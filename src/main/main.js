const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const serve = require('electron-serve');
const { spawn } = require('cross-spawn');
const { join } = require('path');
const { PythonShell } = require('python-shell');

// Serve the Next.js app
const serveURL = serve({ directory: join(__dirname, '../../src/renderer/.next') });

// Keep a global reference of the window object
let mainWindow;
let pythonProcess;
const isProd = process.env.NODE_ENV === 'production';

// Function to create the browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  if (isProd) {
    serveURL(mainWindow);
  } else {
    mainWindow.loadURL('http://localhost:3001');
    mainWindow.webContents.openDevTools();
  }

  // Event handlers
  mainWindow.on('closed', () => {
    mainWindow = null;
    stopPythonApi();
  });
}

// Start the Python API server
function startPythonApi() {
  // Determine the path to the Python executable and script
  const pythonPath = isProd 
    ? join(process.resourcesPath, 'python')
    : join(__dirname, '../../src/python');
  
  console.log(`Starting Python API server from: ${pythonPath}`);
  
  // Options for the Python shell
  const options = {
    mode: 'text',
    pythonPath: process.platform === 'win32' ? 'python' : 'python3', // Use python or python3 instead of full path
    pythonOptions: ['-u'], // unbuffered output
    scriptPath: pythonPath,
    args: ['--electron'], // Add the --electron flag
    env: {
      ...process.env,
      // Set Chrome path for Windows or detect based on platform
      CHROME_PATH: process.platform === 'win32' ? 
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 
        (process.platform === 'darwin' ? 
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 
          '/usr/bin/google-chrome'),
      // Set CDP port for browser debugging
      CHROME_DEBUGGING_PORT: '9222'
    }
  };

  // Create a new PythonShell instance instead of using run
  pythonProcess = new PythonShell('api.py', options);

  // Handle Python script output
  pythonProcess.on('message', message => {
    console.log('Python message:', message);
    if (mainWindow) {
      try {
        // Check if the message is a JSON string
        if (message && message.trim().startsWith('{') && message.trim().endsWith('}')) {
          // Try to parse the message if it's JSON
          const parsedMessage = JSON.parse(message);
          mainWindow.webContents.send('python-message', parsedMessage);
        } else {
          // Log non-JSON output but don't try to parse it
          console.log('Non-JSON output from Python:', message);
          
          // Send as error message if it looks like an error
          if (message.includes('Error') || message.includes('Exception') || message.includes('Traceback')) {
            mainWindow.webContents.send('python-error', message);
          } else {
            // Otherwise send as regular message
            mainWindow.webContents.send('python-message', message);
          }
        }
      } catch (err) {
        // If JSON parsing fails, send as is
        console.error('Error parsing Python message:', err);
        mainWindow.webContents.send('python-message', message);
      }
    }
  });

  // Handle Python script errors
  pythonProcess.on('stderr', stderr => {
    console.error('Python stderr:', stderr);
    if (mainWindow) {
      mainWindow.webContents.send('python-error', stderr);
    }
  });

  // Handle process error
  pythonProcess.on('error', err => {
    console.error('Python process error:', err);
    if (mainWindow) {
      mainWindow.webContents.send('python-error', `Process error: ${err.message}`);
    }
  });

  // Handle process end
  pythonProcess.on('close', (code) => {
    console.log(`Python API server stopped with code ${code}`);
    if (mainWindow && code !== 0) {
      mainWindow.webContents.send('python-error', `Python process exited with code ${code}`);
    }
    pythonProcess = null;
  });

  console.log('Python API server started');
  
  // Send init message after 2 seconds to confirm connection
  setTimeout(() => {
    if (pythonProcess) {
      pythonProcess.send(JSON.stringify({
        action: 'init',
        data: { timestamp: Date.now() }
      }));
    }
  }, 2000);
}

// Stop the Python API server
function stopPythonApi() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
    console.log('Python API server stopped');
  }
}

// App event handlers
app.on('ready', () => {
  startPythonApi();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  stopPythonApi();
});

// IPC handler for directory creation
ipcMain.handle('run-agent', async (event, data) => {
  // Handle special 'create-dirs' action
  if (data && data.action === 'create-dirs') {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Create directories if they don't exist
      for (const dirPath of data.paths || []) {
        const fullPath = path.resolve(dirPath);
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true });
          console.log(`Created directory: ${fullPath}`);
        }
      }
      
      return { status: 'success', message: 'Directories created' };
    } catch (error) {
      console.error('Error creating directories:', error);
      return { status: 'error', message: error.message };
    }
  }

  // Forward the request to Python API and return the response
  return new Promise((resolve, reject) => {
    if (!pythonProcess) {
      reject(new Error('Python process not running'));
      return;
    }
    
    // Send a message to the Python process
    pythonProcess.send(JSON.stringify({
      action: 'run-agent',
      data: data,
      id: data.id // Make sure to include the ID
    }));
    
    // Set up a one-time listener for this specific request
    const messageHandler = message => {
      try {
        // Only try to parse if it looks like JSON
        if (message && typeof message === 'string' && message.trim().startsWith('{') && message.trim().endsWith('}')) {
          const parsedMessage = JSON.parse(message);
          if (parsedMessage.id === data.id) {
            pythonProcess.removeListener('message', messageHandler);
            resolve(parsedMessage.result);
          }
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };
    
    pythonProcess.on('message', messageHandler);
    
    // Add timeout to prevent hanging promises
    setTimeout(() => {
      pythonProcess.removeListener('message', messageHandler);
      reject(new Error('Request timed out'));
    }, 60000); // 60 second timeout
  });
});

