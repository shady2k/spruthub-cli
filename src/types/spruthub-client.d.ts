declare module 'spruthub-client' {
  export class Sprut {
    constructor(options: {
      wsUrl: string;
      sprutEmail: string;
      sprutPassword: string;
      serial: string;
      logger: any;
      defaultTimeout?: number;
    });

    connected(): Promise<void>;
    execute(method: string, params?: any): Promise<any>;
    close(): Promise<void>;
    version(): Promise<any>;
    [key: string]: any;
  }

  export const Schema: {
    getAvailableMethods(): string[];
    getMethodSchema(methodName: string): any;
    getCategories(): string[];
    getMethodsByCategory(category: string): Record<string, any>;
    getRestMethods(): any[];
    schema: any;
  };
}