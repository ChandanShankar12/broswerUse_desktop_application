import json
import logging
import os

from browser_use.browser.browser import Browser
from browser_use.browser.context import BrowserContext, BrowserContextConfig
from playwright.async_api import Browser as PlaywrightBrowser
from playwright.async_api import BrowserContext as PlaywrightBrowserContext

logger = logging.getLogger(__name__)


class CustomBrowserContext(BrowserContext):
    def __init__(
        self,
        browser: "Browser",
        config: BrowserContextConfig = BrowserContextConfig()
    ):
        super(CustomBrowserContext, self).__init__(browser=browser, config=config)

    async def _init_context(self):
        """Initialize the browser context and set default settings"""
        await super()._init_context()
        
        # After initializing context, set default settings for all pages
        if self._context:
            logger.info("Setting default browser context settings")
            try:
                # Create a new page to set default settings like zoom
                page = await self._context.new_page()
                
                # Set default zoom level to 75%
                logger.info("Setting default zoom level to 75%")
                await page.evaluate("""() => {
                    document.body.style.zoom = "75%";
                    document.body.style.transform = "scale(0.75)";
                    document.body.style.transformOrigin = "0 0";
                }""")
                
                # Close the temporary page
                await page.close()
                
                logger.info("Default browser context settings applied")
            except Exception as e:
                logger.error(f"Error setting default browser context settings: {str(e)}")

    async def new_page(self):
        """Create a new page with default settings applied"""
        try:
            # Create the page
            page = await super().new_page()
            
            # Apply default zoom level and other settings
            try:
                logger.info("Applying default zoom level to new page")
                if hasattr(page, '_page'):
                    await page._page.evaluate("""() => {
                        // Inject CSS to handle zoom level
                        const style = document.createElement('style');
                        style.textContent = `
                            html {
                                zoom: 75%;
                                -moz-transform: scale(0.75);
                                -moz-transform-origin: 0 0;
                            }
                        `;
                        document.head.appendChild(style);
                    }""")
            except Exception as e:
                logger.warning(f"Could not set default zoom level on page: {str(e)}")
                
            return page
        except Exception as e:
            logger.error(f"Error creating new page: {str(e)}")
            raise