import { fetchPerkPage } from "./fetchPerkPage";
import { extractPerkSchema } from "./extractPerkSchema";
import { publishRules } from "./publishRules";
import { validateRuleset } from "./validateRules";
import type { FetchDependencies } from "./fetchPerkPage";
import type { PublishDependencies } from "./publishRules";
import type { CardRuleSet, PublishResult } from "./types";
import type { ValidationResult } from "./validateRules";

export interface ProcessCardLinkOutput {
  status: "published" | "needs_review";
  ruleset: CardRuleSet;
  validation: ValidationResult;
  publishResult?: PublishResult;
}

export interface ProcessCardLinkDependencies {
  fetch: FetchDependencies;
  publish: PublishDependencies;
}

export async function processCardLink(
  url: string,
  region: string,
  deps: ProcessCardLinkDependencies,
): Promise<ProcessCardLinkOutput> {
  const fetched = await fetchPerkPage({ url, region }, deps.fetch);
  const ruleset = extractPerkSchema(fetched, region);
  const validation = validateRuleset(ruleset);

  if (!validation.valid) {
    return {
      status: "needs_review",
      ruleset,
      validation,
    };
  }

  const publishResult = await publishRules(ruleset, deps.publish);
  return {
    status: "published",
    ruleset,
    validation,
    publishResult,
  };
}
