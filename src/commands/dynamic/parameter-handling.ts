import { Command } from 'commander';
import type { CommandOptions, MethodSchema } from '../../types/index.js';

export function addSchemaOptions(cmd: Command, properties: Record<string, any>, prefix = '', excludeParams: string[] = []): void {
  Object.keys(properties).forEach(key => {
    const prop = properties[key];
    
    if (prop.properties) {
      // Recursively handle nested objects
      addSchemaOptions(cmd, prop.properties, prefix ? `${prefix}-${key}` : key, excludeParams);
    } else if (prop.type && (prop.type === 'string' || prop.type === 'number' || prop.type === 'integer' || prop.type === 'boolean')) {
      // Skip if this parameter is already handled as a positional argument
      if (excludeParams.includes(key)) {
        return;
      }
      
      // Use the actual parameter name directly - no hardcoding needed!
      const optionName = key; // Simple: just use the leaf parameter name
      const flagName = `--${optionName.replace(/[A-Z]/g, '-$&').toLowerCase()}`;
      
      if (prop.type === 'string') {
        cmd.option(`${flagName} <value>`, prop.description);
      } else if (prop.type === 'number' || prop.type === 'integer') {
        cmd.option(`${flagName} <number>`, prop.description);
      } else if (prop.type === 'boolean') {
        cmd.option(flagName, prop.description);
      }
    }
    // For complex types that aren't objects, we'll rely on JSON input
  });
}

export function getPositionalParameters(methodSchema: MethodSchema): Array<{name: string, path: string[], type: string, required: boolean}> {
  const positionalParams: Array<{name: string, path: string[], type: string, required: boolean}> = [];
  
  if (!methodSchema.params || !methodSchema.params.properties) {
    return positionalParams;
  }
  
  const paramsSchema = methodSchema.params as any;
  
  // Recursively search for required parameters that could be positional
  function searchParams(obj: any, path: string[] = [], requiredFields: string[] = []) {
    if (!obj || !obj.properties) return;
    
    const required = obj.required || requiredFields;
    
    for (const [key, prop] of Object.entries(obj.properties) as [string, any][]) {
      const currentPath = [...path, key];
      const isRequired = required.includes(key);
      
      if (prop.properties) {
        // Recurse into nested objects
        searchParams(prop, currentPath, prop.required);
      } else if (isRequired && (prop.type === 'string' || prop.type === 'number' || prop.type === 'integer')) {
        // This is a potential positional parameter
        positionalParams.push({
          name: key,
          path: currentPath,
          type: prop.type,
          required: isRequired
        });
      }
    }
  }
  
  searchParams(paramsSchema);
  
  // Sort by path depth and name to ensure consistent ordering
  return positionalParams.sort((a, b) => {
    if (a.path.length !== b.path.length) {
      return a.path.length - b.path.length;
    }
    return a.name.localeCompare(b.name);
  });
}

export function mergePositionalParameters(params: any, methodSchema: MethodSchema, positionalArgs: any[]): any {
  const positionalParams = getPositionalParameters(methodSchema);
  
  for (let i = 0; i < Math.min(positionalArgs.length, positionalParams.length); i++) {
    const param = positionalParams[i];
    const value = positionalArgs[i];
    
    // Convert value to appropriate type
    let convertedValue = value;
    if (param.type === 'number' || param.type === 'integer') {
      convertedValue = parseInt(value);
      if (isNaN(convertedValue)) {
        throw new Error(`Invalid ${param.type} value for parameter '${param.name}': ${value}`);
      }
    } else if (param.type === 'string') {
      convertedValue = value.toString();
    }
    
    // Build nested structure based on path
    let current = params;
    for (let j = 0; j < param.path.length - 1; j++) {
      const pathSegment = param.path[j];
      if (!current[pathSegment]) {
        current[pathSegment] = {};
      }
      current = current[pathSegment];
    }
    
    // Set the final value
    const finalKey = param.path[param.path.length - 1];
    current[finalKey] = convertedValue;
  }
  
  return params;
}

