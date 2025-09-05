import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import client from '../../utils/client.js';
import type { CommandOptions } from '../../types/index.js';

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
      const scenarioFile = resolve(scenariosDir, `${source}.json`);
      
      try {
        await fs.access(scenarioFile);
        sourcePath = scenarioFile;
        console.log(chalk.gray(`Using scenario file: ${scenarioFile}`));
      } catch {
        // Fall through to original error handling
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
      // Process all .json files in directory
      const files = await fs.readdir(sourcePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          filesToProcess.push(resolve(sourcePath, file));
        }
      }
      
      if (filesToProcess.length === 0) {
        console.log(chalk.yellow('No .json files found in directory'));
        return;
      }
      
      console.log(chalk.blue(`Found ${filesToProcess.length} scenario files to process\n`));
    } else if (stat.isFile()) {
      // Process single file
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
      const filename = filePath.split('/').pop() || '';
      const scenarioIndex = filename.replace('.json', '');
      
      console.log(chalk.cyan(`Processing ${filename}...`));
      
      try {
        // Read local file
        const localContent = await fs.readFile(filePath, 'utf8');
        let localData;
        
        try {
          localData = JSON.parse(localContent);
        } catch (parseError) {
          console.error(chalk.red(`✗ Invalid JSON in ${filename}`));
          errorCount++;
          break; // Stop on first error as requested
        }
        
        // Validate scenario data
        if (!await validateScenarioData(localData)) {
          console.error(chalk.red(`✗ Invalid scenario data in ${filename}`));
          errorCount++;
          break;
        }
        
        // Ensure the index matches the filename
        if (localData.index !== scenarioIndex) {
          console.error(chalk.red(`✗ Scenario index mismatch in ${filename}: expected ${scenarioIndex}, got ${localData.index}`));
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
        console.error(chalk.red(`✗ Failed to process ${filename}:`), error.message);
        errorCount++;
        break;
      }
    }

    // Summary
    console.log();
    if (updatedCount > 0) {
      console.log(chalk.green(`✓ Updated ${updatedCount} scenarios`));
    }
    if (skippedCount > 0) {
      console.log(chalk.yellow(`⚠ Skipped ${skippedCount} scenarios (no changes)`));
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

      const filename = `${scenario}.json`;
      const filePath = resolve(scenariosDir, filename);
      
      // Check if file exists and handle conflicts
      try {
        await fs.access(filePath);
        if (!options.force) {
          spinner.fail(`File ${filename} already exists`);
          console.error(chalk.yellow('Use --force to overwrite existing files'));
          process.exit(1);
        }
      } catch {
        // File doesn't exist, continue with creation
      }

      // Create JSON file with raw scenario data
      const jsonContent = JSON.stringify(response.data, null, 2);
      
      await fs.writeFile(filePath, jsonContent);
      spinner.succeed(`✓ Scenario ${scenario} saved to ${filePath}`);
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

      const filename = `${scenario.index}.json`;
      const filePath = resolve(scenariosDir, filename);
      
      // Check if file exists and handle conflicts
      try {
        await fs.access(filePath);
        if (!options.force) {
          console.warn(chalk.yellow(`⚠ Skipping existing file: ${filename} (use --force to overwrite)`));
          skippedCount++;
          continue;
        }
      } catch {
        // File doesn't exist, continue with creation
      }

      // Get complete scenario data using scenario.get
      try {
        const fullScenarioResponse = await client.callMethod('scenario.get', { index: scenario.index }, options.profile);
        
        if (!fullScenarioResponse.isSuccess || !fullScenarioResponse.data) {
          console.error(chalk.red(`✗ Failed to fetch scenario ${scenario.index}:`), fullScenarioResponse.message);
          skippedCount++;
          continue;
        }

        // Create .js file with raw scenario data (no export default)
        const jsContent = JSON.stringify(fullScenarioResponse.data, null, 2);
        
        await fs.writeFile(filePath, jsContent);
        createdCount++;
      } catch (error) {
        console.error(chalk.red(`✗ Failed to create ${filename}:`), error);
        skippedCount++;
      }
    }

    // Summary
    console.log();
    if (createdCount > 0) {
      console.log(chalk.green(`✓ Created ${createdCount} scenario files in ${scenariosDir}`));
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