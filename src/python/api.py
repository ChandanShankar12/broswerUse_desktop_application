import pdb
import logging
import json
import sys
import asyncio
import threading
import re
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any, Union

from dotenv import load_dotenv

load_dotenv()
import os
import glob
import argparse
import os

# Fix encoding issues with emoji characters on Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

logger = logging.getLogger(__name__)

import gradio as gr

from browser_use.agent.service import Agent
from playwright.async_api import async_playwright
from browser_use.browser.browser import Browser, BrowserConfig
from browser_use.browser.context import (
    BrowserContextConfig,
    BrowserContextWindowSize,
)
from langchain_ollama import ChatOllama
from playwright.async_api import async_playwright
from src.utils.agent_state import AgentState

from src.utils import utils
from src.agent.custom_agent import CustomAgent
from src.browser.custom_browser import CustomBrowser
from src.agent.custom_prompts import CustomSystemPrompt, CustomAgentMessagePrompt
from src.browser.custom_context import CustomBrowserContext
from src.controller.custom_controller import CustomController
from gradio.themes import Citrus, Default, Glass, Monochrome, Ocean, Origin, Soft, Base
from src.utils.default_config_settings import default_config, load_config_from_file, save_config_to_file, save_current_config, update_ui_from_config
from src.utils.utils import update_model_dropdown, get_latest_files, capture_screenshot


# Global variables for persistence
_global_browser = None
_global_browser_context = None
_global_agent = None

