/**
 * PDF Parser Utility
 * 
 * Extracts PDF URLs from HTML and fetches/parses PDF content.
 * Uses pdfjs-dist for parsing (Cloudflare Workers compatible).
 */

export interface PdfInfo {
  url: string;
  priority: number;
  type: 'key_facts' | 'rewards' | 'cashback' | 'terms' | 'other';
}

/**
 * Extract PDF URLs from HTML content
 * Works even if the HTML page is blocked by Cloudflare
 */
export function extractPdfUrls(html: string, baseUrl: string): PdfInfo[] {
  const pdfUrls: Set<string> = new Set();
  
  // Match absolute URLs
  const absoluteRegex = /https?:\/\/[^"'\s<>]+\.pdf/gi;
  const absoluteMatches = html.match(absoluteRegex) || [];
  absoluteMatches.forEach(url => pdfUrls.add(url));
  
  // Match relative URLs
  const relativeRegex = /(?:href|src)=["']([^"']*\.pdf)["']/gi;
  let match;
  while ((match = relativeRegex.exec(html)) !== null) {
    try {
      const fullUrl = new URL(match[1], baseUrl).href;
      pdfUrls.add(fullUrl);
    } catch (e) {
      // Invalid URL, skip
    }
  }
  
  // Match /static/ paths (common for banks like Mox)
  const staticRegex = /\/static\/[^"'\s<>]+\.pdf/gi;
  const staticMatches = html.match(staticRegex) || [];
  staticMatches.forEach(path => {
    try {
      const fullUrl = new URL(path, baseUrl).href;
      pdfUrls.add(fullUrl);
    } catch (e) {
      // Invalid URL, skip
    }
  });
  
  // Convert to PdfInfo array with priority
  return Array.from(pdfUrls).map(url => ({
    url,
    priority: calculatePdfPriority(url),
    type: identifyPdfType(url)
  })).sort((a, b) => a.priority - b.priority);
}

/**
 * Calculate priority for PDF (lower number = higher priority)
 */
function calculatePdfPriority(url: string): number {
  const lowerUrl = url.toLowerCase();
  
  // Highest priority: Key Facts Statements (official regulatory docs)
  if (lowerUrl.includes('key_fact') || lowerUrl.includes('kfs') || 
      lowerUrl.includes('關鍵事實') || lowerUrl.includes('重要資料')) {
    return 1;
  }
  
  // High priority: Rewards tables and cashback details
  if (lowerUrl.includes('reward') || lowerUrl.includes('cashback') ||
      lowerUrl.includes('回贈') || lowerUrl.includes('獎賞')) {
    return 2;
  }
  
  // Medium priority: Terms and conditions
  if (lowerUrl.includes('term') || lowerUrl.includes('t&c') || lowerUrl.includes('t_c') ||
      lowerUrl.includes('條款') || lowerUrl.includes('細則')) {
    return 3;
  }
  
  // Lower priority: Fee schedules
  if (lowerUrl.includes('fee') || lowerUrl.includes('charge') || lowerUrl.includes('收費')) {
    return 4;
  }
  
  // Lowest priority: Other PDFs
  return 5;
}

/**
 * Identify the type of PDF based on URL
 */
function identifyPdfType(url: string): PdfInfo['type'] {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('key_fact') || lowerUrl.includes('kfs')) return 'key_facts';
  if (lowerUrl.includes('reward') || lowerUrl.includes('獎賞')) return 'rewards';
  if (lowerUrl.includes('cashback') || lowerUrl.includes('回贈')) return 'cashback';
  if (lowerUrl.includes('term') || lowerUrl.includes('條款')) return 'terms';
  
  return 'other';
}

/**
 * Fetch and parse a PDF file
 * Returns the extracted text content
 * 
 * Strategy:
 * 1. Try pdf.co API (if API key available) - BEST quality for complex PDFs
 * 2. Try ScraperAPI (if key available)
 * 3. Fallback to direct download + simple parsing
 */
export async function fetchAndParsePdf(
  pdfUrl: string, 
  scraperApiKey?: string,
  pdfcoApiKey?: string
): Promise<string> {
  try {
    console.log(`[PDF] Fetching: ${pdfUrl}`);
    
    // PRIORITY 1: Use pdf.co API (best for complex PDFs with Chinese text)
    if (pdfcoApiKey) {
      try {
        console.log(`[PDF] Using pdf.co API for high-quality extraction`);
        const response = await fetch('https://api.pdf.co/v1/pdf/convert/to/text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': pdfcoApiKey
          },
          body: JSON.stringify({
            url: pdfUrl,
            inline: true,
            pages: '0-10' // First 10 pages (key facts are usually early)
          })
        });
        
        if (!response.ok) {
          throw new Error(`pdf.co API returned ${response.status}`);
        }
        
        const result = await response.json() as any;
        
        if (result.error) {
          throw new Error(`pdf.co error: ${result.message || 'Unknown error'}`);
        }
        
        const text = result.body || '';
        
        if (text.length > 500) {
          console.log(`[PDF] ✅ pdf.co extraction successful: ${text.length} chars`);
          return text;
        } else {
          console.warn(`[PDF] pdf.co returned only ${text.length} chars`);
        }
      } catch (pdfcoError) {
        console.warn(`[PDF] pdf.co API failed:`, pdfcoError);
        // Continue to fallback methods
      }
    } else {
      console.log(`[PDF] No pdf.co API key - skipping pdf.co extraction`);
    }
    
    // If ScraperAPI key is available, use it to fetch PDF content
    // ScraperAPI can render PDFs and extract text
    if (scraperApiKey) {
      try {
        console.log(`[PDF] Using ScraperAPI to fetch PDF content`);
        const proxyUrl = `https://api.scraperapi.com?${new URLSearchParams({
          api_key: scraperApiKey,
          url: pdfUrl,
          render: 'false', // PDFs don't need rendering
          country_code: 'hk'
        })}`;
        
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          console.log(`[PDF] Downloaded via ScraperAPI: ${arrayBuffer.byteLength} bytes`);
          
          const text = await parsePdfBuffer(arrayBuffer);
          if (text.length > 500) {
            console.log(`[PDF] ✅ ScraperAPI extraction successful: ${text.length} chars`);
            return text;
          }
        }
        console.warn(`[PDF] ScraperAPI extraction failed or returned too little text`);
      } catch (scraperError) {
        console.warn(`[PDF] ScraperAPI error:`, scraperError);
      }
    }
    
    // Fallback: Download directly
    console.log(`[PDF] Downloading PDF directly`);
    const response = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log(`[PDF] Downloaded: ${arrayBuffer.byteLength} bytes`);
    
    // Parse PDF using simple extraction
    const text = await parsePdfBuffer(arrayBuffer);
    console.log(`[PDF] Extracted: ${text.length} chars`);
    
    if (text.length < 500) {
      console.error(`[PDF] ❌ WARNING: Extracted only ${text.length} chars - PDF parsing likely failed`);
      console.error(`[PDF] This PDF requires better parsing. Consider:`);
      console.error(`[PDF] 1. Using ScraperAPI with proper PDF support`);
      console.error(`[PDF] 2. Using an external PDF parsing service`);
      console.error(`[PDF] 3. Manual extraction and upload`);
    }
    
    return text;
  } catch (error) {
    console.error(`[PDF] Error fetching ${pdfUrl}:`, error);
    throw error;
  }
}

