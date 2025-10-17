# 🧪 Model Testing Guide

## How to Switch Models & Test Different Banks

This guide shows you how to test different LLM models on various bank websites to find the best performance/cost balance.

---

## 🎯 Quick Answer: How to Change Models

**Edit this ONE line in `cloudflare/src/lib/extractWithLLM.ts` (line ~157):**

```typescript
const model = "google/gemini-flash-1.5"; // ← Change this!
```

**Available models:**

```typescript
// RECOMMENDED FOR EXTRACTION:
const model = "google/gemini-flash-1.5";  // ⭐ Best value: Fast, cheap, good quality
const model = "qwen/qwen-2.5-72b-instruct"; // ⭐⭐ Best Chinese: Excellent for Traditional Chinese
const model = "meta-llama/llama-3.1-70b-instruct"; // 💰 Often FREE on OpenRouter!

// PREMIUM (more expensive but better):
const model = "anthropic/claude-3.5-haiku"; // ⭐⭐⭐ Best accuracy
const model = "openai/gpt-4o-mini"; // ⭐⭐ Good balance
```

**After changing, redeploy:**

```bash
cd cloudflare
npx wrangler deploy
```

That's it! 🎉

---

## 📊 Testing Different Models

### Step 1: Test Mox.com (Baseline)

This is your original test case. Use it to compare all models:

```bash
curl -X POST "https://kacard-worker.paws-labu.workers.dev/process-card-link" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mox.com/zh/features/mox-credit/", "region": "hk"}' \
  | jq '{
    cardName: .ruleset.cardName,
    ruleCount: (.ruleset.rules | length),
    model: .provenance.model,
    confidence: .provenance.fields.cardName.confidence
  }'
```

**Expected output:**
```json
{
  "cardName": "Mox Credit",
  "ruleCount": 2,
  "model": "google/gemini-flash-1.5",
  "confidence": 0.95
}
```

### Step 2: Test Other Hong Kong Banks

Try these popular HK cards:

```bash
# HSBC Red Credit Card
curl -X POST "https://kacard-worker.paws-labu.workers.dev/process-card-link" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.redcard.hsbc.com.hk/", "region": "hk"}' \
  | jq '.ruleset.cardName, (.ruleset.rules | length)'

# Citi Cash Back Credit Card
curl -X POST "https://kacard-worker.paws-labu.workers.dev/process-card-link" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.citibank.com.hk/chinese/credit-cards/cash-back-credit-card.htm", "region": "hk"}' \
  | jq '.ruleset.cardName, (.ruleset.rules | length)'

# Standard Chartered Simply Cash Visa
curl -X POST "https://kacard-worker.paws-labu.workers.dev/process-card-link" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.sc.com/hk/zh/credit-cards/simply-cash-visa/", "region": "hk"}' \
  | jq '.ruleset.cardName, (.ruleset.rules | length)'

# DBS Compass Visa
curl -X POST "https://kacard-worker.paws-labu.workers.dev/process-card-link" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.dbs.com.hk/personal-zh/cards/credit-cards/compass-visa", "region": "hk"}' \
  | jq '.ruleset.cardName, (.ruleset.rules | length)'
```

### Step 3: Create a Test Script

**Save this as `test-models.sh`:**

```bash
#!/bin/bash

# Test multiple banks with the current model
BANKS=(
  "https://mox.com/zh/features/mox-credit/"
  "https://www.redcard.hsbc.com.hk/"
  "https://www.citibank.com.hk/chinese/credit-cards/cash-back-credit-card.htm"
  "https://www.sc.com/hk/zh/credit-cards/simply-cash-visa/"
)

echo "Testing current model..."
for url in "${BANKS[@]}"; do
  echo "---"
  echo "URL: $url"
  
  result=$(curl -s -X POST "https://kacard-worker.paws-labu.workers.dev/process-card-link" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\", \"region\": \"hk\"}")
  
  echo "Card: $(echo $result | jq -r '.ruleset.cardName')"
  echo "Rules: $(echo $result | jq '.ruleset.rules | length')"
  echo "Model: $(echo $result | jq -r '.provenance.model')"
  echo "Confidence: $(echo $result | jq '.provenance.fields.cardName.confidence')"
  echo ""
done
```

**Run it:**
```bash
chmod +x test-models.sh
./test-models.sh
```

---

## 🔬 Systematic Model Comparison

### Test Plan

1. **Start with FREE model** (Llama 3.1 70B)
   - Test all banks above
   - Record: card name extracted? Rule count? Quality?

2. **Test recommended model** (Gemini Flash 1.5)
   - Same banks
   - Compare to Llama results

3. **Test Chinese specialist** (Qwen 2.5 72B)
   - Same banks
   - Does it extract better categories from Chinese text?

4. **Test premium** (Claude 3.5 Haiku) - only if needed
   - Use if Gemini/Qwen miss important details

### Model Testing Template

For each model, record:

| Bank | Card Name | Rule Count | Confidence | Quality Notes | Cost |
|------|-----------|------------|------------|---------------|------|
| Mox | ✅/❌ | 2 | 0.95 | Baseline | $X |
| HSBC Red | ✅/❌ | ? | ? | | $X |
| Citi Cash Back | ✅/❌ | ? | ? | | $X |
| SC Simply Cash | ✅/❌ | ? | ? | | $X |

**Quality criteria:**
- ✅ **Good**: Card name correct, 2+ rules extracted, confidence > 0.8
- ⚠️ **Okay**: Card name correct, 1 rule, confidence > 0.6
- ❌ **Bad**: Wrong card name or confidence < 0.5

