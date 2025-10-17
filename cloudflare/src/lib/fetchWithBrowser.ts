/**
 * Fetch page content using Cloudflare Browser Rendering for JavaScript-heavy sites.
 * This is essential for sites that render content dynamically with React/Vue/etc.
 */

export interface BrowserDependencies {
  browser: Fetcher; // Cloudflare Browser Rendering binding
}

export interface BrowserFetchResult {
  content: string;
  renderedHtml: string;
  success: boolean;
  error?: string;
}

/**
 * Auto-scroll helper to trigger lazy-loaded content
 * Executes in browser context to scroll page gradually
 */
async function autoScroll(page: any): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 800;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

/**
 * Fetch a page using headless Chrome via Cloudflare Browser Rendering.
 * Returns the fully rendered HTML after JavaScript execution.
 * 
 * UPDATED: Proper configuration for HK banking sites:
 * - Locale: zh-HK (Hong Kong Chinese)
 * - Timezone: Asia/Hong_Kong
 * - Realistic Chrome user agent
 * - Auto-scroll for lazy-loaded content
 * - Extract both HTML and visible text
 */
export async function fetchWithBrowser(
  url: string,
  browserBinding: any // Cloudflare Browser binding (supports Puppeteer API)
): Promise<BrowserFetchResult> {
  try {
    console.log(`[BROWSER] Launching browser for: ${url}`);
    
    // Launch browser with HK-specific configuration
    const browser = await browserBinding.launch({
      locale: 'zh-HK',
      timezoneId: 'Asia/Hong_Kong',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });

    console.log(`[BROWSER] Browser launched, creating page`);
    const page = await browser.newPage();
    
    // Navigate with networkidle wait (ensures AJAX/dynamic content loads)
    console.log(`[BROWSER] Navigating to: ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    console.log(`[BROWSER] Page loaded, scrolling to trigger lazy content`);
    // Auto-scroll to trigger lazy-loaded elements
    await autoScroll(page);
    
    console.log(`[BROWSER] Extracting content`);
    // Get both HTML and visible text
    const renderedHtml = await page.content();
    const visibleText = await page.evaluate(() => document.body.innerText);
    
    await browser.close();
    console.log(`[BROWSER] Success: HTML ${renderedHtml.length} chars, Visible Text ${visibleText.length} chars`);

    return {
      content: visibleText || renderedHtml, // Prefer visible text (cleaner)
      renderedHtml: renderedHtml,
      success: true
    };
  } catch (error) {
    console.error(`[BROWSER] Exception:`, error);
    return {
      content: "",
      renderedHtml: "",
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Detect if a URL is for a JavaScript-heavy site that requires browser rendering.
 * Add more domains as needed based on extraction failures.
 */
export function requiresBrowserRendering(url: string): boolean {
  const jsHeavySites = [
    "mox.com",           // MOX Bank (React/Gatsby)
    "payme.hsbc.com.hk", // HSBC PayMe
    "sc.com/hk",         // Standard Chartered (some pages)
    "dbs.com.hk",        // DBS (some pages)
    // Add more as discovered
  ];
  
  const urlLower = url.toLowerCase();
  return jsHeavySites.some(site => urlLower.includes(site));
}
