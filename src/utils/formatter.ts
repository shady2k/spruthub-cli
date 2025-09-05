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
    
    switch (format) {
      case 'json':
        return this.formatJson(data, options);
      case 'yaml':
        return this.formatYaml(data, options);
      case 'table':
        return this.formatTable(data, options);
      default:
        return this.formatTable(data, options);
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

    // Handle single object
    if (data.data && Array.isArray(data.data)) {
      // Spruthub API response format
      return this.formatApiResponseTable(data as ApiResponse, options);
    }

    // Handle simple key-value object
    return this.formatObjectTable(data, options);
  }

  private formatArrayTable(data: any[], options: FormatOptions = {}): string {
    if (data.length === 0) {
      return chalk.gray('No data to display');
    }

    const columns = options.columns || this.inferColumns(data);
    const table = new Table({
      head: columns.map(col => chalk.cyan(col)),
      style: { border: [], head: [] },
      colWidths: columns.length > 2 ? [12, 80, 25] : undefined, // Limit column widths for readability
      wordWrap: true
    });

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
    const header: string[] = [];
    
    if (data.isSuccess !== undefined) {
      header.push(`Status: ${data.isSuccess ? chalk.green('Success') : chalk.red('Failed')}`);
    }
    
    if (data.message) {
      header.push(`Message: ${data.message}`);
    }

    if (data.code !== undefined) {
      header.push(`Code: ${data.code}`);
    }

    let output = header.length > 0 ? header.join(', ') + '\n\n' : '';

    if (data.data) {
      if (Array.isArray(data.data)) {
        output += this.formatArrayTable(data.data, options);
      } else {
        output += this.formatObjectTable(data.data, options);
      }
    }

    return output;
  }

  private formatObjectTable(data: Record<string, any>, options: FormatOptions = {}): string {
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
    
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    
    const text = String(value);
    
    // Word wrap long text (especially descriptions)
    if (text.length > 80) {
      return this.wordWrap(text, 80);
    }
    
    return text;
  }

  private wordWrap(text: string, width: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.join('\n');
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

    // Prioritize common/important columns
    const priorityColumns = ['id', 'name', 'type', 'status', 'online', 'value'];
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
    return sortedKeys.slice(0, 8);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  // Utility methods for specific data types
  formatAccessories(accessories: any[]): string {
    const columns = ['name', 'id', 'manufacturer', 'model', 'online', 'services'];
    return this.formatArrayTable(accessories, { columns });
  }

  formatScenarios(scenarios: any[]): string {
    const columns = ['name', 'id', 'enabled', 'lastRun', 'actions'];
    return this.formatArrayTable(scenarios, { columns });
  }

  formatRooms(rooms: any[]): string {
    const columns = ['name', 'id', 'accessories'];
    return this.formatArrayTable(rooms, { columns });
  }
}

export default OutputFormatter;