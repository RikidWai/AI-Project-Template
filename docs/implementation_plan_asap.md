# ASAP Implementation Plan: Processing Quality Testing

**Date:** October 11, 2025  
**Priority:** Test extraction quality IMMEDIATELY  
**Timeline:** 3-5 days for MVP testing capability

---

## Project Requirements Summary

Based on your answers:

1. **Chatbot Platform:** Web-based with OpenAI Agent Builder API integration
2. **User Auth:** OAuth2 (Google/Apple) via Supabase (defer to Phase 2)
3. **LLM Integration:** Yes, with crawler-friendly approach (avoid bot detection)
4. **Timeline:** ASAP - need to validate processing quality immediately
5. **Storage:** Cloudflare R2 + D1 for current implementation

---

## Phase 0: IMMEDIATE - Test Processing Quality (2-3 Days)

**Goal:** Get a working system that can process real bank URLs and show extraction quality so you can validate the approach.

### Day 1: LLM-Enhanced Extraction with Provenance

#### Task 1.1: Add OpenAI API Integration
**File:** `cloudflare/wrangler.toml`

```toml
[vars]
# Add these to your secrets using: wrangler secret put OPENAI_API_KEY
```

**File:** `cloudflare/src/lib/types.ts`

Add:
```typescript
export interface ExtractedField {
  value: any;
  confidence: number;
  sourceSpan: {
    text: string;
    selector?: string;
    startOffset?: number;
    endOffset?: number;
  };
}

export interface CardRuleSetWithProvenance extends CardRuleSet {
  provenance: {
    snapshot_id: string;
    fields: Record<string, ExtractedField>;
  };
}
```

#### Task 1.2: Create LLM Extraction Module
**File:** `cloudflare/src/lib/extractWithLLM.ts`

```typescript
import type { FetchedPage, CardRuleSetWithProvenance } from "./types";

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const EXTRACTION_PROMPT = `You are a credit card benefits extraction assistant. Extract structured data from credit card benefit pages.

For each field you extract, provide:
1. The extracted value
2. The exact text snippet that supports this value (quote it verbatim)
3. A confidence score (0.0-1.0)

Return JSON in this format:
{
  "cardName": {"value": "...", "sourceText": "...", "confidence": 0.95},
  "baseRate": {"value": 1.0, "sourceText": "...", "confidence": 0.9},
  "rules": [
    {
      "category": "dining",
      "rate": 3.0,
      "description": "...",
      "sourceText": "...",
      "confidence": 0.92
    }
  ],
  "annualFee": {"value": 1200, "sourceText": "...", "confidence": 0.98},
  "fxFee": {"value": 2.0, "sourceText": "...", "confidence": 0.95},
  "promotions": [
    {"text": "...", "sourceText": "...", "confidence": 0.85}
  ]
}

