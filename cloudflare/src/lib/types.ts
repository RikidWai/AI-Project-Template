export type RewardType = "cashback" | "miles" | "points";

export interface ConditionWindow { start?: string; end?: string }
export interface Condition {
  type?: string; // e.g., "balance", "spend", "tenure"
  op?: string;   // e.g., ">=", "<", "between"
  value?: string | number;
  text: string;  // human-readable condition text
  window?: ConditionWindow;
}

export interface CardRule {
  category: string;
  // Legacy rate for % cashback; retained for backward compatibility
  rate: number;
  description: string;
  // Reward modeling
  rewardType?: RewardType;         // e.g., cashback, miles, points
  unit?: string;                   // "%", "hkd_per_mile", "miles_per_hkd", etc.
  rateValue?: number;              // numeric value in the given unit
  stacking?: "choose_one" | "stackable";
  conditions?: Condition[];
  merchants?: string[];
  mccs?: string[];
  sources?: string[];              // multiple supporting links
  source?: string;                 // legacy single source
}

export interface CardRuleSet {
  cardName: string;
  region: string;
  currency: string;
  baseRate: number;
  rules: CardRule[];
  annualFee?: number | null;
  // Deprecated: prefer fx.issuerFeePct + fx.networkMarkupPct
  fxFee?: number | null;
  fx?: {
    issuerFeePct?: number | null;     // issuer foreign transaction fee
    networkMarkupPct?: number | null; // scheme markup estimate
    effectivePct?: number | null;     // issuer + network when both known
    notes?: string | null;
  };
  baseRates?: {
    cashbackPct?: number | null;
    milesUnit?: string | null;
    milesRate?: number | null;
  };
  promotions: string[];
  sourceUrl: string;
  contentHash: string;
  fetchedAt: string;
}

export interface FetchedPage {
  url: string;
  content: string;
  contentHash: string;
  snapshotKey: string;
  fetchedAt: string;
}

export interface FetchPerkPageInput {
  url: string;
  region: string;
}

export interface PublishResult {
  cardKey: string;
  version: string;
  r2Key: string;
  contentHash: string;
}

export interface RulesetKVValue {
  version: string;
  r2Key: string;
  contentHash: string;
  updatedAt: string;
}

export interface SnapshotPutOptions {
  metadata?: Record<string, unknown>;
  contentType?: string;
}

export interface SnapshotStore {
  put(key: string, value: string | ArrayBuffer, options?: SnapshotPutOptions): Promise<void>;
}

export interface RulesetStore {
  put(key: string, value: string, options?: { contentType?: string }): Promise<void>;

  get?(key: string): Promise<string | null>;
}
export interface RulesetKV {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

// Optional hash index to dedupe extractions by immutable content hash
export interface HashIndexKV {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
}
