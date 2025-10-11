# Feature Gap Analysis: Current State vs Requirements

**Date:** October 11, 2025  
**Project:** KaCard - Credit Card Chatbot with Human-in-Loop Review

---

## Executive Summary

Your current codebase provides a **solid foundation** for the fetching and extraction pipeline, achieving approximately **30-40%** of the desired "paste-a-link chatbot" functionality. The critical missing components are:
- **Human-in-the-loop UI** with provenance/spans
- **Contribution tracking & review queue**
- **User reputation & rewards system**
- **Duplicate detection logic**
- **Chatbot interface** (Telegram/WhatsApp/Web widget)

---

## ✅ What You Have (Implemented Features)

### 1. **Core Fetching & Snapshot System** ✅
- ✅ `fetchPerkPage.ts`: Fetches credit card benefit pages via URL
- ✅ Content-addressed storage in R2 (`SNAPSHOT_BUCKET`)
- ✅ SHA-256 hashing for immutable snapshots
- ✅ Metadata storage with `fetchedAt` timestamp

**Coverage:** ~90% of required fetching functionality

---

### 2. **Extraction & Parsing** ✅ (Partial)
- ✅ `extractPerkSchema.ts`: Regex-based extraction for:
  - Card name
  - Currency detection
  - Annual/FX fees
  - Percentage-based perks
  - Promotions
  - Category classification (dining, groceries, travel, etc.)
- ⚠️ **Missing:** Span/selector tracking (WHERE the data was extracted from)
- ⚠️ **Missing:** LLM-based extraction for complex structures
- ⚠️ **Missing:** PDF/image OCR support

**Coverage:** ~50% of required extraction functionality

---

### 3. **Validation** ✅
- ✅ `validateRules.ts`: Validates extracted `CardRuleSet` for:
  - Valid categories
  - Non-negative rates
  - Required fields
- ✅ Returns structured `ValidationResult` with issues

**Coverage:** ~80% of required validation functionality

---

### 4. **Publishing & Versioning** ✅
- ✅ `publishRules.ts`: Stores validated rulesets in R2 (`RULESET_BUCKET`)
- ✅ Versioning system (timestamp-based)
- ✅ KV store (`RULESET_KV`) for hot pointers to latest versions
- ✅ Immutable storage with content hashing

**Coverage:** ~85% of required publishing functionality

---

### 5. **Basic Web Interface** ✅
- ✅ Simple HTML form in `index.ts` for pasting URLs
- ✅ Region selection dropdown
- ✅ Display JSON result
- ⚠️ **Missing:** Confirmation/editing UI
- ⚠️ **Missing:** Field-by-field review with provenance

**Coverage:** ~40% of required UI functionality

---

## ❌ What You're Missing (Critical Gaps)

### 1. **Provenance & Span Tracking** ❌ (Priority: CRITICAL)

**Required:**
```json
{
  "provenance": {
    "snapshot_id": "sha256",
    "spans": {
      "multipliers.dining.cap": {
        "text": "up to HK$4,000 per calendar month",
        "selector": "benefits > li:nth-child(2)",
        "confidence": 0.92
      }
    }
  }
}
```

**Current State:** Extraction returns only values, not the source spans.

**Action Required:**
- Modify `extractPerkSchema.ts` to return:
  - Text snippet for each field
  - CSS selector or XPath
  - Character offset in raw HTML
  - Confidence score
- Store provenance alongside `CardRuleSet` in R2

---

### 2. **Human-in-the-Loop Review UI** ❌ (Priority: CRITICAL)

**Required:**
- Per-field review cards with:
  - Extracted value
  - Highlighted snippet from source
  - ✓ Confirm / ✎ Fix buttons
  - Supporting text paste area
  - "Why editing?" dropdown

**Current State:** Only a basic form that shows JSON output.

**Action Required:**
- Build React/Vue/Svelte component library for review cards
- Implement snippet highlighting (use `mark.js` or similar)
- Add inline editing with undo buffer (10s window)
- Store user decisions as contribution events

---

### 3. **Contribution Tracking & Review Queue** ❌ (Priority: HIGH)

**Required:**
```json
{
  "event_type": "field_review",
  "source_url": "https://issuer.com/card/abc",
  "snapshot_id": "sha256",
  "entity_id": "card_issuer_abc_hk",
  "field": "multipliers[dining].cap",
  "proposed_value": {"amount": 4000, "currency": "HKD"},
  "supporting_span": "Earn 3x... up to HK$4,000 per calendar month.",
  "action": "confirm|edit",
  "user_id": "u_123",
  "user_reputation": 0.92,
  "timestamp": "2025-10-10T15:12:03Z"
}
```