IMPORTANT: Only extract information that is explicitly stated. If unsure, lower the confidence score.`;

export async function extractWithLLM(
  page: FetchedPage,
  region: string,
  apiKey: string
): Promise<CardRuleSetWithProvenance> {
  // Truncate content to avoid token limits (keep first 8000 chars)
  const truncatedContent = page.content.substring(0, 8000);
  
  const messages: OpenAIMessage[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { 
      role: "user", 
      content: `Extract credit card benefits from this page (Region: ${region}):\n\n${truncatedContent}` 
    }
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o", // or gpt-4o-mini for cost savings
      messages,
      temperature: 0.1, // Low temperature for consistency
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const result = await response.json();
  const extracted = JSON.parse(result.choices[0].message.content);

  // Transform LLM output to CardRuleSetWithProvenance
  return {
    cardName: extracted.cardName?.value || "Unknown Card",
    region,
    currency: detectCurrency(region),
    baseRate: extracted.baseRate?.value || 0,
    rules: (extracted.rules || []).map((r: any) => ({
      category: r.category,
      rate: r.rate,
      description: r.description,
      unit: "%",
      source: page.url,
      sourceSpan: {
        text: r.sourceText,
        confidence: r.confidence
      }
    })),
    annualFee: extracted.annualFee?.value ?? null,
    fxFee: extracted.fxFee?.value ?? null,
    promotions: (extracted.promotions || []).map((p: any) => p.text),
    sourceUrl: page.url,
    contentHash: page.contentHash,
    fetchedAt: page.fetchedAt,
    provenance: {
      snapshot_id: page.contentHash,
      fields: {
        cardName: {
          value: extracted.cardName?.value,
          confidence: extracted.cardName?.confidence || 0,
          sourceSpan: {
            text: extracted.cardName?.sourceText || ""
          }
        },
        annualFee: {
          value: extracted.annualFee?.value,
          confidence: extracted.annualFee?.confidence || 0,
          sourceSpan: {
            text: extracted.annualFee?.sourceText || ""
          }
        },
        fxFee: {
          value: extracted.fxFee?.value,
          confidence: extracted.fxFee?.confidence || 0,
          sourceSpan: {
            text: extracted.fxFee?.sourceText || ""
          }
        }
      }
    }
  };
}

function detectCurrency(region: string): string {
  const map: Record<string, string> = {
    hk: "HKD",
    sg: "SGD",
    my: "MYR",
    tw: "TWD",
    ph: "PHP"
  };
  return map[region] || "USD";
}
```

#### Task 1.3: Update processCardLink to use LLM
**File:** `cloudflare/src/lib/processCardLink.ts`

Modify to call `extractWithLLM` instead of regex-based extraction when API key is available.

---

### Day 2: Enhanced Review UI

#### Task 2.1: Build Field Review Component
**File:** `cloudflare/src/index.ts` - Update `renderLandingPage()`

Add after extraction results are displayed:

```html
<div class="review-container">
  <h2>Review Extracted Fields</h2>
  <div id="field-review-cards"></div>
  <div class="review-actions">
    <button id="confirm-all">✓ Confirm All</button>
    <button id="save-to-knowledge-base">💾 Save to Knowledge Base</button>
  </div>
</div>

<script>
function renderFieldReview(extractedData) {
  const container = document.getElementById("field-review-cards");
  const fields = [
    { label: "Card Name", value: extractedData.cardName, path: "cardName" },
    { label: "Base Rate", value: extractedData.baseRate + "%", path: "baseRate" },
    { label: "Annual Fee", value: extractedData.annualFee, path: "annualFee" },
    { label: "FX Fee", value: extractedData.fxFee + "%", path: "fxFee" }
  ];

  container.innerHTML = fields.map((field, idx) => `
    <div class="field-card" data-field="${field.path}">
      <div class="field-header">
        <strong>${field.label}</strong>
        <span class="confidence-badge">${getConfidence(extractedData, field.path)}</span>
      </div>
      <div class="field-value">
        <input type="text" value="${field.value}" id="field-${idx}" />
      </div>
      <div class="field-provenance">
        <details>
          <summary>Source</summary>
          <p class="source-snippet">"${getSourceText(extractedData, field.path)}"</p>
        </details>
      </div>
      <div class="field-actions">
        <button class="confirm-btn" onclick="confirmField('${field.path}')">✓ Confirm</button>
        <button class="edit-btn" onclick="editField('${field.path}', ${idx})">✎ Edit</button>
      </div>
    </div>
  `).join("");
}

function getConfidence(data, path) {
  const conf = data.provenance?.fields[path]?.confidence || 0;
  const percentage = Math.round(conf * 100);
  const color = conf > 0.8 ? "green" : conf > 0.5 ? "orange" : "red";
  return `<span style="color: ${color}">${percentage}% confident</span>`;
}

function getSourceText(data, path) {
  return data.provenance?.fields[path]?.sourceSpan?.text || "No source available";
}

function confirmField(fieldPath) {
  const card = document.querySelector(`[data-field="${fieldPath}"]`);
  card.classList.add("confirmed");
  // Store confirmation in localStorage for now
  const confirmations = JSON.parse(localStorage.getItem("confirmations") || "{}");
  confirmations[fieldPath] = { confirmed: true, timestamp: new Date().toISOString() };
  localStorage.setItem("confirmations", JSON.stringify(confirmations));
}

function editField(fieldPath, inputIdx) {
  const input = document.getElementById(`field-${inputIdx}`);
  input.disabled = false;
  input.focus();
  input.select();
}
</script>

<style>
.review-container {
  max-width: 800px;
  margin: 2rem auto;
  padding: 2rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.field-card {
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  transition: border-color 0.2s;
}

.field-card.confirmed {
  border-color: #10b981;
  background: #f0fdf4;
}

.field-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.confidence-badge {
  font-size: 0.875rem;
  font-weight: 600;
}

.field-value input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
}

.field-provenance {
  margin: 0.75rem 0;
}

.source-snippet {
  background: #fef3c7;
  padding: 0.5rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-style: italic;
  color: #78350f;
}

.field-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.confirm-btn {
  background: #10b981;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 600;
}

.edit-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 600;
}

.review-actions {
  margin-top: 2rem;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.review-actions button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}

#confirm-all {
  background: #10b981;
  color: white;
}

#save-to-knowledge-base {
  background: #6366f1;
  color: white;
}
</style>
```

