# Bank Credit Card Page Ingestion Strategy

## Goals
- Accept issuer URLs provided by users and turn the on-page content into structured perks, fees, and eligibility data.
- Operate fully within the server-side ingestion pipeline so browser extensions or manual scraping are not required.
- Handle banks that ship key details in images, interactive widgets, or geo-gated experiences.

## Constraints & Challenges
- Many issuers block traditional crawlers, returning CAPTCHAs or lightweight error pages.
- Copy is often localized, and variant-specific content is hidden behind geo/IP checks or language toggles.
- Perk tables appear as images, PDF downloads, or script-rendered components that never surface in the initial HTML.
- Frequent DOM re-organizations break brittle CSS selectors.

## Recommended Pipeline

### 1. Fetch Phase Enhancements
1. **Stealth Fetching Profiles**
   - Rotate user agents, add realistic headers, and execute small wait periods before requesting the main page.
   - Support headless browser fetches (e.g., Puppeteer on Cloudflare Workers Browser Rendering or Playwright on a server) when static HTTP fetches return placeholders.
   - Capture HTTP status, redirect chains, and cookies to diagnose anti-bot responses.

2. **Dynamic Rendering & Snapshotting**
   - When a headless browser is required, evaluate a script bundle to:
     - Wait for core content selectors (e.g., perk tables, fees sections).
     - Trigger lazy-loaded accordions or tab panels using heuristic clicks.
     - Scroll the page to force image and component hydration.
   - Persist both the final DOM (`.html` snapshot) and a stitched full-page screenshot to object storage for audit/debug.

3. **Asset Harvesting**
   - Parse the DOM for `<a>` links to PDFs, `<img>` elements inside perk sections, and `<script>` tags pointing to JSON data.
   - Queue the discovered assets for follow-up fetches using the same anti-bot settings.

### 2. Normalization & Text Extraction
1. **HTML to Text**
   - Strip navigation and boilerplate via semantic landmarks (e.g., `<main>`, `<article>`, ARIA roles) and heuristics on heading text.
   - Generate structured blocks (headings, tables, bullet lists) for the extraction model.

2. **PDF OCR**
   - For downloaded PDFs, run OCR via Cloudflare Workers AI or another managed OCR service.
   - Maintain per-page confidence scores and keep both the text and the original binary in storage.

3. **Image OCR**
   - Run vision OCR on stored screenshots and individual perk-table images.
   - Use layout-aware OCR to recover table structure (cells, headings, footnotes).
   - Merge OCR output with DOM text, preferring higher-confidence sources.

4. **Embedded JSON & Microdata**
   - Attempt to parse known issuer data formats (e.g., `dataLayer`, `__NUXT__`, `window.__APOLLO_STATE__`).
   - Map fields to the internal schema before falling back to general LLM extraction.

### 3. Extraction & Validation
1. **Hybrid Extraction**
   - Run deterministic parsers for recurring issuer patterns (e.g., Chase perk tables, American Express benefit grids).
   - Feed residual text blocks to an LLM-based extractor (`extractPerkSchema`) with issuer-specific prompts.

2. **Confidence Propagation**
   - Track provenance for each extracted field (DOM, PDF, OCR image).
   - Lower confidence when OCR quality is poor or when multiple sources conflict.
   - Surface low-confidence results as `needs_review` in downstream validation.

3. **Change Detection**
   - Compare new snapshots with previous versions using diffing on structured rules.
   - Trigger manual review when large deltas occur or when anti-bot defences change the rendering path.

### 4. Operational Considerations
- **Rate Limiting & Respectful Fetching**: Implement issuer-specific throttle policies, respect robots.txt when permissible, and cache responses.
- **Credentialed Access**: For geo-locked pages, support worker-side VPN or regional proxies with legal approval.
- **Monitoring**: Log fetch failures, OCR confidences, and extraction errors to identify banks that need bespoke parsers.

## Alternative Inputs
- Allow users to upload PDFs or screenshots when a link cannot be fetched automatically.
- Provide a manual "paste benefit text" form that runs the same extraction pipeline for urgent cases.

## Next Steps
1. Implement the fetcher/type changes outlined in the OCR task stubs to store MIME type and binary payloads.
2. Integrate browser rendering via Workers Browser Rendering for issuers that require full JS execution.
3. Stand up OCR services for PDFs and images and feed the results through the existing rule extraction flow.
4. Build issuer-specific extraction adapters starting with Chase and Mox to validate the approach.
