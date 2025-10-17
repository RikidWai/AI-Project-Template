import type { FetchedPage, CardRuleSet } from "./types";

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ExtractedWithProvenance {
  value: any;
  sourceText: string;
  confidence: number;
}

interface LLMExtractionResult {
  cardName: ExtractedWithProvenance;
  baseRate: ExtractedWithProvenance;
  rules: Array<{
    category: string;
    rate: number;
    description: string;
    sourceText: string;
    confidence: number;
    conditions?: string; // e.g., "requires HKD 250k balance"
  }>;
  annualFee: ExtractedWithProvenance;
  fxFee: ExtractedWithProvenance;
  promotions: Array<{
    text: string;
    sourceText: string;
    confidence: number;
  }>;
}

const EXTRACTION_PROMPT = `You are a credit card benefits extraction assistant for Asian banks (Hong Kong, Singapore, Taiwan, etc.). 

Extract structured credit card data from the provided HTML content. The content may be in Chinese, English, or mixed languages.

CRITICAL RULES:
1. ONLY extract information explicitly stated in the provided HTML
2. DO NOT use external knowledge about this card
3. For each field, quote the EXACT text snippet that supports your extraction
4. If information is conditional (e.g., "2% if balance > 250k, else 1%"), extract ALL conditions as separate rules
5. Convert cashback rates to percentages (e.g., "HKD 4 = 1 mile" = 25% value if 1 mile = HKD 1)
6. Identify supermarket/dining/travel categories even if written in Chinese (超市/餐飲/旅遊)

Return JSON in this EXACT format:
{
  "cardName": {
    "value": "Card Name",
    "sourceText": "exact quote from HTML",
    "confidence": 0.95
  },
  "baseRate": {
    "value": 1.0,
    "sourceText": "exact quote",
    "confidence": 0.9
  },
  "rules": [
    {
      "category": "dining|supermarket|travel|online|general",
      "rate": 3.0,
      "description": "3% cashback on dining",
      "sourceText": "exact quote",
      "confidence": 0.92,
      "conditions": "requires balance ≥ HKD 250,000" // optional
    }
  ],
  "annualFee": {
    "value": 0,
    "sourceText": "免年費 or Free",
    "confidence": 0.98
  },
  "fxFee": {
    "value": 0,
    "sourceText": "0% foreign transaction fee",
    "confidence": 0.95
  },
  "promotions": [
    {
      "text": "Welcome bonus: HKD 500",
      "sourceText": "exact quote",
      "confidence": 0.85
    }
  ]
}

Category mapping guide:
- dining/餐飲 → "dining"
- supermarket/超市 → "supermarket"  
- travel/旅遊/機票/酒店 → "travel"
- online/網購 → "online"
- any general spending/任何消費 → "general"

Confidence scoring:
- 0.9-1.0: Explicitly stated, clear formatting
- 0.7-0.89: Stated but requires interpretation
- 0.5-0.69: Implied or ambiguous
- <0.5: Uncertain or not found

IMPORTANT: If a field is not found, set value to null and confidence to 0, but still provide a sourceText like "Not mentioned in content".`;

/**
 * Extract visible text from HTML, removing scripts, styles, and HTML tags.
 * Crucial for SPA/React apps where content is in the DOM, not raw HTML.
 */
function extractVisibleText(html: string): string {
  // Remove scripts, styles, and comments
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, ' ');
  
  // Extract text from common content tags
  const contentTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'div', 'span', 'a', 'button'];
  const contentRegex = new RegExp(`<(${contentTags.join('|')})[^>]*>([^<]+)<\\/\\1>`, 'gi');
  const matches: string[] = [];
  let match;
  while ((match = contentRegex.exec(text)) !== null) {
    matches.push(match[2].trim());
  }
  
  // Also strip all remaining HTML tags and decode entities
  text = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
  
  return text;
}

