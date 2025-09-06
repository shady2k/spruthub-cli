import chalk from 'chalk';
import { pushCommand } from './scripts.js';
import client from '../../utils/client.js';
import { OutputFormatter } from '../../utils/formatter.js';
import type { CommandOptions } from '../../types/index.js';

interface DeployOptions extends CommandOptions {
  noLogs?: boolean;
}

export async function deployCommand(scenarioId: string, options: DeployOptions = {}): Promise<void> {
  try {
    if (process.env.VERBOSE) {
      console.log(chalk.blue(`Deploy Scenario ${scenarioId} to Spruthub Device\n`));
    }

    if (!scenarioId) {
      throw new Error('Scenario ID is required');
    }

    // Validate scenario ID is provided (can be string or numeric)
    if (!scenarioId.trim()) {
      throw new Error('Scenario ID cannot be empty');
    }

    console.log(chalk.cyan(`🚀 Starting deployment of scenario ${scenarioId}...`));

    // Phase 1: Push scenario using existing push command
    console.log(chalk.blue('\n📤 Phase 1: Push scenario...'));
    try {
      await pushCommand(scenarioId, options);
      console.log(chalk.green(`✅ Push completed for scenario ${scenarioId}`));
    } catch (pushError: any) {
      // If push fails due to "no changes", that's OK - we can still run the scenario
      if (pushError.message?.includes('up to date') || pushError.message?.includes('no changes')) {
        console.log(chalk.yellow(`⚠️  Scenario ${scenarioId} is already up to date`));
      } else {
        console.error(chalk.red(`❌ Push failed for scenario ${scenarioId}:`), pushError.message);
        throw pushError;
      }
    }

    // Phase 2: Run scenario using existing scenario run command
    console.log(chalk.blue('\n▶️  Phase 2: Run scenario...'));
    try {
      await runScenarioCommand(scenarioId, options);
      console.log(chalk.green(`✅ Scenario ${scenarioId} started successfully`));
    } catch (runError: any) {
      console.error(chalk.red(`❌ Failed to run scenario ${scenarioId}:`), runError.message);
      throw runError;
    }

    // Phase 3: Show recent logs using existing logs command (unless --no-logs)
    if (!options.noLogs) {
      console.log(chalk.blue('\n📋 Phase 3: Show recent logs...'));
      console.log(chalk.gray('Waiting 3 seconds for logs to be generated...'));
      
      // Wait a bit for logs to be generated
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        await showScenarioLogs(scenarioId, options);
      } catch (logError: any) {
        console.log(chalk.yellow(`⚠️  Failed to show logs: ${logError.message}`));
      }
    }

    console.log(chalk.green(`\n✅ Deploy completed successfully for scenario ${scenarioId}!`));

  } catch (error: any) {
    console.error(chalk.red('\n❌ Deploy failed:'), error.message);
    process.exit(1);
  } finally {
    // Always disconnect the client to prevent hanging
    await client.disconnect();
  }
}

async function runScenarioCommand(scenarioId: string, options: DeployOptions): Promise<void> {
  // Use the correct API structure based on schema
  const runResponse = await client.callMethod('scenario.run', { 
    scenario: { 
      run: { 
        index: scenarioId 
      } 
    } 
  }, options.profile);
  
  if (!runResponse.isSuccess) {
    throw new Error(`Failed to run scenario: ${runResponse.message}`);
  }
}

async function showScenarioLogs(scenarioId: string, options: DeployOptions): Promise<void> {
  // Use the same logic as the existing logs list command with scenario filtering
  const logsResponse = await client.callMethod('log.list', { 
    count: 20
  }, options.profile);
  
  if (!logsResponse.isSuccess || !logsResponse.data) {
    throw new Error(`Failed to fetch logs: ${logsResponse.message}`);
  }

  // Apply scenario filtering exactly like the existing logs command
  try {
    let logs: any[] = [];
    
    if (Array.isArray(logsResponse.data)) {
      logs = logsResponse.data;
    } else if (typeof logsResponse.data === 'object' && !Array.isArray(logsResponse.data)) {
      const keys = Object.keys(logsResponse.data);
      if (keys.length === 1 && Array.isArray(logsResponse.data[keys[0]])) {
        logs = logsResponse.data[keys[0]];
      }
    }

    if (logs.length > 0) {
      const regex = new RegExp(`Сценарий ${scenarioId}\\b`);
      const filteredLogs = logs.filter(log => typeof log === 'object' && log.message && regex.test(log.message));
      
      if (Array.isArray(logsResponse.data)) {
        logsResponse.data = filteredLogs;
      } else {
        const key = Object.keys(logsResponse.data)[0];
        logsResponse.data[key] = filteredLogs;
      }
    }
  } catch (error) {
    console.warn(chalk.yellow('Failed to filter logs by scenario ID:'), (error as Error).message);
  }

  // Reverse log order for chronological display (oldest first) - same as logs command
  try {
    if (Array.isArray(logsResponse.data)) {
      logsResponse.data = [...logsResponse.data].reverse();
    } else if (typeof logsResponse.data === 'object' && !Array.isArray(logsResponse.data)) {
      const keys = Object.keys(logsResponse.data);
      if (keys.length === 1 && Array.isArray(logsResponse.data[keys[0]])) {
        const key = keys[0];
        logsResponse.data[key] = [...logsResponse.data[key]].reverse();
      }
    }
  } catch {
    // If reversing fails, continue without it
  }

  // Check if any logs were found after filtering
  let hasLogs = false;
  if (Array.isArray(logsResponse.data)) {
    hasLogs = logsResponse.data.length > 0;
  } else if (typeof logsResponse.data === 'object') {
    const keys = Object.keys(logsResponse.data);
    if (keys.length === 1 && Array.isArray(logsResponse.data[keys[0]])) {
      hasLogs = logsResponse.data[keys[0]].length > 0;
    }
  }

  if (!hasLogs) {
    console.log(chalk.yellow(`⚠️  No recent logs found for scenario ${scenarioId}`));
    return;
  }

  // Use the same OutputFormatter as the existing logs command
  const formatter = new OutputFormatter();
  console.log(formatter.format(logsResponse));
}