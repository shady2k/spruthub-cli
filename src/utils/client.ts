import chalk from 'chalk';
import ora from 'ora';
import { Sprut, Schema } from 'spruthub-client';
import configManager from '../config/manager.js';
import type { ConnectionStatus, ApiResponse } from '../types/index.js';

class SprutHubClientWrapper {
  private client: any = null;
  private isConnected = false;

  async getClient(profileName?: string): Promise<any> {
    if (this.client && this.isConnected) {
      if (process.env.VERBOSE) {
        console.log(chalk.cyan(`[DEBUG] Reusing existing connection`));
      }
      return this.client;
    }

    const isVerbose = process.env.VERBOSE;
    const spinner = ora('Connecting to Spruthub device...').start();
    
    try {
      const credStart = performance.now();
      const credentials = await configManager.getCredentials(profileName);
      
      if (isVerbose) {
        const credTime = Math.round((performance.now() - credStart) * 100) / 100;
        spinner.text = `Loading credentials (${credTime}ms)...`;
      }
      
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
      
      const clientStart = performance.now();
      
      if (isVerbose) {
        spinner.text = `Creating Sprut client...`;
      }
      
      this.client = new Sprut({
        wsUrl: credentials.wsUrl,
        sprutEmail: credentials.email,
        sprutPassword: credentials.password,
        serial: credentials.serial,
        logger: quietLogger,
        defaultTimeout: 10000
      });
      
      if (isVerbose) {
        const clientTime = Math.round((performance.now() - clientStart) * 100) / 100;
        spinner.text = `Client created (${clientTime}ms), waiting for connection...`;
      }

      // Wait for connection
      const connStart = performance.now();
      await this.client.connected();
      this.isConnected = true;
      
      if (isVerbose) {
        const connTime = Math.round((performance.now() - connStart) * 100) / 100;
        spinner.succeed(`Connected to Spruthub device (${connTime}ms)`);
        console.log(chalk.cyan(`[DEBUG] Connection established successfully`));
        console.log(chalk.cyan(`[DEBUG] Client ready for API calls`));
      } else {
        spinner.succeed('Connected to Spruthub device');
      }
      
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
    const isVerbose = process.env.VERBOSE;
    const connectionStart = performance.now();
    
    if (isVerbose) {
      console.log(chalk.cyan(`[DEBUG] Getting client connection...`));
    }
    
    const client = await this.getClient(profileName);

    if (isVerbose) {
      const connectionTime = Math.round((performance.now() - connectionStart) * 100) / 100;
      console.log(chalk.cyan(`[DEBUG] Connection ready in ${connectionTime}ms`));
      console.log(chalk.cyan(`[DEBUG] Raw request to spruthub-client:`));
      console.log(chalk.cyan(`[DEBUG]   Method: ${methodName}`));
      console.log(chalk.cyan(`[DEBUG]   Params:`), JSON.stringify(params, null, 2));
    }
    
    const apiStart = performance.now();
    
    try {
      // Use spruthub-client's built-in callMethod which handles:
      // - Schema validation
      // - Parameter building from schema
      // - Enhanced methods
      // - Authentication
      const result = await client.callMethod(methodName, params);
      
      if (isVerbose) {
        const apiTime = Math.round((performance.now() - apiStart) * 100) / 100;
        console.log(chalk.cyan(`[DEBUG] API call completed in ${apiTime}ms`));
        console.log(chalk.cyan(`[DEBUG] Raw response from spruthub-client:`));
        console.log(chalk.cyan(`[DEBUG]   Success: ${result.isSuccess}`));
        console.log(chalk.cyan(`[DEBUG]   Code: ${result.code}`));
        console.log(chalk.cyan(`[DEBUG]   Message: ${result.message || 'N/A'}`));
        console.log(chalk.cyan(`[DEBUG]   Data:`), JSON.stringify(result.data, null, 2));
      }
      
      return result;
    } catch (error) {
      if (isVerbose) {
        const apiTime = Math.round((performance.now() - apiStart) * 100) / 100;
        console.log(chalk.red(`[DEBUG] API call failed in ${apiTime}ms:`));
        console.log(chalk.red(`[DEBUG] Error details:`), JSON.stringify(error, null, 2));
      }
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
      } catch {
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

  // Log streaming methods (WebSocket only)
  async subscribeLogs(callback: (logEntry: any) => void): Promise<any> {
    const client = await this.getClient();
    return client.subscribeLogs(callback);
  }

  async unsubscribeLogs(subscriptionId: string): Promise<any> {
    const client = await this.getClient();
    return client.unsubscribeLogs(subscriptionId);
  }

  async unsubscribeAllLogs(): Promise<any> {
    const client = await this.getClient();
    return client.unsubscribeAllLogs();
  }

  getActiveLogSubscriptions(): any[] {
    if (!this.client) return [];
    return this.client.getActiveLogSubscriptions();
  }
}

// Export singleton instance
export default new SprutHubClientWrapper();