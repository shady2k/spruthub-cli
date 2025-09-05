import inquirer from 'inquirer';
import chalk from 'chalk';
import configManager from '../../config/manager.js';
import client from '../../utils/client.js';
import type { CommandOptions } from '../../types/index.js';

export async function loginCommand(options?: CommandOptions): Promise<void> {
  try {
    console.log(chalk.blue('Spruthub CLI Login'));
    console.log(chalk.gray('Enter your Spruthub device credentials:\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'profileName',
        message: 'Profile name:',
        default: 'default',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Profile name cannot be empty';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'wsUrl',
        message: 'WebSocket URL:',
        default: 'wss://your-spruthub-server.com',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'WebSocket URL cannot be empty';
          }
          if (!input.startsWith('ws://') && !input.startsWith('wss://')) {
            return 'URL must start with ws:// or wss://';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'email',
        message: 'Email:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Email cannot be empty';
          }
          if (!input.includes('@')) {
            return 'Please enter a valid email address';
          }
          return true;
        }
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Password cannot be empty';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'serial',
        message: 'Device serial number:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Serial number cannot be empty';
          }
          return true;
        }
      }
    ]);

    // Save credentials
    await configManager.setCredentials(
      answers.profileName,
      answers.wsUrl,
      answers.email,
      answers.password,
      answers.serial
    );

    console.log(chalk.green('✓ Credentials saved successfully!'));
    console.log(chalk.gray(`Profile "${answers.profileName}" is now active.`));
    
    // Show next steps
    console.log('\nNext steps:');
    console.log(chalk.gray('• Check status: spruthub-cli status'));
    console.log(chalk.gray('• List devices: spruthub-cli accessory list'));
    console.log(chalk.gray('• Discover commands: spruthub-cli methods list'));

  } catch (error: any) {
    console.error(chalk.red('Login failed:'), error.message);
    process.exit(1);
  }
}

export async function logoutCommand(): Promise<void> {
  try {
    const profiles = await configManager.listProfiles();
    
    if (Object.keys(profiles.profiles).length === 0) {
      console.log(chalk.yellow('No saved profiles found.'));
      return;
    }

    await configManager.clearAllData();
    console.log(chalk.green('✓ All profiles and credentials have been cleared.'));

  } catch (error: any) {
    console.error(chalk.red('Logout failed:'), error.message);
    process.exit(1);
  }
}