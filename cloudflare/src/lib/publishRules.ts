import type { CardRuleSet, PublishResult, RulesetKV, RulesetStore, RulesetKVValue } from "./types";

export interface PublishDependencies {
  rulesetStore: RulesetStore;
  rulesetKV: RulesetKV;
  now?: () => Date;
}

function buildCardKey(cardName: string, region: string): string {
  return `${cardName}-${region}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function publishRules(
  ruleset: CardRuleSet,
  deps: PublishDependencies,
): Promise<PublishResult> {
  const cardKey = buildCardKey(ruleset.cardName, ruleset.region);
  const existingRaw = await deps.rulesetKV.get(cardKey);
  let nextVersion = 1;
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw) as RulesetKVValue;
      nextVersion = Number.parseInt(parsed.version, 10) + 1;
    } catch (error) {
      nextVersion = 1;
    }
  }

  const version = `${nextVersion}`;
  const r2Key = `rulesets/${cardKey}/v${version}.json`;
  await deps.rulesetStore.put(r2Key, JSON.stringify(ruleset, null, 2), {
    contentType: "application/json",
  });
  const updatedAt = (deps.now ? deps.now() : new Date()).toISOString();
  const kvValue: RulesetKVValue = {
    version,
    r2Key,
    contentHash: ruleset.contentHash,
    updatedAt,
  };
  await deps.rulesetKV.put(cardKey, JSON.stringify(kvValue));

  return {
    cardKey,
    version,
    r2Key,
    contentHash: ruleset.contentHash,
  };
}
