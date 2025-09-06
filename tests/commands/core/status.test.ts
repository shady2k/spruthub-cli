
import { statusCommand } from '../../../src/commands/core/status';
import configManager from '../../../src/config/manager';
import client from '../../../src/utils/client';

// Mock dependencies
jest.mock('../../../src/config/manager');
jest.mock('../../../src/utils/client');

const mockedConfigManager = jest.mocked(configManager);
const mockedClient = jest.mocked(client);

describe('statusCommand', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    // Spy on console methods to capture output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    // Restore original methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('should print a message when no profiles are configured', async () => {
    // Arrange
    mockedConfigManager.listProfiles.mockResolvedValue({ profiles: {}, currentProfile: null });

    // Act
    await statusCommand();

    // Assert
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No profiles configured.'));
  });

  it('should test connection for the current profile', async () => {
    // Arrange
    const profiles = {
      'default': { wsUrl: 'ws://localhost:1234', email: 'test@test.com', serial: '123', createdAt: new Date().toISOString(), lastUsed: new Date().toISOString() }
    };
    mockedConfigManager.listProfiles.mockResolvedValue({ profiles, currentProfile: 'default' });
    mockedClient.testConnection.mockResolvedValue({ connected: true, profile: 'default' });
    mockedClient.disconnect.mockResolvedValue(undefined);

    // Act
    await statusCommand();

    // Assert
    expect(mockedClient.testConnection).toHaveBeenCalledWith('default');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ Connection is healthy'));
  });
});
