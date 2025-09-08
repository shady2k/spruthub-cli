import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  extractScenarioCode,
  injectScenarioCode,
  hasExtractedCode,
  validateScenarioDirectory,
  restoreFromRemoteData,
  getScenarioType,
  type ScenarioData
} from '../../src/utils/scenario-code.js';

// Mock chalk for cleaner test output
jest.mock('chalk', () => ({
  green: jest.fn((str: string) => str),
  yellow: jest.fn((str: string) => str),
  cyan: jest.fn((str: string) => str),
  gray: jest.fn((str: string) => str)
}));

describe('scenario-code utilities', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    const randomSuffix = randomBytes(8).toString('hex');
    tempDir = resolve(tmpdir(), `scenario-test-${randomSuffix}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('validateScenarioDirectory', () => {
    it('should return invalid for non-existent directory', async () => {
      const nonExistentDir = resolve(tempDir, 'non-existent');
      const result = await validateScenarioDirectory(nonExistentDir);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to read or parse metadata.json');
    });

    it('should return invalid for directory without metadata.json', async () => {
      const result = await validateScenarioDirectory(tempDir);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to read or parse metadata.json');
    });

    it('should return invalid for directory with invalid metadata.json', async () => {
      const metadataPath = resolve(tempDir, 'metadata.json');
      await fs.writeFile(metadataPath, 'invalid json');
      
      const result = await validateScenarioDirectory(tempDir);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to read or parse metadata.json');
    });

    it('should validate LOGIC scenario with legacy format successfully', async () => {
      const metadata = {
        index: '1',
        name: 'Test Logic',
        type: 'LOGIC',
        data: '__CODE__'
      };
      
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      await fs.writeFile(resolve(tempDir, 'code.js'), 'console.log("test");');
      
      const result = await validateScenarioDirectory(tempDir);
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });


    it('should return invalid when data.json is missing for BLOCK format', async () => {
      const metadata = {
        index: '1',
        name: 'Test Block',
        type: 'BLOCK',
        data: '__DATA__'
      };
      
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      // Missing data.json
      
      const result = await validateScenarioDirectory(tempDir);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to read or parse data.json');
    });

    it('should return invalid when data.json contains invalid JSON', async () => {
      const metadata = {
        index: '1',
        name: 'Test Block',
        type: 'BLOCK',
        data: '__DATA__'
      };
      
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      await fs.writeFile(resolve(tempDir, 'data.json'), 'invalid json');
      
      const result = await validateScenarioDirectory(tempDir);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to read or parse data.json');
    });

    it('should validate BLOCK scenario with code blocks successfully', async () => {
      const metadata = {
        index: '1',
        name: 'Test Block',
        type: 'BLOCK',
        data: '__DATA__'
      };
      
      const blockData = {
        targets: [
          { type: 'action', id: 1 },
          { type: 'code', blockId: 123, code: '__BLOCK_123__' },
          { type: 'code', blockId: 456, code: '__BLOCK_456__' }
        ]
      };
      
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      await fs.writeFile(resolve(tempDir, 'data.json'), JSON.stringify(blockData, null, 2));
      await fs.writeFile(resolve(tempDir, 'block-123.js'), 'console.log("block 123");');
      await fs.writeFile(resolve(tempDir, 'block-456.js'), 'console.log("block 456");');
      
      const result = await validateScenarioDirectory(tempDir);
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid when BLOCK scenario is missing code files', async () => {
      const metadata = {
        index: '1',
        name: 'Test Block',
        type: 'BLOCK',
        data: '__DATA__'
      };
      
      const blockData = {
        targets: [
          { type: 'code', blockId: 123, code: '__BLOCK_123__' }
        ]
      };
      
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      await fs.writeFile(resolve(tempDir, 'data.json'), JSON.stringify(blockData, null, 2));
      // Missing block-123.js
      
      const result = await validateScenarioDirectory(tempDir);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing code file block-123.js');
    });
  });

  describe('extractScenarioCode', () => {
    it('should extract LOGIC scenario with new format', async () => {
      const scenarioData: ScenarioData = {
        index: '1',
        name: 'Test Logic',
        type: 'LOGIC',
        desc: 'Test description',
        active: true,
        onStart: false,
        sync: true,
        data: 'console.log("Hello World");'
      };
      
      const scenarioDir = resolve(tempDir, 'scenario-1');
      await extractScenarioCode(scenarioData, scenarioDir);
      
      // Check that files were created (no data.json for LOGIC scenarios)
      const backupExists = await fs.access(resolve(scenarioDir, 'backup.json')).then(() => true).catch(() => false);
      const dataExists = await fs.access(resolve(scenarioDir, 'data.json')).then(() => true).catch(() => false);
      const metadataExists = await fs.access(resolve(scenarioDir, 'metadata.json')).then(() => true).catch(() => false);
      const codeExists = await fs.access(resolve(scenarioDir, 'code.js')).then(() => true).catch(() => false);
      
      expect(backupExists).toBe(true);
      expect(dataExists).toBe(false); // No data.json for LOGIC scenarios
      expect(metadataExists).toBe(true);
      expect(codeExists).toBe(true);
      
      // Check content of files
      const metadata = JSON.parse(await fs.readFile(resolve(scenarioDir, 'metadata.json'), 'utf8'));
      expect(metadata.data).toBe('__CODE__'); // Legacy format for LOGIC scenarios
      expect(metadata.name).toBe('Test Logic');
      
      const codeContent = await fs.readFile(resolve(scenarioDir, 'code.js'), 'utf8');
      expect(codeContent).toBe('console.log("Hello World");');
    });

    it('should extract BLOCK scenario with new format', async () => {
      const blockData = {
        targets: [
          { type: 'action', id: 1, name: 'Test Action' },
          { type: 'code', blockId: 123, code: 'console.log("block 1");' },
          { type: 'code', blockId: 456, code: 'console.log("block 2");' }
        ]
      };
      
      const scenarioData: ScenarioData = {
        index: '1',
        name: 'Test Block',
        type: 'BLOCK',
        desc: 'Test block scenario',
        active: true,
        onStart: false,
        sync: true,
        data: JSON.stringify(blockData)
      };
      
      const scenarioDir = resolve(tempDir, 'scenario-1');
      await extractScenarioCode(scenarioData, scenarioDir);
      
      // Check that all files were created
      const backupExists = await fs.access(resolve(scenarioDir, 'backup.json')).then(() => true).catch(() => false);
      const dataExists = await fs.access(resolve(scenarioDir, 'data.json')).then(() => true).catch(() => false);
      const metadataExists = await fs.access(resolve(scenarioDir, 'metadata.json')).then(() => true).catch(() => false);
      const block123Exists = await fs.access(resolve(scenarioDir, 'block-123.js')).then(() => true).catch(() => false);
      const block456Exists = await fs.access(resolve(scenarioDir, 'block-456.js')).then(() => true).catch(() => false);
      
      expect(backupExists).toBe(true);
      expect(dataExists).toBe(true);
      expect(metadataExists).toBe(true);
      expect(block123Exists).toBe(true);
      expect(block456Exists).toBe(true);
      
      // Check content
      const metadata = JSON.parse(await fs.readFile(resolve(scenarioDir, 'metadata.json'), 'utf8'));
      expect(metadata.data).toBe('__DATA__');
      
      const extractedData = JSON.parse(await fs.readFile(resolve(scenarioDir, 'data.json'), 'utf8'));
      expect(extractedData.targets).toHaveLength(3);
      expect(extractedData.targets[1].code).toBe('__BLOCK_123__');
      expect(extractedData.targets[2].code).toBe('__BLOCK_456__');
      
      const block123Code = await fs.readFile(resolve(scenarioDir, 'block-123.js'), 'utf8');
      expect(block123Code).toBe('console.log("block 1");');
      
      const block456Code = await fs.readFile(resolve(scenarioDir, 'block-456.js'), 'utf8');
      expect(block456Code).toBe('console.log("block 2");');
    });
  });

  describe('injectScenarioCode', () => {

    it('should inject LOGIC scenario with legacy format', async () => {
      const scenarioDir = resolve(tempDir, 'scenario-1');
      await fs.mkdir(scenarioDir, { recursive: true });
      
      const metadata = {
        index: '1',
        name: 'Test Logic',
        type: 'LOGIC',
        data: '__CODE__'
      };
      
      await fs.writeFile(resolve(scenarioDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      await fs.writeFile(resolve(scenarioDir, 'code.js'), 'console.log("legacy code");');
      
      const result = await injectScenarioCode(scenarioDir);
      
      expect(result.data).toBe('console.log("legacy code");');
      expect(result.name).toBe('Test Logic');
      expect(result.type).toBe('LOGIC');
    });

    it('should inject BLOCK scenario with code blocks', async () => {
      const scenarioDir = resolve(tempDir, 'scenario-1');
      await fs.mkdir(scenarioDir, { recursive: true });
      
      const metadata = {
        index: '1',
        name: 'Test Block',
        type: 'BLOCK',
        data: '__DATA__'
      };
      
      const blockData = {
        targets: [
          { type: 'action', id: 1 },
          { type: 'code', blockId: 123, code: '__BLOCK_123__' },
          { type: 'code', blockId: 456, code: '__BLOCK_456__' }
        ]
      };
      
      await fs.writeFile(resolve(scenarioDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      await fs.writeFile(resolve(scenarioDir, 'data.json'), JSON.stringify(blockData, null, 2));
      await fs.writeFile(resolve(scenarioDir, 'block-123.js'), 'console.log("injected block 1");');
      await fs.writeFile(resolve(scenarioDir, 'block-456.js'), 'console.log("injected block 2");');
      
      const result = await injectScenarioCode(scenarioDir);
      
      const resultData = JSON.parse(result.data);
      expect(resultData.targets).toHaveLength(3);
      expect(resultData.targets[1].code).toBe('console.log("injected block 1");');
      expect(resultData.targets[2].code).toBe('console.log("injected block 2");');
    });

    it('should throw error for missing metadata.json', async () => {
      const scenarioDir = resolve(tempDir, 'scenario-1');
      await fs.mkdir(scenarioDir, { recursive: true });
      
      await expect(injectScenarioCode(scenarioDir)).rejects.toThrow('Failed to read metadata.json');
    });

    it('should throw error for missing data.json in BLOCK format', async () => {
      const scenarioDir = resolve(tempDir, 'scenario-1');
      await fs.mkdir(scenarioDir, { recursive: true });
      
      const metadata = {
        index: '1',
        name: 'Test Block',
        type: 'BLOCK',
        data: '__DATA__'
      };
      
      await fs.writeFile(resolve(scenarioDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      // Missing data.json
      
      await expect(injectScenarioCode(scenarioDir)).rejects.toThrow('Failed to read data.json');
    });

    it('should throw error for missing code files in BLOCK scenario', async () => {
      const scenarioDir = resolve(tempDir, 'scenario-1');
      await fs.mkdir(scenarioDir, { recursive: true });
      
      const metadata = {
        index: '1',
        name: 'Test Block',
        type: 'BLOCK',
        data: '__DATA__'
      };
      
      const blockData = {
        targets: [
          { type: 'code', blockId: 123, code: '__BLOCK_123__' }
        ]
      };
      
      await fs.writeFile(resolve(scenarioDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
      await fs.writeFile(resolve(scenarioDir, 'data.json'), JSON.stringify(blockData, null, 2));
      // Missing block-123.js
      
      await expect(injectScenarioCode(scenarioDir)).rejects.toThrow('Failed to read code file block-123.js');
    });
  });

  describe('hasExtractedCode', () => {
    it('should return false for non-existent directory', async () => {
      const nonExistentDir = resolve(tempDir, 'non-existent');
      const result = await hasExtractedCode(nonExistentDir);
      expect(result).toBe(false);
    });

    it('should return false for directory without metadata.json', async () => {
      const result = await hasExtractedCode(tempDir);
      expect(result).toBe(false);
    });

    it('should return true for new format with data.json', async () => {
      const metadata = { data: '__DATA__' };
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata));
      await fs.writeFile(resolve(tempDir, 'data.json'), '{}');
      
      const result = await hasExtractedCode(tempDir);
      expect(result).toBe(true);
    });

    it('should return true for legacy format with __CODE__ placeholder', async () => {
      const metadata = { data: '__CODE__' };
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata));
      
      const result = await hasExtractedCode(tempDir);
      expect(result).toBe(true);
    });

    it('should return true for new format with __DATA__ placeholder', async () => {
      const metadata = { data: '__DATA__' };
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata));
      // Even without data.json, it should return true if placeholder exists
      
      const result = await hasExtractedCode(tempDir);
      expect(result).toBe(true);
    });

    it('should return false for normal metadata without placeholders', async () => {
      const metadata = { data: 'normal data' };
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata));
      
      const result = await hasExtractedCode(tempDir);
      expect(result).toBe(false);
    });
  });

  describe('getScenarioType', () => {
    it('should return null for non-existent directory', async () => {
      const nonExistentDir = resolve(tempDir, 'non-existent');
      const result = await getScenarioType(nonExistentDir);
      expect(result).toBeNull();
    });

    it('should return null for directory without metadata.json', async () => {
      const result = await getScenarioType(tempDir);
      expect(result).toBeNull();
    });

    it('should return correct type for LOGIC scenario', async () => {
      const metadata = { type: 'LOGIC' };
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata));
      
      const result = await getScenarioType(tempDir);
      expect(result).toBe('LOGIC');
    });

    it('should return correct type for BLOCK scenario', async () => {
      const metadata = { type: 'BLOCK' };
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata));
      
      const result = await getScenarioType(tempDir);
      expect(result).toBe('BLOCK');
    });

    it('should return correct type for GLOBAL scenario', async () => {
      const metadata = { type: 'GLOBAL' };
      await fs.writeFile(resolve(tempDir, 'metadata.json'), JSON.stringify(metadata));
      
      const result = await getScenarioType(tempDir);
      expect(result).toBe('GLOBAL');
    });
  });

  describe('restoreFromRemoteData', () => {
    it('should restore LOGIC scenario from remote data', async () => {
      const scenarioDir = resolve(tempDir, 'scenario-1');
      const originalRemoteData: ScenarioData = {
        index: '1',
        name: 'Original Logic',
        type: 'LOGIC',
        desc: 'Original description',
        active: true,
        onStart: false,
        sync: true,
        data: 'console.log("original code");'
      };
      
      await restoreFromRemoteData(scenarioDir, originalRemoteData);
      
      // Check that the directory was properly restored (no data.json for LOGIC scenarios)
      const metadataExists = await fs.access(resolve(scenarioDir, 'metadata.json')).then(() => true).catch(() => false);
      const dataExists = await fs.access(resolve(scenarioDir, 'data.json')).then(() => true).catch(() => false);
      const codeExists = await fs.access(resolve(scenarioDir, 'code.js')).then(() => true).catch(() => false);
      
      expect(metadataExists).toBe(true);
      expect(dataExists).toBe(false); // No data.json for LOGIC scenarios
      expect(codeExists).toBe(true);
      
      const metadata = JSON.parse(await fs.readFile(resolve(scenarioDir, 'metadata.json'), 'utf8'));
      expect(metadata.name).toBe('Original Logic');
      expect(metadata.data).toBe('__CODE__'); // LOGIC scenarios use __CODE__ placeholder
      
      const codeContent = await fs.readFile(resolve(scenarioDir, 'code.js'), 'utf8');
      expect(codeContent).toBe('console.log("original code");');
    });

    it('should restore BLOCK scenario from remote data', async () => {
      const scenarioDir = resolve(tempDir, 'scenario-1');
      const blockData = {
        targets: [
          { type: 'code', blockId: 123, code: 'console.log("original block");' }
        ]
      };
      
      const originalRemoteData: ScenarioData = {
        index: '1',
        name: 'Original Block',
        type: 'BLOCK',
        desc: 'Original block scenario',
        active: true,
        onStart: false,
        sync: true,
        data: JSON.stringify(blockData)
      };
      
      await restoreFromRemoteData(scenarioDir, originalRemoteData);
      
      // Check that the directory was properly restored
      const metadataExists = await fs.access(resolve(scenarioDir, 'metadata.json')).then(() => true).catch(() => false);
      const dataExists = await fs.access(resolve(scenarioDir, 'data.json')).then(() => true).catch(() => false);
      const block123Exists = await fs.access(resolve(scenarioDir, 'block-123.js')).then(() => true).catch(() => false);
      
      expect(metadataExists).toBe(true);
      expect(dataExists).toBe(true);
      expect(block123Exists).toBe(true);
      
      const metadata = JSON.parse(await fs.readFile(resolve(scenarioDir, 'metadata.json'), 'utf8'));
      expect(metadata.name).toBe('Original Block');
      
      const blockCode = await fs.readFile(resolve(scenarioDir, 'block-123.js'), 'utf8');
      expect(blockCode).toBe('console.log("original block");');
    });
  });
});