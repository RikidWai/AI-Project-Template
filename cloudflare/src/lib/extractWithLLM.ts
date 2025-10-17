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
    description: string;
    rewardType: "cashback" | "miles" | "points";
    unit: string; // "%" | "hkd_per_mile" | ...
    rateValue: number; // numeric value in the given unit
    sourceText: string;
    confidence: number;
    stacking?: "choose_one" | "stackable";
    conditions?: string; // free-form text summary
    merchants?: string[];
  }>;
  annualFee: ExtractedWithProvenance;
  fx: {
    issuerFeePct?: ExtractedWithProvenance;
    networkMarkupPct?: ExtractedWithProvenance;
  };
  promotions: Array<{
    text: string;
    sourceText: string;
    confidence: number;
  }>;
}

const EXTRACTION_PROMPT = `You are KaCard, a global credit-card planner that extracts card facts from official issuer documents only.

Task: Extract structured credit card data from the provided page content for ANY market (global). Content may be in any language.

Golden rules:
- Official-source only: Use the given page content as the sole source; do not infer from third parties.
- If a field is missing or ambiguous, set value to null and include sourceText = "Not mentioned in content" (Unknown ⚠️).
- Do not infer FX fees from network brand alone.
- If conditions apply (e.g., tiered rates, caps/windows), output separate rules and include short condition text.
- Do NOT convert miles/points to cashback. Identify rewardType and unit precisely (e.g., "%", "miles_per_currency", "points_per_currency").

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
      "description": "3% cashback on dining",
      "rewardType": "cashback|miles|points",
      "unit": "%|miles_per_currency|points_per_currency",
      "rateValue": 3,
      "sourceText": "exact quote",
      "confidence": 0.92,
      "stacking": "choose_one|stackable",
      "conditions": "requires balance ≥ HKD 250,000",
      "merchants": ["CitySuper", "ParknShop"]
    }
  ],
  "annualFee": {
    "value": 0,
    "sourceText": "免年費 or Free",
    "confidence": 0.98
  },
  "fx": {
    "issuerFeePct": { "value": null, "sourceText": "Not mentioned in content", "confidence": 0 },
    "networkMarkupPct": { "value": null, "sourceText": "Not mentioned in content", "confidence": 0 }
  },
  "promotions": [
    {
      "text": "Welcome bonus: HKD 500",
      "sourceText": "exact quote",
      "confidence": 0.85
    }
  ]
}

Category mapping guide (examples, not exhaustive):
- dining/餐飲 → "dining"
- supermarket/超市 → "supermarket"
- travel/旅遊/airlines/hotels → "travel"
- online/e-commerce/網購 → "online"
- general/any spend → "general"

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
  const model = "google/gemini-2.5-pro";

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
      // legacy rate: only set for % cashback
      rate: r.unit === "%" ? r.rateValue : 0,
      description: r.description + (r.conditions ? ` (Conditions: ${r.conditions})` : ""),
      rewardType: r.rewardType,
      unit: r.unit,
      rateValue: r.rateValue,
      stacking: r.stacking || "choose_one",
      merchants: r.merchants,
      source: page.url,
      sources: [page.url],
    })),
    annualFee: extracted.annualFee?.value ?? null,
    fxFee: (extracted.fx?.issuerFeePct?.value ?? 0) + (extracted.fx?.networkMarkupPct?.value ?? 0) || null,
    fx: {
      issuerFeePct: extracted.fx?.issuerFeePct?.value ?? null,
      networkMarkupPct: extracted.fx?.networkMarkupPct?.value ?? null,
      effectivePct: ((extracted.fx?.issuerFeePct?.value ?? 0) + (extracted.fx?.networkMarkupPct?.value ?? 0)) || null,
      notes: null,
    },
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
        fx: {
          issuerFeePct: {
            value: extracted.fx?.issuerFeePct?.value,
            confidence: extracted.fx?.issuerFeePct?.confidence || 0,
            sourceSpan: { text: extracted.fx?.issuerFeePct?.sourceText || "" }
          },
          networkMarkupPct: {
            value: extracted.fx?.networkMarkupPct?.value,
            confidence: extracted.fx?.networkMarkupPct?.confidence || 0,
            sourceSpan: { text: extracted.fx?.networkMarkupPct?.sourceText || "" }
          }
        },
        rules: (extracted.rules || []).map((r) => ({
          category: r.category,
          rate: r.rateValue,
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
  return map[region?.toLowerCase?.()] || "USD";
}
