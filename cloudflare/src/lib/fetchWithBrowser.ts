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
  const script = `(() => new Promise((resolve) => {
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
  }))()`;
  await page.evaluate(script);
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
  browserBinding: any // Cloudflare Browser binding (supports Playwright-like RPC)
): Promise<BrowserFetchResult> {
  try {
    console.log(`[BROWSER] Launching browser for: ${url}`);
    const launchOpts = {
      locale: 'zh-HK',
      timezoneId: 'Asia/Hong_Kong',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    } as any;

    // Support both API shapes: newContext() (recommended) or launch().
    let page: any = null;
    let context: any = null;
    let browser: any = null;
    if (browserBinding && typeof browserBinding.newContext === 'function') {
      console.log('[BROWSER] Using newContext API');
      context = await browserBinding.newContext(launchOpts);
      page = await context.newPage();
    } else if (browserBinding && typeof browserBinding.launch === 'function') {
      console.log('[BROWSER] Using launch API');
      browser = await browserBinding.launch(launchOpts);
      page = await browser.newPage();
    } else {
      console.warn('[BROWSER] Binding does not expose newContext/launch. Is Browser Rendering enabled?');
      return { content: '', renderedHtml: '', success: false, error: 'Browser binding unsupported in this env' };
    }
    
    // Navigate with networkidle wait (ensures AJAX/dynamic content loads)
    console.log(`[BROWSER] Navigating to: ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    console.log(`[BROWSER] Page loaded, interacting to reveal hidden sections`);
    // Try clicking common reveal buttons/links for designated merchants
    try {
      const clickScript = `(() => {
        const terms = ['designated','eligible','merchant','merchants','商戶','指定','合資格','terms','細則','條款'];
        const clickIfMatch = (el) => {
          const txt = (el.textContent || '').toLowerCase();
          if (terms.some(t => txt.includes(t))) { el.click?.(); return true; }
          return false;
        };
        document.querySelectorAll('button, a, summary, div[role="button"]').forEach((el) => { try { clickIfMatch(el); } catch(e) {} });
      })()`;
      await page.evaluate(clickScript);
    } catch {}

    // Auto-scroll to trigger lazy-loaded elements after interaction
    await autoScroll(page);
    
    console.log(`[BROWSER] Extracting content`);
    // Get both HTML and visible text
    const renderedHtml = await page.content();
    const visibleText = await page.evaluate('document.body.innerText');
    
    try { await page.close?.(); } catch {}
    try { await context?.close?.(); } catch {}
    try { await browser?.close?.(); } catch {}
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
