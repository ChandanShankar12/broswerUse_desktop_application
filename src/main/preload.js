const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    runAgent: async (data) => {
      try {
        const result = await ipcRenderer.invoke('run-agent', data);
        return result;
      } catch (error) {
        console.error('Error invoking run-agent:', error);
        return {
          status: 'error',
          message: error.message || 'Unknown error occurred'
        };
      }
    },
    
    stopAgent: async () => {
      try {
        return await ipcRenderer.invoke('stop-agent');
      } catch (error) {
        console.error('Error invoking stop-agent:', error);
        return {
          status: 'error',
          message: error.message || 'Unknown error occurred'
        };
      }
    },
    
    runDeepSearch: async (data) => {
      try {
        const result = await ipcRenderer.invoke('run-deep-search', data);
        return result;
      } catch (error) {
        console.error('Error invoking run-deep-search:', error);
        return {
          status: 'error',
          message: error.message || 'Unknown error occurred'
        };
      }
    },
    
    stopResearchAgent: async () => {
      try {
        return await ipcRenderer.invoke('stop-research-agent');
      } catch (error) {
        console.error('Error invoking stop-research-agent:', error);
        return {
          status: 'error',
          message: error.message || 'Unknown error occurred'
        };
      }
    },
    
    getRecordings: async (directory) => {
      try {
        return await ipcRenderer.invoke('get-recordings', directory);
      } catch (error) {
        console.error('Error invoking get-recordings:', error);
        return {
          status: 'error',
          message: error.message || 'Unknown error occurred'
        };
      }
    },
    
    // Configuration management
    saveConfig: async (data) => {
      try {
        return await ipcRenderer.invoke('save-config', data);
      } catch (error) {
        console.error('Error invoking save-config:', error);
        return {
          status: 'error',
          message: error.message || 'Unknown error occurred'
        };
      }
    },
    
    getConfigs: async () => {
      try {
        return await ipcRenderer.invoke('get-configs');
      } catch (error) {
        console.error('Error invoking get-configs:', error);
        return {
          status: 'error',
          message: error.message || 'Unknown error occurred'
        };
      }
    },
    
    loadConfig: async (configName) => {
      try {
        return await ipcRenderer.invoke('load-config', configName);
      } catch (error) {
        console.error('Error invoking load-config:', error);
        return {
          status: 'error',
          message: error.message || 'Unknown error occurred'
        };
      }
    },
    
    onPythonMessage: (callback) => {
      const wrappedCallback = (event, ...args) => {
        try {
          callback(...args);
        } catch (error) {
          console.error('Error in python message callback:', error);
        }
      };
      ipcRenderer.on('python-message', wrappedCallback);
      return () => {
        ipcRenderer.removeListener('python-message', wrappedCallback);
      };
    },
    
    onPythonError: (callback) => {
      const wrappedCallback = (event, ...args) => {
        try {
          callback(...args);
        } catch (error) {
          console.error('Error in python error callback:', error);
        }
      };
      ipcRenderer.on('python-error', wrappedCallback);
      return () => {
        ipcRenderer.removeListener('python-error', wrappedCallback);
      };
    },
    
    removeListener: (channel) => {
      ipcRenderer.removeAllListeners(channel);
    }
  }
); 