**Current State:** No contribution tracking system.

**Action Required:**
- Create D1 database schema for:
  - `contributions` table
  - `users` table
  - `review_queue` table
- Build `/intake/parse` endpoint that returns provenance
- Implement webhook system for `card.field_changed` events
- Add append-only contributions table

---

### 4. **Duplicate Detection** ❌ (Priority: MEDIUM)

**Required:**
- Hash snapshot DOM (sanitized) + URL
- Detect unchanged pages → return cached result
- Ask for 1-tap reconfirmation

**Current State:** Always fetches fresh; no cache check.

**Action Required:**
- Before fetching, check KV for `url:{hash(url)}` → `snapshot_id`
- Compare new hash with stored hash
- If identical, return cached `CardRuleSet` + provenance
- Add "Last verified: 3 days ago - Quick reconfirm?" UI

---

### 5. **User Reputation & Rewards** ❌ (Priority: LOW)

**Required:**
- Reputation score per user (0.0–1.0)
- Gold checks (1 in 10 fields) for accuracy estimation
- KaCard perks ("Verified 3 fields → 1 week Pro")
- Contributor rank + streak

**Current State:** No user authentication or tracking.

**Action Required:**
- Add OAuth2 login (Google/GitHub)
- Implement reputation algorithm:
  ```
  reputation = (correct_reviews + 10) / (total_reviews + 20)
  ```
- Create gold-standard test set (manually verified cards)
- Build `/api/user/stats` endpoint
- Add gamification UI (badges, streaks)

---

### 6. **Chatbot Interface** ❌ (Priority: MEDIUM)

**Required:**
- Telegram/WhatsApp bot OR web widget
- Conversational flow:
  1. User pastes URL
  2. Bot returns TL;DR + review cards
  3. User confirms/edits fields
  4. Bot publishes to knowledge base

**Current State:** Only a static web form.

**Action Required:**
- Option A: Build Telegram bot using `node-telegram-bot-api`
- Option B: Embed widget using `botpress` or `rasa`
- Option C: Use OpenAI Assistant API with custom actions
- Implement message handlers for paste/confirm/edit flows

---

### 7. **Anti-Abuse & Quality Guardrails** ❌ (Priority: MEDIUM)

**Required:**
- `robots.txt` check before fetching
- Rate limiting by domain (e.g., 1 fetch/5min per issuer)
- "Official API preferred" banner for partner banks
- Conflict resolution ("Others suggested different cap")

**Current State:** None.

**Action Required:**
- Add `robots-parser` library to check `robots.txt`
- Implement rate limiting with Cloudflare Durable Objects
- Create partner API integration framework
- Build merge conflict UI for multi-user edits

---

### 8. **Metrics & Observability** ❌ (Priority: LOW)

**Required:**
- Links submitted
- % auto-publish (without human edits)
- Audited accuracy (vs gold checks)
- Median time: paste → publish

**Current State:** No metrics collection.

**Action Required:**
- Add Analytics Engine bindings to `wrangler.toml`
- Instrument key events:
  ```typescript
  env.ANALYTICS.writeDataPoint({
    blobs: ['paste', 'auto_publish'],
    doubles: [1],
    indexes: [cardName, region]
  });
  ```
- Build Grafana/Cloudflare Dashboard for visualization

---

## 📊 Feature Completion Matrix

| Feature Category | Completion | Priority | Effort (Days) |
|-----------------|------------|----------|---------------|
| Fetching & Snapshots | 90% | ✅ Done | 0 |
| Extraction (no spans) | 50% | HIGH | 3-5 |
| Validation | 80% | ✅ Done | 0.5 |
| Publishing & Versioning | 85% | ✅ Done | 0.5 |
| Basic Web UI | 40% | HIGH | 5-7 |
| **Provenance & Spans** | 0% | **CRITICAL** | **5-7** |
| **Review Queue** | 0% | **HIGH** | **7-10** |
| **Contribution Tracking** | 0% | **HIGH** | **5-7** |
| Duplicate Detection | 0% | MEDIUM | 2-3 |
| User Auth & Reputation | 0% | LOW | 7-10 |
| Chatbot Interface | 0% | MEDIUM | 5-7 |
| Anti-Abuse | 0% | MEDIUM | 3-5 |
| Metrics | 0% | LOW | 2-3 |

---

## 🚀 Recommended Implementation Roadmap