# Create the global agent state instance
_global_agent_state = AgentState()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Ensure proper JSON handling
class ElectronJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for sending data to Electron."""
    def default(self, obj):
        if isinstance(obj, (datetime, bytes)):
            return str(obj)
        elif hasattr(obj, 'to_dict'):
            return obj.to_dict()
        elif hasattr(obj, '__dict__'):
            return obj.__dict__
        return super().default(obj)

def json_serialize(data):
    """Safely serialize data to JSON for Electron IPC."""
    try:
        return json.dumps(data, cls=ElectronJSONEncoder)
    except Exception as e:
        logger.error(f"JSON serialization error: {str(e)}")
        # Return a simplified error object that can be serialized
        return json.dumps({"error": f"Failed to serialize data: {str(e)}"})

# Function to send data back to Electron
def send_to_electron(data):
    """Send data back to Electron process."""
    try:
        if isinstance(data, str):
            # If it's already a string, print directly
            print(data, flush=True)
        else:
            # Otherwise, serialize to JSON
            print(json_serialize(data), flush=True)
    except Exception as e:
        # If there's an error, send a simplified error message
        logger.error(f"Error sending to Electron: {str(e)}")
        print(json.dumps({"error": str(e)}), flush=True)

def resolve_sensitive_env_variables(text):
    """
    Replace environment variable placeholders ($SENSITIVE_*) with their values.
    Only replaces variables that start with SENSITIVE_.
    """
    if not text:
        return text
        
    import re
    
    # Find all $SENSITIVE_* patterns
    env_vars = re.findall(r'\$SENSITIVE_[A-Za-z0-9_]*', text)
    
    result = text
    for var in env_vars:
        # Remove the $ prefix to get the actual environment variable name
        env_name = var[1:]  # removes the $
        env_value = os.getenv(env_name)
        if env_value is not None:
            # Replace $SENSITIVE_VAR_NAME with its value
            result = result.replace(var, env_value)
        
    return result

async def stop_agent():
    """Request the agent to stop and update UI with enhanced feedback"""
    global _global_agent_state, _global_browser_context, _global_browser, _global_agent

    try:
        # Request stop
        _global_agent.stop()

        # Update UI immediately
        message = "Stop requested - the agent will halt at the next safe point"
        logger.info(f"🛑 {message}")

        # Return UI updates
        return (
            message,                                        # errors_output
            gr.update(value="Stopping...", interactive=False),  # stop_button
            gr.update(interactive=False),                      # run_button
        )
    except Exception as e:
        error_msg = f"Error during stop: {str(e)}"
        logger.error(error_msg)
        return (
            error_msg,
            gr.update(value="Stop", interactive=True),
            gr.update(interactive=True)
        )
        
async def stop_research_agent():
    """Request the agent to stop and update UI with enhanced feedback"""
    global _global_agent_state, _global_browser_context, _global_browser

    try:
        # Request stop
        _global_agent_state.request_stop()

        # Update UI immediately
        message = "Stop requested - the agent will halt at the next safe point"
        logger.info(f"🛑 {message}")

        # Return UI updates
        return (                                   # errors_output
            gr.update(value="Stopping...", interactive=False),  # stop_button
            gr.update(interactive=False),                      # run_button
        )
    except Exception as e:
        error_msg = f"Error during stop: {str(e)}"
        logger.error(error_msg)
        return (
            gr.update(value="Stop", interactive=True),
            gr.update(interactive=True)
        )

async def run_browser_agent(
        agent_type,
        llm_provider,
        llm_model_name,
        llm_num_ctx,
        llm_temperature,
        llm_base_url,
        llm_api_key,
        use_own_browser,
        keep_browser_open,
        headless,
        disable_security,
        window_w,
        window_h,
        save_recording_path,
        save_agent_history_path,
        save_trace_path,
        enable_recording,
        task,
        add_infos,
        max_steps,
        use_vision,
        max_actions_per_step,
        tool_calling_method,
        chrome_cdp
):
    """
    Run the browser agent with the specified parameters.
    """
    global _global_agent_state, _global_browser_context, _global_browser, _global_agent

    # Clear any previous stop request
    _global_agent_state.clear_stop()
    
    logger.info(f"Starting browser agent with task: {task}")
    logger.info(f"Agent type: {agent_type}, LLM: {llm_provider}/{llm_model_name}")
    
    try:
        # Disable recording if the checkbox is unchecked
        if not enable_recording:
            save_recording_path = None

        # Ensure the recording directory exists if recording is enabled
        if save_recording_path:
            os.makedirs(save_recording_path, exist_ok=True)

        # Get the list of existing videos before the agent runs
        existing_videos = set()
        if save_recording_path:
            existing_videos = set(
                glob.glob(os.path.join(save_recording_path, "*.[mM][pP]4"))
                + glob.glob(os.path.join(save_recording_path, "*.[wW][eE][bB][mM]"))
            )

        task = resolve_sensitive_env_variables(task)
        
        # Get the LLM model
        llm = utils.get_llm_model(
            provider=llm_provider,
            model_name=llm_model_name,
            num_ctx=llm_num_ctx,
            temperature=llm_temperature,
            base_url=llm_base_url,
            api_key=llm_api_key,
        )
        logger.info(f"Successfully initialized LLM model")
        
        # Run the appropriate agent type
        if agent_type == "org":
            final_result, errors, model_actions, model_thoughts, trace_file, history_file = await run_org_agent(
                llm=llm,
                use_own_browser=use_own_browser,
                keep_browser_open=keep_browser_open,
                headless=headless,
                disable_security=disable_security,
                window_w=window_w,
                window_h=window_h,
                save_recording_path=save_recording_path,
                save_agent_history_path=save_agent_history_path,
                save_trace_path=save_trace_path,
                task=task,
                max_steps=max_steps,
                use_vision=use_vision,
                max_actions_per_step=max_actions_per_step,
                tool_calling_method=tool_calling_method,
                chrome_cdp=chrome_cdp
            )
        elif agent_type == "custom":
            final_result, errors, model_actions, model_thoughts, trace_file, history_file = await run_custom_agent(
                llm=llm,
                use_own_browser=use_own_browser,
                keep_browser_open=keep_browser_open,
                headless=headless,
                disable_security=disable_security,
                window_w=window_w,
                window_h=window_h,
                save_recording_path=save_recording_path,
                save_agent_history_path=save_agent_history_path,
                save_trace_path=save_trace_path,
                task=task,
                add_infos=add_infos,
                max_steps=max_steps,
                use_vision=use_vision,
                max_actions_per_step=max_actions_per_step,
                tool_calling_method=tool_calling_method,
                chrome_cdp=chrome_cdp
            )
        else:
            raise ValueError(f"Unknown agent type: {agent_type}")
            
        # Get the list of new videos after the agent runs
        new_videos = set()
        if save_recording_path:
            new_videos = set(
                glob.glob(os.path.join(save_recording_path, "*.[mM][pP]4"))
                + glob.glob(os.path.join(save_recording_path, "*.[wW][eE][bB][mM]"))
            )
            
        # Generate a GIF from the video if there's a new one
        if new_videos - existing_videos:
            latest_video = max(new_videos - existing_videos, key=os.path.getctime)
            try:
                utils.generate_gif_from_video(latest_video, "agent_history.gif")
                logger.info(f"Generated GIF from {latest_video}")
            except Exception as e:
                logger.error(f"Error generating GIF: {str(e)}")
                
        return final_result, errors, model_actions, model_thoughts, trace_file, history_file
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error running agent: {str(e)}\n{error_trace}")
        return '', str(e) + "\n" + error_trace, '', '', None, None


async def run_org_agent(
        llm,
        use_own_browser,
        keep_browser_open,
        headless,
        disable_security,
        window_w,
        window_h,
        save_recording_path,
        save_agent_history_path,
        save_trace_path,
        task,
        max_steps,
        use_vision,
        max_actions_per_step,
        tool_calling_method,
        chrome_cdp
):
    """
    Run the organizational agent with Browser-use.
    """
    global _global_browser, _global_browser_context, _global_agent, _global_agent_state
    
    logger.info(f"Starting organizational agent with task: {task}")
    
    try:
        # Initialize chrome_path and extra_chromium_args
        chrome_path = None
        extra_chromium_args = [f"--window-size={window_w},{window_h}"]
        
        # Log the browser configuration
        logger.info(f"Browser config - use_own_browser: {use_own_browser}, headless: {headless}, chrome_cdp: {chrome_cdp}")
        
        # Configure CDP
        if chrome_cdp:
            # Use CDP connection (existing browser)
            logger.info(f"Connecting to existing browser via CDP: {chrome_cdp}")
            cdp_url = chrome_cdp
        else:
            # Use packaged Chrome
            cdp_url = None
            
            # Check if we should use the user's Chrome
            if use_own_browser:
                logger.info("Using user's Chrome browser")
                
                # Add remote debugging if CDP URL is not provided
                debug_port = os.getenv("CHROME_DEBUGGING_PORT", "9222")
                extra_chromium_args += [f"--remote-debugging-port={debug_port}"]
                logger.info(f"Added remote debugging on port {debug_port}")
                
                chrome_user_data = os.getenv("CHROME_USER_DATA", None)
                if chrome_user_data:
                    extra_chromium_args += [f"--user-data-dir={chrome_user_data}"]
                    logger.info(f"Using Chrome user data dir: {chrome_user_data}")
                
                # Get Chrome path from environment
                chrome_path = os.getenv("CHROME_PATH", None)
                if chrome_path:
                    logger.info(f"Using Chrome path: {chrome_path}")
            else:
                chrome_path = None
                logger.info("Using packaged Chrome browser")
        
        try:
            # Import Controller here to avoid circular imports
            from browser_use.controller.controller import Controller
            controller = Controller()
            logger.info("Successfully created controller")
        except Exception as e:
            logger.error(f"Failed to create controller: {str(e)}")
            raise Exception(f"Failed to create controller: {str(e)}")
        
        # Check if browser needs to be initialized
        need_new_browser = (_global_browser is None) or (cdp_url and cdp_url != "")
        
        if need_new_browser:
            logger.info("Creating new browser instance with config:")
            logger.info(f"  Headless: {headless}")
            logger.info(f"  Disable security: {disable_security}")
            logger.info(f"  CDP URL: {cdp_url}")
            logger.info(f"  Chrome path: {chrome_path}")
            logger.info(f"  Extra args: {extra_chromium_args}")
            
            try:
                _global_browser = Browser(
                    config=BrowserConfig(
                        headless=headless,
                        disable_security=disable_security,
                        cdp_url=cdp_url,
                        chrome_instance_path=chrome_path,
                        extra_chromium_args=extra_chromium_args,
                    )
                )
                logger.info("Successfully created browser instance")
            except Exception as e:
                logger.error(f"Failed to create browser: {str(e)}")
                raise Exception(f"Failed to launch browser: {str(e)}")
        
        need_new_context = (_global_browser_context is None) or (cdp_url and cdp_url != "")
        
        if need_new_context:
            logger.info("Creating new browser context with config:")
            logger.info(f"  Trace path: {save_trace_path}")
            logger.info(f"  Recording path: {save_recording_path}")
            logger.info(f"  Window size: {window_w}x{window_h}")
            
            try:
                _global_browser_context = await _global_browser.new_context(
                    config=BrowserContextConfig(
                        trace_path=save_trace_path if save_trace_path else None,
                        save_recording_path=save_recording_path if save_recording_path else None,
                        no_viewport=False,
                        browser_window_size=BrowserContextWindowSize(
                            width=window_w, height=window_h
                        ),
                    )
                )
                logger.info("Successfully created browser context")
            except Exception as e:
                logger.error(f"Failed to create browser context: {str(e)}")
                raise Exception(f"Failed to create browser context: {str(e)}")

        # Create and run agent
        if _global_agent is None:
            logger.info("Creating agent")
            try:
                _global_agent = Agent(
                    task=task,
                    use_vision=use_vision,
                    llm=llm,
                    browser=_global_browser,
                    browser_context=_global_browser_context,
                    controller=controller,
                    max_actions_per_step=max_actions_per_step,
                    tool_calling_method=tool_calling_method
                )
                logger.info("Successfully created agent")
            except Exception as e:
                logger.error(f"Failed to create agent: {str(e)}")
                raise Exception(f"Failed to create agent: {str(e)}")
            
        logger.info(f"Running agent with max_steps={max_steps}")
        history = await _global_agent.run(max_steps=max_steps)
        logger.info("Agent run completed successfully")

        # Save history
        history_file = os.path.join(save_agent_history_path, f"{_global_agent.agent_id}.json")
        _global_agent.save_history(history_file)
        logger.info(f"Saved agent history to {history_file}")

        # Process results
        final_result = history.final_result()
        errors = history.errors()
        model_actions = history.model_actions()
        model_thoughts = history.model_thoughts()

        # Get trace file
        trace_file = get_latest_files(save_trace_path)

        return final_result, errors, model_actions, model_thoughts, trace_file.get('.zip'), history_file
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error in run_org_agent: {str(e)}\n{error_trace}")
        return '', f"Error: {str(e)}\n{error_trace}", '', '', None, None
    finally:
        _global_agent = None
        # Handle cleanup based on persistence configuration
        if not keep_browser_open:
            if _global_browser_context:
                try:
                    await _global_browser_context.close()
                    logger.info("Closed browser context")
                except Exception as e:
                    logger.error(f"Error closing browser context: {str(e)}")
                _global_browser_context = None

            if _global_browser:
                try:
                    await _global_browser.close()
                    logger.info("Closed browser")
                except Exception as e:
                    logger.error(f"Error closing browser: {str(e)}")
                _global_browser = None

async def run_custom_agent(
        llm,
        use_own_browser,
        keep_browser_open,
        headless,
        disable_security,
        window_w,
        window_h,
        save_recording_path,
        save_agent_history_path,
        save_trace_path,
        task,
        add_infos,
        max_steps,
        use_vision,
        max_actions_per_step,
        tool_calling_method,
        chrome_cdp
):
    try:
        global _global_browser, _global_browser_context, _global_agent_state, _global_agent

        # Clear any previous stop request
        _global_agent_state.clear_stop()

        extra_chromium_args = [f"--window-size={window_w},{window_h}"]
        
        # Initialize chrome_path and cdp_url
        chrome_path = None
        cdp_url = None
        
        # Log the browser configuration
        logger.info(f"Browser config - use_own_browser: {use_own_browser}, headless: {headless}, chrome_cdp: {chrome_cdp}")
        
        if use_own_browser:
            # Set CDP URL to the parameter or default
            cdp_url = chrome_cdp or "http://localhost:9222"
            logger.info(f"Using CDP URL: {cdp_url}")
            
            # Get Chrome path from environment 
            chrome_path = os.getenv("CHROME_PATH", None)
            if chrome_path == "":
                chrome_path = None
            
            if chrome_path:
                logger.info(f"Using Chrome path: {chrome_path}")
            
            # Get Chrome user data directory
            chrome_user_data = os.getenv("CHROME_USER_DATA", None)
            if chrome_user_data:
                extra_chromium_args += [f"--user-data-dir={chrome_user_data}"]
                logger.info(f"Using Chrome user data dir: {chrome_user_data}")
        else:
            logger.info("Using packaged Chrome browser")

        controller = CustomController()
        
        # Check if browser needs to be initialized
        need_new_browser = (_global_browser is None) or (cdp_url is not None and not (_global_browser and getattr(_global_browser, '_config', None) and _global_browser._config.cdp_url == cdp_url))
        
        if need_new_browser:
            logger.info("Creating new browser instance with config:")
            logger.info(f"  Headless: {headless}")
            logger.info(f"  Disable security: {disable_security}")
            logger.info(f"  CDP URL: {cdp_url}")
            logger.info(f"  Chrome path: {chrome_path}")
            logger.info(f"  Extra args: {extra_chromium_args}")
            
            try:
                # If we're using CDP, we need to make sure Chrome is running with debugging enabled
                if cdp_url:
                    # Verify CDP endpoint is accessible 
                    import requests
                    try:
                        response = requests.get(cdp_url + "/json/version")
                        if response.status_code == 200:
                            logger.info(f"Successfully connected to Chrome CDP at {cdp_url}")
                        else:
                            logger.warning(f"CDP endpoint returned status code {response.status_code}")
                    except Exception as e:
                        logger.warning(f"Could not verify CDP endpoint: {str(e)}")
                
                # If there's an existing browser, close it first
                if _global_browser:
                    logger.info("Closing existing browser before creating new one")
                    await close_global_browser()
                
                _global_browser = CustomBrowser(
                    config=BrowserConfig(
                        headless=headless,
                        disable_security=disable_security,
                        cdp_url=cdp_url,
                        chrome_instance_path=chrome_path,
                        extra_chromium_args=extra_chromium_args,
                    )
                )
                logger.info("Successfully created browser instance")
            except Exception as e:
                logger.error(f"Failed to create browser: {str(e)}")
                raise Exception(f"Failed to launch browser: {str(e)}")

        need_new_context = (_global_browser_context is None)
        
        if need_new_context:
            logger.info("Creating new browser context with config:")
            logger.info(f"  Trace path: {save_trace_path}")
            logger.info(f"  Recording path: {save_recording_path}")
            logger.info(f"  Window size: {window_w}x{window_h}")
            
            try:
                _global_browser_context = await _global_browser.new_context(
                    config=BrowserContextConfig(
                        trace_path=save_trace_path if save_trace_path else None,
                        save_recording_path=save_recording_path if save_recording_path else None,
                        no_viewport=False,
                        browser_window_size=BrowserContextWindowSize(
                            width=window_w, height=window_h
                        ),
                    )
                )
                logger.info("Successfully created browser context")
            except Exception as e:
                logger.error(f"Failed to create browser context: {str(e)}")
                raise Exception(f"Failed to create browser context: {str(e)}")

        # Create and run agent
        if _global_agent is None:
            logger.info("Creating agent")
            _global_agent = CustomAgent(
                task=task,
                add_infos=add_infos,
                use_vision=use_vision,
                llm=llm,
                browser=_global_browser,
                browser_context=_global_browser_context,
                controller=controller,
                system_prompt_class=CustomSystemPrompt,
                agent_prompt_class=CustomAgentMessagePrompt,
                max_actions_per_step=max_actions_per_step,
                tool_calling_method=tool_calling_method
            )
        
        logger.info(f"Running agent with max_steps={max_steps}")
        history = await _global_agent.run(max_steps=max_steps)
        logger.info("Agent run completed successfully")

        history_file = os.path.join(save_agent_history_path, f"{_global_agent.agent_id}.json")
        _global_agent.save_history(history_file)
        logger.info(f"Saved agent history to {history_file}")

        final_result = history.final_result()
        errors = history.errors()
        model_actions = history.model_actions()
        model_thoughts = history.model_thoughts()

        trace_file = get_latest_files(save_trace_path)        

        return final_result, errors, model_actions, model_thoughts, trace_file.get('.zip'), history_file
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Error in run_custom_agent: {str(e)}\n{error_trace}")
        return '', f"Error: {str(e)}\n{error_trace}", '', '', None, None
    finally:
        _global_agent = None
        # Handle cleanup based on persistence configuration
        if not keep_browser_open:
            if _global_browser_context:
                try:
                    await _global_browser_context.close()
                    logger.info("Closed browser context")
                except Exception as e:
                    logger.error(f"Error closing browser context: {str(e)}")
                _global_browser_context = None

            if _global_browser:
                try:
                    await _global_browser.close()
                    logger.info("Closed browser")
                except Exception as e:
                    logger.error(f"Error closing browser: {str(e)}")
                _global_browser = None

async def run_with_stream(
    agent_type,
    llm_provider,
    llm_model_name,
    llm_num_ctx,
    llm_temperature,
    llm_base_url,
    llm_api_key,
    use_own_browser,
    keep_browser_open,
    headless,
    disable_security,
    window_w,
    window_h,
    save_recording_path,
    save_agent_history_path,
    save_trace_path,
    enable_recording,
    task,
    add_infos,
    max_steps,
    use_vision,
    max_actions_per_step,
    tool_calling_method,
    chrome_cdp
):
    global _global_agent_state
    stream_vw = 80
    stream_vh = int(80 * window_h // window_w)
    if not headless:
        result = await run_browser_agent(
            agent_type=agent_type,
            llm_provider=llm_provider,
            llm_model_name=llm_model_name,
            llm_num_ctx=llm_num_ctx,
            llm_temperature=llm_temperature,
            llm_base_url=llm_base_url,
            llm_api_key=llm_api_key,
            use_own_browser=use_own_browser,
            keep_browser_open=keep_browser_open,
            headless=headless,
            disable_security=disable_security,
            window_w=window_w,
            window_h=window_h,
            save_recording_path=save_recording_path,
            save_agent_history_path=save_agent_history_path,
            save_trace_path=save_trace_path,
            enable_recording=enable_recording,
            task=task,
            add_infos=add_infos,
            max_steps=max_steps,
            use_vision=use_vision,
            max_actions_per_step=max_actions_per_step,
            tool_calling_method=tool_calling_method,
            chrome_cdp=chrome_cdp
        )
        # Add HTML content at the start of the result array
        html_content = f"<h1 style='width:{stream_vw}vw; height:{stream_vh}vh'>Using browser...</h1>"
        yield [html_content] + list(result)
    else:
        try:
            _global_agent_state.clear_stop()
            # Run the browser agent in the background
            agent_task = asyncio.create_task(
                run_browser_agent(
                    agent_type=agent_type,
                    llm_provider=llm_provider,
                    llm_model_name=llm_model_name,
                    llm_num_ctx=llm_num_ctx,
                    llm_temperature=llm_temperature,
                    llm_base_url=llm_base_url,
                    llm_api_key=llm_api_key,
                    use_own_browser=use_own_browser,
                    keep_browser_open=keep_browser_open,
                    headless=headless,
                    disable_security=disable_security,
                    window_w=window_w,
                    window_h=window_h,
                    save_recording_path=save_recording_path,
                    save_agent_history_path=save_agent_history_path,
                    save_trace_path=save_trace_path,
                    enable_recording=enable_recording,
                    task=task,
                    add_infos=add_infos,
                    max_steps=max_steps,
                    use_vision=use_vision,
                    max_actions_per_step=max_actions_per_step,
                    tool_calling_method=tool_calling_method,
                    chrome_cdp=chrome_cdp
                )
            )

            # Initialize values for streaming
            html_content = f"<h1 style='width:{stream_vw}vw; height:{stream_vh}vh'>Using browser...</h1>"
            final_result = errors = model_actions = model_thoughts = ""
            latest_videos = trace = history_file = None


            # Periodically update the stream while the agent task is running
            while not agent_task.done():
                try:
                    encoded_screenshot = await capture_screenshot(_global_browser_context)
                    if encoded_screenshot is not None:
                        html_content = f'<img src="data:image/jpeg;base64,{encoded_screenshot}" style="width:{stream_vw}vw; height:{stream_vh}vh ; border:1px solid #ccc;">'
                    else:
                        html_content = f"<h1 style='width:{stream_vw}vw; height:{stream_vh}vh'>Waiting for browser session...</h1>"
                except Exception as e:
                    html_content = f"<h1 style='width:{stream_vw}vw; height:{stream_vh}vh'>Waiting for browser session...</h1>"

                if _global_agent_state and _global_agent_state.is_stop_requested():
                    yield [
                        html_content,
                        final_result,
                        errors,
                        model_actions,
                        model_thoughts,
                        latest_videos,
                        trace,
                        history_file,
                        gr.update(value="Stopping...", interactive=False),  # stop_button
                        gr.update(interactive=False),  # run_button
                    ]
                    break
                else:
                    yield [
                        html_content,
                        final_result,
                        errors,
                        model_actions,
                        model_thoughts,
                        latest_videos,
                        trace,
                        history_file,
                        gr.update(value="Stop", interactive=True),  # Re-enable stop button
                        gr.update(interactive=True)  # Re-enable run button
                    ]
                await asyncio.sleep(0.05)

            # Once the agent task completes, get the results
            try:
                result = await agent_task
                final_result, errors, model_actions, model_thoughts, latest_videos, trace, history_file, stop_button, run_button = result
            except gr.Error:
                final_result = ""
                model_actions = ""
                model_thoughts = ""
                latest_videos = trace = history_file = None

            except Exception as e:
                errors = f"Agent error: {str(e)}"

            yield [
                html_content,
                final_result,
                errors,
                model_actions,
                model_thoughts,
                latest_videos,
                trace,
                history_file,
                stop_button,
                run_button
            ]

        except Exception as e:
            import traceback
            yield [
                f"<h1 style='width:{stream_vw}vw; height:{stream_vh}vh'>Waiting for browser session...</h1>",
                "",
                f"Error: {str(e)}\n{traceback.format_exc()}",
                "",
                "",
                None,
                None,
                None,
                gr.update(value="Stop", interactive=True),  # Re-enable stop button
                gr.update(interactive=True)    # Re-enable run button
            ]

# Define the theme map globally
theme_map = {
    "Default": Default(),
    "Soft": Soft(),
    "Monochrome": Monochrome(),
    "Glass": Glass(),
    "Origin": Origin(),
    "Citrus": Citrus(),
    "Ocean": Ocean(),
    "Base": Base()
}

async def close_global_browser():
    global _global_browser, _global_browser_context

    if _global_browser_context:
        await _global_browser_context.close()
        _global_browser_context = None

    if _global_browser:
        await _global_browser.close()
        _global_browser = None
        
async def run_deep_search(research_task, max_search_iteration_input, max_query_per_iter_input, llm_provider, llm_model_name, llm_num_ctx, llm_temperature, llm_base_url, llm_api_key, use_vision, use_own_browser, headless, chrome_cdp):
    from src.utils.deep_research import deep_research
    global _global_agent_state

    # Clear any previous stop request
    _global_agent_state.clear_stop()
    
    llm = utils.get_llm_model(
            provider=llm_provider,
            model_name=llm_model_name,
            num_ctx=llm_num_ctx,
            temperature=llm_temperature,
            base_url=llm_base_url,
            api_key=llm_api_key,
        )
    markdown_content, file_path = await deep_research(research_task, llm, _global_agent_state,
                                                        max_search_iterations=max_search_iteration_input,
                                                        max_query_num=max_query_per_iter_input,
                                                        use_vision=use_vision,
                                                        headless=headless,
                                                        use_own_browser=use_own_browser,
                                                        chrome_cdp=chrome_cdp
                                                        )
    
    return markdown_content, file_path, gr.update(value="Stop", interactive=True),  gr.update(interactive=True) 
    

def create_ui(config, theme_name="Ocean"):
    css = """
    .gradio-container {
        max-width: 1200px !important;
        margin: auto !important;
        padding-top: 20px !important;
    }
    .header-text {
        text-align: center;
        margin-bottom: 30px;
    }
    .theme-section {
        margin-bottom: 20px;
        padding: 15px;
        border-radius: 10px;
    }
    """

    with gr.Blocks(
            title="Browser Use WebUI", theme=theme_map[theme_name], css=css
    ) as demo:
        with gr.Row():
            gr.Markdown(
                """
                # 🌐 Browser Use WebUI
                ### Control your browser with AI assistance
                """,
                elem_classes=["header-text"],
            )

        with gr.Tabs() as tabs:
            with gr.TabItem("⚙️ Agent Settings", id=1):
                with gr.Group():
                    agent_type = gr.Radio(
                        ["org", "custom"],
                        label="Agent Type",
                        value=config['agent_type'],
                        info="Select the type of agent to use",
                    )
                    with gr.Column():
                        max_steps = gr.Slider(
                            minimum=1,
                            maximum=200,
                            value=config['max_steps'],
                            step=1,
                            label="Max Run Steps",
                            info="Maximum number of steps the agent will take",
                        )
                        max_actions_per_step = gr.Slider(
                            minimum=1,
                            maximum=20,
                            value=config['max_actions_per_step'],
                            step=1,
                            label="Max Actions per Step",
                            info="Maximum number of actions the agent will take per step",
                        )
                    with gr.Column():
                        use_vision = gr.Checkbox(
                            label="Use Vision",
                            value=config['use_vision'],
                            info="Enable visual processing capabilities",
                        )
                        tool_calling_method = gr.Dropdown(
                            label="Tool Calling Method",
                            value=config['tool_calling_method'],
                            interactive=True,
                            allow_custom_value=True,  # Allow users to input custom model names
                            choices=["auto", "json_schema", "function_calling"],
                            info="Tool Calls Funtion Name",
                            visible=False
                        )

            with gr.TabItem("🔧 LLM Configuration", id=2):
                with gr.Group():
                    llm_provider = gr.Dropdown(
                        choices=[provider for provider,model in utils.model_names.items()],
                        label="LLM Provider",
                        value=config['llm_provider'],
                        info="Select your preferred language model provider"
                    )
                    llm_model_name = gr.Dropdown(
                        label="Model Name",
                        choices=utils.model_names['openai'],
                        value=config['llm_model_name'],
                        interactive=True,
                        allow_custom_value=True,  # Allow users to input custom model names
                        info="Select a model from the dropdown or type a custom model name"
                    )
                    llm_num_ctx = gr.Slider(
                        minimum=2**8,
                        maximum=2**16,
                        value=config['llm_num_ctx'],
                        step=1,
                        label="Max Context Length",
                        info="Controls max context length model needs to handle (less = faster)",
                        visible=config['llm_provider'] == "ollama"
                    )
                    llm_temperature = gr.Slider(
                        minimum=0.0,
                        maximum=2.0,
                        value=config['llm_temperature'],
                        step=0.1,
                        label="Temperature",
                        info="Controls randomness in model outputs"
                    )
                    with gr.Row():
                        llm_base_url = gr.Textbox(
                            label="Base URL",
                            value=config['llm_base_url'],
                            info="API endpoint URL (if required)"
                        )
                        llm_api_key = gr.Textbox(
                            label="API Key",
                            type="password",
                            value=config['llm_api_key'],
                            info="Your API key (leave blank to use .env)"
                        )

            # Change event to update context length slider
            def update_llm_num_ctx_visibility(llm_provider):
                return gr.update(visible=llm_provider == "ollama")

            # Bind the change event of llm_provider to update the visibility of context length slider
            llm_provider.change(
                fn=update_llm_num_ctx_visibility,
                inputs=llm_provider,
                outputs=llm_num_ctx
            )

            with gr.TabItem("🌐 Browser Settings", id=3):
                with gr.Group():
                    with gr.Row():
                        use_own_browser = gr.Checkbox(
                            label="Use Own Browser",
                            value=config['use_own_browser'],
                            info="Use your existing browser instance",
                        )
                        keep_browser_open = gr.Checkbox(
                            label="Keep Browser Open",
                            value=config['keep_browser_open'],
                            info="Keep Browser Open between Tasks",
                        )
                        headless = gr.Checkbox(
                            label="Headless Mode",
                            value=config['headless'],
                            info="Run browser without GUI",
                        )
                        disable_security = gr.Checkbox(
                            label="Disable Security",
                            value=config['disable_security'],
                            info="Disable browser security features",
                        )
                        enable_recording = gr.Checkbox(
                            label="Enable Recording",
                            value=config['enable_recording'],
                            info="Enable saving browser recordings",
                        )

                    with gr.Row():
                        window_w = gr.Number(
                            label="Window Width",
                            value=config['window_w'],
                            info="Browser window width",
                        )
                        window_h = gr.Number(
                            label="Window Height",
                            value=config['window_h'],
                            info="Browser window height",
                        )


                    save_recording_path = gr.Textbox(
                        label="Recording Path",
                        placeholder="e.g. ./tmp/record_videos",
                        value=config['save_recording_path'],
                        info="Path to save browser recordings",
                        interactive=True,  # Allow editing only if recording is enabled
                    )

                    chrome_cdp = gr.Textbox(
                        label="CDP URL",
                        placeholder="http://localhost:9222",
                        value="",
                        info="CDP for google remote debugging",
                        interactive=True,  # Allow editing only if recording is enabled
                    )

                    save_trace_path = gr.Textbox(
                        label="Trace Path",
                        placeholder="e.g. ./tmp/traces",
                        value=config['save_trace_path'],
                        info="Path to save Agent traces",
                        interactive=True,
                    )

                    save_agent_history_path = gr.Textbox(
                        label="Agent History Save Path",
                        placeholder="e.g., ./tmp/agent_history",
                        value=config['save_agent_history_path'],
                        info="Specify the directory where agent history should be saved.",
                        interactive=True,
                    )

            with gr.TabItem("🤖 Run Agent", id=4):
                task = gr.Textbox(
                    label="Task Description",
                    lines=4,
                    placeholder="Enter your task here...",
                    value=config['task'],
                    info="Describe what you want the agent to do",
                )
                add_infos = gr.Textbox(
                    label="Additional Information",
                    lines=3,
                    placeholder="Add any helpful context or instructions...",
                    info="Optional hints to help the LLM complete the task",
                )

                with gr.Row():
                    run_button = gr.Button("▶️ Run Agent", variant="primary", scale=2)
                    stop_button = gr.Button("⏹️ Stop", variant="stop", scale=1)
                    
                with gr.Row():
                    browser_view = gr.HTML(
                        value="<h1 style='width:80vw; height:50vh'>Waiting for browser session...</h1>",
                        label="Live Browser View",
                )
            
            with gr.TabItem("🧐 Deep Research", id=5):
                research_task_input = gr.Textbox(label="Research Task", lines=5, value="Compose a report on the use of Reinforcement Learning for training Large Language Models, encompassing its origins, current advancements, and future prospects, substantiated with examples of relevant models and techniques. The report should reflect original insights and analysis, moving beyond mere summarization of existing literature.")
                with gr.Row():
                    max_search_iteration_input = gr.Number(label="Max Search Iteration", value=3, precision=0) # precision=0 确保是整数
                    max_query_per_iter_input = gr.Number(label="Max Query per Iteration", value=1, precision=0) # precision=0 确保是整数
                with gr.Row():
                    research_button = gr.Button("▶️ Run Deep Research", variant="primary", scale=2)
                    stop_research_button = gr.Button("⏹️ Stop", variant="stop", scale=1)
                markdown_output_display = gr.Markdown(label="Research Report")
                markdown_download = gr.File(label="Download Research Report")


            with gr.TabItem("📊 Results", id=6):
                with gr.Group():

                    recording_display = gr.Video(label="Latest Recording")

                    gr.Markdown("### Results")
                    with gr.Row():
                        with gr.Column():
                            final_result_output = gr.Textbox(
                                label="Final Result", lines=3, show_label=True
                            )
                        with gr.Column():
                            errors_output = gr.Textbox(
                                label="Errors", lines=3, show_label=True
                            )
                    with gr.Row():
                        with gr.Column():
                            model_actions_output = gr.Textbox(
                                label="Model Actions", lines=3, show_label=True
                            )
                        with gr.Column():
                            model_thoughts_output = gr.Textbox(
                                label="Model Thoughts", lines=3, show_label=True
                            )

                    trace_file = gr.File(label="Trace File")

                    agent_history_file = gr.File(label="Agent History")

                # Bind the stop button click event after errors_output is defined
                stop_button.click(
                    fn=stop_agent,
                    inputs=[],
                    outputs=[errors_output, stop_button, run_button],
                )

                # Run button click handler
                run_button.click(
                    fn=run_with_stream,
                        inputs=[
                            agent_type, llm_provider, llm_model_name, llm_num_ctx, llm_temperature, llm_base_url, llm_api_key,
                            use_own_browser, keep_browser_open, headless, disable_security, window_w, window_h,
                            save_recording_path, save_agent_history_path, save_trace_path,  # Include the new path
                            enable_recording, task, add_infos, max_steps, use_vision, max_actions_per_step, tool_calling_method, chrome_cdp
                        ],
                    outputs=[
                        browser_view,           # Browser view
                        final_result_output,    # Final result
                        errors_output,          # Errors
                        model_actions_output,   # Model actions
                        model_thoughts_output,  # Model thoughts
                        recording_display,      # Latest recording
                        trace_file,             # Trace file
                        agent_history_file,     # Agent history file
                        stop_button,            # Stop button
                        run_button              # Run button
                    ],
                )
                
                # Run Deep Research
                research_button.click(
                        fn=run_deep_search,
                        inputs=[research_task_input, max_search_iteration_input, max_query_per_iter_input, llm_provider, llm_model_name, llm_num_ctx, llm_temperature, llm_base_url, llm_api_key, use_vision, use_own_browser, headless, chrome_cdp],
                        outputs=[markdown_output_display, markdown_download, stop_research_button, research_button]
                )
                # Bind the stop button click event after errors_output is defined
                stop_research_button.click(
                    fn=stop_research_agent,
                    inputs=[],
                    outputs=[stop_research_button, research_button],
                )

            with gr.TabItem("🎥 Recordings", id=7):
                def list_recordings(save_recording_path):
                    if not os.path.exists(save_recording_path):
                        return []

                    # Get all video files
                    recordings = glob.glob(os.path.join(save_recording_path, "*.[mM][pP]4")) + glob.glob(os.path.join(save_recording_path, "*.[wW][eE][bB][mM]"))

                    # Sort recordings by creation time (oldest first)
                    recordings.sort(key=os.path.getctime)

                    # Add numbering to the recordings
                    numbered_recordings = []
                    for idx, recording in enumerate(recordings, start=1):
                        filename = os.path.basename(recording)
                        numbered_recordings.append((recording, f"{idx}. {filename}"))

                    return numbered_recordings

                recordings_gallery = gr.Gallery(
                    label="Recordings",
                    value=list_recordings(config['save_recording_path']),
                    columns=3,
                    height="auto",
                    object_fit="contain"
                )

                refresh_button = gr.Button("🔄 Refresh Recordings", variant="secondary")
                refresh_button.click(
                    fn=list_recordings,
                    inputs=save_recording_path,
                    outputs=recordings_gallery
                )
            
            with gr.TabItem("📁 Configuration", id=8):
                with gr.Group():
                    config_file_input = gr.File(
                        label="Load Config File",
                        file_types=[".pkl"],
                        interactive=True
                    )

                    load_config_button = gr.Button("Load Existing Config From File", variant="primary")
                    save_config_button = gr.Button("Save Current Config", variant="primary")

                    config_status = gr.Textbox(
                        label="Status",
                        lines=2,
                        interactive=False
                    )

                load_config_button.click(
                    fn=update_ui_from_config,
                    inputs=[config_file_input],
                    outputs=[
                        agent_type, max_steps, max_actions_per_step, use_vision, tool_calling_method,
                        llm_provider, llm_model_name, llm_num_ctx, llm_temperature, llm_base_url, llm_api_key,
                        use_own_browser, keep_browser_open, headless, disable_security, enable_recording,
                        window_w, window_h, save_recording_path, save_trace_path, save_agent_history_path,
                        task, config_status
                    ]
                )

                save_config_button.click(
                    fn=save_current_config,
                    inputs=[
                        agent_type, max_steps, max_actions_per_step, use_vision, tool_calling_method,
                        llm_provider, llm_model_name, llm_num_ctx, llm_temperature, llm_base_url, llm_api_key,
                        use_own_browser, keep_browser_open, headless, disable_security,
                        enable_recording, window_w, window_h, save_recording_path, save_trace_path,
                        save_agent_history_path, task,
                    ],  
                    outputs=[config_status]
                )


        # Attach the callback to the LLM provider dropdown
        llm_provider.change(
            lambda provider, api_key, base_url: update_model_dropdown(provider, api_key, base_url),
            inputs=[llm_provider, llm_api_key, llm_base_url],
            outputs=llm_model_name
        )

        # Add this after defining the components
        enable_recording.change(
            lambda enabled: gr.update(interactive=enabled),
            inputs=enable_recording,
            outputs=save_recording_path
        )

        use_own_browser.change(fn=close_global_browser)
        keep_browser_open.change(fn=close_global_browser)

    return demo

def main():
    # Check if running in Electron mode
    parser = argparse.ArgumentParser(description='Browser Use API')
    parser.add_argument('--electron', action='store_true', help='Run in Electron mode')
    args = parser.parse_args()
    
    if args.electron:
        print("Starting Browser Use Python API in Electron mode", flush=True)
        
        # Create an event loop for asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Handle messages from Electron
        async def handle_message(message_str):
            try:
                # Parse the message as JSON
                message = json.loads(message_str)
                action = message.get('action')
                data = message.get('data', {})
                request_id = message.get('id')
                
                logger.info(f"Received action: {action}")
                
                if action == 'init':
                    # Respond to initialization
                    response = {
                        'status': 'ready', 
                        'timestamp': datetime.now().isoformat(),
                        'id': request_id
                    }
                    send_to_electron(json_serialize(response))
                
                elif action == 'run-agent':
                    # Run the agent with the provided configuration
                    try:
                        # Extract agent configuration from data
                        agent_type = data.get('agent_type', 'custom')
                        
                        # Common parameters
                        llm_provider = data.get('llm_provider', 'openai')
                        llm_model_name = data.get('llm_model_name', 'gpt-4o')
                        llm_num_ctx = data.get('llm_num_ctx', 4096)
                        llm_temperature = data.get('llm_temperature', 0.0)
                        llm_base_url = data.get('llm_base_url', '')
                        llm_api_key = data.get('llm_api_key', '')
                        use_own_browser = data.get('use_own_browser', False)
                        keep_browser_open = data.get('keep_browser_open', False)
                        headless = data.get('headless', False)
                        disable_security = data.get('disable_security', False)
                        window_w = data.get('window_w', 1280)
                        window_h = data.get('window_h', 720)
                        save_recording_path = data.get('save_recording_path', '')
                        save_agent_history_path = data.get('save_agent_history_path', '')
                        save_trace_path = data.get('save_trace_path', '')
                        enable_recording = data.get('enable_recording', False)
                        task = data.get('task', '')
                        add_infos = data.get('add_infos', '')
                        max_steps = data.get('max_steps', 25)
                        use_vision = data.get('use_vision', True)
                        max_actions_per_step = data.get('max_actions_per_step', 3)
                        tool_calling_method = data.get('tool_calling_method', 'functions')
                        chrome_cdp = data.get('chrome_cdp', 'http://localhost:9222')
                        
                        # Configure the LLM
                        llm = utils.get_llm_model(
                            provider=llm_provider, 
                            model_name=llm_model_name, 
                            num_ctx=llm_num_ctx, 
                            temperature=llm_temperature, 
                            base_url=llm_base_url, 
                            api_key=llm_api_key
                        )
                        
                        # Run the agent based on type
                        result = None
                        if agent_type == 'browser':
                            result = await run_browser_agent(
                                agent_type, llm_provider, llm_model_name, llm_num_ctx, 
                                llm_temperature, llm_base_url, llm_api_key, use_own_browser, 
                                keep_browser_open, headless, disable_security, window_w, 
                                window_h, save_recording_path, save_agent_history_path, 
                                save_trace_path, enable_recording, task, add_infos, max_steps, 
                                use_vision, max_actions_per_step, tool_calling_method, chrome_cdp
                            )
                        elif agent_type == 'org':
                            result = await run_org_agent(
                                llm, use_own_browser, keep_browser_open, headless, 
                                disable_security, window_w, window_h, save_recording_path, 
                                save_agent_history_path, save_trace_path, task, max_steps, 
                                use_vision, max_actions_per_step, tool_calling_method, chrome_cdp
                            )
                        else:  # Default to custom agent
                            result = await run_custom_agent(
                                llm, use_own_browser, keep_browser_open, headless, 
                                disable_security, window_w, window_h, save_recording_path, 
                                save_agent_history_path, save_trace_path, task, add_infos, 
                                max_steps, use_vision, max_actions_per_step, tool_calling_method, chrome_cdp
                            )
                        
                        # Return the result with the request ID
                        response = {
                            'result': result,
                            'id': request_id
                        }
                        send_to_electron(json_serialize(response))
                        
                    except Exception as e:
                        logger.error(f"Error running agent: {str(e)}", exc_info=True)
                        response = {
                            'result': {'status': 'error', 'message': str(e)},
                            'id': request_id
                        }
                        send_to_electron(json_serialize(response))
                
                # ... Handle other actions (other elif blocks)
                        
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON received: {str(e)}")
                send_to_electron(json_serialize({
                    'status': 'error',
                    'message': f'Invalid JSON: {str(e)}'
                }))
            except Exception as e:
                logger.error(f"Error handling message: {str(e)}", exc_info=True)
                send_to_electron(json_serialize({
                    'status': 'error',
                    'message': f'Error: {str(e)}'
                }))
        
        # Read messages from stdin
        for line in sys.stdin:
            line = line.strip()
            if line:
                loop.run_until_complete(handle_message(line))
                
    else:
        # Run the Web UI
        create_ui() 

if __name__ == '__main__':
    main()