// IPC handler for stopping the agent
ipcMain.handle('stop-agent', async (event) => {
  if (!pythonProcess) {
    return { status: 'error', message: 'Python process not running' };
  }
  
  pythonProcess.send(JSON.stringify({
    action: 'stop-agent'
  }));
  
  return { status: 'success', message: 'Stop request sent' };
});

// IPC handler for running deep search
ipcMain.handle('run-deep-search', async (event, data) => {
  // Forward the request to Python API and return the response
  return new Promise((resolve, reject) => {
    if (!pythonProcess) {
      reject(new Error('Python process not running'));
      return;
    }
    
    // Send a message to the Python process
    pythonProcess.send(JSON.stringify({
      action: 'run-deep-search',
      data: data,
      id: data.id // Make sure to include the ID
    }));
    
    // Set up a one-time listener for this specific request
    const messageHandler = message => {
      try {
        // Only try to parse if it looks like JSON
        if (message && typeof message === 'string' && message.trim().startsWith('{') && message.trim().endsWith('}')) {
          const parsedMessage = JSON.parse(message);
          if (parsedMessage.id === data.id) {
            pythonProcess.removeListener('message', messageHandler);
            resolve(parsedMessage.result);
          }
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };
    
    pythonProcess.on('message', messageHandler);
    
    // Add timeout to prevent hanging promises
    setTimeout(() => {
      pythonProcess.removeListener('message', messageHandler);
      reject(new Error('Request timed out'));
    }, 60000); // 60 second timeout for deep search
  });
});

// IPC handler for stopping research agent
ipcMain.handle('stop-research-agent', async (event) => {
  if (!pythonProcess) {
    return { status: 'error', message: 'Python process not running' };
  }
  
  pythonProcess.send(JSON.stringify({
    action: 'stop-research-agent'
  }));
  
  return { status: 'success', message: 'Stop request sent to research agent' };
});

// IPC handler for getting recordings list
ipcMain.handle('get-recordings', async (event, directory) => {
  // Forward the request to Python API and return the response
  return new Promise((resolve, reject) => {
    if (!pythonProcess) {
      reject(new Error('Python process not running'));
      return;
    }
    
    const requestId = Date.now().toString();
    
    // Send a message to the Python process
    pythonProcess.send(JSON.stringify({
      id: requestId,
      action: 'get-recordings',
      data: { directory }
    }));
    
    // Set up a one-time listener for this specific request
    const messageHandler = message => {
      try {
        const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
        if (parsedMessage.id === requestId) {
          pythonProcess.removeListener('message', messageHandler);
          resolve(parsedMessage.result);
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };
    
    pythonProcess.on('message', messageHandler);
    
    // Add timeout to prevent hanging promises
    setTimeout(() => {
      pythonProcess.removeListener('message', messageHandler);
      reject(new Error('Request timed out'));
    }, 10000); // 10 second timeout
  });
});

// IPC handler for saving configuration
ipcMain.handle('save-config', async (event, data) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Create configs directory if it doesn't exist
    const configDir = path.join(__dirname, '../../src/utils/configs');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Save config to JSON file
    const filePath = path.join(configDir, `${data.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data.config, null, 2));
    
    return { status: 'success', message: 'Config saved' };
  } catch (error) {
    console.error('Error saving config:', error);
    return { status: 'error', message: error.message };
  }
});

// IPC handler for getting configurations list
ipcMain.handle('get-configs', async (event) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const glob = require('glob');
    
    // Create configs directory if it doesn't exist
    const configDir = path.join(__dirname, '../../src/utils/configs');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Get list of config files
    const configFiles = glob.sync(path.join(configDir, '*.json'));
    const configs = [];
    
    for (const file of configFiles) {
      const name = path.basename(file, '.json');
      configs.push(name);
    }
    
    return { status: 'success', configs };
  } catch (error) {
    console.error('Error getting configs:', error);
    return { status: 'error', message: error.message };
  }
});

// IPC handler for loading a configuration
ipcMain.handle('load-config', async (event, configName) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Load config from JSON file
    const filePath = path.join(__dirname, `../../src/utils/configs/${configName}.json`);
    if (!fs.existsSync(filePath)) {
      return { status: 'error', message: `Config not found: ${configName}` };
    }
    
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { status: 'success', config };
  } catch (error) {
    console.error('Error loading config:', error);
    return { status: 'error', message: error.message };
  }
}); 