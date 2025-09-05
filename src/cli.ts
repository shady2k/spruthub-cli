import { Command } from 'commander';
import chalk from 'chalk';
import { loadCommands } from './commands/index.js';
import packageInfo from '../package.json' assert { type: 'json' };


export const program = new Command();

program
  .name('spruthub-cli')
  .version(packageInfo.version)
  .description('CLI tool for managing Spruthub smart home devices')
  .option('-v, --verbose', 'enable verbose logging')
  .option('--format <format>', 'output format (json, table, yaml)', 'table')
  .hook('preAction', (thisCommand, actionCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      process.env.VERBOSE = '1';
    }
    process.env.OUTPUT_FORMAT = opts.format || 'table';
  });

// Load all commands (core + dynamic)
loadCommands(program);

// Show help if no command provided
if (process.argv.length <= 2) {
  program.outputHelp();
  console.log('');
  console.log(chalk.gray('Examples:'));
  console.log(chalk.gray('  spruthub-cli login                    # Setup authentication'));
  console.log(chalk.gray('  spruthub-cli status                   # Check connection status'));
  console.log(chalk.gray('  spruthub-cli hub list                 # List all hubs'));
  console.log(chalk.gray('  spruthub-cli accessory search --room kitchen  # Find kitchen devices'));
  console.log(chalk.gray('  spruthub-cli methods list             # Show all available methods'));
  process.exit(0);
}

// Handle unknown commands with helpful suggestions
program.on('command:*', (operands) => {
  console.error(chalk.red(`Unknown command: ${operands[0]}`));
  console.log('');
  console.log(chalk.gray('Use "spruthub-cli --help" to see available commands.'));
  console.log(chalk.gray('Use "spruthub-cli methods list" to see all API methods.'));
  process.exit(1);
});

// Global error handler
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Fatal error:'), error.message);
  if (process.env.VERBOSE) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled rejection at:'), promise, 'reason:', reason);
  if (process.env.VERBOSE && reason instanceof Error) {
    console.error(reason.stack);
  }
  process.exit(1);
});