export async function extractWithLLM(
  page: FetchedPage,
  region: string,
  apiKey: string
): Promise<CardRuleSet & { provenance: any }> {
  // Extract visible text first to avoid HTML noise
  const visibleText = extractVisibleText(page.content);
  console.log(`[LLM] Extracted ${visibleText.length} chars of visible text from ${page.content.length} chars of HTML`);
  
  // Use visible text up to 50k chars (gpt-4o-mini handles this well)
  // This captures much more content than the previous 15k HTML limit
  const contentToAnalyze = visibleText.substring(0, 50000);
  
  const messages: OpenAIMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { 
      role: "user", 
      content: `Extract credit card benefits from this page (Region: ${region.toUpperCase()}):\n\nURL: ${page.url}\n\nContent:\n${contentToAnalyze}` 
    }
  ];
  // Available models (change this line to switch):
  const model = "google/gemini-2.5-flash-lite-preview-06-17"; // ⭐ Recommended: Fast, cheap, good quality
  // Alternatives:
  // "google/gemini-flash-1.5" - Also works, slightly older
  // "qwen/qwen-2.5-72b-instruct" - Best for Chinese
  // "meta-llama/llama-3.1-70b-instruct" - Often FREE!
  // "openai/gpt-4o-mini" - Familiar model

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://kacard.app",
      "X-Title": "KaCard Extraction"
    },
    body: JSON.stringify({
      model: model,  // ← Use variable
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error("OpenAI API error: " + error);
  }

  const result = await response.json() as any;
  
  // Handle both OpenAI and OpenRouter response formats
  const messageContent = result.choices[0].message.content;
  const extracted: LLMExtractionResult = JSON.parse(messageContent);

  // Detect currency based on region
  const currency = detectCurrency(region);

  // Transform LLM output to CardRuleSet with provenance
  return {
    cardName: extracted.cardName?.value || "Unknown Card",
    region,
    currency,
    baseRate: extracted.baseRate?.value || 0,
    rules: (extracted.rules || []).map((r) => ({
      category: r.category,
      rate: r.rate,
      description: r.description + (r.conditions ? ` (Conditions: ${r.conditions})` : ""),
      unit: "%",
      source: page.url
    })),
    annualFee: extracted.annualFee?.value ?? null,
    fxFee: extracted.fxFee?.value ?? null,
    promotions: (extracted.promotions || []).map((p) => p.text),
    sourceUrl: page.url,
    contentHash: page.contentHash,
    fetchedAt: page.fetchedAt,
    provenance: {
      snapshot_id: page.contentHash,
      model: model, // Use the actual model name
      fields: {
        cardName: {
          value: extracted.cardName?.value,
          confidence: extracted.cardName?.confidence || 0,
          sourceSpan: {
            text: extracted.cardName?.sourceText || ""
          }
        },
        baseRate: {
          value: extracted.baseRate?.value,
          confidence: extracted.baseRate?.confidence || 0,
          sourceSpan: {
            text: extracted.baseRate?.sourceText || ""
          }
        },
        annualFee: {
          value: extracted.annualFee?.value,
          confidence: extracted.annualFee?.confidence || 0,
          sourceSpan: {
            text: extracted.annualFee?.sourceText || ""
          }
        },
        fxFee: {
          value: extracted.fxFee?.value,
          confidence: extracted.fxFee?.confidence || 0,
          sourceSpan: {
            text: extracted.fxFee?.sourceText || ""
          }
        },
        rules: (extracted.rules || []).map((r) => ({
          category: r.category,
          rate: r.rate,
          confidence: r.confidence,
          sourceSpan: {
            text: r.sourceText
          }
        })),
        promotions: (extracted.promotions || []).map((p) => ({
          text: p.text,
          confidence: p.confidence,
          sourceSpan: {
            text: p.sourceText
          }
        }))
      }
    }
  };
}

function detectCurrency(region: string): string {
  const map: Record<string, string> = {
    hk: "HKD",
    sg: "SGD",
    my: "MYR",
    tw: "TWD",
    ph: "PHP"
  };
  return map[region.toLowerCase()] || "USD";
}
