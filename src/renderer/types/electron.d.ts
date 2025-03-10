export interface IElectronAPI {
  runAgent: (data: any) => Promise<any>;
  stopAgent: () => Promise<any>;
  runDeepSearch: (data: any) => Promise<any>;
  stopResearchAgent: () => Promise<any>;
  getRecordings: (directory: string) => Promise<any>;
  
  // Configuration management
  saveConfig: (data: any) => Promise<any>;
  getConfigs: () => Promise<any>;
  loadConfig: (configName: string) => Promise<any>;
  
  onPythonMessage: (callback: (message: any) => void) => (() => void);
  onPythonError: (callback: (error: any) => void) => (() => void);
  removeListener: (channel: string) => void;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}

export {}; 