/**
 * Parse PDF buffer and extract text using pdf.co API
 * Free tier: 300 pages/month
 */
async function parsePdfBufferWithAPI(buffer: ArrayBuffer, pdfUrl: string): Promise<string> {
  // Option 1: Use pdf.co API (free tier available)
  // We'll send the PDF URL directly to their API
  try {
    const apiKey = 'YOUR_PDFCO_API_KEY'; // Will be added as env variable
    
    const response = await fetch('https://api.pdf.co/v1/pdf/convert/to/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        url: pdfUrl,
        inline: true
      })
    });
    
    const result = await response.json() as any;
    
    if (result.error) {
      throw new Error(`pdf.co API error: ${result.message}`);
    }
    
    return result.body || '';
  } catch (error) {
    console.warn('[PDF] pdf.co API failed, falling back to simple extraction:', error);
    // Fallback to simple extraction
    return parsePdfBufferSimple(buffer);
  }
}

/**
 * Simple PDF text extraction (fallback method)
 * Extracts visible text strings from PDF structure
 */
function parsePdfBufferSimple(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const text: string[] = [];
  let currentText = '';
  
  // Look for text between () or <> in PDF content streams
  let inParens = false;
  let inAngle = false;
  
  for (let i = 0; i < bytes.length - 1; i++) {
    const char = bytes[i];
    const nextChar = bytes[i + 1];
    
    // Detect text strings in PDF: (text) or <text>
    if (char === 40 && !inParens) { // Opening (
      inParens = true;
      continue;
    }
    
    if (char === 41 && inParens) { // Closing )
      inParens = false;
      if (currentText.trim().length > 0) {
        text.push(currentText.trim());
        currentText = '';
      }
      continue;
    }
    
    if (char === 60 && !inAngle) { // Opening <
      inAngle = true;
      continue;
    }
    
    if (char === 62 && inAngle) { // Closing >
      inAngle = false;
      if (currentText.trim().length > 0) {
        text.push(currentText.trim());
        currentText = '';
      }
      continue;
    }
    
    // Collect text inside markers
    if (inParens || inAngle) {
      // Skip escaped characters
      if (char === 92) { // Backslash
        i++; // Skip next char
        continue;
      }
      
      // Only printable ASCII and common characters
      if ((char >= 32 && char <= 126) || char > 127) {
        currentText += String.fromCharCode(char);
      } else if (char === 10 || char === 13) {
        currentText += ' ';
      }
    }
  }
  
  // Join all extracted text
  let fullText = text.join(' ');
  
  // Clean up
  fullText = fullText
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/(.)\1{5,}/g, '$1$1') // Remove excessive repetition
    .trim();
  
  return fullText;
}

