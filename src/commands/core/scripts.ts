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

export async function pullCommand(destination?: string, options: CommandOptions = {}): Promise<void> {
  const spinner = ora('Fetching scenarios...').start();
  try {
    const response = await client.callMethod('scenario.list', {}, options.profile);

    if (!response.isSuccess || !response.data) {
      spinner.fail('Failed to fetch scenarios');
      console.error(chalk.red('Error:'), response.message);
      process.exit(1);
    }
    
    const scenarios = response.data;
    if (Array.isArray(scenarios)) {
      spinner.succeed(`Found ${scenarios.length} scenarios.`);
    } else {
      spinner.succeed('Found scenarios.');
    }
    const destPath = destination ? resolve(destination) : process.cwd();
    const outputPath = resolve(destPath, 'scenarios.yaml');

    if (scenarios && (!Array.isArray(scenarios) || scenarios.length > 0)) {
      const yamlContent = yaml.dump(scenarios);
      await fs.writeFile(outputPath, yamlContent);
      spinner.succeed(`✓ Scenarios saved to ${outputPath}`);
    } else {
      spinner.info('No scenarios found to pull.');
    }

  } catch (error: any) {
    spinner.fail('Pull failed');
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}