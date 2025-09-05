import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import keytar from 'keytar';
import type { ConfigData, ProfileInfo, SprutHubCredentials } from '../types/index.js';

const SERVICE_NAME = 'spruthub-cli';
const CONFIG_DIR = join(homedir(), '.spruthub');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

class ConfigManager {
  private config: ConfigData | null = null;

  async ensureConfigDir(): Promise<void> {
    try {
      await fs.access(CONFIG_DIR);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  async loadConfig(): Promise<ConfigData> {
    if (this.config) {
      return this.config;
    }

    try {
      await this.ensureConfigDir();
      const configData = await fs.readFile(CONFIG_FILE, 'utf8');
      this.config = JSON.parse(configData);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.config = {
          profiles: {},
          currentProfile: null,
          preferences: {
            outputFormat: 'table',
            timeout: 5000
          }
        };
      } else {
        throw error;
      }
    }

    return this.config!;
  }

  async saveConfig(): Promise<void> {
    if (!this.config) {
      throw new Error('No config to save');
    }
    await this.ensureConfigDir();
    await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  private async _withConfig(callback: (config: ConfigData) => Promise<void> | void): Promise<void> {
    const config = await this.loadConfig();
    await callback(config);
    this.config = config;
    await this.saveConfig();
  }

  async setCredentials(profileName: string, wsUrl: string, email: string, password: string, serial: string): Promise<void> {
    await this._withConfig(async (config) => {
      // Store credentials securely using keytar
      await keytar.setPassword(SERVICE_NAME, `${profileName}_password`, password);

      // Store non-sensitive data in config file
      config.profiles[profileName] = {
        wsUrl,
        email,
        serial,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };

      // Set as current profile if first one
      if (!config.currentProfile) {
        config.currentProfile = profileName;
      }
    });
  }

  async getCredentials(profileName?: string): Promise<SprutHubCredentials> {
    const config = await this.loadConfig();
    const targetProfile = profileName || config.currentProfile;

    if (!targetProfile) {
      throw new Error('No profile specified and no current profile set. Run "spruthub-cli login" first.');
    }

    const profile = config.profiles[targetProfile];
    if (!profile) {
      throw new Error(`Profile "${targetProfile}" not found. Available profiles: ${Object.keys(config.profiles).join(', ')}`);
    }

    // Retrieve password from secure storage
    const password = await keytar.getPassword(SERVICE_NAME, `${targetProfile}_password`);
    if (!password) {
      throw new Error(`Password not found for profile "${targetProfile}". Please run "spruthub-cli login" again.`);
    }

    return {
      wsUrl: profile.wsUrl,
      email: profile.email,
      password,
      serial: profile.serial
    };
  }

  async listProfiles(): Promise<{ profiles: Record<string, ProfileInfo>; currentProfile: string | null }> {
    const config = await this.loadConfig();
    return {
      profiles: config.profiles,
      currentProfile: config.currentProfile
    };
  }

  async setCurrentProfile(profileName: string): Promise<void> {
    await this._withConfig((config) => {
      if (!config.profiles[profileName]) {
        throw new Error(`Profile "${profileName}" not found`);
      }

      config.currentProfile = profileName;
      config.profiles[profileName].lastUsed = new Date().toISOString();
    });
  }

  async deleteProfile(profileName: string): Promise<void> {
    await this._withConfig(async (config) => {
      if (!config.profiles[profileName]) {
        throw new Error(`Profile "${profileName}" not found`);
      }

      // Remove from keytar
      try {
        await keytar.deletePassword(SERVICE_NAME, `${profileName}_password`);
      } catch (error) {
        // Password might not exist, continue anyway
      }

      // Remove from config
      delete config.profiles[profileName];

      // Update current profile if needed
      if (config.currentProfile === profileName) {
        const remainingProfiles = Object.keys(config.profiles);
        config.currentProfile = remainingProfiles.length > 0 ? remainingProfiles[0] : null;
      }
    });
  }

  async getPreferences(): Promise<ConfigData['preferences']> {
    const config = await this.loadConfig();
    return config.preferences;
  }

  async setPreference<K extends keyof ConfigData['preferences']>(key: K, value: ConfigData['preferences'][K]): Promise<void> {
    await this._withConfig((config) => {
      config.preferences[key] = value;
    });
  }

  async clearAllData(): Promise<void> {
    const config = await this.loadConfig();

    // Clear all passwords from keytar
    for (const profileName of Object.keys(config.profiles)) {
      try {
        await keytar.deletePassword(SERVICE_NAME, `${profileName}_password`);
      } catch (error) {
        // Ignore errors
      }
    }

    // Remove config file
    try {
      await fs.unlink(CONFIG_FILE);
    } catch (error) {
      // Ignore if file doesn't exist
    }

    this.config = null;
  }
}

// Export singleton instance
export default new ConfigManager();