import chalk from 'chalk';
import configManager from '../../config/manager.js';
import client from '../../utils/client.js';
import { OutputFormatter } from '../../utils/formatter.js';
import type { CommandOptions } from '../../types/index.js';

export async function statusCommand(options: CommandOptions = {}): Promise<void> {
  try {
    const formatter = new OutputFormatter();
    const profiles = await configManager.listProfiles();
    
    if (Object.keys(profiles.profiles).length === 0) {
      console.log(chalk.yellow('No profiles configured.'));
      console.log(chalk.gray('Run "spruthub-cli login" to add a profile.'));
      return;
    }

    const targetProfile = options.profile || profiles.currentProfile;
    
    if (!targetProfile) {
      console.log(chalk.red('No profile specified and no current profile set.'));
      return;
    }

    console.log(chalk.blue(`Status for profile: ${targetProfile}\n`));

    // Test connection
    const connectionTest = await client.testConnection(targetProfile);
    
    const statusData = {
      ...connectionTest,
      profile: targetProfile
    };

    console.log(formatter.format(statusData));

    if (connectionTest.connected) {
      console.log(chalk.green('\n✓ Connection is healthy'));
    } else {
      console.log(chalk.red('\n✗ Connection failed'));
      console.log(chalk.gray('Check your network connection and credentials.'));
      console.log(chalk.gray('Run "spruthub-cli login" to update credentials.'));
    }

  } catch (error: any) {
    console.error(chalk.red('Status check failed:'), error.message);
    process.exit(1);
  }
}

export async function switchProfileCommand(profileName: string): Promise<void> {
  try {
    await configManager.setCurrentProfile(profileName);
    console.log(chalk.green(`✓ Switched to profile: ${profileName}`));
  } catch (error: any) {
    console.error(chalk.red('Failed to switch profile:'), error.message);
    process.exit(1);
  }
}