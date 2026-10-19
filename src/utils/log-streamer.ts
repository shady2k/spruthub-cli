import { Writable } from 'node:stream';
import { OutputFormatter } from './formatter.js';
import client from './client.js';

export interface LogStreamOptions {
  scenarioId?: string;
  count?: number;
  verbose?: boolean;
  profile?: string;
}

// One outstanding write, bounded by a timeout; watcher bounds incoming records.
export function writeLine(output: Writable, line: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Log output timeout')), timeoutMs);
    const finish = (error?: Error | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Streams may emit error just after invoking the write callback.
      setImmediate(() => output.off('error', onError));
      if (error) reject(new Error('Log output failed')); else resolve();
    };
    const onError = (): void => finish(new Error('Log output failed'));
    output.once('error', onError);
    output.write(line + '\n', finish);
  });
}

export class LogStreamer {
  async startStreaming(options: LogStreamOptions = {}): Promise<void> {
    const { scenarioId, count = 20, profile } = options;
    if (!Number.isInteger(count) || count < 0 || count > 1000) throw new Error('lines must be 0..1000');
    const formatter = new OutputFormatter();
    const json = process.env.OUTPUT_FORMAT === 'json';
    const sprut = await client.getClient(profile);
    const watcher = sprut.watchLogs(async (record: any) => {
      if (record.type === 'hub_log' && scenarioId &&
          !new RegExp(`Сценарий ${scenarioId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`).test(record.message)) return;
      if (json) {
        await writeLine(process.stdout, JSON.stringify(record));
      } else if (record.type === 'hub_log') {
        await writeLine(process.stdout, formatter.formatLogEntry({ timestamp: record.time,
          time: record.time, level: record.level, component: record.path, path: record.path, message: record.message }));
      } else {
        await writeLine(process.stderr, `[log collector] ${record.state || record.reason}`);
      }
    }, { count });
    let stopping = false;
    const stop = (): void => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 15000);
      watcher.stop().finally(() => clearTimeout(deadline)).catch(() => { process.exitCode = 1; });
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    try {
      // Initial auth/transport failure is retried by the watcher too.
      await watcher.done;
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      await watcher.stop();
    }
  }
}
