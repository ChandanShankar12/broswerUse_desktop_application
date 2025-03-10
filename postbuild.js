const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Function to install Python dependencies
function installPythonDependencies() {
  try {
    console.log('Installing Python dependencies...');
    
    const pythonPath = path.join(__dirname, 'src', 'python');
    
    // Check if there's a valid Python installation
    try {
      execSync('py --version', { stdio: 'inherit' });
    } catch (error) {
      console.error('Python is not installed or not in PATH. Please install Python and try again.');
      process.exit(1);
    }
    
    // Install dependencies
    console.log(`Installing dependencies from ${path.join(pythonPath, 'requirements.txt')}`);
    try {
      execSync(`py -m pip install -r "${path.join(pythonPath, 'requirements.txt')}"`, {
        stdio: 'inherit',
        cwd: pythonPath
      });
      console.log('Python dependencies installed successfully.');
    } catch (error) {
      console.error('Failed to install Python dependencies:', error.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error in post-build script:', error);
    process.exit(1);
  }
}

// Run the function
installPythonDependencies(); 