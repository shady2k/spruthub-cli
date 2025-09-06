import { Command } from 'commander';
import client from '../../utils/client.js';
import logger from '../../utils/logger.js';
import { addMethodsCommand } from './discovery.js';
import { addCategoryCommands } from './category-commands.js';

export function loadDynamicCommands(program: Command): void {
  try {
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