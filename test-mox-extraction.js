/**
 * Quick test script to verify our extraction improvements work on the Mox HTML
 * 
 * Run: node test-mox-extraction.js
 */

const fs = require('fs');

// Extract visible text from HTML (simplified version for Node.js)
function extractVisibleText(html) {
  // Remove scripts, styles, and comments
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, ' ');
  
  // Strip all remaining HTML tags and decode entities
  text = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
  
  return text;
}

// Read the Mox HTML file
const html = fs.readFileSync('moxcredithtml.txt', 'utf-8');
console.log(`Original HTML size: ${html.length} chars`);

// Extract visible text
const visibleText = extractVisibleText(html);
console.log(`Extracted visible text: ${visibleText.length} chars`);

// Check for key terms we expect to find
const keyTerms = [
  { term: 'Mox Credit', zh: 'Mox Credit' },
  { term: 'CashBack', zh: 'CashBack' },
  { term: '超市', zh: 'supermarket' },
  { term: '3%', zh: '3% cashback' },
  { term: '免年費', zh: 'no annual fee' },
  { term: '外幣', zh: 'foreign currency' },
  { term: '250,000', zh: 'balance threshold' },
  { term: 'Standard Chartered', zh: 'issuer' }
];

console.log('\n=== Key Term Detection ===');
keyTerms.forEach(({ term, zh }) => {
  const found = visibleText.includes(term);
  console.log(`${found ? '✓' : '✗'} "${term}" (${zh})`);
});

// Show first 2000 chars to verify content quality
console.log('\n=== Sample of Extracted Text (first 2000 chars) ===');
console.log(visibleText.substring(0, 2000));
console.log('...\n');

// Simulate what LLM would see (50k chars)
const contentForLLM = visibleText.substring(0, 50000);
console.log(`Content size for LLM: ${contentForLLM.length} chars`);

// Check if key info is within the 50k window
console.log('\n=== Coverage Check (within 50k char limit) ===');
keyTerms.forEach(({ term, zh }) => {
  const found = contentForLLM.includes(term);
  console.log(`${found ? '✓' : '✗'} "${term}" captured in LLM input`);
});
