# 🔧 PDF Parsing Workaround

## ❌ Problem: Simple PDF Parser Not Working

Our simple PDF parser in Cloudflare Workers **cannot extract text properly** from complex PDFs like Mox's Key Facts Statement. 

**Test Result:**
- ✅ PDF downloads successfully (1MB, 8 pages)
- ✅ Python PyPDF2 extracts **41,021 characters** with rates, terms, cashback details
- ❌ Worker's simple parser extracts mostly garbage (control characters, PDF structure)

---

## ✅ Solutions (In Order of Recommendation)

### **Solution 1: Use pdf.co API** (Recommended) ⭐

**Free Tier:** 300 pages/month (plenty for testing)  
**Paid:** $0.00125 per page after free tier

**Implementation:**
```bash
# Sign up at https://pdf.co/
# Get API key from dashboard

# Add to Worker secrets
wrangler secret put PDFCO_API_KEY
```

Update `pdfParser.ts`:
```typescript
export async function fetchAndParsePdf(pdfUrl: string, pdfcoApiKey?: string): Promise<string> {
  if (pdfcoApiKey) {
    try {
      const response = await fetch('https://api.pdf.co/v1/pdf/convert/to/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': pdfcoApiKey
        },
        body: JSON.stringify({
          url: pdfUrl,
          inline: true,
          pages: "0-10" // First 10 pages only
        })
      });
      
      const result = await response.json();
      if (result.body && result.body.length > 500) {
        console.log(`[PDF] ✅ pdf.co extraction successful: ${result.body.length} chars`);
        return result.body;
      }
    } catch (error) {
      console.warn(`[PDF] pdf.co failed:`, error);
    }
  }
  
  // Fallback to existing logic...
}
```

**Cost for 1,000 Mox requests:**
- 1,000 PDFs × 8 pages = 8,000 pages
- 300 free pages = $0
- 7,700 paid pages × $0.00125 = **$9.63/month**

**Total:** ~$10/month (very affordable!)

---

### **Solution 2: Use CloudConvert API**

**Free Tier:** 25 conversions/day (750/month)  
**Paid:** $9/month for 2,500 conversions

Sign up at https://cloudconvert.com/

---

### **Solution 3: Manual Extraction (Temporary)** 📄

For testing RIGHT NOW, use the already-extracted text:

```bash
# We already extracted the Mox PDF to text
cat mox_kfs_extracted.txt | wc -c
# Output: 41021 characters

# Test LLM extraction with this text
curl -X POST "https://kacard-worker.paws-labu.workers.dev/extract-from-text" \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "url": "https://mox.com/zh/features/mox-credit/",
  "region": "hk",
  "text": "$(cat mox_kfs_extracted.txt | jq -Rs .)"
}
EOF
```

**Or create a simple endpoint:**

```typescript
// In cloudflare/src/index.ts
app.post('/test-pdf-extraction', async (c) => {
  const { pdfText, url } = await c.req.json();
  
  // Skip fetching, use provided text directly
  const result = await extractWithLLM(pdfText, url, ...);
  
  return c.json(result);
});
```

---

### **Solution 4: ScraperAPI with PDF Support**

You already have $5,000 credits! ScraperAPI can handle PDFs:

```typescript
// Already implemented in pdfParser.ts
if (scraperApiKey) {
  const proxyUrl = `https://api.scraperapi.com?${new URLSearchParams({
    api_key: scraperApiKey,
    url: pdfUrl,
    render: 'false', // PDFs don't need rendering
    country_code: 'hk'
  })}`;
  
  const response = await fetch(proxyUrl);
  const arrayBuffer = await response.arrayBuffer();
  const text = await parsePdfBuffer(arrayBuffer); // Still needs better parser
}
```

**Issue:** ScraperAPI only fetches the PDF binary. We still need to parse it.

---

## 🚀 **Recommended Action Plan**

### **Immediate (Next 30 min):**

1. **Sign up for pdf.co** - Get free API key
2. **Test their API manually:**
   ```bash
   curl -X POST https://api.pdf.co/v1/pdf/convert/to/text \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_KEY" \
     -d '{
       "url": "https://mox.com/static/250905_Mox_Credit_Key_Facts_Statement.pdf",
       "inline": true
     }' | jq '.body' | head -100
   ```

3. **If it works** → Add to Worker:
   ```bash
   wrangler secret put PDFCO_API_KEY
   # Update pdfParser.ts to use it
   npx wrangler deploy
   ```

4. **Test end-to-end:**
   ```bash
   curl -X POST "https://kacard-worker.paws-labu.workers.dev/process-card-link" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://mox.com/zh/features/mox-credit/", "region": "hk"}'
   ```

---

## 💡 **Why Our Simple Parser Failed**

PDFs are complex binary formats:
- Text is encoded in streams with compression
- Fonts are embedded and mapped to character codes
- Layout information uses positioning operators
- Chinese characters require special encoding (CID/Unicode mappings)

Our simple approach (looking for `(text)` patterns) works for basic PDFs but fails for:
- **Compressed streams** (most modern PDFs)
- **CID-encoded fonts** (Chinese text)
- **Complex layouts** (multi-column, tables)

**Bottom line:** We need a real PDF parsing library or API.

---

## 📊 **Cost Comparison**

| Solution | Free Tier | Paid Cost (1,000 PDFs/mo) | Notes |
|----------|-----------|----------------------------|-------|
| **pdf.co** | 300 pages/mo | **$10-15/mo** | **Best value** ⭐ |
| CloudConvert | 750 PDFs/mo | $9/mo (2,500 PDFs) | Good for low volume |
| ScraperAPI | Included in credits | Already paying | Still needs parser |
| Manual | Unlimited | $0 (time cost) | Not scalable |

**Recommendation:** Use **pdf.co** - it's affordable, reliable, and specifically built for this.

---

## ✅ **Testing Without Deployment**

While we set up pdf.co, test with manually extracted text:

```bash
cd /Users/silviane/Downloads/AI-Project-Template

# Create test payload
cat > test_mox_manual.json << 'EOF'
{
  "cardName": "Mox Credit",
  "url": "https://mox.com/static/250905_Mox_Credit_Key_Facts_Statement.pdf",
  "region": "hk",
  "pdfText": "...paste first 10,000 chars from mox_kfs_extracted.txt..."
}
EOF

# Test LLM extraction locally (if you have Node.js script)
node test-llm-extraction.js < test_mox_manual.json
```

This proves the **LLM extraction works** - we just need better PDF parsing!

---

**Next Step:** Sign up for pdf.co and test their API! 🚀
