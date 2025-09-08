import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
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
  const backupJsonPath = resolve(scenarioDir, 'backup.json');
  await fs.writeFile(backupJsonPath, JSON.stringify(scenarioData, null, 2));

  if (scenarioData.type === 'BLOCK') {
    // For BLOCK scenarios, extract data to separate file
    const dataJsonPath = resolve(scenarioDir, 'data.json');
    await fs.writeFile(dataJsonPath, scenarioData.data);

    // Create metadata without the data field
    const metadata = { ...scenarioData };
    metadata.data = '__DATA__'; // Placeholder

    const metadataPath = resolve(scenarioDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    await extractBlockScenario(scenarioData, scenarioDir);
  } else if (scenarioData.type === 'LOGIC' || scenarioData.type === 'GLOBAL') {
    // For LOGIC/GLOBAL scenarios, use legacy format with __CODE__ placeholder
    const metadata = { ...scenarioData };
    metadata.data = '__CODE__'; // Placeholder

    const metadataPath = resolve(scenarioDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

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

  // Extract code blocks and create updated data structure
  const metadataTargets = [];
  const codeFiles: { blockId: number; code: string }[] = [];

  for (const target of blockData.targets) {
    if (target.type === 'code' && target.code) {
      // Store code for separate file
      codeFiles.push({
        blockId: target.blockId,
        code: target.code
      });
      
      // Create data entry without code
      const metadataTarget = { ...target };
      metadataTarget.code = `__BLOCK_${target.blockId}__`; // Placeholder
      metadataTargets.push(metadataTarget);
    } else {
      // Non-code targets go directly to data
      metadataTargets.push(target);
    }
  }

  // Update data.json with structure but without code
  const updatedBlockData = {
    ...blockData,
    targets: metadataTargets
  };

  const dataJsonPath = resolve(scenarioDir, 'data.json');
  await fs.writeFile(dataJsonPath, JSON.stringify(updatedBlockData, null, 2));

  // Create individual code files
  for (const codeFile of codeFiles) {
    const codeFilePath = resolve(scenarioDir, `block-${codeFile.blockId}.js`);
    await fs.writeFile(codeFilePath, codeFile.code);
  }

  if (process.env.VERBOSE) {
    console.log(chalk.green(`✓ Extracted ${codeFiles.length} code blocks from scenario ${scenarioData.index}`));
  }
}

/**
 * Extract code from LOGIC or GLOBAL scenario
 */
async function extractLogicOrGlobalScenario(scenarioData: ScenarioData, scenarioDir: string): Promise<void> {
  // Create code file with the entire data content
  const codeFilePath = resolve(scenarioDir, 'code.js');
  await fs.writeFile(codeFilePath, scenarioData.data);

  if (process.env.VERBOSE) {
    console.log(chalk.green(`✓ Extracted code from ${scenarioData.type.toLowerCase()} scenario ${scenarioData.index}`));
  }
}

/**
 * Validate scenario directory structure and data without injecting
 */
export async function validateScenarioDirectory(scenarioDir: string): Promise<{ isValid: boolean; error?: string }> {
  try {
    const metadataPath = resolve(scenarioDir, 'metadata.json');
    
    // Check if metadata.json exists and is valid
    let metadata: ScenarioData;
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(metadataContent);
    } catch (error) {
      return { isValid: false, error: `Failed to read or parse metadata.json: ${error}` };
    }

    // Check if data.json exists and is valid JSON when using new format
    if (metadata.data === '__DATA__') {
      const dataJsonPath = resolve(scenarioDir, 'data.json');
      try {
        const dataContent = await fs.readFile(dataJsonPath, 'utf8');
        JSON.parse(dataContent); // Validate JSON syntax
      } catch (error) {
        return { isValid: false, error: `Failed to read or parse data.json: ${error}` };
      }
    }
    // Check if code.js exists for legacy format
    else if (metadata.data === '__CODE__' && (metadata.type === 'LOGIC' || metadata.type === 'GLOBAL')) {
      const codeFilePath = resolve(scenarioDir, 'code.js');
      try {
        await fs.access(codeFilePath);
      } catch (error) {
        return { isValid: false, error: `Failed to access code.js: ${error}` };
      }
    }

    // For BLOCK scenarios, validate code block files exist
    if (metadata.type === 'BLOCK' && metadata.data === '__DATA__') {
      const dataJsonPath = resolve(scenarioDir, 'data.json');
      try {
        const dataContent = await fs.readFile(dataJsonPath, 'utf8');
        const blockData = JSON.parse(dataContent);
        
        if (blockData.targets && Array.isArray(blockData.targets)) {
          for (const target of blockData.targets) {
            if (target.type === 'code' && target.code === `__BLOCK_${target.blockId}__`) {
              const codeFilePath = resolve(scenarioDir, `block-${target.blockId}.js`);
              try {
                await fs.access(codeFilePath);
              } catch (error) {
                return { isValid: false, error: `Missing code file block-${target.blockId}.js: ${error}` };
              }
            }
          }
        }
      } catch (error) {
        return { isValid: false, error: `Failed to validate block scenario structure: ${error}` };
      }
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: `Validation failed: ${error}` };
  }
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

  // Check if we need to inject data from data.json (new format)
  if (metadata.data === '__DATA__') {
    const dataJsonPath = resolve(scenarioDir, 'data.json');
    try {
      const dataContent = await fs.readFile(dataJsonPath, 'utf8');
      metadata.data = dataContent;
    } catch (error) {
      throw new Error(`Failed to read data.json: ${error}`);
    }
  }
  // Check if we need to inject code (legacy format for LOGIC/GLOBAL)
  else if (metadata.data === '__CODE__' && (metadata.type === 'LOGIC' || metadata.type === 'GLOBAL')) {
    const codeFilePath = resolve(scenarioDir, 'code.js');
    try {
      const codeContent = await fs.readFile(codeFilePath, 'utf8');
      metadata.data = codeContent;
    } catch (error) {
      throw new Error(`Failed to read code.js: ${error}`);
    }
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
    throw new Error(`Invalid JSON in scenario data: ${error}`);
  }

  if (!blockData.targets || !Array.isArray(blockData.targets)) {
    throw new Error('Block scenario data must have targets array');
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

  if (process.env.VERBOSE) {
    console.log(chalk.green(`✓ Injected ${finalTargets.filter(t => t.type === 'code').length} code blocks into scenario ${metadata.index}`));
  }
  return finalScenario;
}

/**
 * Inject code for LOGIC or GLOBAL scenario
 */
async function injectLogicOrGlobalScenario(metadata: ScenarioData, _scenarioDir: string): Promise<ScenarioData> {
  // Data should already be injected in the main injectScenarioCode function
  // For LOGIC/GLOBAL scenarios, the data is either already set or read from code.js (legacy)
  
  const finalScenario = { ...metadata };
  
  if (process.env.VERBOSE) {
    console.log(chalk.green(`✓ Processed ${metadata.type.toLowerCase()} scenario ${metadata.index}`));
  }
  return finalScenario;
}

/**
 * Check if a scenario directory has extracted code files
 */
export async function hasExtractedCode(scenarioDir: string): Promise<boolean> {
  try {
    const metadataPath = resolve(scenarioDir, 'metadata.json');
    await fs.access(metadataPath);
    
    // Check if it has either the new format (data.json) or legacy format structure
    const dataJsonPath = resolve(scenarioDir, 'data.json');
    try {
      await fs.access(dataJsonPath);
      return true; // New format with data.json
    } catch {
      // Check for legacy format with placeholders in metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      return metadata.data === '__CODE__' || metadata.data === '__DATA__';
    }
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

/**
 * Restore scenario directory to match the original remote data when push fails
 */
export async function restoreFromRemoteData(scenarioDir: string, originalRemoteData: ScenarioData): Promise<void> {
  try {
    // Re-extract the remote data to restore the directory structure
    await extractScenarioCode(originalRemoteData, scenarioDir);
    
    if (process.env.VERBOSE) {
      console.log(chalk.yellow(`🔄 Restored scenario directory from original remote data`));
    }
    
  } catch (error) {
    throw new Error(`Failed to restore from remote data: ${error}`);
  }
}