import Table from 'cli-table3';
import { dump as yamlDump } from 'js-yaml';
import chalk from 'chalk';
import type { ApiResponse } from '../types/index.js';

interface FormatOptions {
  compact?: boolean;
  columns?: string[];
  lineWidth?: number;
}

export class OutputFormatter {
  private outputFormat: string;

  constructor(format = 'table') {
    this.outputFormat = format;
  }

  format(data: any, options: FormatOptions = {}): string {
    const format = process.env.OUTPUT_FORMAT || this.outputFormat;
    
    // Auto-detect log data and use logs format if not explicitly set
    const shouldUseLogs = format === 'logs' || (format === 'table' && this.isLogData(data));
    
    switch (format) {
      case 'json':
        return this.formatJson(data, options);
      case 'yaml':
        return this.formatYaml(data, options);
      case 'logs':
        return this.formatLogs(data, options);
      case 'table':
        return shouldUseLogs ? this.formatLogs(data, options) : this.formatTable(data, options);
      default:
        return shouldUseLogs ? this.formatLogs(data, options) : this.formatTable(data, options);
    }
  }

  private formatJson(data: any, options: FormatOptions = {}): string {
    const indent = options.compact ? 0 : 2;
    return JSON.stringify(data, null, indent);
  }

  private formatYaml(data: any, options: FormatOptions = {}): string {
    return yamlDump(data, { 
      indent: 2,
      lineWidth: options.lineWidth || 120,
      noRefs: true
    });
  }

  private formatTable(data: any, options: FormatOptions = {}): string {
    if (!data || typeof data !== 'object') {
      return String(data);
    }

    // Handle array of objects (common API response format)
    if (Array.isArray(data)) {
      return this.formatArrayTable(data, options);
    }

    // Handle Spruthub API response format
    if (data.isSuccess !== undefined && data.data !== undefined) {
      return this.formatApiResponseTable(data as ApiResponse, options);
    }

    // Handle simple key-value object
    return this.formatObjectTable(data);
  }

  private formatLogs(data: any, options: FormatOptions = {}): string {
    if (!data || typeof data !== 'object') {
      return String(data);
    }

    // Handle API response wrapper
    let logData = data;
    if (data.isSuccess !== undefined && data.data !== undefined) {
      logData = data.data;
    }

    // Handle collection patterns (single key with array value)
    const collectionArray = this.detectCollectionPattern(logData);
    if (collectionArray) {
      logData = collectionArray;
    }

    if (!Array.isArray(logData)) {
      return this.formatTable(data, options);
    }

    if (logData.length === 0) {
      return chalk.gray('No logs to display');
    }

    const lines = logData.map(entry => this.formatLogEntry(entry)).filter(Boolean);
    return lines.join('\n');
  }

  private formatLogEntry(entry: any): string {
    if (!entry || typeof entry !== 'object') {
      return String(entry);
    }

    // Extract common log fields
    const level = entry.level || entry.Level || entry.severity || '';
    const message = entry.message || entry.Message || entry.msg || '';
    const timestamp = entry.time || entry.timestamp || entry.Time || entry.date || '';
    const path = entry.path || entry.source || entry.logger || entry.category || '';

    // Format timestamp
    const formattedTime = this.formatTimestamp(timestamp);
    
    // Format log level with colors
    const formattedLevel = this.formatLogLevel(level);
    
    // Format the message (keep it simple for one-line)
    let formattedMessage = this.formatLogMessageOneline(message);
    
    // Add other fields that aren't already included
    const excludeFields = ['level', 'Level', 'severity', 'message', 'Message', 'msg', 'time', 'timestamp', 'Time', 'date', 'path', 'source', 'logger', 'category'];
    const otherFields = Object.keys(entry).filter(key => !excludeFields.includes(key));
    
    if (otherFields.length > 0) {
      const extras = otherFields.map(key => {
        const value = entry[key];
        return `${key}=${this.formatLogValueOneline(value)}`;
      }).join(' ');
      
      if (formattedMessage) {
        formattedMessage += ` ${extras}`;
      } else {
        formattedMessage = extras;
      }
    }

    // Build one-line format: timestamp  level  source  message
    const parts = [formattedTime, formattedLevel];
    
    if (path) {
      parts.push(chalk.cyan(path));
    }
    
    if (formattedMessage) {
      parts.push(formattedMessage);
    }

    return parts.join('  ');
  }

  private formatTimestamp(timestamp: any): string {
    if (!timestamp) {
      return chalk.gray('--:--:--');
    }

    let date: Date;
    
    if (typeof timestamp === 'number') {
      // Handle Unix timestamps (both seconds and milliseconds)
      date = new Date(timestamp > 1000000000000 ? timestamp : timestamp * 1000);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return chalk.gray(String(timestamp));
    }

    if (isNaN(date.getTime())) {
      return chalk.gray(String(timestamp));
    }

    // Format as YYYY-MM-DD HH:MM:SS
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');

    return chalk.blue(`${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`);
  }

