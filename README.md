# KaCard — "Use the right card, every time."

KaCard is an AI agent that helps consumers pick the optimal credit card for every purchase. The agent keeps track of issuer benefits, caps, and promotions so users never miss rewards. It runs inside OpenAI's Agent Builder experience as well as a lightweight web widget, and it can ingest issuer benefit pages that users paste to expand the shared knowledge base automatically.

## Why KaCard

People routinely leave money on the table because credit card perks are fragmented, confusing, and constantly changing. Merchant Category Codes (MCCs) are opaque, issuer pages are dense, and the "best" card depends on merchant, channel, spend amount, reward caps, and time-sensitive promotions. KaCard eliminates the guesswork by surfacing plain-language recommendations that are grounded in issuer sources and backed by transparent math.

## Key Features

- **Smart card recommendations** – Ask questions like "Which card for PARKnSHOP HK$280?" and KaCard will respond with a ranked list, estimated value back, and any caps or exclusions that apply.
- **Issuer benefits ingestion** – Paste a benefits link and the agent produces an instant TL;DR with structured rules. Users can approve the results to enrich the shared rule library for everyone.
- **Grounded explanations** – Every answer is accompanied by the underlying math, categories, multipliers, caps, and source URLs, making it easy to verify.
- **Receipt tracking & exports** – Users can log receipts and compare savings against a 0.4% baseline, then export monthly summaries to CSV or Notion.
- **Cross-platform availability** – Runs inside ChatGPT (zero install) and on KaCard's web/mobile surfaces.

## Product Tiers

| Plan | Price | Checks | Receipt Limit | Alerts |
| --- | --- | --- | --- | --- |
| Free | $0 | 40/month | 8 | Weekly |
| Pro Lite | $0.99/month | Unlimited | 60 | Daily |
| Pro Plus | $1.99/month | 120 | 120 + auto e-receipts | Near real-time |
| Add-ons | $3/100 receipts | — | +100 receipts | — |
| Family | Add-on | Shared | Shared | Shared |

## Roadmap Snapshot

- **Week 1** – Launch the no-code agent (Parse → Score → Answer), URL analyzer, CSV export, and seed rules.
- **Weeks 2–3** – Add the shared Rules KV and watcher for top HK/US cards, merchant detection that learns from receipts, and pricing toggles.
- **Month 2** – Ship Pro Plus features (auto e-receipts), merchant "Add to Wallet" loop, and the first B2B pilots under the "Wallet Loyal" offering.

## Architecture Overview

KaCard combines OpenAI's Agent Builder with a Cloudflare-based backend.

- **Agent Layer** – A drag-and-drop workflow in Agent Builder orchestrates user prompts, branching logic, and calls to registered Actions defined via an OpenAPI 3.1 specification.
- **Backend Services** – Cloudflare Workers handle fetching issuer pages/PDFs, extracting and validating structured perks, and persisting artifacts in R2 (blobs), KV (hot pointers), and D1 (indexes & diffs). Lightweight queues coordinate re-parsing when source pages change.
- **Rule Management** – Each card/region/tier has a canonical JSON ruleset that includes base rates, category overrides, caps, FX/annual fees, welcome offers, provenance, and confidence scores. Rulesets are versioned, content-addressed, and re-published when a page hash changes.
- **User Vault** – Private storage for saved cards, receipts, regions, and exports. Community-contributed rules live in the shared Rules KV, while personal overrides remain private.

## Monetization

KaCard monetizes through consumer subscriptions and, later, merchant tooling.

- **B2C** – Free, Pro Lite ($0.99/mo), and Pro Plus ($1.99/mo) tiers with upsells for additional receipts or family sharing.
- **B2B (Wallet Loyal)** – Merchant marketing packages that bundle pass templates, Sora-produced promos, and GPT copywriting ($9–$79/mo). KaCard recommendations drive merchant leads into Wallet Loyal.

## Metrics We Track

- **Consumer** – DAU/WAU, first-week activation, paywall hit rate, Pro conversion, verified savings per user, refund rate.
- **Quality** – Recommendation acceptance, category correction rate, rules diff accuracy.
- **Cost** – Tokens per action, cache hit rate, percentage of escalations.

## Contributing

Pull requests are welcome. Please open an issue first to discuss significant changes.

## Development

- Cloudflare Worker actions for issuer-link ingestion live under [`cloudflare/src`](cloudflare/src). Run `npm install` followed by `npm test` inside the `cloudflare/` folder to execute the Vitest suite that exercises the ingestion pipeline end-to-end.

## License

Specify your project license here (e.g., MIT License).
