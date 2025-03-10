# Browser Use Electron App

An Electron version of the [Browser Use](https://github.com/MindfulAI/browser-use) project that provides a desktop application interface for the browser automation agent. This application provides the exact same functionality as the original web UI but in a desktop application format.

## Architecture

This application follows a modular architecture:

- **Electron Main Process**: Manages the application lifecycle and launches the Python backend
- **Next.js Frontend**: Provides a modern UI for configuring and interacting with the browser agent (matching the original web UI functionality)
- **Python Backend**: Uses the same browser-use package for browser automation and agent functionality

## Directory Structure

```
electron-app/
├── dist/                   # Compiled application (generated)
├── public/                 # Static assets
├── src/
│   ├── main/               # Electron main process code
│   │   ├── main.js         # Main Electron process
│   │   └── preload.js      # Preload script for secure context bridge
│   ├── renderer/           # Next.js frontend
│   │   ├── app/            # Next.js app directory with UI matching original web UI
│   │   ├── components/     # React components
│   │   └── types/          # TypeScript definitions
│   └── python/             # Python backend
│       ├── api.py          # Flask API and Electron communication
│       ├── src/            # Source files from the browser-use package
│       └── requirements.txt # Python dependencies
├── next.config.js          # Next.js configuration
├── package.json            # Dependencies and scripts
└── tailwind.config.js      # Tailwind CSS configuration
```

## Development

### Prerequisites

- Node.js (v14+)
- Python (v3.8+)
- Yarn or npm

### Setup

1. Run the setup script to copy necessary files and install dependencies:
   ```
   .\setup.ps1
   ```

   Or manually:

   a. Install JavaScript dependencies:
   ```
   npm install
   ```

   b. Install Python dependencies:
   ```
   cd src/python
   pip install -r requirements.txt
   ```

2. Start the application:
   ```
   npm run start
   ```

This will build the Next.js frontend and launch the Electron application.

## Building

To build the application for production:

```
npm run package
```

This will:
1. Build the Next.js frontend
2. Compile the Electron application
3. Package everything into a distributable format

The output will be in the `dist` directory.

## Features

This application provides all the same features as the original Browser Use web UI:

- Agent configuration (agent type, max steps, vision capability, etc.)
- LLM provider configuration (OpenAI, Anthropic, Groq, Ollama, etc.)
- Browser settings (headless mode, recording, window size, etc.)
- Agent execution with real-time feedback
- Live browser view

## License

See the LICENSE file for details. 