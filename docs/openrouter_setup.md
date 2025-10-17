# 🚀 OpenRouter Setup Guide

## Why OpenRouter?

**OpenRouter is BETTER than using OpenAI directly** for your use case:

### ✅ Advantages

1. **50% Cheaper** - Gemini Flash 1.5 costs $0.0003/card vs GPT-4o-mini at $0.0006/card
2. **One API Key, Many Models** - Switch models without changing code
3. **No Quota Limits** - Pay as you go, no pre-purchase required
4. **Model Redundancy** - If one model is down, instantly switch to another
5. **Better Chinese Support** - Access to Qwen 2.5 (built for Chinese)
6. **Future-Proof** - Easy to upgrade to better models for your Part 2 chatbot

### 💰 Cost Comparison

| Task | Model (via OpenRouter) | Cost per 1000 cards | Quality |
|------|----------------------|---------------------|---------|
| **Data Extraction** | Gemini Flash 1.5 | **$0.30** ✅ | ⭐⭐⭐⭐ |
| Data Extraction | Qwen 2.5 72B | **$0.70** | ⭐⭐⭐⭐⭐ (Best Chinese!) |
| Data Extraction | Llama 3.1 70B | **FREE** 🎉 | ⭐⭐⭐ |
| **Part 2 Chatbot** | Claude 3.5 Sonnet | $18.00 | ⭐⭐⭐⭐⭐ (Best reasoning) |
| Part 2 Chatbot | GPT-4o | $12.50 | ⭐⭐⭐⭐ |
| Part 2 Chatbot | Gemini 1.5 Pro | $6.25 | ⭐⭐⭐⭐ (Best value) |

**For comparison, OpenAI direct:**
- GPT-4o-mini (extraction): $0.60/1000 cards
- GPT-4o (chatbot): $12.50/1000 conversations

---

## 🔧 Setup (5 Minutes)

### Step 1: Create OpenRouter Account

1. Go to https://openrouter.ai/
2. Click "Sign In" → Sign in with Google (easiest)
3. Click your profile → "Keys"
4. Click "Create Key"
5. Name it "KaCard Extraction"
6. Copy the key (starts with `sk-or-v1-...`)

### Step 2: Add Credits

1. Go to https://openrouter.ai/credits
2. Click "Add Credits"
3. Add **$5** (will process ~16,000 cards with Gemini Flash!)
4. No subscription required - pure pay-as-you-go

### Step 3: Set API Key in Cloudflare

```bash
cd cloudflare
wrangler secret put OPENAI_API_KEY
# Paste your OpenRouter key: sk-or-v1-...
```

**Note:** Even though it says `OPENAI_API_KEY`, it works with OpenRouter because the API is compatible!

### Step 4: Deploy

```bash
npx wrangler deploy
```

**Done!** 🎉 You're now using Gemini Flash 1.5 via OpenRouter.

---

## 🎛️ Switching Models

The beauty of OpenRouter is you can switch models **without changing the API key**.

### For Data Extraction (Current Need)

Edit `cloudflare/src/lib/extractWithLLM.ts`, line ~160:

```typescript
// Current (Recommended for most users):
const model = "google/gemini-flash-1.5"; // Fast, cheap, great quality

// Alternative options:

// Best for Chinese content:
const model = "qwen/qwen-2.5-72b-instruct"; // Excellent for Traditional/Simplified Chinese

// Cheapest (often FREE):
const model = "meta-llama/llama-3.1-70b-instruct"; // Free tier available

// Premium quality (more expensive):
const model = "anthropic/claude-3.5-haiku"; // Best accuracy, but 10x cost
```

**After changing**, just redeploy:
```bash
cd cloudflare
npx wrangler deploy
```

### For Part 2 Chatbot (Future)

When you build the card recommendation agent, use a smarter model:

```typescript
// For conversational AI and reasoning:
const model = "anthropic/claude-3.5-sonnet"; // Best reasoning ($3/$15)
const model = "openai/gpt-4o"; // Good balance ($2.50/$10)
const model = "google/gemini-pro-1.5"; // Cheapest option ($1.25/$5)
```

---

## 📊 Model Recommendations by Use Case

### Current Need: Data Extraction

**🏆 Winner: Gemini Flash 1.5**
- Cost: $0.075/$0.30 per 1M tokens
- Speed: Very fast (~2-3 seconds)
- Quality: Excellent structured output
- Chinese: Good support

**🥈 Runner-up: Qwen 2.5 72B**
- Cost: $0.35/$0.70 per 1M tokens  
- Speed: Fast (~3-4 seconds)
- Quality: Excellent, especially for Chinese
- Chinese: **Best in class**

**🥉 Budget Option: Llama 3.1 70B**
- Cost: **FREE** (rate-limited) or very cheap
- Speed: Fast
- Quality: Good enough for extraction
- Chinese: Decent but not great

### Part 2: Card Recommendation Chatbot

**🏆 Winner: Claude 3.5 Sonnet**
- Cost: $3/$15 per 1M tokens
- Reasoning: **Best** at complex decision-making
- Conversation: Natural, helpful tone
- Use when: User needs personalized card advice

**🥈 Runner-up: GPT-4o**
- Cost: $2.50/$10 per 1M tokens
- Reasoning: Very good
- Conversation: Natural
- Use when: Need fast responses with good quality