export async function buildParams(options: CommandOptions, methodSchema: MethodSchema, positionalArgs: any[] = []): Promise<any> {
  let params: any = {};

  // 1. If JSON params provided directly via --params option
  if (options.params) {
    try {
      params = JSON.parse(options.params);
    } catch (error: any) {
      throw new Error(`Invalid JSON in --params option: ${error.message}`);
    }
  }

  // 2. If a file is provided via --file option, merge its contents
  if (options.file) {
    const { readFile } = await import('node:fs/promises');
    try {
      const fileContent = await readFile(options.file, 'utf8');
      const fileParams = JSON.parse(fileContent);
      params = { ...params, ...fileParams }; // file params can override --params
    } catch (error: any) {
      throw new Error(`Failed to read or parse parameters from file: ${error.message}`);
    }
  }

  // 3. Build params from individual command-line options (e.g., --id 123)
  // These will override any values from --params or --file
  if (methodSchema.params && methodSchema.params.properties) {
    const schemaParams = buildSchemaParams(options, methodSchema.params.properties);
    params = { ...params, ...schemaParams };
  }

  // 4. Handle positional arguments
  if (positionalArgs.length > 0) {
    params = mergePositionalParameters(params, methodSchema, positionalArgs);
  }

  // 5. If no params provided but schema requires them, build default structure
  if (Object.keys(params).length === 0 && methodSchema.params && (methodSchema.params as any).required) {
    params = buildDefaultParams(methodSchema);
  }

  return params;
}

export function buildDefaultParams(methodSchema: MethodSchema): any {
  const params: any = {};
  
  if (!methodSchema.params || !methodSchema.params.properties) {
    return params;
  }

  // Build required nested structure based on schema
  const paramsSchema = methodSchema.params as any;
  for (const requiredField of paramsSchema.required || []) {
    const fieldSchema = paramsSchema.properties[requiredField];
    
    if (fieldSchema && fieldSchema.type === 'object' && fieldSchema.properties) {
      params[requiredField] = {};
      
      // Handle nested required fields
      if (fieldSchema.required) {
        for (const nestedField of fieldSchema.required) {
          const nestedSchema = fieldSchema.properties[nestedField];
          if (nestedSchema && nestedSchema.type === 'object') {
            params[requiredField][nestedField] = {};
          }
        }
      }
    }
  }

  return params;
}

/**
 * Recursively builds a parameter object from command options based on a method's schema properties.
 * @param options - The command options object from Commander.
 * @param properties - The properties object from the method's schema.
 * @param result - The object to build the parameters into.
 * @param prefix - A prefix for nested option names.
 * @returns The constructed parameters object.
 */
export function buildSchemaParams(options: any, properties: Record<string, any>, result: any = {}, prefix = ''): any {
  Object.keys(properties).forEach(key => {
    const prop = properties[key];
    
    if (prop.properties) {
      // Handle nested objects recursively
      if (!result[key]) {
        result[key] = {};
      }
      buildSchemaParams(options, prop.properties, result[key], prefix ? `${prefix}-${key}` : key);
    } else if (prop.type && (prop.type === 'string' || prop.type === 'number' || prop.type === 'integer' || prop.type === 'boolean')) {
      // Use the actual parameter name directly - no hardcoding needed!
      const optionName = key; // Simple: just use the leaf parameter name
      
      // Convert to camelCase for Commander lookup (though it should already be the same)
      const flagKey = optionName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

      if (options[flagKey] !== undefined) {
        if ((prop.type === 'number' || prop.type === 'integer') && typeof options[flagKey] === 'string') {
          result[key] = parseInt(options[flagKey], 10);
          if (isNaN(result[key])) {
            throw new Error(`Invalid number for option "--${optionName}"`);
          }
        } else if (prop.type === 'boolean') {
          result[key] = true; // Commander sets boolean flags to true when present
        } else {
          result[key] = options[flagKey];
        }
      }
    }
  });

  return result;
}