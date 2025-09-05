import chalk from 'chalk';

class Logger {
  private level: string;

  constructor() {
    this.level = process.env.VERBOSE ? 'debug' : 'info';
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(chalk.blue('[INFO]'), message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(chalk.yellow('[WARN]'), message, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(chalk.red('[ERROR]'), message, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(chalk.gray('[DEBUG]'), message, ...args);
    }
  }

  success(message: string, ...args: any[]): void {
    console.log(chalk.green('✓'), message, ...args);
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.level);
    const targetLevelIndex = levels.indexOf(level);
    return targetLevelIndex <= currentLevelIndex;
  }

  // Pino-compatible interface for spruthub-client
  child(): Logger {
    return this;
  }

  fatal(message: string, ...args: any[]): void {
    this.error(message, ...args);
  }

  trace(message: string, ...args: any[]): void {
    this.debug(message, ...args);
  }
}

export default new Logger();