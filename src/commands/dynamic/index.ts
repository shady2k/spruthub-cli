import { Command } from 'commander';
import chalk from 'chalk';
import client from '../../utils/client.js';
import { OutputFormatter } from '../../utils/formatter.js';
import logger from '../../utils/logger.js';
import type { CommandOptions, MethodSchema } from '../../types/index.js';

export function loadDynamicCommands(program: Command): void {
  try {
    const schema = client.getSchema();
    const categories = client.getCategories();
    
    // Add a methods command for discovery
    addMethodsCommand(program);
    
    // Add commands for each category
    categories.forEach(category => {
      addCategoryCommands(program, category);
    });
    
  } catch (error: any) {
    logger.warn('Failed to load dynamic commands:', error.message);
    logger.debug(error.stack);
  }
}

function addMethodsCommand(program: Command): void {
  const methodsCmd = program
    .command('methods')
    .description('Discover available API methods and schemas');

  methodsCmd
    .command('list')
    .description('List all available API methods')
    .option('-c, --category <category>', 'filter by category')
    .action(async (options: { category?: string }) => {
      try {
        const formatter = new OutputFormatter();
        
        if (options.category) {
          const methods = client.getMethodsByCategory(options.category);
          const methodList = Object.keys(methods).map(methodName => ({
            method: methodName,
            description: methods[methodName].description,
            category: methods[methodName].category
          }));
          
          console.log(formatter.format(methodList));
        } else {
          const methods = client.getAvailableMethods();
          const methodList = methods.map(methodName => {
            const schema = client.getMethodSchema(methodName);
            return {
              method: methodName,
              description: schema?.description || 'No description',
              category: schema?.category || 'unknown'
            };
          });
          
          console.log(formatter.format(methodList));
        }
      } catch (error: any) {
        console.error(chalk.red('Failed to list methods:'), error.message);
        process.exit(1);
      }
    });

  methodsCmd
    .command('describe <method>')
    .description('Show detailed schema for a specific method')
    .action(async (methodName: string) => {
      try {
        const schema = client.getMethodSchema(methodName);
        
        if (!schema) {
          console.error(chalk.red(`Method "${methodName}" not found`));
          console.log(chalk.gray('Use "spruthub-cli methods list" to see available methods'));
          process.exit(1);
        }

        const formatter = new OutputFormatter();
        console.log(formatter.format(schema));
      } catch (error: any) {
        console.error(chalk.red('Failed to describe method:'), error.message);
        process.exit(1);
      }
    });

  methodsCmd
    .command('categories')
    .description('List all available categories')
    .action(async () => {
      try {
        const categories = client.getCategories();
        const schema = client.getSchema();
        
        const categoryList = categories.map(cat => ({
          category: cat,
          name: schema.schema.categories[cat]?.name || cat,
          description: schema.schema.categories[cat]?.description || 'No description'
        }));

        const formatter = new OutputFormatter();
        console.log(formatter.format(categoryList));
      } catch (error: any) {
        console.error(chalk.red('Failed to list categories:'), error.message);
        process.exit(1);
      }
    });
}

function addCategoryCommands(program: Command, category: string): void {
  const methods = client.getMethodsByCategory(category);
  
  if (Object.keys(methods).length === 0) {
    return;
  }

  const categoryCmd = program
    .command(category)
    .description(`${category.charAt(0).toUpperCase() + category.slice(1)} management commands`);

  Object.keys(methods).forEach(methodName => {
    const method = methods[methodName];
    const methodParts = methodName.split('.');
    const commandName = methodParts[1]; // e.g., 'list' from 'hub.list'
    
    addMethodCommand(categoryCmd, commandName, methodName, method);
  });
}