---

### Day 3: Deploy and Test

#### Task 3.1: Add Environment Variables

```bash
cd cloudflare
wrangler secret put OPENAI_API_KEY
# Enter your OpenAI API key when prompted
```

#### Task 3.2: Deploy to Cloudflare Workers

```bash
wrangler deploy
```

#### Task 3.3: Test with Real Bank URLs

Create a test suite:

**File:** `docs/test_urls.md`

```markdown
# Test URLs for Processing Quality Validation

## Hong Kong Banks

### HSBC
- [ ] https://www.hsbc.com.hk/credit-cards/products/premier/
- [ ] https://www.hsbc.com.hk/credit-cards/products/red/

### Hang Seng Bank
- [ ] https://bank.hangseng.com/1/2/credit-card/...
- [ ] Test extraction quality
- [ ] Check confidence scores
- [ ] Verify source spans are accurate

### Standard Chartered
- [ ] https://www.sc.com/hk/credit-cards/...

## Singapore Banks

### DBS
- [ ] https://www.dbs.com.sg/personal/cards/...

### OCBC
- [ ] https://www.ocbc.com/personal-banking/cards/...

## Quality Metrics to Track

For each URL, record:
1. **Extraction Accuracy:** Did it get the card name correct?
2. **Perk Detection:** % of perks detected vs. manually counted
3. **Confidence Calibration:** Are high-confidence fields actually correct?
4. **Source Spans:** Do the highlighted snippets actually contain the info?
5. **Missing Information:** What types of data consistently fail?
6. **False Positives:** What did it extract incorrectly?

## Known Challenges

- [ ] Cards with benefits embedded in images
- [ ] Cards with PDF-only T&C
- [ ] Dynamic content requiring JavaScript execution
- [ ] Multi-language pages
- [ ] Promotional pop-ups blocking content
```

---

## Phase 1: Human-in-Loop + Duplicate Detection (Week 2)

### Day 4-5: Contribution Tracking

#### Task 4.1: Setup D1 Database

**File:** `cloudflare/schema.sql`

```sql
-- Users table (for future OAuth integration)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  reputation REAL DEFAULT 0.5,
  total_reviews INTEGER DEFAULT 0,
  correct_reviews INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Contributions table (append-only)
CREATE TABLE contributions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  source_url TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  card_key TEXT NOT NULL,
  field_path TEXT NOT NULL,
  action TEXT NOT NULL, -- 'confirm' or 'edit'
  proposed_value TEXT,
  supporting_span TEXT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Review queue
CREATE TABLE review_queue (
  id TEXT PRIMARY KEY,
  card_key TEXT NOT NULL,
  field_path TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  num_confirmations INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Extracted snapshots with metadata
CREATE TABLE snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  extracted_data TEXT, -- JSON
  confidence_score REAL,
  fetch_timestamp TEXT NOT NULL,
  last_verified TEXT
);
```

