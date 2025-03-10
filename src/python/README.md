# Browser Use Integration

This directory contains the integration with the [Browser Use](https://github.com/browser-use/web-ui) project, which enables AI agents to interact with web browsers.

## Structure

- `api.py`: Main API endpoints for browser automation
- `src/`: Custom implementations of Browser Use components
  - `agent/`: Custom agent implementations
  - `browser/`: Custom browser implementations
  - `controller/`: Custom controller implementations
  - `utils/`: Utility functions

## Usage

To use the Browser Use functionality:

1. Make sure you have the required dependencies installed:
   ```
   pip install -r requirements.txt
   ```

2. Set up your environment variables in a `.env` file (see `.env.example` for reference)

3. Import the necessary components:
   ```python
   from src.agent import CustomAgent
   from src.browser import CustomBrowser
   from src.controller import CustomController
   ```

4. Run the API server:
   ```
   python api.py
   ```

## Testing

Run the tests to verify the integration:

```
cd tests
python -m pytest test_playwright.py
python -m pytest test_deep_research.py
python -m pytest test_llm_api.py
``` 