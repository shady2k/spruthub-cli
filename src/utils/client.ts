import chalk from 'chalk';
import ora from 'ora';
import { Sprut, Schema } from 'spruthub-client';
import configManager from '../config/manager.js';
import logger from './logger.js';
import type { ConnectionStatus, ApiResponse } from '../types/index.js';

class SprutHubClientWrapper {
  private client: any = null;
  private isConnected = false;

  async getClient(profileName?: string): Promise<any> {
    if (this.client && this.isConnected) {
      return this.client;
    }

    const spinner = ora('Connecting to Spruthub device...').start();
    
    try {
      const credentials = await configManager.getCredentials(profileName);
      
      // Create a quiet logger for connection phase to avoid spinner interference
      const quietLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        child: () => quietLogger,
        fatal: () => {},
        trace: () => {}
      };
      
      this.client = new Sprut({
        wsUrl: credentials.wsUrl,
        sprutEmail: credentials.email,
        sprutPassword: credentials.password,
        serial: credentials.serial,
        logger: process.env.VERBOSE ? logger : quietLogger,
        defaultTimeout: 10000
      });

      // Wait for connection
      await this.client.connected();
      this.isConnected = true;
      
      spinner.succeed('Connected to Spruthub device');
      return this.client;
      
    } catch (error: any) {
      spinner.fail('Failed to connect to Spruthub device');
      
      if (error.message.includes('not found')) {
        throw new Error(`Authentication failed. Please check your credentials and run "spruthub-cli login" again.\nError: ${error.message}`);
      }
      
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        throw new Error(`Cannot reach Spruthub server. Please check your network connection and server URL.\nError: ${error.message}`);
      }
      
      throw error;
    }
  }

  async execute(method: string, params: any = {}, profileName?: string): Promise<ApiResponse> {
    const client = await this.getClient(profileName);
    
    const spinner = ora(`Executing ${method}...`).start();
    
    try {
      const result = await client.execute(method, params);
      
      if (result.isSuccess) {
        spinner.succeed(`${method} completed successfully`);
        return result;
      } else {
        spinner.fail(`${method} failed`);
        throw new Error(`API call failed: ${result.message} (code: ${result.code})`);
      }
    } catch (error: any) {
      spinner.fail(`${method} failed`);
      throw error;
    }
  }

  async callMethod(methodName: string, params: any = {}, profileName?: string): Promise<ApiResponse> {
    const client = await this.getClient(profileName);
    
    try {
      // Use spruthub-client's built-in callMethod which handles:
      // - Schema validation
      // - Parameter building from schema
      // - Enhanced methods
      // - Authentication
      return await client.callMethod(methodName, params);
    } catch (error) {
      throw error;
    }
  }

  async testConnection(profileName?: string): Promise<ConnectionStatus> {
    try {
      const client = await this.getClient(profileName);
      const result = await client.version();
      const config = await configManager.loadConfig();
      return {
        connected: true,
        version: result.data,
        profile: profileName || config.currentProfile
      };
    } catch (error: any) {
      const config = await configManager.loadConfig();
      return {
        connected: false,
        error: error.message,
        profile: profileName || config.currentProfile
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        // Ignore close errors
      }
      this.client = null;
      this.isConnected = false;
    }
  }

  // Schema access methods
  getSchema(): any {
    return Schema;
  }

  getAvailableMethods(): string[] {
    return Schema.getAvailableMethods();
  }

  getMethodSchema(methodName: string): any {
    return Schema.getMethodSchema(methodName);
  }

  getCategories(): string[] {
    return Schema.getCategories();
  }

  getMethodsByCategory(category: string): Record<string, any> {
    return Schema.getMethodsByCategory(category);
  }

  getRestMethods(): any[] {
    return Schema.getRestMethods();
  }
}

// Export singleton instance
export default new SprutHubClientWrapper();