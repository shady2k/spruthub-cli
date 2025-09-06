import { OutputFormatter } from '../../src/utils/formatter.js';

describe('OutputFormatter', () => {
  let formatter: OutputFormatter;

  beforeEach(() => {
    formatter = new OutputFormatter('json');
  });

  describe('formatJson', () => {
    it('should format simple object as JSON', () => {
      const data = { name: 'test', value: 42 };
      const result = formatter.format(data);
      
      expect(result).toBe('{\n  "name": "test",\n  "value": 42\n}');
    });

    it('should format array as JSON', () => {
      const data = ['a', 'b', 'c'];
      const result = formatter.format(data);
      
      expect(result).toBe('[\n  "a",\n  "b",\n  "c"\n]');
    });

    it('should format null as JSON', () => {
      const result = formatter.format(null);
      expect(result).toBe('null');
    });
  });

  describe('formatValue', () => {
    it('should format null values', () => {
      const result = (formatter as any).formatValue(null);
      expect(result).toContain('null');
    });

    it('should format boolean values', () => {
      const trueResult = (formatter as any).formatValue(true);
      const falseResult = (formatter as any).formatValue(false);
      expect(trueResult).toContain('true');
      expect(falseResult).toContain('false');
    });

    it('should format number values', () => {
      const result = (formatter as any).formatValue(42);
      expect(result).toBe('42');
    });

    it('should format string values', () => {
      const result = (formatter as any).formatValue('hello world');
      expect(result).toBe('hello world');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(150);
      const result = (formatter as any).formatValue(longString);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(longString.length);
    });
  });
});