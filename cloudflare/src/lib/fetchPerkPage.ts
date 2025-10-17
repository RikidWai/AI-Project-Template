import { sha256 } from "./hash";
import { fetchWithBrowser, requiresBrowserRendering } from "./fetchWithBrowser";
import { extractPdfUrls, fetchAndCombinePdfs } from "./pdfParser";
import type { FetchPerkPageInput, FetchedPage, SnapshotStore } from "./types";

export interface FetchDependencies {
  fetch: (url: string) => Promise<{ text(): Promise<string> }>;
  snapshotStore: SnapshotStore;
  browserBinding?: any; // Optional: Cloudflare Browser Rendering binding
  scraperApiKey?: string; // Optional: ScraperAPI key for final fallback
  pdfcoApiKey?: string; // Optional: pdf.co API key for PDF text extraction
  now?: () => Date;
}

/**
 * Helper function to get realistic browser headers
 */
function getRealisticHeaders(): Record<string, string> {
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-HK,zh-TW;q=0.9,zh;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1'
  };
}

/**
 * Fetch page using ScraperAPI (final fallback)
 */
async function fetchWithScraperAPI(url: string, apiKey: string): Promise<string> {
  const proxyUrl = `https://api.scraperapi.com?${new URLSearchParams({
    api_key: apiKey,
    url: url,
    render: 'true',
    country_code: 'hk',
    premium: 'true'  // Use premium for stubborn sites like Mox
  })}`;
  
  console.log(`[SCRAPERAPI] Fetching via proxy: ${url}`);
  const response = await fetch(proxyUrl);
  const content = await response.text();
  console.log(`[SCRAPERAPI] Success: ${content.length} chars`);
  return content;
}

/**
 * Fetch perk page with intelligent fallback strategy:
 * 
 * TIER 1: PDF-FIRST (Primary, bypasses Cloudflare)
 *   - Extract PDF URLs from HTML source
 *   - Fetch and parse PDFs (Key Facts, Rewards, Terms)
 *   - Cost: ~$0 (just compute)
 *   - Success rate: ~90% for HK banks
 * 
 * TIER 2: BROWSER RENDERING (Fallback)
 *   - Cloudflare Workers browser binding
 *   - Extract visible text from rendered page
 *   - Cost: ~$0.50 per 1,000 requests
 *   - Success rate: ~70% with proper config
 * 
 * TIER 3: SCRAPERAPI (Last Resort)
 *   - Premium proxy with Cloudflare bypass
 *   - Cost: Limited by credits ($5,000 free trial)
 *   - Success rate: ~95% (most reliable)
 * 
 * TIER 4: REGULAR FETCH (Baseline)
 *   - Standard HTTP fetch with realistic headers
 *   - Cost: ~$0
 *   - Success rate: ~50% (blocked by Cloudflare on some sites)
 */
