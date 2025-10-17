import { processCardLink } from "./lib/processCardLink";
import { enrichDesignatedMerchantsFromHtml } from "./lib/enrichMerchants";
import { publishRules } from "./lib/publishRules";
import { fetchWithBrowser } from "./lib/fetchWithBrowser";
import type { CardRuleSet, RulesetKV, RulesetStore } from "./lib/types";
import type { ProcessCardLinkDependencies } from "./lib/processCardLink";
import type { SnapshotPutOptions } from "./lib/types";

export interface Env {
  SNAPSHOT_BUCKET: R2Bucket;
  RULESET_BUCKET: R2Bucket;
  RULESET_KV: KVNamespace;
  OPENAI_API_KEY?: string; // Optional: OpenAI or OpenRouter API key (set via wrangler secret put OPENAI_API_KEY)
  OPENROUTER_API_KEY?: string; // Optional: OpenRouter API key (alias)
  BRAVE_API_KEY?: string; // Brave Search API key
  BROWSER?: Fetcher; // Optional: Cloudflare Browser Rendering for JavaScript-heavy sites
  SCRAPER_API_KEY?: string; // Optional: ScraperAPI key for stubborn sites (with underscore)
  SCRAPERAPI_KEY?: string; // Optional: ScraperAPI key for stubborn sites (without underscore, legacy)
  PDFCO_API_KEY?: string; // Optional: pdf.co API key for PDF text extraction
  HASH_TO_RULESET_KV?: KVNamespace; // Optional: Hash index to dedupe repeated content
}

function buildDependencies(env: Env): ProcessCardLinkDependencies {
  return {
    fetch: {
      fetch: (url: string) => fetch(url),
      browserBinding: env.BROWSER, // Pass browser binding for JavaScript-heavy sites
      scraperApiKey: env.SCRAPER_API_KEY || env.SCRAPERAPI_KEY, // Pass ScraperAPI key (accept both names)
      pdfcoApiKey: env.PDFCO_API_KEY, // Pass pdf.co API key for PDF parsing
      snapshotStore: {
        async put(key: string, value: string | ArrayBuffer, options?: SnapshotPutOptions) {
          await env.SNAPSHOT_BUCKET.put(key, value, {
            customMetadata: options?.metadata as Record<string, string> | undefined,
            httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
          });
        },
      },
    },
    publish: {
      rulesetStore: {
        async put(key: string, value: string, options?: { contentType?: string }) {
          await env.RULESET_BUCKET.put(key, value, {
            httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
          });
        },
        async get(key: string) {
          const obj = await env.RULESET_BUCKET.get(key);
          if (!obj) return null;
          return await obj.text();
        },
      },
      rulesetKV: {
        put: (key: string, value: string) => env.RULESET_KV.put(key, value),
        get: (key: string) => env.RULESET_KV.get(key),
      },
    },
    openaiApiKey: env.OPENAI_API_KEY || env.OPENROUTER_API_KEY, // Support either key name
    hashIndexKV: env.HASH_TO_RULESET_KV,
  };
}

function isOfficialDomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  // Networks
  const NETWORKS = ["visa.com", "mastercard.com", "americanexpress.com", "discover.com", "dinersclub.com", "jcb.co.jp"]; 
  // Global issuers (incomplete but broad)
  const ISSUERS = [
    // US
    "chase.com", "bankofamerica.com", "capitalone.com", "wellsfargo.com", "usbank.com", "citibank.com", "citi.com",
    // UK/EU
    "barclays.co.uk", "lloydsbank.com", "natwest.com", "hsbc.co.uk", "santander.co.uk", "monzo.com", "revolut.com",
    "ing.com", "unicredit.eu", "societegenerale.com", "bnpparibas.com", "db.com", "bbva.com", "santander.com",
    // CA/AU/NZ
    "rbc.com", "td.com", "scotiabank.com", "bmo.com", "cibc.com", "anz.com", "nab.com.au", "westpac.com.au",
    // APAC broad
    "hsbc.com", "hsbc.com.hk", "sc.com", "hangseng.com", "ocbc.com", "uob.com.sg", "dbs.com", "maybank.com",
    "hdfcbank.com", "sbi.co.in", "icicibank.com", "axisbank.com", "kotak.com", "mox.com", "za.group", "za.bank"
  ];
  // Regulators/government (generic heuristic)
  const isGov = h.endsWith(".gov") || h.includes(".gov.") || h.endsWith(".gouv.fr") || h.endsWith(".gov.uk") || h.endsWith(".gc.ca");
  const REGULATORS = [
    "ecb.europa.eu", "bankofengland.co.uk", "fdic.gov", "occ.treas.gov", "sec.gov", "fca.org.uk",
    "hkma.gov.hk", "mas.gov.sg", "fsc.gov.tw", "sec.gov.ph"
  ];
  const OFFICIAL = new Set([...NETWORKS, ...ISSUERS, ...REGULATORS]);
  if (isGov) return true;
  for (const root of OFFICIAL) {
    if (h === root || h.endsWith(`.${root}`)) return true;
  }
  return false;
}

function renderLandingPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Card Link Processor</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 2rem;
        background: radial-gradient(circle at top, #eef2ff, #fff);
        color: #1f2937;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2rem;
      }
      h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3rem);
      }
      form {
        display: grid;
        gap: 1rem;
        width: min(520px, 90vw);
        padding: 1.5rem;
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.85);
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.15);
      }
      label {
        display: grid;
        gap: 0.5rem;
        font-weight: 600;
      }
      input,
      select,
      button,
      textarea {
        font: inherit;
      }
      input,
      select {
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        border: 1px solid rgba(99, 102, 241, 0.3);
        background: rgba(255, 255, 255, 0.9);
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      input:focus,
      select:focus {
        outline: none;
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.75rem 1.5rem;
        border-radius: 9999px;
        border: none;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.7;
      }
      button:not(:disabled):hover {
        transform: translateY(-1px);
        box-shadow: 0 12px 24px rgba(99, 102, 241, 0.25);
      }
      .result {
        width: min(640px, 90vw);
        padding: 1.5rem;
        border-radius: 1rem;
        background: rgba(15, 23, 42, 0.9);
        color: #f8fafc;
        font-family: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        max-height: 320px;
        overflow: auto;
        white-space: pre-wrap;
      }
      .hidden {
        display: none;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
      }
      .actions button {
        background: #10b981;
      }
      .actions button.secondary {
        background: #0ea5e9;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Card Link Processor</h1>
      <p>Paste a credit card information page link and confirm the extracted perks.</p>
    </header>
    <form id="card-form">
      <label>
        Card URL
        <input id="card-url" type="url" placeholder="https://example.com/card" required />
      </label>
      <label>
        Region
        <select id="card-region" required>
          <option value="" disabled selected>Select a region</option>
          <option value="hk">Hong Kong</option>
          <option value="sg">Singapore</option>
          <option value="my">Malaysia</option>
          <option value="tw">Taiwan</option>
          <option value="ph">Philippines</option>
        </select>
      </label>
      <div class="actions">
        <button id="submit-button" type="submit">
          <span>Process</span>
          <span aria-hidden="true">➜</span>
        </button>
        <button class="secondary" type="button" id="reset-button">Reset</button>
      </div>
    </form>
    <section id="result-section" class="result hidden" aria-live="polite"></section>
    <section id="bento" class="hidden"></section>
    <script>
      const form = document.getElementById("card-form");
      const urlInput = document.getElementById("card-url");
      const regionSelect = document.getElementById("card-region");
      const resultSection = document.getElementById("result-section");
      const bento = document.getElementById("bento");
      const submitButton = document.getElementById("submit-button");
      const resetButton = document.getElementById("reset-button");
      let lastPayload = null;

      function setLoading(isLoading) {
        submitButton.disabled = isLoading;
        submitButton.querySelector("span").textContent = isLoading ? "Processing" : "Process";
      }

      function displayResult(content, isError = false) {
        resultSection.textContent = content;
        resultSection.classList.toggle("hidden", false);
        resultSection.style.background = isError ? "#b91c1c" : "rgba(15, 23, 42, 0.9)";
      }

      function renderBento(payload) {
        const { ruleset } = payload;
        if (!ruleset) return;
        bento.classList.remove("hidden");
        bento.innerHTML = "";
        bento.style.width = "min(960px, 95vw)";
        bento.style.display = "grid";
        bento.style.gridTemplateColumns = "repeat(auto-fit, minmax(240px, 1fr))";
        bento.style.gap = "1rem";

        const tile = (title, content, span = 1) => {
          const d = document.createElement("div");
          d.style.background = "white";
          d.style.color = "#111827";
          d.style.padding = "1rem";
          d.style.borderRadius = "0.75rem";
          d.style.boxShadow = "0 10px 24px rgba(15,23,42,.12)";
          d.style.gridColumn = 'span ' + span;
          const h = document.createElement("div");
          h.style.fontWeight = "700";
          h.style.marginBottom = ".5rem";
          h.textContent = title;
          const c = document.createElement("div");
          c.appendChild(content);
          d.appendChild(h);
          d.appendChild(c);
          return d;
        };

        // Reward type toggle
        const rtWrap = document.createElement("div");
        const rtLabel = document.createElement("span");
        rtLabel.textContent = "Reward type:";
        rtLabel.style.marginRight = ".5rem";
        const select = document.createElement("select");
        ["all","cashback","miles","points"].forEach(v => {
          const o = document.createElement("option");
          o.value = v; o.textContent = v;
          select.appendChild(o);
        });
        rtWrap.appendChild(rtLabel);
        rtWrap.appendChild(select);

        // Actions
        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = ".5rem";
        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.textContent = "Save";
        saveBtn.style.background = "#10b981";
        saveBtn.style.color = "white";
        saveBtn.style.border = "none";
        saveBtn.style.borderRadius = "0.5rem";
        saveBtn.style.padding = ".5rem .75rem";
        saveBtn.addEventListener("click", async () => {
          try {
            const cardKey = (lastPayload && lastPayload.publishResult && lastPayload.publishResult.cardKey) || null;
            if (!cardKey) throw new Error("Missing card key");
            const selection = { rewardType: select.value };
            const res = await fetch('/save-card', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cardKey, selection }) });
            if (!res.ok) throw new Error('Save failed');
            saveBtn.textContent = 'Saved';
            setTimeout(() => saveBtn.textContent = 'Save', 1500);
          } catch (e) {
            alert('Save failed');
          }
        });
        actions.appendChild(saveBtn);

        // Fees
        const feeDiv = document.createElement("div");
        const af = document.createElement("div");
        af.textContent = 'Annual Fee: ' + (ruleset.annualFee ?? 0);
        const fxDetails = document.createElement("details");
        const effective = (ruleset.fx?.effectivePct ?? ruleset.fxFee ?? null);
        const summary = document.createElement("summary");
        summary.textContent = 'Foreign Transaction: ' + (effective ?? '–') + '%';
        const fxBody = document.createElement("div");
        fxBody.style.marginTop = ".5rem";
        fxBody.innerHTML = 'Issuer: ' + (ruleset.fx?.issuerFeePct ?? '–') + '%<br/>Network: ' + (ruleset.fx?.networkMarkupPct ?? '–') + '%';
        fxDetails.appendChild(summary);
        fxDetails.appendChild(fxBody);
        feeDiv.appendChild(af);
        feeDiv.appendChild(fxDetails);

        // Promotions
        const promos = document.createElement("ul");
        (ruleset.promotions || []).forEach(p => { const li = document.createElement("li"); li.textContent = p; promos.appendChild(li); });

        // Categories
        const list = document.createElement("div");
        list.style.display = "grid";
        list.style.gap = ".75rem";

        function renderRules(filter) {
          list.innerHTML = "";
          const grouped = {};
          for (const r of ruleset.rules) {
            if (filter !== "all" && r.rewardType !== filter) continue;
            (grouped[r.category] ||= []).push(r);
          }
          Object.entries(grouped).forEach(([cat, arr]) => {
            const card = document.createElement("div");
            card.style.border = "1px solid rgba(99,102,241,.25)";
            card.style.borderRadius = "0.75rem";
            card.style.padding = "0.75rem";
            const head = document.createElement("div");
            head.style.fontWeight = "600";
            head.style.marginBottom = ".5rem";
            head.textContent = cat + (arr.some(r => r.stacking === 'stackable') ? " (Stackable)" : " (Choose one)");
            const chips = document.createElement("div");
            chips.style.display = "flex";
            chips.style.flexWrap = "wrap";
            chips.style.gap = ".5rem";
            arr.forEach(r => {
              const chip = document.createElement("button");
              chip.type = "button";
              chip.style.padding = ".4rem .6rem";
              chip.style.borderRadius = "9999px";
              chip.style.border = "1px solid #e5e7eb";
              chip.style.background = "#f3f4f6";
              const unit = r.unit || (r.rewardType === 'cashback' ? '%' : '');
              const val = (r.rateValue ?? r.rate);
              chip.textContent = String(val) + String(unit) + ' • ' + (r.rewardType || 'cashback');
              chip.title = r.description;
              chips.appendChild(chip);
            });
            card.appendChild(head);
            card.appendChild(chips);
            list.appendChild(card);
          });
        }
        renderRules("all");
        select.addEventListener("change", () => renderRules(select.value));

        // Allow inline edit (local only)
        af.contentEditable = "true";

        const rtTile = tile("Reward Type", rtWrap);
        rtTile.appendChild(actions);
        bento.appendChild(rtTile);
        bento.appendChild(tile("Fees", feeDiv, 2));
        bento.appendChild(tile("Promotions", promos));
        bento.appendChild(tile("Categories", list, 2));
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) {
          return;
        }

        setLoading(true);
        displayResult("Processing card link…");

        try {
          const response = await fetch("/process-card-link", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: urlInput.value, region: regionSelect.value }),
          });

          if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            const errorMessage = errorPayload.error || "Request failed with status " + response.status;
            throw new Error(errorMessage);
          }

          const payload = await response.json();
          lastPayload = payload;
          displayResult(JSON.stringify(payload, null, 2));
          renderBento(payload);
        } catch (error) {
          displayResult(error instanceof Error ? error.message : "Unexpected error", true);
        } finally {
          setLoading(false);
        }
      });

      resetButton.addEventListener("click", () => {
        form.reset();
        resultSection.classList.add("hidden");
        bento.classList.add("hidden");
      });
    </script>
  </body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const deps = buildDependencies(env);
    const llmApiKey = env.OPENAI_API_KEY || env.OPENROUTER_API_KEY || "";

    async function braveSearch(query: string, apiKey: string) {
      const endpoint = "https://api.search.brave.com/res/v1/web/search";
      const u = `${endpoint}?q=${encodeURIComponent(query)}&country=HK&count=10&offset=0&freshness=365d`;
      const res = await fetch(u, { headers: { "Accept": "application/json", "X-Subscription-Token": apiKey, "User-Agent": "KaCard/1.0" } });
      if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
      const json: any = await res.json();
      const web: any[] = json?.web?.results || [];
      return { results: web.map((r: any) => ({ url: r.url, title: r.title, description: r.description })) };
    }

    async function extractFeesFromDocInline(docUrl: string, region: string) {
      const FEES_PROMPT = `You extract FX fee information from OFFICIAL issuer/network/regulator documents. Return ONLY JSON {"issuerFeePct":{"value":number|null,"sourceText":string,"confidence":number},"networkMarkupPct":{"value":number|null,"sourceText":string,"confidence":number}}. Do not invent.`;
      const res = await fetch(docUrl); const text = await res.text();
      const messages = [ { role: "system", content: FEES_PROMPT }, { role: "user", content: `Region: ${region}\nURL: ${docUrl}\nDocument:\n${text.substring(0,45000)}` } ];
      const llm = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmApiKey}`, "HTTP-Referer": "https://kacard.app", "X-Title": "KaCard Fees Extraction" }, body: JSON.stringify({ model: "google/gemini-2.5-pro", messages, temperature: 0.1, response_format: { type: "json_object" } }) });
      if (!llm.ok) throw new Error(await llm.text());
      const out: any = await llm.json(); const content = out.choices[0].message.content as string; const parsed = JSON.parse(content);
      const issuer = parsed.issuerFeePct || { value: null, sourceText: "Not found in document", confidence: 0 };
      const network = parsed.networkMarkupPct || { value: null, sourceText: "Not found in document", confidence: 0 };
      const effective = (issuer.value ?? 0) + (network.value ?? 0);
      return { issuerFeePct: issuer, networkMarkupPct: network, effectivePct: (issuer.value==null && network.value==null)? null : effective, sources: [docUrl] };
    }

    async function extractMerchantsInline(docUrl: string, region: string) {
      const PROMPT = `From the document, extract designated merchant brand names and MCCs related to card rewards. Return ONLY JSON {"merchants":string[],"mccs":string[],"exclusions":string[]}.`;
      const res = await fetch(docUrl); const text = await res.text();
      const messages = [ { role: "system", content: PROMPT }, { role: "user", content: `Region: ${region}\nURL: ${docUrl}\nDocument:\n${text.substring(0,45000)}` } ];
      const llm = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmApiKey}`, "HTTP-Referer": "https://kacard.app", "X-Title": "KaCard Merchant Extraction" }, body: JSON.stringify({ model: "google/gemini-2.5-pro", messages, temperature: 0.1, response_format: { type: "json_object" } }) });
      if (!llm.ok) throw new Error(await llm.text());
      const out: any = await llm.json(); const content = out.choices[0].message.content as string; const parsed = JSON.parse(content);
      return { merchants: parsed.merchants || [], mccs: parsed.mccs || [], exclusions: parsed.exclusions || [], sources: [docUrl] };
    }

    async function scorePurchaseInline(input: { amount: number; currency: string; merchantName?: string; channel?: string; city?: string; userCardIds: string[]; }, publish: { rulesetKV: RulesetKV; rulesetStore: RulesetStore; }) {
      const baseline = 0.4;
      const cards: any[] = [];
      for (const id of input.userCardIds) {
        const kvRaw = await publish.rulesetKV.get(id);
        if (!kvRaw) { cards.push({ id, ruleset: null }); continue; }
        const kv = JSON.parse(kvRaw);
        const raw = await publish.rulesetStore.get?.(kv.r2Key);
        if (!raw) { cards.push({ id, ruleset: null }); continue; }
        cards.push({ id, ruleset: JSON.parse(raw) });
      }
      const candidates = cards.filter(c => !!c.ruleset);
      const evals = candidates.map((c) => {
        const pr = c.ruleset.rules.filter((r: any) => (r.rewardType ?? (r.unit === "%" ? "cashback" : undefined)) === "cashback").map((r: any) => r.rateValue ?? r.rate).filter((v: any) => typeof v === "number");
        const best = pr.length ? Math.max(...pr) : (c.ruleset.baseRate || 0);
        const fxPenalty = (input.currency && input.currency !== c.ruleset.currency && c.ruleset.fx?.effectivePct) ? c.ruleset.fx.effectivePct : 0;
        const effective = Math.max(0, best - (fxPenalty || 0));
        return { cardId: c.id, cardName: c.ruleset.cardName, ratePct: effective, fxPenalty: fxPenalty || 0 };
      }).sort((a: any, b: any) => b.ratePct - a.ratePct);
      const top = evals[0];
      const recommendation = top ? `Use ${top.cardName} → ~${top.ratePct}%` : `Fallback baseline → ~${baseline}%`;
      return { recommendation, baseline, evaluated: evals };
    }

    if (request.method === "POST" && url.pathname === "/save-card") {
      const body = await request.json().catch(() => ({}));
      const { cardKey, selection } = body as { cardKey?: string; selection?: any };
      if (!cardKey) {
        return new Response(JSON.stringify({ error: "cardKey is required" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      const saved = { cardKey, selection: selection ?? null, savedAt: new Date().toISOString() };
      await deps.publish.rulesetKV.put(`user_cards:${cardKey}`, JSON.stringify(saved));
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    }
    if (request.method === "POST" && url.pathname === "/save-card-profile") {
      const body = await request.json().catch(() => ({}));
      const { ruleset } = body as { ruleset?: CardRuleSet };
      if (!ruleset) {
        return new Response(JSON.stringify({ error: "ruleset is required" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      const result = await publishRules(ruleset, deps.publish);
      return new Response(JSON.stringify({ ok: true, publishResult: result }), { headers: { "content-type": "application/json" } });
    }
    if (request.method === "POST" && url.pathname === "/process-card-link") {
      const payload = await request.json();
      const { url: targetUrl, region } = payload as { url?: string; region?: string };
      if (!targetUrl || !region) {
        return new Response(JSON.stringify({ error: "url and region are required" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      // Enforce official source policy
      try {
        const u = new URL(targetUrl);
        if (!isOfficialDomain(u.hostname)) {
          return new Response(JSON.stringify({ error: "Only official issuer/network/regulator/government domains are allowed" }), { status: 400, headers: { "content-type": "application/json" } });
        }
      } catch {
        return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: { "content-type": "application/json" } });
      }

      
      // Debug logging
      console.log("[DEBUG] LLM key present:", !!llmApiKey);
      console.log("[DEBUG] LLM key length:", llmApiKey?.length || 0);
      console.log("[DEBUG] deps.openaiApiKey present:", !!deps.openaiApiKey);
      
      const result = await processCardLink(targetUrl, region, deps);
      // Background enrichment for designated merchants
      try {
        ctx.waitUntil((async () => {
          let html: string = "";
          if (env.BROWSER) {
            const br = await fetchWithBrowser(targetUrl, env.BROWSER as any);
            html = br.renderedHtml || br.content || "";
          }
          if (!html) {
            const res = await fetch(targetUrl);
            html = await res.text();
          }
          await enrichDesignatedMerchantsFromHtml(targetUrl, html, result.ruleset as CardRuleSet, {
            fetch: (u: string) => fetch(u) as any,
            publish: deps.publish as any,
          });
        })());
      } catch (e) {
        console.warn("[ENRICH] Failed to enqueue merchant enrichment", e);
      }
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    }

    // Discover official pages by name
    if (request.method === "POST" && url.pathname === "/discover-official-pages") {
      if (!env.BRAVE_API_KEY) {
        return new Response(JSON.stringify({ error: "BRAVE_API_KEY not configured" }), { status: 500, headers: { "content-type": "application/json" } });
      }
      const body = await request.json().catch(() => ({}));
      const { cardName, region } = body as { cardName?: string; region?: string };
      if (!cardName) return new Response(JSON.stringify({ error: "cardName is required" }), { status: 400, headers: { "content-type": "application/json" } });
      // Broad query; we will filter to official domains after search
      const query = `${cardName} credit card official site ${region ? `(${region})` : ""}`;
      const res = await braveSearch(query, env.BRAVE_API_KEY);
      const urls = res.results.filter((r: any) => {
        try { return isOfficialDomain(new URL(r.url).hostname); } catch { return false; }
      }).map(r => r.url);
      return new Response(JSON.stringify({ urls }), { headers: { "content-type": "application/json" } });
    }

    // Find related docs (KFS/T&Cs/fees/promos)
    if (request.method === "POST" && url.pathname === "/find-related-docs") {
      if (!env.BRAVE_API_KEY) {
        return new Response(JSON.stringify({ error: "BRAVE_API_KEY not configured" }), { status: 500, headers: { "content-type": "application/json" } });
      }
      const body = await request.json().catch(() => ({}));
      const { url: baseUrl, bank, cardName } = body as { url?: string; bank?: string; cardName?: string };
      let host = "";
      if (baseUrl) {
        try { host = new URL(baseUrl).hostname; } catch { /* ignore */ }
      }
      const bankQuery = bank ? `${bank}` : "";
      const nameQuery = cardName ? `${cardName}` : "";
      const sitePart = host ? `site:${host}` : (bankQuery ? `site:${bankQuery}.com` : "");
      const terms = ["Key Facts Statement", "KFS", "Terms and Conditions", "Fees", "Foreign transaction fee", "merchant list", "designated merchants", "MCC"];
      const query = `${sitePart} ${bankQuery} ${nameQuery} (${terms.join(" OR ")})`;
      const res = await braveSearch(query, env.BRAVE_API_KEY);
      const related = res.results.filter((r: any) => {
        try { return isOfficialDomain(new URL(r.url).hostname); } catch { return false; }
      }).map((r: any) => ({ url: r.url, title: r.title }));
      return new Response(JSON.stringify({ related }), { headers: { "content-type": "application/json" } });
    }

    // Extract FX/fees from a doc URL
    if (request.method === "POST" && url.pathname === "/extract-fees") {
      if (!llmApiKey) return new Response(JSON.stringify({ error: "LLM key not configured" }), { status: 500, headers: { "content-type": "application/json" } });
      const body = await request.json().catch(() => ({}));
      const { docUrl, region } = body as { docUrl?: string; region?: string };
      if (!docUrl || !region) return new Response(JSON.stringify({ error: "docUrl and region are required" }), { status: 400, headers: { "content-type": "application/json" } });
      try { const h = new URL(docUrl).hostname; if (!isOfficialDomain(h)) throw new Error("not official"); } catch { return new Response(JSON.stringify({ error: "Only official domains allowed" }), { status: 400, headers: { "content-type": "application/json" } }); }
      const fees = await extractFeesFromDocInline(docUrl, region);
      return new Response(JSON.stringify(fees), { headers: { "content-type": "application/json" } });
    }

    // Extract designated merchants/MCCs
    if (request.method === "POST" && url.pathname === "/extract-merchants") {
      if (!llmApiKey) return new Response(JSON.stringify({ error: "LLM key not configured" }), { status: 500, headers: { "content-type": "application/json" } });
      const body = await request.json().catch(() => ({}));
      const { docUrl, region } = body as { docUrl?: string; region?: string };
      if (!docUrl || !region) return new Response(JSON.stringify({ error: "docUrl and region are required" }), { status: 400, headers: { "content-type": "application/json" } });
      try { const h = new URL(docUrl).hostname; if (!isOfficialDomain(h)) throw new Error("not official"); } catch { return new Response(JSON.stringify({ error: "Only official domains allowed" }), { status: 400, headers: { "content-type": "application/json" } }); }
      const merchants = await extractMerchantsInline(docUrl, region);
      return new Response(JSON.stringify(merchants), { headers: { "content-type": "application/json" } });
    }

    // Score a purchase
    if (request.method === "POST" && url.pathname === "/score-purchase") {
      const body = await request.json().catch(() => ({}));
      const { amount, currency, merchantName, channel, city, userCardIds } = body as any;
      if (typeof amount !== "number" || !currency || !Array.isArray(userCardIds)) {
        return new Response(JSON.stringify({ error: "amount(number), currency, userCardIds(array) are required" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      const result = await scorePurchaseInline({ amount, currency, merchantName, channel, city, userCardIds }, deps.publish);
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return new Response(renderLandingPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
