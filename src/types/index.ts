export interface SprutHubCredentials {
  wsUrl: string;
  email: string;
  password: string;
  serial: string;
}

export interface ProfileInfo {
  wsUrl: string;
  email: string;
  serial: string;
  createdAt: string;
  lastUsed: string;
}

export interface ConfigData {
  profiles: Record<string, ProfileInfo>;
  currentProfile: string | null;
  preferences: {
    outputFormat: string;
    timeout: number;
  };
}

export interface ConnectionStatus {
  connected: boolean;
  error?: string;
  profile: string | null;
  version?: any;
}

export interface CommandOptions {
  profile?: string;
  verbose?: boolean;
  format?: string;
  force?: boolean;
  params?: string;
  file?: string;
}

export interface ApiResponse<T = any> {
  isSuccess: boolean;
  code: number;
  message: string;
  data: T;
}

export interface MethodSchema {
  description: string;
  category: string;
  method: string;
  rest?: {
    method: string;
    path: string;
  };
  params?: {
    type: string;
    properties?: Record<string, any>;
  };
}