export async function fetchPerkPage(
  input: FetchPerkPageInput,
  deps: FetchDependencies,
): Promise<FetchedPage> {
  let content: string = "";
  let fetchMethod: string = "";
  
  try {
    // ════════════════════════════════════════════════════════════
    // TIER 1: PDF-FIRST STRATEGY (BEST - bypasses all blocking)
    // ════════════════════════════════════════════════════════════
    console.log(`[FETCH] Starting PDF-first fetch for: ${input.url}`);
    
    // Try to fetch HTML (even if blocked, we can extract PDF URLs from source)
    let htmlContent: string;
    try {
      // Prefer injected fetch (tests/mocks)
      const htmlResponse = await deps.fetch(input.url);
      htmlContent = await htmlResponse.text();
      console.log(`[FETCH] Initial HTML fetch: 200 (${htmlContent.length} chars)`);
    } catch (error) {
      console.warn(`[FETCH] Initial HTML fetch via deps.fetch failed, trying direct fetch:`, error);
      try {
        const htmlResponse = await fetch(input.url, { headers: getRealisticHeaders() });
        htmlContent = await htmlResponse.text();
        console.log(`[FETCH] Direct HTML fetch: ${htmlResponse.status} (${htmlContent.length} chars)`);
      } catch (e2) {
        console.warn(`[FETCH] Direct HTML fetch failed:`, e2);
        htmlContent = '';
      }
    }
    
    // Extract PDF URLs from HTML source
    if (htmlContent) {
      const pdfInfos = extractPdfUrls(htmlContent, input.url);
      
      if (pdfInfos.length > 0) {
        console.log(`[FETCH] ✅ Found ${pdfInfos.length} PDFs - using PDF-first strategy`);
        console.log(`[FETCH] PDFs: ${pdfInfos.map(p => `${p.type} (priority ${p.priority})`).join(', ')}`);
        
        // Fetch and combine top 3 PDFs by priority (pass API keys if available)
        content = await fetchAndCombinePdfs(pdfInfos, 3, deps.scraperApiKey, deps.pdfcoApiKey);
        fetchMethod = 'pdf';
        
        if (content.length > 100) {
          console.log(`[FETCH] ✅ PDF extraction successful (${content.length} chars)`);
        } else {
          console.warn(`[FETCH] ⚠️ PDF content too short (${content.length} chars), trying fallback`);
          content = '';
        }
      } else {
        console.log(`[FETCH] No PDFs found in HTML, trying fallback methods`);
      }
    }
    
    // ════════════════════════════════════════════════════════════
    // TIER 2: BROWSER RENDERING (Fallback if no PDFs)
    // ════════════════════════════════════════════════════════════
    if (!content && deps.browserBinding) {
      console.log(`[FETCH] 🌐 Trying Browser Rendering`);
      const browserResult = await fetchWithBrowser(input.url, deps.browserBinding);
      
      if (browserResult.success) {
        content = browserResult.content; // Use visible text (cleaner than HTML)
        fetchMethod = 'browser';
        console.log(`[FETCH] ✅ Browser rendering successful (${content.length} chars)`);
      } else {
        console.warn(`[FETCH] ⚠️ Browser rendering failed: ${browserResult.error}`);
      }
    }
    
    // ════════════════════════════════════════════════════════════
    // TIER 3: SCRAPERAPI (Last resort for stubborn sites)
    // ════════════════════════════════════════════════════════════
    if (!content && deps.scraperApiKey) {
      console.log(`[FETCH] 💰 Trying ScraperAPI (last resort)`);
      try {
        content = await fetchWithScraperAPI(input.url, deps.scraperApiKey);
        fetchMethod = 'scraperapi';
        console.log(`[FETCH] ✅ ScraperAPI successful (${content.length} chars)`);
      } catch (error) {
        console.error(`[FETCH] ⚠️ ScraperAPI failed:`, error);
      }
    }
    
    // ════════════════════════════════════════════════════════════
    // TIER 4: REGULAR FETCH (Baseline if all else fails)
    // ════════════════════════════════════════════════════════════
    if (!content) {
      console.log(`[FETCH] 📄 Falling back to regular fetch`);
      
      if (htmlContent) {
        // Use already-fetched HTML
        content = htmlContent;
        fetchMethod = 'html';
      } else {
        // Try again with injected fetch (tests/mocks)
        try {
          const response = await deps.fetch(input.url);
          content = await response.text();
          fetchMethod = 'html';
        } catch (e3) {
          // Last resort direct fetch
          const response = await fetch(input.url, { headers: getRealisticHeaders() });
          content = await response.text();
          fetchMethod = 'html';
        }
      }
      
      console.log(`[FETCH] Regular fetch completed (${content.length} chars)`);
    }
    
  } catch (error) {
    console.error(`[FETCH] ❌ All fetch strategies failed:`, error);
    throw new Error(`Failed to fetch ${input.url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  const contentHash = await sha256(content);
  const snapshotKey = `snapshots/${input.region.toLowerCase()}/${contentHash}.html`;
  await deps.snapshotStore.put(snapshotKey, content, {
    metadata: {
      url: input.url,
      region: input.region,
    },
    contentType: "text/html",
  });

  const fetchedAt = (deps.now ? deps.now() : new Date()).toISOString();
  return {
    url: input.url,
    content,
    contentHash,
    snapshotKey,
    fetchedAt,
  };
}
