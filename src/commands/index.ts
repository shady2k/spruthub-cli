import { Command } from 'commander';
import { loadCoreCommands } from './core/index.js';
import { loadDynamicCommands } from './dynamic/index.js';

export function loadCommands(program: Command): void {
  // Load core commands first (login, status, etc.)
  loadCoreCommands(program);
  
  // Load dynamic API commands from spruthub-client schema
  loadDynamicCommands(program);
}