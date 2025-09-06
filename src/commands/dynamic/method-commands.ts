import { Command } from 'commander';
import chalk from 'chalk';
import client from '../../utils/client.js';
import { OutputFormatter } from '../../utils/formatter.js';
import logger from '../../utils/logger.js';
import type { CommandOptions, MethodSchema } from '../../types/index.js';
import { 
  addSchemaOptions, 
  getPositionalParameters, 
  buildParams 
} from './parameter-handling.js';

export function addMethodCommand(parentCmd: Command, commandName: string, methodName: string, methodSchema: MethodSchema): void {
  // Check if method needs positional arguments (like room ID)
  const commandWithArgs = getCommandWithPositionalArgs(commandName, methodSchema);
  
  const cmd = parentCmd
    .command(commandWithArgs)
    .description(methodSchema.description || `Execute ${methodName}`);

  // Add common options
  cmd
    .option('-p, --profile <profile>', 'use specific profile')
    .option('--params <json>', 'parameters as JSON string')
    .option('--file <file>', 'read parameters from JSON file');

  // Add special filtering for log.list
  if (methodName === 'log.list') {
    cmd.option('--scenario-id <id>', 'Filter logs by scenario ID');
  }

  // Get positional parameters to avoid creating conflicting options
  const positionalParams = getPositionalParameters(methodSchema);
  const positionalParamNames = positionalParams.map(p => p.name);

  // Add specific options based on schema (excluding positional ones)
  if (methodSchema.params && methodSchema.params.properties) {
    addSchemaOptions(cmd, methodSchema.params.properties, '', positionalParamNames);
  }

  cmd.action(async (...args: any[]) => {
    const startTime = performance.now();
    const isVerbose = process.env.VERBOSE;
    
    if (isVerbose) {
      console.time(`${methodName}-total`);
      console.time(`${methodName}-param-building`);
    }
    
    try {
      // Commander.js passes: [options, command] when no positional args
      // Commander.js passes: [pos1, pos2, ..., options, command] when there are positional args
      const options = args[args.length - 2] as CommandOptions; // Options are second-to-last
      const positionalArgs = args.slice(0, -2); // Everything except the last 2 are positional
      
      if (isVerbose) {
        console.log(chalk.cyan(`[DEBUG] Executing ${methodName} with profile: ${options.profile || 'default'}`));
        console.log(chalk.cyan(`[DEBUG] Positional args:`), JSON.stringify(positionalArgs, null, 2));
      }
      
      const params = await buildParams(options, methodSchema, positionalArgs);
      
      if (isVerbose) {
        console.timeEnd(`${methodName}-param-building`);
        console.log(chalk.cyan(`[DEBUG] Built parameters:`), JSON.stringify(params, null, 2));
        console.time(`${methodName}-api-call`);
      }
      
      const result = await client.callMethod(methodName, params, options.profile);

      if (isVerbose) {
        console.timeEnd(`${methodName}-api-call`);
        console.time(`${methodName}-formatting`);
      }
      
      const scenarioId = (options as any).scenarioId;

      if (methodName === 'log.list' && scenarioId && result && result.data) {
        try {
          let logs: any[] = [];
          
          if (Array.isArray(result.data)) {
            logs = result.data;
          } else if (typeof result.data === 'object' && !Array.isArray(result.data)) {
            const keys = Object.keys(result.data);
            if (keys.length === 1 && Array.isArray(result.data[keys[0]])) {
              logs = result.data[keys[0]];
            }
          }

          if (logs.length > 0) {
            const regex = new RegExp(`Сценарий ${scenarioId}\\b`);
            const filteredLogs = logs.filter(log => typeof log === 'object' && log.message && regex.test(log.message));
            
            if (Array.isArray(result.data)) {
                result.data = filteredLogs;
            } else {
                const key = Object.keys(result.data)[0];
                result.data[key] = filteredLogs;
            }
          }
        } catch (error) {
          logger.warn('Failed to filter logs by scenario ID:', (error as Error).message);
        }
      }

      const formatter = new OutputFormatter();
      console.log(formatter.format(result));
      
      if (isVerbose) {
        console.timeEnd(`${methodName}-formatting`);
      }
      
      const endTime = performance.now();
      const responseTime = Math.round((endTime - startTime) * 100) / 100; // Round to 2 decimal places
      
      // Show response time (always visible for user feedback)
      console.log(chalk.gray(`\n⏱️  Response time: ${responseTime}ms`));
      
      if (isVerbose) {
        console.timeEnd(`${methodName}-total`);
      }
      
    } catch (error: any) {
      const endTime = performance.now();
      const responseTime = Math.round((endTime - startTime) * 100) / 100;
      
      console.error(chalk.red(`Failed to execute ${methodName}:`), error.message);
      console.log(chalk.gray(`⏱️  Failed after: ${responseTime}ms`));
      
      if (isVerbose) {
        console.error(error.stack);
        console.timeEnd(`${methodName}-total`);
      }
      process.exit(1);
    } finally {
      // Clean up connection
      await client.disconnect();
    }
  });
}

export function getCommandWithPositionalArgs(commandName: string, methodSchema: MethodSchema): string {
  const positionalParams = getPositionalParameters(methodSchema);
  
  if (positionalParams.length > 0) {
    const argNames = positionalParams.map(param => `<${param.name}>`).join(' ');
    return `${commandName} ${argNames}`;
  }
  
  return commandName;
}