  private formatLogLevel(level: string): string {
    const levelStr = String(level).toUpperCase();
    
    if (levelStr.includes('ERROR') || levelStr.includes('ERR')) {
      return chalk.red(levelStr.padEnd(8));
    }
    if (levelStr.includes('WARN')) {
      return chalk.yellow(levelStr.padEnd(8));
    }
    if (levelStr.includes('INFO')) {
      return chalk.cyan(levelStr.padEnd(8));
    }
    if (levelStr.includes('DEBUG') || levelStr.includes('DBG')) {
      return chalk.gray(levelStr.padEnd(8));
    }
    if (levelStr.includes('TRACE')) {
      return chalk.magenta(levelStr.padEnd(8));
    }
    
    return chalk.white(levelStr.padEnd(8));
  }

  private formatLogMessage(message: any): string {
    if (!message) {
      return '';
    }

    const str = String(message);
    
    // Try to parse and format JSON objects in the message
    if (str.includes('{') && str.includes('}')) {
      // Look for JSON-like patterns and format them
      return str.replace(/\{[^{}]*\}/g, (match) => {
        try {
          const parsed = JSON.parse(match);
          return JSON.stringify(parsed, null, 2).replace(/\n/g, '\n  ');
        } catch {
          return match;
        }
      });
    }

    return str;
  }

  private formatLogMessageOneline(message: any): string {
    if (!message) {
      return '';
    }

    const str = String(message);
    
    // For one-line format, keep JSON compact
    if (str.includes('{') && str.includes('}')) {
      return str.replace(/\{[^{}]*\}/g, (match) => {
        try {
          const parsed = JSON.parse(match);
          return JSON.stringify(parsed); // Compact JSON, no indentation
        } catch {
          return match;
        }
      });
    }

    return str;
  }

  private formatLogValueOneline(value: any): string {
    if (value === null || value === undefined) {
      return chalk.gray('null');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value); // Compact JSON for one-line
    }
    
