import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import client from '../../utils/client.js';
import type { CommandOptions } from '../../types/index.js';
import { extractScenarioCode, injectScenarioCode, hasExtractedCode, type ScenarioData } from '../../utils/scenario-code.js';

async function validateScenarioData(data: any): Promise<boolean> {
  // Basic validation - ensure it's a valid scenario object
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  // Required fields from schema
  const requiredFields = ['index', 'name', 'type'];
  for (const field of requiredFields) {
    if (!data.hasOwnProperty(field)) {
      return false;
    }
  }
  
  // Validate type enum
  if (!['BLOCK', 'LOGIC', 'GLOBAL'].includes(data.type)) {
    return false;
  }
  
  return true;
}

async function compareScenarios(local: any, remote: any): Promise<boolean> {
  // Compare the actual scenario data, ignoring runtime fields and local-only fields
  const localCopy = { ...local };
  const remoteCopy = { ...remote };
  
  // Remove runtime fields that shouldn't be compared
  const runtimeFields = ['lastRun', 'runCount', 'error'];
  // Remove local-only fields that don't exist on remote
  const localOnlyFields = ['iconsThen', 'iconsIf'];
  
  [...runtimeFields, ...localOnlyFields].forEach(field => {
    delete localCopy[field];
    delete remoteCopy[field];
  });
  
  return JSON.stringify(localCopy) === JSON.stringify(remoteCopy);
}

async function askForConfirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(`${message} (y/N): `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      const response = data.toString().trim().toLowerCase();
      process.stdin.setRawMode(false);
      process.stdin.pause();
      console.log(response); // Echo the response
      resolve(response === 'y' || response === 'yes');
    });
  });
}

