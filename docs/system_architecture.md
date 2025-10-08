# KaCard System Architecture

This document captures the working architecture for KaCard v1/v2, aligning the agent workflow, backend services, and storage strategy.

## 1. Agent Builder Workflow

KaCard relies on OpenAI Agent Builder as the orchestrator for the end-to-end experience. The canvas contains decision nodes, prompt nodes, and action calls described below.

1. **Get Source** – `fetch_perk_page(url, region)` downloads issuer HTML/PDF pages, stores a snapshot in R2, and returns `{ snapshot_key, content_hash }`.
2. **Extract Rules** – `extract_perk_schema(snapshot_key, region)` performs regex pre-processing followed by LLM extraction into a normalized ruleset, returning `{ ruleset, confidence, hints[] }`.
3. **Validate & Map** – `validate_rules(ruleset)` standardizes units, category labels, MCC mappings, caps, and dates. The response includes `{ valid, issues[], mappedCategories[] }`.
4. **Branching Logic**
   - If `confidence ≥ 0.7` **and** validation passes, call `publish_rules(ruleset, card_key)` to write the canonical version.
   - Otherwise, the agent collects user overrides (e.g., annual fee, FX fee, monthly cap) before re-validating.
5. **Return** – The flow finishes by surfacing `{ ruleset_id, version, r2_key, provenance }` back to the user.

The same OpenAPI actions are leveraged in conversational recommendation flows to compute rewards for specific purchases.

## 2. Backend Services

All Actions are implemented as authenticated Cloudflare Workers running inside KaCard's Cloudflare account.

- **Fetching & OCR** – Workers retrieve issuer pages, optionally run OCR for PDFs, compute a SHA-256 `content_hash`, and upload raw snapshots to R2 under `snapshots/{issuer}/{product}/{region}/{sha256}.html|pdf`.
- **Extraction Pipeline** – A combination of regex heuristics and OpenAI models convert unstructured content into the canonical rules schema. Confidence scores and hints flag ambiguous fields.
- **Validation Layer** – Category normalization relies on a curated Category→MCC map stored in KV. Caps, dates, and units are verified, with issues pushed back to the agent for clarification.
- **Publishing** – When rules are accepted, Workers persist structured JSON to R2 (`rulesets/{issuer}/{product}/{region}/{version}.json`), update a KV pointer (`card_key -> { version, r2_key, content_hash, updated_at }`), and log metadata in D1.

## 3. Storage Layout

| Store | Purpose | Example Keys |
| --- | --- | --- |
| R2 | Immutable blobs for snapshots and published rulesets | `snapshots/...`, `rulesets/...` |
| KV | Hot pointers to the latest ruleset & category/MCC tables | `card_key`, `category_map` |
| D1 | Relational metadata for cards, rulesets, provenance, diffs, and metrics | `rulesets`, `diffs`, `metrics` tables |

## 4. Change Detection & Versioning

A scheduled watcher refetches top cards weekly (long-tail cards monthly). When a new fetch returns a different `content_hash`, the system re-runs extraction and publishes `version + 1`, capturing diffs in D1. Only the content-hash comparison triggers re-parsing, keeping costs low.

## 5. Recommendation Engine

The `calc_rewards` action evaluates a purchase described as `{ merchant, amount, currency, channel }` against the relevant ruleset.

- Converts points to cash using a compact conversion table (e.g., Citi ThankYou → HKD/USD).
- Accounts for caps, exclusions, and active promotions.
- Returns `{ effective_rate, est_value, explanations[] }` to drive user-facing narratives.

`detect_merchant` augments categorization by learning from user-submitted receipts and aliases, reducing dependency on raw MCC codes.

## 6. Data Separation & Privacy

- **Shared Rules KV** – Community-approved issuer facts that any user can leverage.
- **User Vault** – Private store for declared cards, receipts, regions, and exports. Personal overrides are layered atop shared rules without altering the public corpus.
- **Privacy Guardrails** – No PAN/PII storage; receipts undergo PII redaction. OCR can run on-device when available, and analytics are opt-in.

## 7. Operational Metrics

We monitor:

- **Quality** – Recommendation acceptance, category correction rate, rules diff accuracy.
- **Efficiency** – Tokens per action, cache hit rate, and share of escalations to manual review.
- **Business** – DAU/WAU, paywall hits, Pro conversion, verified savings per user, refund rate.

## 8. Future Enhancements

- Expand the watcher to handle more regions and automate anomaly detection on rules diffs.
- Build an admin surface to triage low-confidence extractions and monitor data freshness.
- Integrate merchant "Add to Wallet" loops that feed into the Wallet Loyal B2B offering.