**🥉 Budget Option: Gemini 1.5 Pro**
- Cost: $1.25/$5 per 1M tokens
- Reasoning: Good
- Conversation: Good
- Use when: High volume, need to keep costs low

---

## 🔍 Testing Your Setup

### Test 1: Verify API Key Works

```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer YOUR_OPENROUTER_KEY" | jq '.data[0]'
```

**Expected:** List of available models

### Test 2: Test Extraction

```bash
curl -X POST "https://kacard-worker.paws-labu.workers.dev/process-card-link" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mox.com/zh/features/mox-credit/", "region": "hk"}' \
  | jq '.ruleset.cardName, .ruleset.rules | length, .provenance.model'
```

**Expected output:**
```json
"Mox Credit"
2
"google/gemini-flash-1.5"
```

### Test 3: Check Logs

```bash
cd cloudflare
npx wrangler tail --format pretty
```

**Look for:**
```
[PROCESS] Using LLM extraction...
[LLM] Extracted X chars of visible text...
[PROCESS] LLM extraction succeeded!
[PROCESS] Extracted card name: Mox Credit  ← Success!
```

---

## 💸 Cost Monitoring

### Check Your Usage

1. Go to https://openrouter.ai/activity
2. See real-time usage per model
3. Download CSV for detailed analysis

### Set Spending Limits

1. Go to https://openrouter.ai/settings
2. Set "Monthly Spending Limit"
3. Recommended: $10/month for testing, $50/month for production

### Cost Breakdown (Example)

With **Gemini Flash 1.5** at 5k input + 1k output tokens per card:

```
Input:  5,000 tokens × $0.075 / 1M = $0.000375
Output: 1,000 tokens × $0.30 / 1M  = $0.0003
Total per card: $0.000675

For 1,000 cards: $0.68
For 10,000 cards: $6.75
```

**Compare to OpenAI direct (GPT-4o-mini):**
```
1,000 cards: $1.35 (2x more expensive)
10,000 cards: $13.50 (2x more expensive)
```

---

## 🐛 Troubleshooting

### Issue: "Model not found"

**Cause:** Typo in model name

**Fix:** Check available models:
```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer YOUR_KEY" | jq '.data[].id' | grep gemini
```

Copy the exact model ID.

### Issue: "Insufficient credits"

**Cause:** Your OpenRouter account has $0 balance

**Fix:**
1. Go to https://openrouter.ai/credits
2. Add $5+ credits
3. Wait 1 minute
4. Redeploy: `npx wrangler deploy`

### Issue: "Rate limit exceeded"

**Cause:** Free tier rate limits (for Llama 3.1)

**Fix:**
1. Add $1 credit to remove rate limits
2. **Or** switch to Gemini Flash (very cheap, no limits)

### Issue: Still getting "mox.com" as card name

**Cause:** Either:
1. OpenRouter key not set
2. Cloudflare still blocking the fetch (403)
3. Browser rendering not working

**Debug:**
```bash
# Check logs for these patterns:
npx wrangler tail --format pretty

# Look for:
[PROCESS] OpenAI API key available: true  ← Should be true
[PROCESS] Using LLM extraction...  ← LLM should run
[PROCESS] Extracted card name: Mox Credit  ← Should NOT be "mox.com"
```

---

## 🚀 Advanced: Model Fallback

For production reliability, implement fallback logic:

```typescript
// In extractWithLLM.ts
const models = [
  "google/gemini-flash-1.5",      // Primary (fast, cheap)
  "qwen/qwen-2.5-72b-instruct",   // Fallback 1 (better Chinese)
  "meta-llama/llama-3.1-70b-instruct"  // Fallback 2 (free)
];

for (const model of models) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, messages, temperature: 0.1 })
    });
    
    if (response.ok) {
      return await response.json();
    }
    
    console.warn(`Model ${model} failed, trying next...`);
  } catch (error) {
    console.error(`Model ${model} error:`, error);
  }
}

throw new Error("All models failed");
```

---

## 📈 Scaling for Production

When you hit 10,000+ cards/month:

1. **Enable caching:**
   ```typescript
   // Cache extracted results by contentHash
   const cached = await env.KV.get(`extraction:${contentHash}`);
   if (cached) return JSON.parse(cached);
   
   const result = await extractWithLLM(...);
   await env.KV.put(`extraction:${contentHash}`, JSON.stringify(result));
   ```

2. **Batch processing:**
   ```typescript
   // Process multiple cards in parallel
   const results = await Promise.all(
     urls.map(url => processCardLink(url, region, deps))
   );
   ```

3. **Use cheaper models for updates:**
   - New cards → Gemini Flash
   - Re-checking existing cards → Llama 3.1 (free)
   - Only use premium models when confidence < 0.8

---

## 🎯 Summary

**For Data Extraction (Now):**
- ✅ Use: **Gemini Flash 1.5** via OpenRouter
- Cost: $0.68 per 1000 cards
- Setup time: 5 minutes

**For Chatbot (Part 2):**
- ✅ Use: **Claude 3.5 Sonnet** or **Gemini 1.5 Pro**
- Cost: $6-18 per 1000 conversations
- Same API key, just change model name!

**Total monthly cost estimate:**
- 1,000 cards/month: **$0.68**
- 1,000 chat conversations/month: **$6-18**
- **Total: ~$7-19/month** (very affordable!)

---

## 📞 Support

- OpenRouter docs: https://openrouter.ai/docs
- Model pricing: https://openrouter.ai/models
- Discord: https://discord.gg/openrouter
