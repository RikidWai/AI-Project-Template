var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-eXZYDL/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/lib/hash.ts
async function sha256(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");

// src/lib/fetchPerkPage.ts
async function fetchPerkPage(input, deps) {
  const response = await deps.fetch(input.url);
  const content = await response.text();
  const contentHash = await sha256(content);
  const snapshotKey = `snapshots/${input.region.toLowerCase()}/${contentHash}.html`;
  await deps.snapshotStore.put(snapshotKey, content, {
    metadata: {
      url: input.url,
      region: input.region
    },
    contentType: "text/html"
  });
  const fetchedAt = (deps.now ? deps.now() : /* @__PURE__ */ new Date()).toISOString();
  return {
    url: input.url,
    content,
    contentHash,
    snapshotKey,
    fetchedAt
  };
}
__name(fetchPerkPage, "fetchPerkPage");

// src/lib/extractPerkSchema.ts
var PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/;
var CURRENCY_RE = /(?:HK|US|SG|CA|AU)?\$\s*(\d+(?:\.\d+)?)/i;
var CARD_NAME_HINT_RE = /([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){1,5})\s+(?:Card|Visa|Mastercard|American Express)/;
function detectCurrency(text) {
  if (text.includes("HK$")) return "HKD";
  if (text.includes("SG$")) return "SGD";
  if (text.includes("US$")) return "USD";
  if (text.toUpperCase().includes("USD")) return "USD";
  return "USD";
}
__name(detectCurrency, "detectCurrency");
function extractCardName(content, url) {
  const titleMatch = content.match(/<title>(.*?)<\/title>/i);
  if (titleMatch) {
    const hint = CARD_NAME_HINT_RE.exec(titleMatch[1]);
    if (hint) {
      return hint[0];
    }
  }
  const headingMatch = content.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
  if (headingMatch) {
    const text = headingMatch[1].replace(/<[^>]+>/g, " ").trim();
    const hint = CARD_NAME_HINT_RE.exec(text);
    if (hint) {
      return hint[0];
    }
    if (/card/i.test(text)) {
      return text;
    }
  }
  return url.replace(/^https?:\/\//, "").split("/")[0];
}
__name(extractCardName, "extractCardName");
function sanitizeText(html) {
  return Array.from(html.matchAll(/<(?:p|li|h\d)[^>]*>(.*?)<\/\s*(?:p|li|h\d)>/gis)).map(
    (match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  ).filter((text) => text.length > 0);
}
__name(sanitizeText, "sanitizeText");
function categorize(line) {
  const lower = line.toLowerCase();
  if (/(dining|restaurant|food)/.test(lower)) return "dining";
  if (/(groc|supermarket)/.test(lower)) return "groceries";
  if (/(online|e-commerce|internet)/.test(lower)) return "online";
  if (/(travel|airline|hotel|flight)/.test(lower)) return "travel";
  if (/(gas|fuel|petrol)/.test(lower)) return "fuel";
  if (/(welcome|bonus)/.test(lower)) return "welcome-offer";
  return "general";
}
__name(categorize, "categorize");
function extractAnnualFee(lines) {
  for (const line of lines) {
    if (line.toLowerCase().includes("annual fee")) {
      const currency = CURRENCY_RE.exec(line);
      if (currency) return Number.parseFloat(currency[1]);
      const percent = PERCENT_RE.exec(line);
      if (percent) return Number.parseFloat(percent[1]);
    }
  }
  return null;
}
__name(extractAnnualFee, "extractAnnualFee");
function extractFxFee(lines) {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/(foreign transaction|fx fee|overseas transaction)/.test(lower)) {
      const percent = PERCENT_RE.exec(line);
      if (percent) return Number.parseFloat(percent[1]);
    }
  }
  return null;
}
__name(extractFxFee, "extractFxFee");
function extractPromotions(lines) {
  return lines.filter(
    (line) => /(limited time|bonus|promotion|offer|spend)/i.test(line)
  );
}
__name(extractPromotions, "extractPromotions");
function extractPerkSchema(page, region) {
  const lines = sanitizeText(page.content);
  const currency = detectCurrency(page.content);
  const cardName = extractCardName(page.content, page.url);
  const annualFee = extractAnnualFee(lines);
  const fxFee = extractFxFee(lines);
  const promotions = extractPromotions(lines);
  const rulesByCategory = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const percent = PERCENT_RE.exec(line);
    if (!percent) continue;
    const rate = Number.parseFloat(percent[1]);
    const category = categorize(line);
    const existing = rulesByCategory.get(category);
    if (!existing || rate > existing.rate) {
      rulesByCategory.set(category, {
        category,
        rate,
        description: line,
        unit: "%",
        source: page.url
      });
    }
  }
  const generalRule = rulesByCategory.get("general");
  const baseRate = generalRule ? generalRule.rate : rulesByCategory.size > 0 ? Math.min(...Array.from(rulesByCategory.values()).map((rule) => rule.rate)) : 0;
  return {
    cardName,
    region,
    currency,
    baseRate,
    rules: Array.from(rulesByCategory.values()),
    annualFee,
    fxFee,
    promotions,
    sourceUrl: page.url,
    contentHash: page.contentHash,
    fetchedAt: page.fetchedAt
  };
}
__name(extractPerkSchema, "extractPerkSchema");