### **Phase 1: MVP (1-2 weeks)** - Ship First!
Focus on the minimal product slice:

#### Week 1: Provenance + Review UI
1. ✅ **Day 1-2:** Modify extraction to return spans
   - Update `extractPerkSchema.ts` to track text snippets + selectors
   - Extend `CardRuleSet` type to include `provenance` field
2. **Day 3-5:** Build review UI component library
   - Create `ReviewCard.tsx` component
   - Implement snippet highlighting
   - Add Confirm/Edit buttons
3. **Day 6-7:** Connect UI to backend
   - Create `/intake/parse` endpoint
   - Store contributions in D1

#### Week 2: Review Queue + Duplicate Detection
1. **Day 8-10:** Build review queue system
   - D1 schema for contributions
   - Merge logic (high-rep user > majority vote)
   - Auto-publish threshold (e.g., 2 confirmations)
2. **Day 11-12:** Implement duplicate detection
   - Cache check in `fetchPerkPage.ts`
   - "Quick reconfirm" UI flow
3. **Day 13-14:** Testing + deployment

---

### **Phase 2: Chatbot Integration (1 week)**
1. Choose platform (Telegram recommended for MVP)
2. Implement conversation handlers
3. Integrate with review UI via deep links

---

### **Phase 3: Quality & Scale (1-2 weeks)**
1. User authentication + reputation
2. Gold checks + accuracy metrics
3. Anti-abuse measures
4. Metrics dashboard

---

## 💡 Quick Wins You Can Implement Today

### 1. Add Basic Provenance Tracking (2-3 hours)
Extend `CardRule` to include source span:

```typescript
export interface CardRule {
  category: string;
  rate: number;
  description: string;
  unit?: string;
  source?: string;
  // ADD THESE:
  sourceSpan?: {
    text: string;
    selector?: string;
    offset?: number;
  };
  confidence?: number;
}
```

### 2. Add Duplicate Check (1 hour)
In `fetchPerkPage.ts`:

```typescript
export async function fetchPerkPage(input: FetchPerkPageInput, deps: FetchDeps): Promise<FetchedPage> {
  const urlHash = await sha256(input.url);
  const cacheKey = `url:${urlHash}`;
  
  // Check cache
  const cached = await deps.snapshotStore.get?.(cacheKey);
  if (cached) {
    // Return cached snapshot if content unchanged
  }
  
  // ... existing fetch logic
}
```

### 3. Add Simple Review Buttons to Landing Page (1 hour)
Modify `renderLandingPage()` to show per-field confirmation UI:

```html
<div class="field-review">
  <div class="field-label">Dining Cashback:</div>
  <div class="field-value">3%</div>
  <div class="field-snippet">"Earn 3x rewards on dining..."</div>
  <button class="confirm">✓ Confirm</button>
  <button class="edit">✎ Fix</button>
</div>
```

---

## 📋 Next Steps

1. ✅ **DONE:** Fix compilation error in `index.ts`
2. **Decide:** Which platform for chatbot? (Telegram/Web widget/WhatsApp)
3. **Prioritize:** Phase 1 features (provenance + review UI)
4. **Setup:** D1 database for contributions
5. **Design:** Review card UI components

---

## Questions to Answer Before Implementation

1. **User Authentication:** Do you want OAuth2 login, or anonymous contributions with browser fingerprinting?
2. **Chatbot Platform:** Telegram, WhatsApp, web widget, or OpenAI Assistant API?
3. **Storage:** Should contributions go in D1, or a separate service (Supabase/Firebase)?
4. **LLM Integration:** Will you use OpenAI GPT-4 for complex extraction, or stick with regex + manual review?
5. **Rate Limiting:** What's your budget for Cloudflare Workers requests? (Free tier: 100k/day)

---

## Resources & References

- **Cloudflare D1 Docs:** https://developers.cloudflare.com/d1/
- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Mark.js (text highlighting):** https://markjs.io/
- **Analytics Engine:** https://developers.cloudflare.com/analytics/analytics-engine/

---

## Conclusion

You have a **strong technical foundation** with the fetching, extraction, and publishing pipeline. To achieve the full "paste-a-link chatbot" vision, you need to:

1. **Add provenance tracking** (critical for human-in-loop)
2. **Build review UI** with per-field confirmation
3. **Implement contribution system** with review queue
4. **Add duplicate detection** for efficiency

Estimated time to MVP: **2-3 weeks** with one full-time developer.

---

**Status:** Ready for Phase 1 implementation after priorities are confirmed.
