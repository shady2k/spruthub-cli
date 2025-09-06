import { Command } from 'commander';
import client from '../../utils/client.js';
import { addMethodCommand } from './method-commands.js';

export function addCategoryCommands(program: Command, category: string): void {
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