    return String(value);
  }

  private formatLogValue(value: any): string {
    if (value === null || value === undefined) {
      return chalk.gray('null');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 0);
    }
    
    return String(value);
  }

  private isLogData(data: any): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Handle API response wrapper
    let checkData = data;
    if (data.isSuccess !== undefined && data.data !== undefined) {
      checkData = data.data;
    }

    // Handle collection patterns
    const collectionArray = this.detectCollectionPattern(checkData);
    if (collectionArray) {
      checkData = collectionArray;
    }

    if (!Array.isArray(checkData) || checkData.length === 0) {
      return false;
    }

    // Check if the first few items have log-like fields
    const logFields = ['level', 'Level', 'severity', 'message', 'Message', 'msg', 'time', 'timestamp', 'Time', 'date', 'path', 'source', 'logger'];
    const sampleSize = Math.min(3, checkData.length);
    
    for (let i = 0; i < sampleSize; i++) {
      const item = checkData[i];
      if (!item || typeof item !== 'object') {
        continue;
      }
      
      const itemKeys = Object.keys(item);
      const logFieldCount = logFields.filter(field => itemKeys.includes(field)).length;
      
      // If we have at least 2 log-like fields, consider it log data
      if (logFieldCount >= 2) {
        return true;
      }
    }

    return false;
  }

  private formatArrayTable(data: any[], options: FormatOptions = {}): string {
    if (data.length === 0) {
      return chalk.gray('No data to display');
    }

    const columns = options.columns || this.inferColumns(data);
    const terminalWidth = process.stdout.columns || 120;

    // Check if we should use vertical layout
    if (this.shouldUseVerticalLayout(data, columns, terminalWidth)) {
      return this.formatVerticalTable(data, columns);
    }

    const calculatedWidths = this.calculateColumnWidths(data, columns, terminalWidth);
    
    // Ensure columns have minimum widths based on their actual content to prevent truncation
    columns.forEach((col, index) => {
      const maxContentLength = Math.max(...data.map(item => {
        const value = this.getNestedValue(item, col);
        return String(value).length;
      }));
      
      // Use the actual content length as minimum, with some padding
      const minWidthForContent = Math.min(maxContentLength + 2, 25); // Cap at reasonable max
      calculatedWidths[index] = Math.max(calculatedWidths[index], minWidthForContent);
    });
    
    const tableOptions: Table.TableConstructorOptions = {
      head: columns.map(col => chalk.cyan(col)),
      style: { border: [], head: [] },
      wordWrap: false,
      colWidths: calculatedWidths,
    };

    const table = new Table(tableOptions);

    data.forEach(item => {
      const row = columns.map(col => {
        const value = this.getNestedValue(item, col);
        return this.formatValue(value);
      });
      table.push(row);
    });

    return table.toString();
  }

  private formatApiResponseTable(data: ApiResponse, options: FormatOptions = {}): string {
    // For API responses, focus on the actual data rather than the wrapper
    if (data.isSuccess && data.data) {
      // If data itself is an array
      if (Array.isArray(data.data)) {
        return this.formatArrayTable(data.data, options);
      }
      
      // Check for collection patterns - single key with array value
      const collectionArray = this.detectCollectionPattern(data.data);
      if (collectionArray) {
        return this.formatArrayTable(collectionArray, options);
      }
      
      // Check if data is empty object
      if (typeof data.data === 'object' && Object.keys(data.data).length === 0) {
        // For successful operations with empty data, show a success message
        return chalk.green('✓ Operation completed successfully');
      }
      
      // For simple objects, show them directly
      return this.formatObjectTable(data.data);
    }
    
    // For successful responses with no data, show success message
    if (data.isSuccess) {
      return chalk.green('✓ Operation completed successfully');
    }
    
    // For error responses, show the full response
    const table = new Table({
      style: { border: [], head: [] }
    });

    table.push(['isSuccess', data.isSuccess ? chalk.green('true') : chalk.red('false')]);
    if (data.code !== undefined) {
      table.push(['code', chalk.yellow(data.code.toString())]);
    }
    if (data.message) {
      table.push(['message', data.message]);
    }
    if (data.data && !data.isSuccess) {
      table.push(['error', this.formatValue(data.data)]);
    }

    return table.toString();
  }

  private formatObjectTable(data: Record<string, any>): string {
    const table = new Table({
      style: { border: [], head: [] }
    });

    Object.entries(data).forEach(([key, value]) => {
      table.push([
        chalk.cyan(key),
        this.formatValue(value)
      ]);
    });

    return table.toString();
  }

  private detectCollectionPattern(data: any): any[] | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return null;
    }
    
    const keys = Object.keys(data);
    
    // Collection responses typically have only one key with an array value
    if (keys.length === 1) {
      const key = keys[0];
      const value = data[key];
      
      if (Array.isArray(value)) {
        return value;
      }
    }
    
    return null;
  }

  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return chalk.gray('null');
    }

    if (typeof value === 'boolean') {
      return value ? chalk.green('true') : chalk.red('false');
    }

    if (typeof value === 'number') {
      return chalk.yellow(value.toString());
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      return this.formatComplexObject(value);
    }

    if (Array.isArray(value)) {
      // Show actual array values instead of just count
      if (value.length === 0) {
        return '[]';
      }
      
      // Format array as JSON but with smart truncation
      const formatted = JSON.stringify(value, null, 0);
      
      // If array is short, show it completely
      if (formatted.length <= 100) {
        return formatted;
      }
      
      // For longer arrays, show first few items and truncate
      if (value.length <= 3) {
        return formatted.substring(0, 97) + '...';
      }
      
      // Show first 2 items and indicate more
      const shortArray = value.slice(0, 2);
      const shortFormatted = JSON.stringify(shortArray, null, 0);
      return shortFormatted.replace(']', `, ...+${value.length - 2}]`);
    }

    // Handle string values - check if it's JSON and format accordingly
    const str = String(value);
    
    // Try to parse as JSON and format it
    if (str.startsWith('{') || str.startsWith('[')) {
      try {
        const parsed = JSON.parse(str);
        const formatted = JSON.stringify(parsed, null, 2);
        
        // If formatted JSON is still too long, truncate it
        if (formatted.length > 800) {
          const truncated = formatted.substring(0, 797) + '...';
          return truncated;
        }
        return formatted;
      } catch {
        // Not valid JSON, treat as regular string
      }
    }
    
    // Truncate very long non-JSON strings
    if (str.length > 100) {
      return str.substring(0, 97) + '...';
    }
    return str;
  }

  private formatComplexObject(obj: any): string {
    // Format object as JSON with proper indentation
    const formatted = JSON.stringify(obj, null, 2);
    
    // If object is reasonably sized, show it completely
    if (formatted.length <= 1200) {
      return formatted;
    }
    
    // For very large objects, truncate but still show structure
    return formatted.substring(0, 1197) + '...';
  }

  private truncateValue(value: any, maxLength = 20): string {
    const str = String(value);
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }

  private inferColumns(data: any[]): string[] {
    if (data.length === 0) {
      return [];
    }

    // Get all unique keys from all objects
    const keys = new Set<string>();
    data.forEach(item => {
      Object.keys(item).forEach(key => keys.add(key));
    });

    // Prioritize columns based on data type
    const priorityColumns = ['name', 'id', 'type', 'active', 'status', 'online', 'visible', 'index'];
    
    // For scenarios, prioritize scenario-specific columns
    if (keys.has('active') && keys.has('type') && keys.has('index')) {
      return ['name', 'type', 'active', 'index'].filter(col => keys.has(col));
    }
    
    // For rooms, prioritize room-specific columns
    if (keys.has('visible') && keys.has('order')) {
      return ['name', 'id', 'order', 'visible'].filter(col => keys.has(col));
    }
    
    // General priority sorting
    const sortedKeys = Array.from(keys).sort((a, b) => {
      const aPriority = priorityColumns.indexOf(a);
      const bPriority = priorityColumns.indexOf(b);
      
      if (aPriority !== -1 && bPriority !== -1) {
        return aPriority - bPriority;
      }
      
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      
      return a.localeCompare(b);
    });

    // Limit columns for readability
    return sortedKeys;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  private shouldUseVerticalLayout(data: any[], columns: string[], terminalWidth: number): boolean {
    // Use vertical layout if:
    // 1. Too many columns (>6)
    // 2. Estimated total width exceeds terminal width
    // 3. Data contains complex objects
    
    if (columns.length > 6) {
      return true;
    }
    
    // Check if any values are complex objects
    const hasComplexObjects = data.some(item => 
      columns.some(col => {
        const value = this.getNestedValue(item, col);
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      })
    );
    
    if (hasComplexObjects) {
      return true;
    }
    
    // Estimate width needed
    const estimatedWidth = columns.reduce((total, col) => {
      const headerWidth = col.length;
      const maxContentWidth = Math.max(...data.map(item => {
        const value = this.getNestedValue(item, col);
        return String(value).length;
      }));
      return total + Math.max(headerWidth, Math.min(maxContentWidth, 30)) + 3; // +3 for padding
    }, 0);
    
    return estimatedWidth > terminalWidth;
  }

  private formatVerticalTable(data: any[], columns: string[]): string {
    const sections = data.map((item, index) => {
      const table = new Table({
        style: { border: [], head: [] }
      });
      
      columns.forEach(col => {
        const value = this.getNestedValue(item, col);
        table.push([
          chalk.cyan(col),
          this.formatValueVerbose(value)
        ]);
      });
      
      const header = item.name ? `Item: ${chalk.bold(item.name)}` : `Item ${index + 1}`;
      return `${chalk.green(header)}\n${table.toString()}`;
    });
    
    return sections.join('\n\n');
  }

  private formatValueVerbose(value: any): string {
    if (value === null || value === undefined) {
      return chalk.gray('null');
    }

    if (typeof value === 'boolean') {
      return value ? chalk.green('true') : chalk.red('false');
    }

    if (typeof value === 'number') {
      return chalk.yellow(value.toString());
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      // In vertical mode, we can show more detail
      return JSON.stringify(value, null, 2);
    }

    if (Array.isArray(value)) {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  private calculateColumnWidths(data: any[], columns: string[], terminalWidth: number): number[] {
    const minWidth = 15;
    const maxWidth = 60;
    const padding = 3;

    const totalWidth = terminalWidth - (columns.length * padding);

    const contentWidths = columns.map(col => {
      const headerWidth = col.length;
      const columnData = data.map(item => {
        const value = this.getNestedValue(item, col);
        return this.formatValue(value).length;
      });
      return Math.max(headerWidth, ...columnData);
    });

    const totalContentWidth = contentWidths.reduce((sum, width) => sum + width, 0);

    if (totalContentWidth <= totalWidth) {
      return contentWidths.map(width => Math.min(maxWidth, width));
    }

    const shrinkFactor = totalWidth / totalContentWidth;
    const columnWidths = contentWidths.map((width) => {
      const shrinkedWidth = Math.floor(width * shrinkFactor);
      
      // Ensure minimum width to prevent excessive truncation
      const minReasonableWidth = 8; // Minimum width for any column
      return Math.max(shrinkedWidth, minReasonableWidth);
    });

    const remainingWidth = totalWidth - columnWidths.reduce((sum, width) => sum + width, 0);
    const sortedIndices = columnWidths.map((_, i) => i).sort((a, b) => columnWidths[b] - columnWidths[a]);

    for (let i = 0; i < remainingWidth; i++) {
      columnWidths[sortedIndices[i % sortedIndices.length]]++;
    }

    return columnWidths.map((width) => {
      return Math.max(minWidth, Math.min(maxWidth, width));
    });
  }
}

export default OutputFormatter;