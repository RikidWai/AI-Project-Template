import { fetchPerkPage } from "./fetchPerkPage";
import { extractPerkSchema } from "./extractPerkSchema";
import { extractWithLLM } from "./extractWithLLM";
import { publishRules } from "./publishRules";
import { validateRuleset } from "./validateRules";
import type { FetchDependencies } from "./fetchPerkPage";
import type { PublishDependencies } from "./publishRules";
import type { CardRuleSet, PublishResult, HashIndexKV, RulesetKVValue } from "./types";
import type { ValidationResult } from "./validateRules";

export interface ProcessCardLinkOutput {
  status: "published" | "needs_review";
  ruleset: CardRuleSet & { provenance?: any };
  validation: ValidationResult;
  publishResult?: PublishResult;
}

export interface ProcessCardLinkDependencies {
  fetch: FetchDependencies;
  publish: PublishDependencies;
  openaiApiKey?: string; // Optional: if provided, use LLM extraction
  hashIndexKV?: HashIndexKV; // Optional: mapping from contentHash -> cardKey for dedupe
}

export async function processCardLink(
  url: string,
  region: string,
  deps: ProcessCardLinkDependencies,
): Promise<ProcessCardLinkOutput> {
  const fetched = await fetchPerkPage({ url, region }, deps.fetch);
  // Early dedupe: if contentHash already processed, return existing ruleset immediately
  const mapKey = `hash:${fetched.contentHash}`;
  if (deps.hashIndexKV) {
    try {
      const existingCardKey = await deps.hashIndexKV.get(mapKey);
      if (existingCardKey) {
        const kvRaw = await deps.publish.rulesetKV.get(existingCardKey);
        if (kvRaw) {
          const kv = JSON.parse(kvRaw) as RulesetKVValue;
          const existingRaw = await deps.publish.rulesetStore.get?.(kv.r2Key);
          if (existingRaw) {
            const existingRuleset = JSON.parse(existingRaw) as CardRuleSet;
            const validation = validateRuleset(existingRuleset);
            return {
              status: "published",
              ruleset: existingRuleset,
              validation,
              publishResult: {
                cardKey: existingCardKey,
                version: kv.version,
                r2Key: kv.r2Key,
                contentHash: kv.contentHash,
              },
            };
          }
        }
      }
    } catch (e) {
      console.warn("[DEDUPE] Hash index lookup failed, proceeding:", e);
    }
  }
  
  // Debug: Check fetched content
  console.log("[PROCESS] Fetched content length:", fetched.content.length);
  console.log("[PROCESS] First 500 chars:", fetched.content.substring(0, 500));
  
  // Use LLM extraction if API key is available, otherwise fall back to regex
  let ruleset: CardRuleSet & { provenance?: any };
  console.log("[PROCESS] OpenAI API key available:", !!deps.openaiApiKey);
  console.log("[PROCESS] OpenAI API key length:", deps.openaiApiKey?.length || 0);
  console.log("[PROCESS] OpenAI API key starts with 'sk-':", deps.openaiApiKey?.startsWith('sk-'));
  
  if (deps.openaiApiKey) {
    console.log("[PROCESS] Using LLM extraction...");
    try {
      ruleset = await extractWithLLM(fetched, region, deps.openaiApiKey);
      console.log("[PROCESS] LLM extraction succeeded!");
      console.log("[PROCESS] Extracted card name:", ruleset.cardName);
      console.log("[PROCESS] Extracted rules count:", ruleset.rules.length);
    } catch (error) {
      console.error("[PROCESS] LLM extraction failed, falling back to regex:", error);
      console.error("[PROCESS] Error details:", error instanceof Error ? error.message : String(error));
      ruleset = extractPerkSchema(fetched, region);
    }
  } else {
    console.log("[PROCESS] No API key, using regex extraction");
    ruleset = extractPerkSchema(fetched, region);
  }
  
  const validation = validateRuleset(ruleset);

  if (!validation.valid) {
    return {
      status: "needs_review",
      ruleset,
      validation,
    };
  }

  const publishResult = await publishRules(ruleset, deps.publish);
  // Update hash index for future dedupe
  try {
    await deps.hashIndexKV?.put(mapKey, publishResult.cardKey);
  } catch (e) {
    console.warn("[DEDUPE] Failed to update hash index:", e);
  }
  return {
    status: "published",
    ruleset,
    validation,
    publishResult,
  };
}
