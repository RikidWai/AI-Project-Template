import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { processCardLink } from "../src/lib/processCardLink";
import type { SnapshotPutOptions } from "../src/lib/types";
import type { FetchDependencies } from "../src/lib/fetchPerkPage";
import type { PublishDependencies } from "../src/lib/publishRules";

class MemoryBucket {
  public storage = new Map<string, { value: string; options?: SnapshotPutOptions | { contentType?: string } }>();

  async put(key: string, value: string | ArrayBuffer, options?: SnapshotPutOptions | { contentType?: string }) {
    const normalized = typeof value === "string" ? value : Buffer.from(value).toString("utf-8");
    this.storage.set(key, { value: normalized, options });
  }
}

class MemoryKV {
  public storage = new Map<string, string>();

  async put(key: string, value: string) {
    this.storage.set(key, value);
  }

  async get(key: string) {
    return this.storage.get(key) ?? null;
  }
}

const SAMPLE_HTML = `
<html>
  <head>
    <title>HSBC Red Credit Card Benefits | Earn up to 4% Cashback</title>
  </head>
  <body>
    <h1>HSBC Red Credit Card</h1>
    <p>Earn 1% cashback on all local spend with no minimum.</p>
    <p>Enjoy 4% cashback on online shopping worldwide.</p>
    <p>Groceries get 2.5% rebate at supermarkets and grocery stores.</p>
    <p>Welcome bonus: Limited time offer of extra 8% cashback when you spend HK$8,000.</p>
    <p>Annual fee: HK$400 waived for first year.</p>
    <p>Foreign transaction fee of 3.5% applies to overseas purchases.</p>
  </body>
</html>
`;

describe("processCardLink", () => {
  it("ingests a page and publishes a versioned ruleset", async () => {
    const snapshotBucket = new MemoryBucket();
    const rulesetBucket = new MemoryBucket();
    const kv = new MemoryKV();

    const fetchDeps: FetchDependencies = {
      fetch: async () => ({
        text: async () => SAMPLE_HTML,
      }),
      snapshotStore: snapshotBucket,
      now: () => new Date("2023-10-01T00:00:00Z"),
    };

    const publishDeps: PublishDependencies = {
      rulesetStore: rulesetBucket,
      rulesetKV: kv,
      now: () => new Date("2023-10-01T00:00:00Z"),
    };

    const result = await processCardLink(
      "https://www.example.com/hsbc-red",
      "HK",
      {
        fetch: fetchDeps,
        publish: publishDeps,
      },
    );

    expect(result.status).toBe("published");
    expect(result.publishResult?.cardKey).toContain("hsbc-red");
    expect(result.ruleset.rules.some((rule) => rule.description.includes("4% cashback"))).toBe(true);
    expect(result.ruleset.fxFee).toBe(3.5);

    const savedRulesetEntry = Array.from(rulesetBucket.storage.entries()).find(([key]) => key.includes("hsbc-red"));
    expect(savedRulesetEntry).toBeTruthy();
    const [savedKey, savedPayload] = savedRulesetEntry!;
    expect(savedKey).toMatch(/rulesets\/hsbc-red/);
    expect(savedPayload.value).toContain("\"cardName\": \"HSBC Red Credit Card\"");

    const kvValue = kv.storage.get(result.publishResult!.cardKey);
    expect(kvValue).toBeTruthy();
    expect(kvValue).toContain(result.publishResult!.r2Key);
  });
});
