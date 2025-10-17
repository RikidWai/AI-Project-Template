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

function sanitizeText(content: string): string[] {
  const fromHtml = Array.from(content.matchAll(/<(?:p|li|h\d)[^>]*>(.*?)<\/\s*(?:p|li|h\d)>/gis)).map((match) =>
    match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  ).filter((text) => text.length > 0);
  if (fromHtml.length >= 5) return fromHtml;
  // Fallback for plain text (e.g., PDF extracted text)
  const byLine = content
    .split(/\r?\n|\u3002|\uff1a|\uff0c|\.|\;|\:/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);
  return byLine;
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
  let issuer: number | null = null;
  let network: number | null = null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    const hasFxKeyword = /foreign\s+transaction|fx fee|overseas\s+transaction|currency\s+conversion|mastercard|visa/.test(lower)
      || /外幣|海外|交易費|手續費|匯率|國際組織|萬事達|維薩/.test(line);
    if (!hasFxKeyword) continue;

    // Detect explicit "no fee"
    if (/no\s+foreign|no\s+fx|不收取|免收/.test(lower + line)) {
      issuer = issuer ?? 0;
      network = network ?? 0;
    }

    const percents = Array.from(line.matchAll(/(\d+(?:\.\d+)?)\s*%/g)).map((m) => parseFloat(m[1]));
    if (percents.length === 1) {
      // Heuristic: if line mentions Mastercard/Visa/network, treat as network
      if (/mastercard|visa|network|國際組織|卡組織/.test(lower + line)) {
        network = network ?? percents[0];
      } else {
        issuer = issuer ?? percents[0];
      }
    }
    if (percents.length >= 2) {
      // Take min as network, max as issuer (common phrasing issuer+network)
      const min = Math.min(...percents);
      const max = Math.max(...percents);
      network = network ?? min;
      issuer = issuer ?? (max !== min ? max : null);
    }
  }
  if (issuer == null && network == null) return null;
  const effective = (issuer ?? 0) + (network ?? 0);
  return Number.isFinite(effective) ? effective : null;
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