// src/lib/publishRules.ts
function buildCardKey(cardName, region) {
  return `${cardName}-${region}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
__name(buildCardKey, "buildCardKey");
async function publishRules(ruleset, deps) {
  const cardKey = buildCardKey(ruleset.cardName, ruleset.region);
  const existingRaw = await deps.rulesetKV.get(cardKey);
  let nextVersion = 1;
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      nextVersion = Number.parseInt(parsed.version, 10) + 1;
    } catch (error) {
      nextVersion = 1;
    }
  }
  const version = `${nextVersion}`;
  const r2Key = `rulesets/${cardKey}/v${version}.json`;
  await deps.rulesetStore.put(r2Key, JSON.stringify(ruleset, null, 2), {
    contentType: "application/json"
  });
  const updatedAt = (deps.now ? deps.now() : /* @__PURE__ */ new Date()).toISOString();
  const kvValue = {
    version,
    r2Key,
    contentHash: ruleset.contentHash,
    updatedAt
  };
  await deps.rulesetKV.put(cardKey, JSON.stringify(kvValue));
  return {
    cardKey,
    version,
    r2Key,
    contentHash: ruleset.contentHash
  };
}
__name(publishRules, "publishRules");

// src/lib/validateRules.ts
var ALLOWED_CATEGORIES = /* @__PURE__ */ new Set([
  "general",
  "dining",
  "groceries",
  "online",
  "travel",
  "fuel",
  "welcome-offer"
]);
function validateRuleset(ruleset) {
  const issues = [];
  if (!ruleset.cardName || ruleset.cardName.length < 3) {
    issues.push({ field: "cardName", message: "Card name appears invalid" });
  }
  if (!ruleset.region) {
    issues.push({ field: "region", message: "Region is required" });
  }
  if (Number.isNaN(ruleset.baseRate) || ruleset.baseRate < 0) {
    issues.push({ field: "baseRate", message: "Base rate must be non-negative" });
  }
  const mappedCategories = [];
  for (const rule of ruleset.rules) {
    if (!ALLOWED_CATEGORIES.has(rule.category)) {
      issues.push({ field: `rules.${rule.category}`, message: "Unknown category" });
    } else {
      mappedCategories.push(rule.category);
    }
    if (rule.rate < 0) {
      issues.push({ field: `rules.${rule.category}`, message: "Rate must be non-negative" });
    }
  }
  if (ruleset.annualFee != null && ruleset.annualFee < 0) {
    issues.push({ field: "annualFee", message: "Annual fee cannot be negative" });
  }
  if (ruleset.fxFee != null && ruleset.fxFee < 0) {
    issues.push({ field: "fxFee", message: "FX fee cannot be negative" });
  }
  return {
    valid: issues.length === 0,
    issues,
    mappedCategories
  };
}
__name(validateRuleset, "validateRuleset");

// src/lib/processCardLink.ts
async function processCardLink(url, region, deps) {
  const fetched = await fetchPerkPage({ url, region }, deps.fetch);
  const ruleset = extractPerkSchema(fetched, region);
  const validation = validateRuleset(ruleset);
  if (!validation.valid) {
    return {
      status: "needs_review",
      ruleset,
      validation
    };
  }
  const publishResult = await publishRules(ruleset, deps.publish);
  return {
    status: "published",
    ruleset,
    validation,
    publishResult
  };
}
__name(processCardLink, "processCardLink");

// src/index.ts
function buildDependencies(env) {
  return {
    fetch: {
      fetch: /* @__PURE__ */ __name((url) => fetch(url), "fetch"),
      snapshotStore: {
        async put(key, value, options) {
          await env.SNAPSHOT_BUCKET.put(key, value, {
            customMetadata: options?.metadata,
            httpMetadata: options?.contentType ? { contentType: options.contentType } : void 0
          });
        }
      }
    },
    publish: {
      rulesetStore: {
        async put(key, value, options) {
          await env.RULESET_BUCKET.put(key, value, {
            httpMetadata: options?.contentType ? { contentType: options.contentType } : void 0
          });
        }
      },
      rulesetKV: {
        put: /* @__PURE__ */ __name((key, value) => env.RULESET_KV.put(key, value), "put"),
        get: /* @__PURE__ */ __name((key) => env.RULESET_KV.get(key), "get")
      }
    }
  };
}
__name(buildDependencies, "buildDependencies");
function renderLandingPage() {
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
          <span aria-hidden="true">\u279C</span>
        </button>
        <button class="secondary" type="button" id="reset-button">Reset</button>
      </div>
    </form>
    <section id="result-section" class="result hidden" aria-live="polite"></section>
    <script>
      const form = document.getElementById("card-form");
      const urlInput = document.getElementById("card-url");
      const regionSelect = document.getElementById("card-region");
      const resultSection = document.getElementById("result-section");
      const submitButton = document.getElementById("submit-button");
      const resetButton = document.getElementById("reset-button");

      function setLoading(isLoading) {
        submitButton.disabled = isLoading;
        submitButton.querySelector("span").textContent = isLoading ? "Processing" : "Process";
      }

      function displayResult(content, isError = false) {
        resultSection.textContent = content;
        resultSection.classList.toggle("hidden", false);
        resultSection.style.background = isError ? "#b91c1c" : "rgba(15, 23, 42, 0.9)";
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) {
          return;
        }

        setLoading(true);
        displayResult("Processing card link\u2026");

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
          displayResult(JSON.stringify(payload, null, 2));
        } catch (error) {
          displayResult(error instanceof Error ? error.message : "Unexpected error", true);
        } finally {
          setLoading(false);
        }
      });

      resetButton.addEventListener("click", () => {
        form.reset();
        resultSection.classList.add("hidden");
      });
    <\/script>
  </body>
</html>`;
}
__name(renderLandingPage, "renderLandingPage");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/process-card-link") {
      const payload = await request.json();
      const { url: targetUrl, region } = payload;
      if (!targetUrl || !region) {
        return new Response(JSON.stringify({ error: "url and region are required" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      const deps = buildDependencies(env);
      const result = await processCardLink(targetUrl, region, deps);
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" }
      });
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return new Response(renderLandingPage(), {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    return new Response("Not Found", { status: 404 });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-eXZYDL/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-eXZYDL/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