function addMethodCommand(parentCmd: Command, commandName: string, methodName: string, methodSchema: MethodSchema): void {
  const cmd = parentCmd
    .command(commandName)
    .description(methodSchema.description || `Execute ${methodName}`);

  // Add common options
  cmd
    .option('-p, --profile <profile>', 'use specific profile')
    .option('--params <json>', 'parameters as JSON string')
    .option('--file <file>', 'read parameters from JSON file');

  // Add specific options based on schema
  if (methodSchema.params && methodSchema.params.properties) {
    addSchemaOptions(cmd, methodSchema.params.properties);
  }

  cmd.action(async (options: CommandOptions) => {
    try {
      const params = await buildParams(options, methodSchema);
      const result = await client.callMethod(methodName, params, options.profile);
      
      const formatter = new OutputFormatter();
      console.log(formatter.format(result));
      
    } catch (error: any) {
      console.error(chalk.red(`Failed to execute ${methodName}:`), error.message);
      if (process.env.VERBOSE) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });
}

function addSchemaOptions(cmd: Command, properties: Record<string, any>, prefix = ''): void {
  Object.keys(properties).forEach(key => {
    const prop = properties[key];
    const optionName = prefix ? `${prefix}-${key}` : key;
    const flagName = `--${optionName.replace(/[A-Z]/g, '-$&').toLowerCase()}`;
    
    if (prop.type === 'string') {
      cmd.option(`${flagName} <value>`, prop.description);
    } else if (prop.type === 'number' || prop.type === 'integer') {
      cmd.option(`${flagName} <number>`, prop.description);
    } else if (prop.type === 'boolean') {
      cmd.option(flagName, prop.description);
    }
    // For complex types, we'll rely on JSON input
  });
}

async function buildParams(options: CommandOptions, methodSchema: MethodSchema): Promise<any> {
  let params: any = {};

  // 1. If JSON params provided directly via --params option
  if (options.params) {
    try {
      params = JSON.parse(options.params);
    } catch (error: any) {
      throw new Error(`Invalid JSON in --params option: ${error.message}`);
    }
  }

  // 2. If a file is provided via --file option, merge its contents
  if (options.file) {
    const { readFile } = await import('node:fs/promises');
    try {
      const fileContent = await readFile(options.file, 'utf8');
      const fileParams = JSON.parse(fileContent);
      params = { ...params, ...fileParams }; // file params can override --params
    } catch (error: any) {
      throw new Error(`Failed to read or parse parameters from file: ${error.message}`);
    }
  }

  // 3. Build params from individual command-line options (e.g., --id 123)
  // These will override any values from --params or --file
  if (methodSchema.params && methodSchema.params.properties) {
    const schemaParams = buildSchemaParams(options, methodSchema.params.properties);
    params = { ...params, ...schemaParams };
  }

  return params;
}

/**
 * Recursively builds a parameter object from command options based on a method's schema properties.
 * @param options - The command options object from Commander.
 * @param properties - The properties object from the method's schema.
 * @param result - The object to build the parameters into.
 * @param prefix - A prefix for nested option names.
 * @returns The constructed parameters object.
 */
function buildSchemaParams(options: any, properties: Record<string, any>, result: any = {}, prefix = ''): any {
  Object.keys(properties).forEach(key => {
    const prop = properties[key];
    // CamelCase the option name for Commander (e.g., 'user-id' -> 'userId')
    const optionName = prefix ? `${prefix}${key.charAt(0).toUpperCase() + key.slice(1)}` : key;
    
    // Commander stores option values in a camelCased key.
    // We need to find the corresponding key in the options object.
    const flagKey = optionName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

    if (options[flagKey] !== undefined) {
      if ((prop.type === 'number' || prop.type === 'integer') && typeof options[flagKey] === 'string') {
        result[key] = parseInt(options[flagKey], 10);
        if (isNaN(result[key])) {
          throw new Error(`Invalid number for option "${key}"`);
        }
      } else if (prop.type === 'boolean') {
        result[key] = true; // Commander sets boolean flags to true when present
      } else {
        result[key] = options[flagKey];
      }
    }
  });

  return result;
}