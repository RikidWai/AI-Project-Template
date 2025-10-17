# 🚀 OpenRouter - Quick Start (5 Minutes)

## TL;DR

**Use OpenRouter instead of OpenAI** - It's 50% cheaper, supports Chinese better, and perfect for both extraction AND your future chatbot!

---

## ⚡ Quick Setup

### 1. Get OpenRouter API Key (2 min)

```bash
# Go to: https://openrouter.ai/
# Sign in with Google
# Click profile → Keys → Create Key
# Copy the key (starts with sk-or-v1-...)
```

### 2. Add Credits ($5) (1 min)

```bash
# Go to: https://openrouter.ai/credits
# Add $5 = ~16,000 card extractions with Gemini Flash
```

### 3. Set API Key in Cloudflare (1 min)

```bash
cd cloudflare
wrangler secret put OPENAI_API_KEY
# Paste your OpenRouter key: sk-or-v1-...
```

### 4. Update Code (1 min)

**Change line ~160 in `cloudflare/src/lib/extractWithLLM.ts`:**

```typescript
// FROM:
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  // ...
  body: JSON.stringify({
    model: "gpt-4o-mini",
    // ...
  })
});

// TO:
const model = "google/gemini-flash-1.5"; // 50% cheaper!

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "HTTP-Referer": "https://kacard.app",
    "X-Title": "KaCard Extraction"
  },
  body: JSON.stringify({
    model: model,  // ← Use variable
    messages,
    temperature: 0.1,
    response_format: { type: "json_object" }
  })
});
```

**Also update the provenance field (around line ~200):**

```typescript
// FROM:
provenance: {
  snapshot_id: page.contentHash,
  model: "gpt-4o-mini",  // ← Hard-coded
  fields: { /* ... */ }
}

// TO:
provenance: {
  snapshot_id: page.contentHash,
  model: model,  // ← Use variable
  fields: { /* ... */ }
}
```

### 5. Deploy

```bash
npx wrangler deploy
```

**Done!** 🎉

---

## 💰 Cost Savings

| Provider | Model | Cost per 1000 cards |
|----------|-------|---------------------|
| OpenAI Direct | GPT-4o-mini | $1.35 |
| **OpenRouter** | **Gemini Flash 1.5** | **$0.68** ✅ (50% cheaper!) |
| OpenRouter | Llama 3.1 70B | **$0** (often FREE!) |

---

## 🎯 Model Recommendations

### For Data Extraction (Now)
```typescript
const model = "google/gemini-flash-1.5"; // Best value
```

### For Chatbot (Part 2)
```typescript
const model = "anthropic/claude-3.5-sonnet"; // Best reasoning
// OR
const model = "google/gemini-pro-1.5"; // Cheaper alternative
```

---

## ✅ Test It Works

```bash
curl -X POST "https://kacard-worker.paws-labu.workers.dev/process-card-link" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mox.com/zh/features/mox-credit/", "region": "hk"}' \
  | jq '.provenance.model'
```

**Expected:** `"google/gemini-flash-1.5"`

---

## 📚 Full Documentation

See `docs/openrouter_setup.md` for:
- Detailed model comparisons
- Chinese language support
- Part 2 chatbot recommendations
- Troubleshooting guide
- Cost monitoring

---

## 🆘 Still Have OpenAI Issues?

If your OpenAI key has no credits and you don't want to add more, **just switch to OpenRouter!**

No need to fix OpenAI - OpenRouter is better anyway:
- ✅ Cheaper
- ✅ More models
- ✅ Better Chinese support
- ✅ No quota limits
- ✅ Future-proof for your chatbot

**Setup time:** 5 minutes
**Cost:** $5 for 16,000 cards

**vs OpenAI:**
- Setup time: Same
- Cost: $10 for 7,000 cards (2x more expensive!)
