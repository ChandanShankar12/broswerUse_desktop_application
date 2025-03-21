import asyncio
import pdb
import os
import sys

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
