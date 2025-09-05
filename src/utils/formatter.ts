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

    // Handle Spruthub API response format
    if (data.isSuccess !== undefined && data.data) {
      return this.formatApiResponseTable(data as ApiResponse, options);
    }

    // Handle simple key-value object
    return this.formatObjectTable(data);
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
      
      // For simple objects, show them directly
      return this.formatObjectTable(data.data);
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