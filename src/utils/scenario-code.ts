import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';
import chalk from 'chalk';

export interface ScenarioData {
  index: string;
  name: string;
  type: 'BLOCK' | 'LOGIC' | 'GLOBAL';
  data: string;
  [key: string]: any;
}

export interface CodeBlock {
  type: string;
  blockId: number;
  code: string;
  [key: string]: any;
}

export interface BlockScenarioData {
  blockId: number;
  targets: CodeBlock[];
  [key: string]: any;
}

/**
 * Escape JavaScript code for JSON string embedding
 */
export function escapeCodeForJSON(code: string): string {
  return code
    .replace(/\\/g, '\\\\')    // Escape backslashes
    .replace(/"/g, '\\"')      // Escape double quotes
    .replace(/\r?\n/g, '\\n')  // Escape newlines
    .replace(/\r/g, '\\r')     // Escape carriage returns
    .replace(/\t/g, '\\t');    // Escape tabs
}

/**
 * Unescape JavaScript code from JSON string
 */
export function unescapeCodeFromJSON(code: string): string {
  return code
    .replace(/\\n/g, '\n')     // Unescape newlines
    .replace(/\\r/g, '\r')     // Unescape carriage returns
    .replace(/\\t/g, '\t')     // Unescape tabs
    .replace(/\\"/g, '"')      // Unescape double quotes
    .replace(/\\\\/g, '\\');   // Unescape backslashes (must be last)
}

/**
 * Validate that a JSON string is valid
 */
export function validateJSON(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract code from a scenario to separate files
 */
export async function extractScenarioCode(scenarioData: ScenarioData, scenarioDir: string): Promise<void> {
  await fs.mkdir(scenarioDir, { recursive: true });

  // Save original JSON as backup
  const originalJsonPath = resolve(scenarioDir, 'scenario.json');
  await fs.writeFile(originalJsonPath, JSON.stringify(scenarioData, null, 2));

  if (scenarioData.type === 'BLOCK') {
    await extractBlockScenario(scenarioData, scenarioDir);
  } else if (scenarioData.type === 'LOGIC' || scenarioData.type === 'GLOBAL') {
    await extractLogicOrGlobalScenario(scenarioData, scenarioDir);
  } else {
    throw new Error(`Unsupported scenario type: ${scenarioData.type}`);
  }
}

/**
 * Extract code from BLOCK scenario
 */
async function extractBlockScenario(scenarioData: ScenarioData, scenarioDir: string): Promise<void> {
  let blockData: BlockScenarioData;
  
  try {
    blockData = JSON.parse(scenarioData.data);
  } catch (error) {
    throw new Error(`Invalid JSON in scenario data: ${error}`);
  }

  if (!blockData.targets || !Array.isArray(blockData.targets)) {
    throw new Error('Block scenario data must have targets array');
  }

  // Extract code blocks and create metadata structure
  const metadataTargets = [];
  const codeFiles: { blockId: number; code: string }[] = [];

  for (const target of blockData.targets) {
    if (target.type === 'code' && target.code) {
      // Store code for separate file
      codeFiles.push({
        blockId: target.blockId,
        code: target.code
      });
      
      // Create metadata entry without code
      const metadataTarget = { ...target };
      metadataTarget.code = `__BLOCK_${target.blockId}__`; // Placeholder
      metadataTargets.push(metadataTarget);
    } else {
      // Non-code targets go directly to metadata
      metadataTargets.push(target);
    }
  }

  // Create metadata.json with structure but without code
  const metadata = { ...scenarioData };
  metadata.data = JSON.stringify({
    ...blockData,
    targets: metadataTargets
  });

  const metadataPath = resolve(scenarioDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  // Create individual code files
  for (const codeFile of codeFiles) {
    const codeFilePath = resolve(scenarioDir, `block-${codeFile.blockId}.js`);
    await fs.writeFile(codeFilePath, codeFile.code);
  }

  console.log(chalk.green(`✓ Extracted ${codeFiles.length} code blocks from scenario ${scenarioData.index}`));
}

/**
 * Extract code from LOGIC or GLOBAL scenario
 */
async function extractLogicOrGlobalScenario(scenarioData: ScenarioData, scenarioDir: string): Promise<void> {
  // Create metadata without the data field
  const metadata = { ...scenarioData };
  metadata.data = '__CODE__'; // Placeholder

  const metadataPath = resolve(scenarioDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  // Create code file with the entire data content
  const codeFilePath = resolve(scenarioDir, 'code.js');
  await fs.writeFile(codeFilePath, scenarioData.data);

  console.log(chalk.green(`✓ Extracted code from ${scenarioData.type.toLowerCase()} scenario ${scenarioData.index}`));
}

/**
 * Inject code from separate files back into scenario JSON
 */
export async function injectScenarioCode(scenarioDir: string): Promise<ScenarioData> {
  const metadataPath = resolve(scenarioDir, 'metadata.json');
  
  let metadata: ScenarioData;
  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    metadata = JSON.parse(metadataContent);
  } catch (error) {
    throw new Error(`Failed to read metadata.json: ${error}`);
  }

  if (metadata.type === 'BLOCK') {
    return await injectBlockScenario(metadata, scenarioDir);
  } else if (metadata.type === 'LOGIC' || metadata.type === 'GLOBAL') {
    return await injectLogicOrGlobalScenario(metadata, scenarioDir);
  } else {
    throw new Error(`Unsupported scenario type: ${metadata.type}`);
  }
}

/**
 * Inject code for BLOCK scenario
 */
async function injectBlockScenario(metadata: ScenarioData, scenarioDir: string): Promise<ScenarioData> {
  let blockData: BlockScenarioData;
  
  try {
    blockData = JSON.parse(metadata.data);
  } catch (error) {
    throw new Error(`Invalid JSON in metadata data: ${error}`);
  }

  if (!blockData.targets || !Array.isArray(blockData.targets)) {
    throw new Error('Block scenario metadata must have targets array');
  }

  // Process targets and inject code
  const finalTargets = [];
  
  for (const target of blockData.targets) {
    if (target.type === 'code' && target.code === `__BLOCK_${target.blockId}__`) {
      // This is a code placeholder, read from file
      const codeFilePath = resolve(scenarioDir, `block-${target.blockId}.js`);
      
      try {
        const codeContent = await fs.readFile(codeFilePath, 'utf8');
        const finalTarget = { ...target };
        finalTarget.code = codeContent;
        finalTargets.push(finalTarget);
      } catch (error) {
        throw new Error(`Failed to read code file block-${target.blockId}.js: ${error}`);
      }
    } else {
      // Non-code target or already has code
      finalTargets.push(target);
    }
  }

  // Create final scenario data
  const finalScenario = { ...metadata };
  const finalBlockData = { ...blockData, targets: finalTargets };
  finalScenario.data = JSON.stringify(finalBlockData);

  // Validate the final JSON
  if (!validateJSON(finalScenario.data)) {
    throw new Error('Generated scenario data is not valid JSON');
  }

  console.log(chalk.green(`✓ Injected ${finalTargets.filter(t => t.type === 'code').length} code blocks into scenario ${metadata.index}`));
  return finalScenario;
}

/**
 * Inject code for LOGIC or GLOBAL scenario
 */
async function injectLogicOrGlobalScenario(metadata: ScenarioData, scenarioDir: string): Promise<ScenarioData> {
  const codeFilePath = resolve(scenarioDir, 'code.js');
  
  try {
    const codeContent = await fs.readFile(codeFilePath, 'utf8');
    
    const finalScenario = { ...metadata };
    finalScenario.data = codeContent;
    
    console.log(chalk.green(`✓ Injected code into ${metadata.type.toLowerCase()} scenario ${metadata.index}`));
    return finalScenario;
  } catch (error) {
    throw new Error(`Failed to read code file code.js: ${error}`);
  }
}

/**
 * Check if a scenario directory has extracted code files
 */
export async function hasExtractedCode(scenarioDir: string): Promise<boolean> {
  try {
    const metadataPath = resolve(scenarioDir, 'metadata.json');
    await fs.access(metadataPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get scenario type from directory
 */
export async function getScenarioType(scenarioDir: string): Promise<'BLOCK' | 'LOGIC' | 'GLOBAL' | null> {
  try {
    const metadataPath = resolve(scenarioDir, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(metadataContent);
    return metadata.type || null;
  } catch {
    return null;
  }
}