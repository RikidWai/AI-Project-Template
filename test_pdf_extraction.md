# Test PDF Extraction Issue

## Current Status

All API keys are set:
- ✅ OPENAI_API_KEY
- ✅ PDFCO_API_KEY  
- ✅ SCRAPER_API_KEY

But Mox extraction still returns "Unknown Card" with empty rules, both for:
1. The HTML page URL: `https://mox.com/zh/features/mox-credit/`
2. The direct PDF URL: `https://mox.com/static/250905_Mox_Credit_Key_Facts_Statement.pdf`

## Possible Issues

### 1. pdf.co API Call Failing Silently

The pdf.co API might be:
- Failing but catching the error and falling back to simple parser
- Not being called at all due to conditional logic
- API key is invalid or expired

### 2. LLM API Call Failing

The OpenRouter/LLM API might be:
- Not being called due to missing API key
- Failing but returning empty response
- Timeout or rate limit

### 3. Content Extraction Working But LLM Returns Nothing

The content might be reaching the LLM but:
- LLM returns "Unknown Card" response
- Validation rejects the response
- Prompt is not working correctly

## Debug Steps

1. **Check if pdf.co is being called**:
   - Add console.log in `pdfParser.ts` before pdf.co API call
   - Check Worker logs to see if pdf.co is attempted

2. **Check if LLM is being called**:
   - Add console.log in `extractWithLLM.ts` before OpenRouter API call
   - Log the API key length and first/last chars
   - Log the response from OpenRouter

3. **Check what content is being sent to LLM**:
   - Log the first 1000 chars of content being sent
   - Verify it contains meaningful text

4. **Test pdf.co directly**:
   ```bash
   curl -X POST https://api.pdf.co/v1/pdf/convert/to/text \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_KEY" \
     -d '{
       "url": "https://mox.com/static/250905_Mox_Credit_Key_Facts_Statement.pdf",
       "inline": true
     }'
   ```

## Next Actions

Since we can't see Worker logs easily, let's:
1. Add explicit logging to track execution flow
2. Add error boundaries to catch silent failures
3. Test pdf.co API directly to verify it works
4. Test OpenRouter API directly to verify it works
