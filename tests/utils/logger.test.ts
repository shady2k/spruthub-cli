import logger from '../../src/utils/logger.js';

describe('Logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.VERBOSE;
  });

  it('should log success messages', () => {
    logger.success('Operation completed');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Operation completed'
    );
  });

  it('should log info messages when level allows', () => {
    logger.info('Information message');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[INFO]'),
      'Information message'
    );
  });

  it('should have shouldLog method working correctly', () => {
    // Test the shouldLog logic indirectly
    logger.error('Error message');
    
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]'),
      'Error message'
    );
  });
});