---

## 💰 Cost Comparison (Per Model)

Assuming ~5k input tokens + 1k output tokens per extraction:

| Model | Cost per Card | Free Tier? | Best For |
|-------|---------------|------------|----------|
| **Llama 3.1 70B** | **$0** | ✅ Yes! | Budget testing, simple cards |
| **Gemini Flash 1.5** | **$0.0007** | ❌ | Production (fast + cheap) |
| **Qwen 2.5 72B** | **$0.0021** | ❌ | Chinese-heavy content |
| **Claude 3.5 Haiku** | **$0.0050** | ❌ | Complex cards, high accuracy |
| **GPT-4o-mini** | **$0.0014** | ❌ | Familiar model, good balance |

**Example monthly costs:**
- 1,000 cards with **Llama 3.1**: **FREE** (if rate limits allow)
- 1,000 cards with **Gemini Flash**: **$0.68**
- 1,000 cards with **Qwen 2.5**: **$2.10**
- 1,000 cards with **Claude Haiku**: **$5.00**

**My Recommendation:**
1. Start with **Llama 3.1 70B** (free) to test
2. Use **Gemini Flash 1.5** for production (best value)
3. Fallback to **Qwen 2.5 72B** if Chinese text has issues
4. Use **Claude Haiku** only for difficult/ambiguous cards

---

## 🎯 Recommended Testing Workflow

### Day 1: Test Free Model
```bash
# Change model to Llama 3.1
# Edit extractWithLLM.ts line 157:
const model = "meta-llama/llama-3.1-70b-instruct";

# Deploy
cd cloudflare && npx wrangler deploy

# Test all banks
./test-models.sh > results-llama.txt
```

### Day 2: Test Gemini Flash (Recommended)
```bash
# Change model to Gemini Flash
const model = "google/gemini-flash-1.5";

# Deploy
npx wrangler deploy

# Test all banks
./test-models.sh > results-gemini.txt

# Compare
diff results-llama.txt results-gemini.txt
```

### Day 3: Test Chinese Specialist (If Needed)
```bash
# Change model to Qwen
const model = "qwen/qwen-2.5-72b-instruct";

# Deploy
npx wrangler deploy

# Test all banks
./test-models.sh > results-qwen.txt

# Compare
diff results-gemini.txt results-qwen.txt
```

### Day 4: Make Decision

**If Llama 3.1 works well:**
- Use it! It's FREE!
- Save your $5 OpenRouter credit for the Part 2 chatbot

**If Gemini Flash better:**
- Use it for production
- Only $0.68 per 1000 cards
- Best balance of cost/quality

**If Qwen 2.5 significantly better:**
- Use it for Chinese-heavy cards
- $2.10 per 1000 cards still very cheap
- Best for Traditional Chinese content

---

## 🐛 Debugging Model Issues

### Issue: Model returns "Unknown Card"

**Check:**
1. Did you set the OpenRouter API key?
   ```bash
   npx wrangler tail --format pretty | grep "OpenAI API key"
   ```
   Should show: `OpenAI API key available: true`

2. Is the model name correct?
   ```bash
   curl https://openrouter.ai/api/v1/models \
     -H "Authorization: Bearer YOUR_KEY" \
     | jq '.data[].id' | grep gemini
   ```

3. Check the actual API response:
   ```bash
   npx wrangler tail --format pretty
   ```
   Look for error messages in the logs.

### Issue: Rate limit exceeded (Llama 3.1 Free)

**Solution:**
- Add $1 to your OpenRouter account to remove limits
- **Or** switch to Gemini Flash (very cheap, no limits)

### Issue: Model too slow

**Speed ranking (fastest to slowest):**
1. Gemini Flash 1.5 (~2 seconds)
2. Llama 3.1 70B (~3 seconds)
3. Qwen 2.5 72B (~4 seconds)
4. Claude 3.5 Haiku (~4 seconds)

If speed matters, stick with Gemini Flash.

---

## 📈 Advanced: Automatic Model Selection

If you want to get fancy, you can automatically choose models based on content:

```typescript
// In extractWithLLM.ts
function selectModel(visibleText: string): string {
  const chineseChars = (visibleText.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = visibleText.length;
  const chinesePct = chineseChars / totalChars;
  
  if (chinesePct > 0.5) {
    // Majority Chinese → use Qwen
    return "qwen/qwen-2.5-72b-instruct";
  } else if (visibleText.length > 30000) {
    // Long content → use fast model
    return "google/gemini-flash-1.5";
  } else {
    // Default: best value
    return "google/gemini-flash-1.5";
  }
}

// Then use it:
const model = selectModel(visibleText);
```

This way you get the best model for each card automatically!

---

## 🎓 Summary

**To change models:**
1. Edit line 157 in `cloudflare/src/lib/extractWithLLM.ts`
2. Change `const model = "..."` to your desired model
3. Run `npx wrangler deploy`

**Recommended testing order:**
1. Llama 3.1 70B (free) → Test if it's good enough
2. Gemini Flash 1.5 (cheap) → Production default
3. Qwen 2.5 72B (if Chinese issues) → Chinese specialist
4. Claude Haiku (if quality issues) → Premium fallback

**My prediction:**
- **Gemini Flash 1.5 will be your winner** for most cards
- **Qwen 2.5 72B** might be better for complex Chinese reward structures
- **Llama 3.1** good for simple cards if you want to save money

Let me know your results! 📊
