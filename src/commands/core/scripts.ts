import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import yaml from 'js-yaml';
import client from '../../utils/client.js';
import type { CommandOptions } from '../../types/index.js';

export async function pushCommand(source: string, options: CommandOptions = {}): Promise<void> {
  try {
    console.log(chalk.blue('Push Scripts to Spruthub Device\n'));

    if (!source) {
      throw new Error('Source file or directory is required');
    }

    const sourcePath = resolve(source);
    
    // Check if source exists
    try {
      await fs.access(sourcePath);
    } catch (error) {
      throw new Error(`Source "${source}" does not exist`);
    }

    console.log(chalk.green(`✓ Push operation would process: ${sourcePath}`));
    console.log(chalk.yellow('Note: Full push implementation requires scenario management logic'));

  } catch (error: any) {
    console.error(chalk.red('Push failed:'), error.message);
    process.exit(1);
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