Create database:
```bash
wrangler d1 create kacard-db
wrangler d1 execute kacard-db --file=schema.sql
```

Update `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "kacard-db"
database_id = "<YOUR_DATABASE_ID>"
```

#### Task 4.2: Build Contribution API

**File:** `cloudflare/src/lib/contributions.ts`

```typescript
export async function recordContribution(
  db: D1Database,
  data: {
    userId: string;
    sourceUrl: string;
    snapshotId: string;
    cardKey: string;
    fieldPath: string;
    action: "confirm" | "edit";
    proposedValue?: any;
    supportingSpan?: string;
  }
) {
  const id = crypto.randomUUID();
  
  await db.prepare(`
    INSERT INTO contributions 
    (id, user_id, source_url, snapshot_id, card_key, field_path, action, proposed_value, supporting_span)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    data.userId,
    data.sourceUrl,
    data.snapshotId,
    data.cardKey,
    data.fieldPath,
    data.action,
    JSON.stringify(data.proposedValue),
    data.supportingSpan
  ).run();

  // Update review queue
  await updateReviewQueue(db, data.cardKey, data.fieldPath);

  return { id, timestamp: new Date().toISOString() };
}

async function updateReviewQueue(db: D1Database, cardKey: string, fieldPath: string) {
  // Count confirmations
  const result = await db.prepare(`
    SELECT COUNT(*) as count
    FROM contributions
    WHERE card_key = ? AND field_path = ? AND action = 'confirm'
  `).bind(cardKey, fieldPath).first();

  const count = result?.count as number || 0;

  // Auto-approve if >= 2 confirmations
  const status = count >= 2 ? "approved" : "pending";

  await db.prepare(`
    INSERT INTO review_queue (id, card_key, field_path, status, num_confirmations)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(card_key, field_path) DO UPDATE SET
      num_confirmations = excluded.num_confirmations,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    crypto.randomUUID(),
    cardKey,
    fieldPath,
    status,
    count
  ).run();
}
```

---

### Day 6-7: Duplicate Detection

#### Task 5.1: Implement URL-Based Caching

**File:** `cloudflare/src/lib/fetchPerkPage.ts`

Add caching logic:
```typescript
export async function fetchPerkPage(
  input: FetchPerkPageInput,
  deps: FetchDeps
): Promise<FetchedPage> {
  // Check cache first
  const urlHash = await sha256(input.url);
  const cacheKey = `url:${urlHash}`;
  
  const cached = await deps.snapshotStore.get?.(cacheKey);
  if (cached) {
    // Parse cached metadata
    const cachedData = JSON.parse(cached);
    
    // If fetched recently (< 7 days), return cached
    const cachedTime = new Date(cachedData.fetchedAt);
    const now = new Date();
    const daysSince = (now.getTime() - cachedTime.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSince < 7) {
      return {
        ...cachedData,
        cached: true,
        lastVerified: cachedData.fetchedAt
      };
    }
  }

  // Fetch fresh
  const response = await deps.fetch.fetch(input.url);
  const content = await response.text();
  const contentHash = await sha256(content);
  const fetchedAt = new Date().toISOString();

  // Store snapshot
  const snapshotKey = `snapshot:${contentHash}`;
  await deps.snapshotStore.put(snapshotKey, content, {
    metadata: {
      sourceUrl: input.url,
      fetchedAt,
      region: input.region
    },
    contentType: "text/html"
  });

  // Store URL-to-hash mapping
  await deps.snapshotStore.put(cacheKey, JSON.stringify({
    url: input.url,
    contentHash,
    snapshotKey,
    fetchedAt
  }));

  return {
    url: input.url,
    content,
    contentHash,
    snapshotKey,
    fetchedAt
  };
}
```

---

## Phase 2: Bot-Friendly Crawling Strategy (Week 3)

### Avoiding Bank Bot Detection

#### Option A: Use Cloudflare Browser Rendering

```typescript
// cloudflare/src/lib/fetchWithBrowser.ts
export async function fetchWithBrowser(url: string, env: Env): Promise<string> {
  const browser = await puppeteer.launch(env.BROWSER);
  const page = await browser.newPage();
  
  // Set realistic headers
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
  );
  
  // Navigate and wait for content
  await page.goto(url, { waitUntil: "networkidle" });
  
  // Wait for common selectors
  await page.waitForSelector("body", { timeout: 5000 });
  
  const content = await page.content();
  await browser.close();
  
  return content;
}
```

Add to `wrangler.toml`:
```toml
browser = { binding = "BROWSER" }
```

#### Option B: Respect robots.txt + Rate Limiting

```typescript
// cloudflare/src/lib/robotsCheck.ts
import robotsParser from "robots-parser";

export async function canFetch(url: string): Promise<boolean> {
  const urlObj = new URL(url);
  const robotsUrl = `${urlObj.origin}/robots.txt`;
  
  try {
    const response = await fetch(robotsUrl);
    const robotsTxt = await response.text();
    
    const robots = robotsParser(robotsUrl, robotsTxt);
    return robots.isAllowed(url, "KaCardBot/1.0");
  } catch {
    // If robots.txt not found, assume allowed
    return true;
  }
}
```

#### Option C: Partner API Integration

Create a registry of banks with official APIs:

**File:** `cloudflare/src/lib/bankApis.ts`

```typescript
const BANK_API_REGISTRY = {
  "hsbc.com.hk": {
    hasApi: false,
    contact: "openbanking@hsbc.com.hk",
    message: "Contact for official API access"
  },
  // Add more as you establish partnerships
};

export function checkOfficialApi(url: string): { hasApi: boolean; contact?: string } | null {
  const domain = new URL(url).hostname;
  return BANK_API_REGISTRY[domain] || null;
}
```

---

## Success Metrics (Track from Day 1)

### Extraction Quality
- **Accuracy:** % of fields correctly extracted (target: >85%)
- **Recall:** % of fields detected vs. total available (target: >80%)
- **Precision:** % of extracted fields that are correct (target: >90%)
- **Confidence Calibration:** Correlation between confidence scores and accuracy

### User Experience
- **Time to Process:** URL paste → displayresults (target: <10s)
- **Time to Review:** User review per card (target: <2 min)
- **False Positive Rate:** % fields requiring manual correction (target: <15%)

### System Performance
- **Cache Hit Rate:** % of repeat URLs served from cache (target: >60%)
- **API Cost:** OpenAI tokens per card processed (target: <5,000 tokens)
- **Failed Fetches:** % of URLs that fail to fetch (target: <5%)

---

## Quick Start Commands

```bash
# Setup
cd cloudflare
npm install

# Add OpenAI key
wrangler secret put OPENAI_API_KEY

# Create D1 database
wrangler d1 create kacard-db
wrangler d1 execute kacard-db --file=schema.sql

# Deploy
wrangler deploy

# Test locally
wrangler dev

# View logs
wrangler tail
```

---

## Next Session Action Items

Would you like me to:

1. **Implement the LLM extraction module** with provenance tracking?
2. **Build the enhanced review UI** with field-by-field confirmation?
3. **Set up the D1 database schema** and contribution tracking?
4. **Create a test harness** for measuring extraction quality?

Or should we start with **something else** based on your immediate priorities?

---

## Notes

- **Bot Detection:** Start with respectful crawling (User-Agent, rate limiting). Upgrade to browser rendering if needed.
- **LLM Cost:** GPT-4o mini is ~10x cheaper than GPT-4 and should work well for structured extraction.
- **Caching:** Aggressive caching reduces both fetch load and API costs.
- **Review UI:** Start simple (checkboxes + text snippets), iterate based on user feedback.

**Status:** Ready to implement. Awaiting your prioritization for next steps.
