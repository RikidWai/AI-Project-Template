import type { CardRuleSet, CardRule, PublishResult } from "./types";
import { publishRules } from "./publishRules";

export interface EnrichDeps {
  fetch: (url: string) => Promise<{ text: () => Promise<string> }>;
  publish: {
    rulesetStore: { put: (k: string, v: string, o?: { contentType?: string }) => Promise<void> } & { get?: (k: string) => Promise<string | null> };
    rulesetKV: { put: (k: string, v: string) => Promise<void>; get: (k: string) => Promise<string | null> };
    now?: () => Date;
  };
}

function absolutize(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function findMerchantLinks(html: string, baseUrl: string): string[] {
  const links = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis));
  const candidates: string[] = [];
  for (const m of links) {
    const href = m[1];
    const text = (m[2] || "").toLowerCase();
    if (/(merchant|merchants|eligible|designated|商戶|指定|合資格)/i.test(text)) {
      candidates.push(absolutize(baseUrl, href));
    }
  }
  return Array.from(new Set(candidates)).slice(0, 6);
}

function extractTextBlocks(html: string): string[] {
  return Array.from(html.matchAll(/<(?:li|p|td|th|div)[^>]*>(.*?)<\/\s*(?:li|p|td|th|div)>/gis))
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 2 && t.length <= 80);
}

function guessCategory(label: string): string {
  const s = label.toLowerCase();
  if (/(supermarket|超市|grocery|grocer)/.test(s)) return "supermarket";
  if (/(dining|restaurant|餐|food)/.test(s)) return "dining";
  if (/(travel|airline|hotel|旅|flight)/.test(s)) return "travel";
  if (/(online|網購|e-?commerce)/.test(s)) return "online";
  return "general";
}

function attachMerchants(ruleset: CardRuleSet, anchorLabel: string, merchants: string[], sourceUrl: string): CardRuleSet {
  const category = guessCategory(anchorLabel);
  const updatedRules: CardRule[] = ruleset.rules.map((r) => {
    if (r.category !== category) return r;
    const merged = Array.from(new Set([...(r.merchants || []), ...merchants]));
    const sources = Array.from(new Set([...(r.sources || []), sourceUrl]));
    return { ...r, merchants: merged, sources };
  });
  return { ...ruleset, rules: updatedRules };
}

export async function enrichDesignatedMerchantsFromHtml(
  pageUrl: string,
  pageHtml: string,
  current: CardRuleSet,
  deps: EnrichDeps,
): Promise<PublishResult | null> {
  const links = findMerchantLinks(pageHtml, pageUrl);
  if (!links.length) return null;

  let enriched = current;
  for (const link of links) {
    try {
      const res = await deps.fetch(link);
      const html = await res.text();
      const blocks = extractTextBlocks(html);
      // heuristic: a merchant line often contains 2-3 words; filter very long lines
      const merchants = blocks
        .filter((t) => /[A-Za-z\u4e00-\u9fa5]/.test(t))
        .filter((t) => !/^note[:：]/i.test(t))
        .slice(0, 300);
      if (merchants.length) {
        // Use link text as category hint when possible
        const labelMatch = link.toLowerCase();
        enriched = attachMerchants(enriched, labelMatch, merchants, link);
      }
    } catch {
      // ignore failures silently
    }
  }

  if (JSON.stringify(enriched.rules) !== JSON.stringify(current.rules)) {
    // republish new version
    return await publishRules(enriched, deps.publish as any);
  }
  return null;
}
