import { processCardLink } from "./lib/processCardLink";
import { enrichDesignatedMerchantsFromHtml } from "./lib/enrichMerchants";
import { publishRules } from "./lib/publishRules";
import { fetchWithBrowser } from "./lib/fetchWithBrowser";
import type { CardRuleSet } from "./lib/types";
import type { ProcessCardLinkDependencies } from "./lib/processCardLink";
import type { SnapshotPutOptions } from "./lib/types";

export interface Env {
  SNAPSHOT_BUCKET: R2Bucket;
  RULESET_BUCKET: R2Bucket;
  RULESET_KV: KVNamespace;
  OPENAI_API_KEY?: string; // Optional: OpenAI or OpenRouter API key (set via wrangler secret put OPENAI_API_KEY)
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
    openaiApiKey: env.OPENAI_API_KEY, // Pass OpenAI API key if available
    hashIndexKV: env.HASH_TO_RULESET_KV,
  };
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
    if (request.method === "POST" && url.pathname === "/process-card-link") {
      const payload = await request.json();
      const { url: targetUrl, region } = payload as { url?: string; region?: string };
      if (!targetUrl || !region) {
        return new Response(JSON.stringify({ error: "url and region are required" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      
      // Debug logging
      console.log("[DEBUG] OPENAI_API_KEY present:", !!env.OPENAI_API_KEY);
      console.log("[DEBUG] OPENAI_API_KEY length:", env.OPENAI_API_KEY?.length || 0);
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

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return new Response(renderLandingPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
