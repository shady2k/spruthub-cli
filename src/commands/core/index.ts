import { Command } from 'commander';
import { loginCommand, logoutCommand } from './login.js';
import { statusCommand, switchProfileCommand } from './status.js';
import { pushCommand, pullCommand } from './scripts.js';

export function loadCoreCommands(program: Command): void {
  // Login command
  program
    .command('login')
    .description('Setup authentication with Spruthub device')
    .action(loginCommand);

  // Logout command  
  program
    .command('logout')
    .description('Remove saved credentials')
    .action(logoutCommand);

  // Status command
  program
    .command('status')
    .description('Check connection status and profile information')
    .option('-p, --profile <profile>', 'check specific profile')
    .action(statusCommand);

  // Profile switching
  program
    .command('use <profile>')
    .description('Switch to a different profile')
    .action(switchProfileCommand);

  // Push command for uploading scripts
  program
    .command('push <source>')
    .description('Upload scenarios/scripts to Spruthub device')
    .option('-p, --profile <profile>', 'use specific profile')
    .option('-f, --force', 'overwrite existing scenarios without confirmation')
    .action(pushCommand);

  // Pull command for downloading scripts  
  program
    .command('pull [destination]')
    .description('Download scenarios/scripts from Spruthub device')
    .option('-p, --profile <profile>', 'use specific profile')
    .option('-f, --force', 'overwrite existing files without confirmation')
    .action(pullCommand);
}