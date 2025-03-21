import asyncio
import pdb
import os
import sys
import time
import requests

from playwright.async_api import Browser as PlaywrightBrowser
from playwright.async_api import (
    BrowserContext as PlaywrightBrowserContext,
)
from playwright.async_api import (
    Playwright,
    async_playwright,
)
from browser_use.browser.browser import Browser
from browser_use.browser.context import BrowserContext, BrowserContextConfig
from playwright.async_api import BrowserContext as PlaywrightBrowserContext
import logging

from .custom_context import CustomBrowserContext

logger = logging.getLogger(__name__)

class CustomBrowser(Browser):
    
    async def _init_browser(self):
        """Overridden method to better handle CDP connections"""
        if self._browser:
            return

        if not self._config:
            raise ValueError("Browser config is not set")

        try:
            self._playwright = await async_playwright().start()
            
            # If a CDP URL is provided, try to connect to it
            if self._config.cdp_url:
                logger.info(f"Connecting to remote browser via CDP {self._config.cdp_url}")
                
                # Wait for CDP endpoint to be available (retry logic)
                max_retries = 5
                retry_count = 0
                last_error = None
                
                while retry_count < max_retries:
                    try:
                        # Check if the CDP endpoint is accessible
                        response = requests.get(f"{self._config.cdp_url}/json/version", timeout=5)
                        if response.status_code == 200:
                            logger.info(f"CDP endpoint verified: {self._config.cdp_url}")
                            break
                        else:
                            logger.warning(f"CDP endpoint returned status {response.status_code}")
                    except Exception as e:
                        last_error = e
                        logger.warning(f"CDP connection attempt {retry_count+1}/{max_retries} failed: {str(e)}")
                    
                    retry_count += 1
                    # Wait before retrying
                    await asyncio.sleep(2)
                
                if retry_count >= max_retries:
                    logger.error(f"Failed to connect to CDP after {max_retries} attempts.")
                    if last_error:
                        raise Exception(f"CDP connection failed: {str(last_error)}")
                    else:
                        raise Exception("CDP connection failed: Max retries reached")
                
                # Try to connect to the CDP endpoint
                try:
                    self._browser = await self._playwright.chromium.connect_over_cdp(
                        endpoint_url=self._config.cdp_url,
                    )
                    logger.info("Successfully connected to browser via CDP")
                except Exception as e:
                    logger.error(f"Failed to initialize Playwright browser: {str(e)}")
                    raise
            else:
                # Launch a new browser instance
                logger.info("Launching new browser instance")
                
                launch_options = {
                    "headless": self._config.headless,
                }
                
                if self._config.chrome_instance_path:
                    launch_options["executable_path"] = self._config.chrome_instance_path
                    
                if self._config.extra_chromium_args:
                    launch_options["args"] = self._config.extra_chromium_args
                    
                if self._config.disable_security:
                    if "args" not in launch_options:
                        launch_options["args"] = []
                    launch_options["args"].extend([
                        "--no-sandbox",
                        "--disable-web-security",
                        "--allow-file-access-from-files",
                        "--disable-features=IsolateOrigins,site-per-process",
                    ])

                self._browser = await self._playwright.chromium.launch(**launch_options)
                logger.info("Successfully launched browser")
        except Exception as e:
            logger.error(f"Error initializing browser: {str(e)}")
            if self._playwright:
                await self._playwright.stop()
                self._playwright = None
            raise

    async def new_context(
        self,
        config: BrowserContextConfig = BrowserContextConfig()
    ) -> CustomBrowserContext:
        try:
            context = CustomBrowserContext(config=config, browser=self)
            logger.info("Successfully created browser context")
            return context
        except Exception as e:
            logger.error(f"Error creating browser context: {str(e)}")
            # Try to log browser details
            try:
                if hasattr(self, '_browser') and self._browser:
                    logger.info(f"Browser info: {self._browser}")
                else:
                    logger.warning("Browser instance is not available")
            except Exception as log_err:
                logger.error(f"Error when logging browser info: {str(log_err)}")
            
            # Re-raise exception to be handled by caller
            raise
