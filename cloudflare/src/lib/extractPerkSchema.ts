import type { CardRule, CardRuleSet, FetchedPage } from "./types";

const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/;
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
  if (/(groc|supermarket)/.test(lower)) return "groceries";
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
  const fxFee = extractFxFee(lines);
  const promotions = extractPromotions(lines);

  const rulesByCategory = new Map<string, CardRule>();
  for (const line of lines) {
    const percent = PERCENT_RE.exec(line);
    if (!percent) continue;
    const rate = Number.parseFloat(percent[1]);
    const category = categorize(line);
    const existing = rulesByCategory.get(category);
    if (!existing || rate > existing.rate) {
      rulesByCategory.set(category, {
        category,
        rate,
        description: line,
        unit: "%",
        source: page.url,
      });
    }
  }

  const generalRule = rulesByCategory.get("general");
  const baseRate = generalRule
    ? generalRule.rate
    : rulesByCategory.size > 0
      ? Math.min(...Array.from(rulesByCategory.values()).map((rule) => rule.rate))
      : 0;

  return {
    cardName,
    region,
    currency,
    baseRate,
    rules: Array.from(rulesByCategory.values()),
    annualFee,
    fxFee,
    promotions,
    sourceUrl: page.url,
    contentHash: page.contentHash,
    fetchedAt: page.fetchedAt,
  };
}