export async function pushCommand(source: string, options: CommandOptions = {}): Promise<void> {
  try {
    console.log(chalk.blue('Push Scripts to Spruthub Device\n'));

    if (!source) {
      throw new Error('Source file or directory is required');
    }

    let sourcePath = resolve(source);
    
    // If source is just a number/scenario index, try to find it in scenarios/ directory
    if (/^\d+$/.test(source)) {
      const scenariosDir = resolve(process.cwd(), 'scenarios');
      
      // Try to find the scenario directory in type subdirectories
      const scenarioTypes = ['block', 'logic', 'global', 'unknown'];
      let found = false;
      
      for (const type of scenarioTypes) {
        const typeDir = resolve(scenariosDir, type);
        const scenarioDir = resolve(typeDir, source);
        
        try {
          // Check if this is a new directory structure with extracted files
          if (await hasExtractedCode(scenarioDir)) {
            sourcePath = scenarioDir;
            console.log(chalk.gray(`Using scenario directory: ${scenarioDir}`));
            found = true;
            break;
          }
        } catch {
          // Continue searching in other type directories
        }
        
        // Fallback: try legacy JSON file structure
        const scenarioFile = resolve(typeDir, `${source}.json`);
        try {
          await fs.access(scenarioFile);
          sourcePath = scenarioFile;
          console.log(chalk.gray(`Using legacy scenario file: ${scenarioFile}`));
          found = true;
          break;
        } catch {
          // Continue searching in other type directories
        }
      }
      
      // If not found in type subdirectories, try the legacy flat structure
      if (!found) {
        const scenarioFile = resolve(scenariosDir, `${source}.json`);
        try {
          await fs.access(scenarioFile);
          sourcePath = scenarioFile;
          console.log(chalk.gray(`Using scenario file: ${scenarioFile}`));
        } catch {
          // Fall through to original error handling
        }
      }
    }
    
    // Check if source exists
    try {
      await fs.access(sourcePath);
    } catch (error) {
      throw new Error(`Source "${source}" does not exist`);
    }

    const stat = await fs.stat(sourcePath);
    const filesToProcess: string[] = [];

    // Determine files to process
    if (stat.isDirectory()) {
      // Check if this is a single scenario directory with extracted code
      if (await hasExtractedCode(sourcePath)) {
        console.log(chalk.blue('Processing single extracted scenario directory'));
        filesToProcess.push(sourcePath);
      } else {
        // Process all scenarios in directory
        const files = await fs.readdir(sourcePath);
        const scenarioTypes = ['block', 'logic', 'global', 'unknown'];
        let hasTypeSubdirectories = false;
        
        // Check if this directory has type subdirectories
        for (const file of files) {
          const filePath = resolve(sourcePath, file);
          const fileStat = await fs.stat(filePath);
          if (fileStat.isDirectory() && scenarioTypes.includes(file.toLowerCase())) {
            hasTypeSubdirectories = true;
            break;
          }
        }
        
        if (hasTypeSubdirectories) {
          // New structure: process scenario directories in type subdirectories
          console.log(chalk.blue('Processing type-based scenario directory structure'));
          for (const file of files) {
            const filePath = resolve(sourcePath, file);
            try {
              const fileStat = await fs.stat(filePath);
              if (fileStat.isDirectory() && scenarioTypes.includes(file.toLowerCase())) {
                const typeFiles = await fs.readdir(filePath);
                for (const typeFile of typeFiles) {
                  const scenarioPath = resolve(filePath, typeFile);
                  const scenarioStat = await fs.stat(scenarioPath);
                  
                  if (scenarioStat.isDirectory()) {
                    // New directory structure with extracted code
                    if (await hasExtractedCode(scenarioPath)) {
                      filesToProcess.push(scenarioPath);
                    }
                  } else if (typeFile.endsWith('.json')) {
                    // Legacy JSON file
                    filesToProcess.push(scenarioPath);
                  }
                }
              }
            } catch (error) {
              console.warn(chalk.yellow(`⚠ Could not access ${file}:`, error));
            }
          }
        } else {
          // Legacy structure: process .json files directly
          console.log(chalk.blue('Processing flat scenario directory structure'));
          for (const file of files) {
            if (file.endsWith('.json')) {
              filesToProcess.push(resolve(sourcePath, file));
            }
          }
        }
      }
      
      if (filesToProcess.length === 0) {
        console.log(chalk.yellow('No scenario files or directories found to process'));
        return;
      }
      
      console.log(chalk.blue(`Found ${filesToProcess.length} scenarios to process\n`));
    } else if (stat.isFile()) {
      // Process single JSON file
      if (!sourcePath.endsWith('.json')) {
        throw new Error('Only .json files are supported');
      }
      filesToProcess.push(sourcePath);
    } else {
      throw new Error('Source must be a file or directory');
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const filePath of filesToProcess) {
      const pathStat = await fs.stat(filePath);
      let localData: ScenarioData;
      let scenarioIndex: string;
      let displayName: string = filePath.split('/').pop() || 'unknown';
      
      try {
        if (pathStat.isDirectory()) {
          // Directory with extracted code - inject code back to JSON
          scenarioIndex = displayName;
          console.log(chalk.cyan(`Processing extracted scenario directory ${displayName}...`));
          
          try {
            localData = await injectScenarioCode(filePath);
          } catch (injectError) {
            console.error(chalk.red(`✗ Failed to inject code for scenario ${displayName}:`), injectError);
            errorCount++;
            break;
          }
        } else {
          // Legacy JSON file
          scenarioIndex = displayName.replace('.json', '');
          console.log(chalk.cyan(`Processing JSON file ${displayName}...`));
          
          const localContent = await fs.readFile(filePath, 'utf8');
          try {
            localData = JSON.parse(localContent);
          } catch (parseError) {
            console.error(chalk.red(`✗ Invalid JSON in ${displayName}`));
            errorCount++;
            break; // Stop on first error as requested
          }
        }
        
        // Validate scenario data
        if (!await validateScenarioData(localData)) {
          console.error(chalk.red(`✗ Invalid scenario data in ${displayName}`));
          errorCount++;
          break;
        }
        
        // Ensure the index matches the expected value
        if (localData.index !== scenarioIndex) {
          console.error(chalk.red(`✗ Scenario index mismatch in ${displayName}: expected ${scenarioIndex}, got ${localData.index}`));
          errorCount++;
          break;
        }
        
        // Fetch remote scenario for comparison
        const spinner = ora(`Fetching remote scenario ${scenarioIndex}...`).start();
        if (process.env.VERBOSE) {
          console.log(chalk.gray(`[VERBOSE] Calling scenario.get with params: ${JSON.stringify({ index: scenarioIndex })}`));
        }
        const remoteResponse = await client.callMethod('scenario.get', { index: scenarioIndex }, options.profile);
        
        if (process.env.VERBOSE) {
          console.log(chalk.gray(`[VERBOSE] scenario.get response: ${JSON.stringify(remoteResponse, null, 2)}`));
        }
        
        if (!remoteResponse.isSuccess || !remoteResponse.data) {
          spinner.fail(`Failed to fetch remote scenario ${scenarioIndex}`);
          console.error(chalk.red('Error:'), remoteResponse.message);
          errorCount++;
          break;
        }
        
        spinner.succeed(`Remote scenario ${scenarioIndex} fetched`);
        
        // Compare scenarios
        if (process.env.VERBOSE) {
          console.log(chalk.gray(`[VERBOSE] Comparing local and remote scenarios...`));
          console.log(chalk.gray(`[VERBOSE] Local data keys: ${Object.keys(localData)}`));
          console.log(chalk.gray(`[VERBOSE] Remote data keys: ${Object.keys(remoteResponse.data)}`));
        }
        
        const areEqual = await compareScenarios(localData, remoteResponse.data);
        
        if (process.env.VERBOSE) {
          console.log(chalk.gray(`[VERBOSE] Scenarios are equal: ${areEqual}`));
        }
        
        if (areEqual) {
          console.log(chalk.green(`✓ No changes detected for scenario ${scenarioIndex}`));
          skippedCount++;
          continue;
        }
        
        // Show diff summary
        console.log(chalk.yellow(`⚠ Changes detected for scenario ${scenarioIndex}:`));
        
        // Simple diff display - could be enhanced with actual diff library
        const changes = [];
        if (localData.name !== remoteResponse.data.name) {
          changes.push(`  name: "${remoteResponse.data.name}" → "${localData.name}"`);
        }
        if (localData.desc !== remoteResponse.data.desc) {
          changes.push(`  desc: "${remoteResponse.data.desc}" → "${localData.desc}"`);
        }
        if (localData.active !== remoteResponse.data.active) {
          changes.push(`  active: ${remoteResponse.data.active} → ${localData.active}`);
        }
        if (localData.data !== remoteResponse.data.data) {
          changes.push(`  data: <scenario logic changed>`);
        }
        
        if (changes.length > 0) {
          console.log(changes.join('\n'));
        }
        
        // Ask for confirmation unless --force is used
        let shouldUpdate = options.force;
        if (!shouldUpdate) {
          shouldUpdate = await askForConfirmation(`Update scenario ${scenarioIndex}?`);
        }
        
        if (!shouldUpdate) {
          console.log(chalk.yellow(`⚠ Skipped scenario ${scenarioIndex}`));
          skippedCount++;
          continue;
        }
        
        // Prepare update data with correct API structure
        const updateParams = {
          scenario: {
            update: {
              index: localData.index,
              name: localData.name || '',
              desc: localData.desc || '',
              type: localData.type,
              active: localData.active,
              onStart: localData.onStart,
              sync: localData.sync,
              data: typeof localData.data === 'string' ? localData.data : JSON.stringify(localData.data)
            }
          }
        };
        
        if (process.env.VERBOSE) {
          console.log(chalk.gray(`[VERBOSE] Update params being sent:`));
          console.log(chalk.gray(JSON.stringify(updateParams, null, 2)));
        }
        
        // Push update
        const updateSpinner = ora(`Updating scenario ${scenarioIndex}...`).start();
        const updateResponse = await client.callMethod('scenario.update', updateParams, options.profile);
        
        if (process.env.VERBOSE) {
          console.log(chalk.gray(`[VERBOSE] scenario.update response:`));
          console.log(chalk.gray(JSON.stringify(updateResponse, null, 2)));
        }
        
        if (!updateResponse.isSuccess) {
          updateSpinner.fail(`Failed to update scenario ${scenarioIndex}`);
          console.error(chalk.red('Error:'), updateResponse.message);
          errorCount++;
          break;
        }
        
        // Verify the update by fetching the scenario again
        updateSpinner.text = `Verifying update for scenario ${scenarioIndex}...`;
        if (process.env.VERBOSE) {
          console.log(chalk.gray(`[VERBOSE] Verifying update by calling scenario.get again...`));
        }
        const verifyResponse = await client.callMethod('scenario.get', { index: scenarioIndex }, options.profile);
        
        if (process.env.VERBOSE) {
          console.log(chalk.gray(`[VERBOSE] Verification scenario.get response:`));
          console.log(chalk.gray(JSON.stringify(verifyResponse, null, 2)));
        }
        
        if (!verifyResponse.isSuccess || !verifyResponse.data) {
          updateSpinner.fail(`Failed to verify update for scenario ${scenarioIndex}`);
          console.error(chalk.red('Verification Error:'), verifyResponse.message);
          errorCount++;
          break;
        }
        
        // Check if the update was actually applied
        const updatedScenario = verifyResponse.data;
        const isNowEqual = await compareScenarios(localData, updatedScenario);
        
        if (process.env.VERBOSE) {
          console.log(chalk.gray(`[VERBOSE] Post-update comparison result: ${isNowEqual}`));
          if (!isNowEqual) {
            console.log(chalk.gray(`[VERBOSE] Local data: ${JSON.stringify(localData, null, 2)}`));
            console.log(chalk.gray(`[VERBOSE] Updated remote data: ${JSON.stringify(updatedScenario, null, 2)}`));
          }
        }
        
        if (!isNowEqual) {
          updateSpinner.fail(`Update verification failed for scenario ${scenarioIndex}`);
          console.error(chalk.red('Error:'), 'Scenario was not updated correctly');
          errorCount++;
          break;
        }
        
        updateSpinner.succeed(`✓ Updated and verified scenario ${scenarioIndex}`);
        updatedCount++;
        
      } catch (error: any) {
        console.error(chalk.red(`✗ Failed to process ${displayName}:`), error.message);
        errorCount++;
        break;
      }
    }

    // Summary
    console.log();
    if (updatedCount > 0) {
      console.log(chalk.green(`✓ Updated ${updatedCount} scenarios`));
    }
    if (errorCount > 0) {
      console.log(chalk.red(`✗ ${errorCount} errors occurred`));
      process.exit(1);
    }

  } catch (error: any) {
    console.error(chalk.red('Push failed:'), error.message);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

export async function pullCommand(scenario?: string, destination?: string, options: CommandOptions = {}): Promise<void> {
  // If pulling a specific scenario
  if (scenario) {
    const spinner = ora(`Fetching scenario ${scenario}...`).start();
    try {
      const response = await client.callMethod('scenario.get', { index: scenario }, options.profile);
      
      if (!response.isSuccess || !response.data) {
        spinner.fail(`Failed to fetch scenario ${scenario}`);
        console.error(chalk.red('Error:'), response.message);
        process.exit(1);
      }

      // Create scenarios directory
      const destPath = destination ? resolve(destination) : process.cwd();
      const scenariosDir = resolve(destPath, 'scenarios');
      
      try {
        await fs.mkdir(scenariosDir, { recursive: true });
      } catch (error) {
        spinner.fail('Failed to create scenarios directory');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }

      // Create type-specific subdirectory
      const scenarioType = response.data.type?.toLowerCase() || 'unknown';
      const typeDir = resolve(scenariosDir, scenarioType);
      
      try {
        await fs.mkdir(typeDir, { recursive: true });
      } catch (error) {
        spinner.fail(`Failed to create ${scenarioType} directory`);
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }

      // Create scenario directory structure: scenarios/{type}/{index}/
      const scenarioDir = resolve(typeDir, scenario);
      const backupJsonPath = resolve(scenarioDir, 'backup.json');
      
      // Check if scenario directory exists and handle conflicts
      let existingData = null;
      let shouldOverwrite = options.force;
      
      try {
        await fs.access(backupJsonPath);
        // Scenario exists, read current content for comparison
        const existingContent = await fs.readFile(backupJsonPath, 'utf8');
        try {
          existingData = JSON.parse(existingContent);
        } catch {
          // Invalid JSON in existing file, we'll overwrite
          if (!shouldOverwrite) {
            console.log(chalk.yellow(`⚠ Existing scenario ${scenario} contains invalid JSON`));
            shouldOverwrite = await askForConfirmation(`Overwrite invalid scenario ${scenario}?`);
          }
        }
      } catch {
        // Scenario doesn't exist, we should create it
        shouldOverwrite = true;
      }
      
      // If we have valid existing data, compare it
      if (existingData && !shouldOverwrite) {
        const areEqual = await compareScenarios(existingData, response.data);
        
        if (areEqual) {
          spinner.succeed(`✓ No changes detected for scenario ${scenario}`);
          return;
        }
        
        // Stop spinner before showing diff and asking for confirmation
        spinner.stop();
        
        // Show diff summary
        console.log(chalk.yellow(`⚠ Changes detected for scenario ${scenario}:`));
        
        const changes = [];
        if (existingData.name !== response.data.name) {
          changes.push(`  name: "${existingData.name}" → "${response.data.name}"`);
        }
        if (existingData.desc !== response.data.desc) {
          changes.push(`  desc: "${existingData.desc}" → "${response.data.desc}"`);
        }
        if (existingData.active !== response.data.active) {
          changes.push(`  active: ${existingData.active} → ${response.data.active}`);
        }
        if (existingData.data !== response.data.data) {
          changes.push(`  data: <scenario logic changed>`);
        }
        
        if (changes.length > 0) {
          console.log(changes.join('\n'));
        }
        
        shouldOverwrite = await askForConfirmation(`Update local scenario ${scenario}?`);
        
        // Restart spinner
        spinner.start(`Saving scenario ${scenario}...`);
      }
      
      if (!shouldOverwrite) {
        console.log(chalk.yellow(`⚠ Skipped scenario ${scenario}`));
        return;
      }

      // Extract code to separate files
      try {
        spinner.stop(); // Stop spinner before extracting code to avoid console conflicts
        await extractScenarioCode(response.data as ScenarioData, scenarioDir);
        console.log(chalk.green(`✓ Scenario ${scenario} saved and code extracted to ${scenarioDir}`));
      } catch (error: any) {
        spinner.fail(`Failed to extract code for scenario ${scenario}`);
        console.error(chalk.red('Extract Error:'), error.message);
        
        // Fallback: save as original JSON file
        console.log(chalk.yellow('Falling back to original JSON format...'));
        await fs.mkdir(scenarioDir, { recursive: true });
        await fs.writeFile(backupJsonPath, JSON.stringify(response.data, null, 2));
        console.log(chalk.yellow(`✓ Scenario ${scenario} saved as JSON backup`));
      }
      return;
      
    } catch (error: any) {
      spinner.fail(`Pull scenario ${scenario} failed`);
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    } finally {
      await client.disconnect();
    }
  }

  // Pull all scenarios (existing logic)
  const spinner = ora('Fetching scenarios...').start();
  try {
    const response = await client.callMethod('scenario.list', {}, options.profile);

    if (!response.isSuccess || !response.data) {
      spinner.fail('Failed to fetch scenarios');
      console.error(chalk.red('Error:'), response.message);
      process.exit(1);
    }
    
    const responseData = response.data;
    
    // Extract scenarios array from response object
    const scenarios = responseData?.scenarios;
    
    if (!scenarios || !Array.isArray(scenarios)) {
      spinner.fail('Invalid scenarios data received');
      console.error(chalk.red('Error:'), 'Expected scenarios array in response');
      if (responseData) {
        console.error(chalk.gray('Available keys:'), Object.keys(responseData));
      }
      process.exit(1);
    }

    spinner.succeed(`Found ${scenarios.length} scenarios`);

    if (scenarios.length === 0) {
      spinner.info('No scenarios found to pull.');
      return;
    }

    // Create scenarios directory
    const destPath = destination ? resolve(destination) : process.cwd();
    const scenariosDir = resolve(destPath, 'scenarios');
    
    try {
      await fs.mkdir(scenariosDir, { recursive: true });
    } catch (error) {
      spinner.fail('Failed to create scenarios directory');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }

    // Process each scenario
    let createdCount = 0;
    let skippedCount = 0;

    spinner.text = 'Fetching complete scenario details...';

    for (const scenario of scenarios) {
      if (!scenario.index) {
        console.warn(chalk.yellow(`⚠ Skipping scenario without index:`, scenario.name || 'unnamed'));
        skippedCount++;
        continue;
      }

      // Get complete scenario data using scenario.get to determine type
      let fullScenarioResponse;
      try {
        fullScenarioResponse = await client.callMethod('scenario.get', { index: scenario.index }, options.profile);
        
        if (!fullScenarioResponse.isSuccess || !fullScenarioResponse.data) {
          console.error(chalk.red(`✗ Failed to fetch scenario ${scenario.index}:`), fullScenarioResponse.message);
          skippedCount++;
          continue;
        }
      } catch (error) {
        console.error(chalk.red(`✗ Failed to fetch scenario ${scenario.index}:`), error);
        skippedCount++;
        continue;
      }

      // Create type-specific subdirectory
      const scenarioType = fullScenarioResponse.data.type?.toLowerCase() || 'unknown';
      const typeDir = resolve(scenariosDir, scenarioType);
      
      try {
        await fs.mkdir(typeDir, { recursive: true });
      } catch (error) {
        console.error(chalk.red(`✗ Failed to create ${scenarioType} directory:`), error);
        skippedCount++;
        continue;
      }

      // Create scenario directory structure: scenarios/{type}/{index}/
      const scenarioDir = resolve(typeDir, scenario.index);
      const backupJsonPath = resolve(scenarioDir, 'backup.json');
      
      // Check if scenario directory exists and handle conflicts
      let existingData = null;
      let shouldOverwrite = options.force;
      
      try {
        await fs.access(backupJsonPath);
        // Scenario exists, read current content for comparison
        const existingContent = await fs.readFile(backupJsonPath, 'utf8');
        try {
          existingData = JSON.parse(existingContent);
        } catch {
          // Invalid JSON in existing file, we'll overwrite
          if (!shouldOverwrite) {
            console.log(chalk.yellow(`⚠ Existing scenario ${scenario.index} contains invalid JSON`));
            shouldOverwrite = await askForConfirmation(`Overwrite invalid scenario ${scenario.index}?`);
          }
        }
      } catch {
        // Scenario doesn't exist, we should create it
        shouldOverwrite = true;
      }

      // If we have existing data and not forcing, compare it
      if (existingData && !shouldOverwrite) {
        const areEqual = await compareScenarios(existingData, fullScenarioResponse.data);
        
        if (areEqual) {
          console.log(chalk.green(`✓ No changes detected for scenario ${scenario.index}`));
          skippedCount++;
          continue;
        }
        
        // Show diff summary
        console.log(chalk.yellow(`⚠ Changes detected for scenario ${scenario.index}:`));
        
        const changes = [];
        if (existingData.name !== fullScenarioResponse.data.name) {
          changes.push(`  name: "${existingData.name}" → "${fullScenarioResponse.data.name}"`);
        }
        if (existingData.desc !== fullScenarioResponse.data.desc) {
          changes.push(`  desc: "${existingData.desc}" → "${fullScenarioResponse.data.desc}"`);
        }
        if (existingData.active !== fullScenarioResponse.data.active) {
          changes.push(`  active: ${existingData.active} → ${fullScenarioResponse.data.active}`);
        }
        if (existingData.data !== fullScenarioResponse.data.data) {
          changes.push(`  data: <scenario logic changed>`);
        }
        
        if (changes.length > 0) {
          console.log(changes.join('\n'));
        }
        
        shouldOverwrite = await askForConfirmation(`Update local scenario ${scenario.index}?`);
      }
      
      if (!shouldOverwrite) {
        console.log(chalk.yellow(`⚠ Skipped scenario ${scenario.index}`));
        skippedCount++;
        continue;
      }

      // Extract code to separate files
      try {
        await extractScenarioCode(fullScenarioResponse.data as ScenarioData, scenarioDir);
        createdCount++;
        console.log(chalk.green(`✓ Scenario ${scenario.index} extracted to ${scenarioDir}`));
      } catch (error: any) {
        console.error(chalk.red(`✗ Failed to extract code for scenario ${scenario.index}:`), error.message);
        
        // Fallback: save as original JSON file
        try {
          await fs.mkdir(scenarioDir, { recursive: true });
          await fs.writeFile(backupJsonPath, JSON.stringify(fullScenarioResponse.data, null, 2));
          createdCount++;
          console.log(chalk.yellow(`✓ Scenario ${scenario.index} saved as JSON backup`));
        } catch (fallbackError) {
          console.error(chalk.red(`✗ Failed to save scenario ${scenario.index}:`), fallbackError);
          skippedCount++;
        }
      }
    }

    // Summary
    console.log();
    if (createdCount > 0) {
      console.log(chalk.green(`✓ Extracted ${createdCount} scenarios with code separation organized by type in ${scenariosDir}`));
    }
    if (skippedCount > 0) {
      console.log(chalk.yellow(`⚠ Skipped ${skippedCount} scenarios`));
    }

  } catch (error: any) {
    spinner.fail('Pull failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}