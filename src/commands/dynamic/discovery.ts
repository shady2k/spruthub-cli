import { Command } from 'commander';
import chalk from 'chalk';
import client from '../../utils/client.js';
import { OutputFormatter } from '../../utils/formatter.js';

export function addMethodsCommand(program: Command): void {
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