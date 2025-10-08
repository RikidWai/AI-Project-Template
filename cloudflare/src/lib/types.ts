export interface CardRule {
  category: string;
  rate: number;
  description: string;
  unit?: string;
  source?: string;
}

export interface CardRuleSet {
  cardName: string;
  region: string;
  currency: string;
  baseRate: number;
  rules: CardRule[];
  annualFee?: number | null;
  fxFee?: number | null;
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
}

export interface RulesetKV {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
}
