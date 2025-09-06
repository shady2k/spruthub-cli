import chalk from 'chalk';
import { OutputFormatter } from './formatter.js';
import client from './client.js';
import logger from './logger.js';

export interface LogStreamOptions {
  scenarioId?: string;
  count?: number;
  verbose?: boolean;
}

export interface LogEntry {
  subscriptionId: string;
  timestamp: number;
  level: string;
  component: string;
  message: string;
  raw: any;
}

export class LogStreamer {
  private formatter: OutputFormatter;
  private subscriptionId?: string;
  private isStreaming = false;
  private scenarioFilter?: RegExp;

  constructor() {
    this.formatter = new OutputFormatter();
  }

  async startStreaming(options: LogStreamOptions = {}): Promise<void> {
    const { scenarioId, count = 20, verbose = false } = options;

    try {
      // Setup scenario filter if provided
      if (scenarioId) {
        this.scenarioFilter = new RegExp(`Сценарий ${scenarioId}\\b`);
      }

      // 1. Get initial logs if count > 0
      if (count > 0) {
        await this.getInitialLogs(count, scenarioId, verbose);
      }

      // 2. Setup signal handlers for graceful shutdown
      this.setupSignalHandlers();

      // 3. Start real-time streaming
      console.log(chalk.gray('--- Following live logs (Press Ctrl+C to exit) ---'));
      await this.subscribeToLogs(verbose);

    } catch (error: any) {
      console.error(chalk.red('Failed to start log streaming:'), error.message);
      await this.cleanup();
      throw error;
    }
  }

  private async getInitialLogs(count: number, scenarioId?: string, verbose = false): Promise<void> {
    if (verbose) {
      console.log(chalk.cyan(`[DEBUG] Fetching last ${count} logs...`));
    }

    try {
      const result = await client.callMethod('log.list', { count });
      
      if (result.isSuccess && result.data) {
        // Apply scenario filtering if needed
        let logs = this.extractLogsFromResult(result);
        
        if (scenarioId && this.scenarioFilter) {
          logs = logs.filter(log => 
            typeof log === 'object' && 
            log.message && 
            this.scenarioFilter!.test(log.message)
          );
        }

        if (logs.length > 0) {
          // Reverse logs for chronological order (oldest first) when following
          // This makes the transition to live streaming more natural
          const reversedLogs = [...logs].reverse();
          console.log(this.formatter.format({ isSuccess: true, data: reversedLogs }));
        } else if (scenarioId) {
          console.log(chalk.gray(`No recent logs found for scenario ${scenarioId}`));
        } else {
          console.log(chalk.gray('No recent logs found'));
        }
      }
    } catch (error: any) {
      logger.warn('Failed to fetch initial logs:', error.message);
    }
  }

  private async subscribeToLogs(verbose = false): Promise<void> {
    if (verbose) {
      console.log(chalk.cyan('[DEBUG] Starting log subscription...'));
    }

    const sprutClient = await client.getClient();
    
    const subscription = await sprutClient.subscribeLogs((logEntry: LogEntry) => {
      this.handleLogEntry(logEntry, verbose);
    });

    if (subscription.isSuccess) {
      this.subscriptionId = subscription.data.uuid;
      this.isStreaming = true;
      
      if (verbose) {
        console.log(chalk.cyan(`[DEBUG] Subscribed with ID: ${this.subscriptionId}`));
      }

      // Keep the process alive
      await this.keepAlive();
    } else {
      throw new Error(`Failed to subscribe to logs: ${subscription.message}`);
    }
  }

  private handleLogEntry(logEntry: LogEntry, verbose = false): void {
    // Apply scenario filtering if configured
    if (this.scenarioFilter && !this.scenarioFilter.test(logEntry.message)) {
      return;
    }

    // Format and display the log entry
    const formattedEntry = this.formatter.formatLogEntry({
      timestamp: logEntry.timestamp,
      level: logEntry.level,
      component: logEntry.component,
      message: logEntry.message,
      ...logEntry.raw
    });

    if (formattedEntry) {
      console.log(formattedEntry);
    }

    if (verbose) {
      console.log(chalk.cyan(`[DEBUG] Received log entry: ${logEntry.subscriptionId}`));
    }
  }

  private extractLogsFromResult(result: any): any[] {
    let logs: any[] = [];
    
    if (Array.isArray(result.data)) {
      logs = result.data;
    } else if (typeof result.data === 'object' && !Array.isArray(result.data)) {
      const keys = Object.keys(result.data);
      if (keys.length === 1 && Array.isArray(result.data[keys[0]])) {
        logs = result.data[keys[0]];
      }
    }
    
    return logs;
  }

  private async keepAlive(): Promise<void> {
    return new Promise((resolve) => {
      // The process will be kept alive by the WebSocket connection
      // and terminated by signal handlers
      process.on('exit', () => {
        resolve();
      });
    });
  }

  private setupSignalHandlers(): void {
    const cleanup = async () => {
      console.log(chalk.gray('\nShutting down log streaming...'));
      try {
        await this.cleanup();
        logger.debug('Cleanup completed, exiting...');
      } catch (error: any) {
        logger.error('Cleanup failed:', error.message);
      }
      // Give a small delay to ensure logs are flushed
      setTimeout(() => process.exit(0), 100);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  private async cleanup(): Promise<void> {
    if (this.isStreaming && this.subscriptionId) {
      try {
        logger.debug(`Cleaning up subscription: ${this.subscriptionId}`);
        const sprutClient = await client.getClient();
        await sprutClient.unsubscribeLogs(this.subscriptionId);
        logger.debug('Log subscription cleaned up successfully');
      } catch (error: any) {
        logger.warn('Failed to cleanup log subscription:', error.message);
      }
    } else {
      logger.debug('No active subscription to cleanup');
    }
    
    this.isStreaming = false;
    this.subscriptionId = undefined;
  }
}