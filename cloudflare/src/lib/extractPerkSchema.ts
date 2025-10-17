import type { CardRule, CardRuleSet, FetchedPage } from "./types";

const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/;
// Examples: "HKD 4 = 1 Asia Mile", "HK$4=1里", "HK$ 8 = 1 亞萬里數"
const HKD_PER_MILE_RE = /(?:HK\$|HKD)\s*(\d+(?:\.\d+)?)\s*=\s*1\s*(?:asia\s*miles?|miles?|里|亞萬里數)/i;
const CURRENCY_RE = /(?:HK|US|SG|CA|AU)?\$\s*(\d+(?:\.\d+)?)/i;
const CARD_NAME_HINT_RE = /([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){1,5})\s+(?:Card|Visa|Mastercard|American Express)/;

function detectCurrency(text: string): string {
  if (text.includes("HK$")) return "HKD";
  if (text.includes("SG$")) return "SGD";
  if (text.includes("US$")) return "USD";
  if (text.toUpperCase().includes("USD")) return "USD";
  return "USD";
}

function extractCardName(content: string, url: string): string {
  const titleMatch = content.match(/<title>(.*?)<\/title>/i);
  if (titleMatch) {
    const hint = CARD_NAME_HINT_RE.exec(titleMatch[1]);
    if (hint) {
      return hint[0];
    }
  }
  const headingMatch = content.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
  if (headingMatch) {
    const text = headingMatch[1].replace(/<[^>]+>/g, " ").trim();
    const hint = CARD_NAME_HINT_RE.exec(text);
    if (hint) {
      return hint[0];
    }
    if (/card/i.test(text)) {
      return text;
    }
  }
  return url.replace(/^https?:\/\//, "").split("/")[0];
}

function sanitizeText(html: string): string[] {
  return Array.from(html.matchAll(/<(?:p|li|h\d)[^>]*>(.*?)<\/\s*(?:p|li|h\d)>/gis)).map((match) =>
    match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  ).filter((text) => text.length > 0);
}

function categorize(line: string): string {
  const lower = line.toLowerCase();
  if (/(dining|restaurant|food)/.test(lower)) return "dining";
  if (/(groc|supermarket|超市)/.test(lower)) return "supermarket";
  if (/(online|e-commerce|internet)/.test(lower)) return "online";
  if (/(travel|airline|hotel|flight)/.test(lower)) return "travel";
  if (/(gas|fuel|petrol)/.test(lower)) return "fuel";
  if (/(welcome|bonus)/.test(lower)) return "welcome-offer";
  return "general";
}

function extractAnnualFee(lines: string[]): number | null {
  for (const line of lines) {
    if (line.toLowerCase().includes("annual fee")) {
      const currency = CURRENCY_RE.exec(line);
      if (currency) return Number.parseFloat(currency[1]);
      const percent = PERCENT_RE.exec(line);
      if (percent) return Number.parseFloat(percent[1]);
    }
  }
  return null;
}

function extractFxFee(lines: string[]): number | null {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/(foreign transaction|fx fee|overseas transaction)/.test(lower)) {
      const percent = PERCENT_RE.exec(line);
      if (percent) return Number.parseFloat(percent[1]);
    }
  }
  return null;
}

function extractPromotions(lines: string[]): string[] {
  return lines.filter((line) =>
    /(limited time|bonus|promotion|offer|spend)/i.test(line),
  );
}

export function extractPerkSchema(page: FetchedPage, region: string): CardRuleSet {
  const lines = sanitizeText(page.content);
  const currency = detectCurrency(page.content);
  const cardName = extractCardName(page.content, page.url);
  const annualFee = extractAnnualFee(lines);
  const fxIssuer = extractFxFee(lines);
  const promotions = extractPromotions(lines);

  const rules: CardRule[] = [];
  for (const line of lines) {
    // Miles pattern
    const milesMatch = HKD_PER_MILE_RE.exec(line);
    if (milesMatch) {
      const hkdPerMile = Number.parseFloat(milesMatch[1]);
      rules.push({
        category: categorize(line),
        rate: 0, // legacy percent field; not applicable for miles
        description: line,
        rewardType: "miles",
        unit: "hkd_per_mile",
        rateValue: hkdPerMile,
        stacking: "choose_one",
        source: page.url,
      });
      continue;
    }

    // Percent cashback
    const percent = PERCENT_RE.exec(line);
    if (percent) {
      const rate = Number.parseFloat(percent[1]);
      rules.push({
        category: categorize(line),
        rate,
        description: line,
        rewardType: "cashback",
        unit: "%",
        rateValue: rate,
        stacking: "choose_one",
        source: page.url,
      });
    }
  }

  // Base rates: prefer general cashback percent if present
  const generalCashback = rules
    .filter((r) => r.category === "general" && r.unit === "%")
    .map((r) => r.rateValue || r.rate);
  const baseRate = generalCashback.length > 0 ? Math.max(...generalCashback.map(Number)) : 0;

  return {
    cardName,
    region,
    currency,
    baseRate,
    rules,
    annualFee,
    fxFee: fxIssuer, // legacy
    fx: {
      issuerFeePct: fxIssuer ?? null,
      networkMarkupPct: null,
      effectivePct: fxIssuer ?? null,
      notes: null,
    },
    promotions,
    sourceUrl: page.url,
    contentHash: page.contentHash,
    fetchedAt: page.fetchedAt,
  };
}