/**
 * Parse PDF buffer and extract text
 * Uses simple extraction that works in Cloudflare Workers
 */
async function parsePdfBuffer(buffer: ArrayBuffer): Promise<string> {
  // Use simple extraction (no external dependencies)
  const text = parsePdfBufferSimple(buffer);
  
  console.log(`[PDF] Extracted ${text.length} chars from PDF`);
  
  if (text.length < 100) {
    console.warn('[PDF] WARNING: Extracted text is very short, PDF parsing may have failed');
    console.warn('[PDF] First 500 chars:', text.substring(0, 500));
  }
  
  return text;
}

/**
 * Fetch and combine multiple PDFs
 * Returns formatted text with document separators
 */
export async function fetchAndCombinePdfs(
  pdfInfos: PdfInfo[],
  maxPdfs: number = 3,
  scraperApiKey?: string,
  pdfcoApiKey?: string
): Promise<string> {
  // Take top N PDFs by priority
  const topPdfs = pdfInfos.slice(0, maxPdfs);
  
  console.log(`[PDF] Fetching ${topPdfs.length} PDFs in priority order`);
  
  const results: Array<{ info: PdfInfo; text: string; error?: string }> = [];
  
  // Fetch PDFs sequentially to avoid overwhelming the server
  for (const pdfInfo of topPdfs) {
    try {
      const text = await fetchAndParsePdf(pdfInfo.url, scraperApiKey, pdfcoApiKey);
      results.push({ info: pdfInfo, text });
    } catch (error) {
      console.error(`[PDF] Failed to fetch ${pdfInfo.url}:`, error);
      results.push({ 
        info: pdfInfo, 
        text: '', 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // Combine results with clear document separators
  const combinedText = results
    .filter(r => r.text.length > 0)
    .map((r, i) => {
      return `
═══════════════════════════════════════════════════════════════
DOCUMENT ${i + 1}: ${r.info.type.toUpperCase()}
URL: ${r.info.url}
═══════════════════════════════════════════════════════════════

${r.text}

`.trim();
    })
    .join('\n\n');
  
  return combinedText;
}

/**
 * Extract relevant snippets from PDF text to save LLM tokens
 * Focuses on sections with rates, categories, terms
 */
export function extractRelevantSnippets(pdfText: string, maxLines: number = 30): string {
  // Keywords that indicate important information
  const keywords = [
    // English
    'cashback', 'rate', 'category', 'merchant', 'eligible', 'exclusion',
    'spend', 'minimum', 'maximum', 'cap', 'unlimited', 'fee', 'charge',
    'reward', 'point', 'mile', '%', 'HKD', 'USD',
    // Chinese
    '回贈', '比率', '類別', '商戶', '合資格', '不適用', '消費', 
    '最低', '最高', '上限', '無限', '收費', '獎賞', '積分', '里數'
  ];
  
  const lines = pdfText.split('\n');
  const relevantLines: Array<{ line: string; score: number }> = [];
  
  // Score each line based on keyword matches
  for (const line of lines) {
    if (line.trim().length < 10) continue; // Skip very short lines
    
    const lowerLine = line.toLowerCase();
    let score = 0;
    
    for (const keyword of keywords) {
      if (lowerLine.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    
    if (score > 0) {
      relevantLines.push({ line: line.trim(), score });
    }
  }
  
  // Sort by score (descending) and take top N lines
  relevantLines.sort((a, b) => b.score - a.score);
  
  return relevantLines
    .slice(0, maxLines)
    .map(r => r.line)
    .join('\n');
}
