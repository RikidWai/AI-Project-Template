import { processCardLink } from "./lib/processCardLink";
import type { ProcessCardLinkDependencies } from "./lib/processCardLink";
import type { SnapshotPutOptions } from "./lib/types";

export interface Env {
  SNAPSHOT_BUCKET: R2Bucket;
  RULESET_BUCKET: R2Bucket;
  RULESET_KV: KVNamespace;
}

function buildDependencies(env: Env): ProcessCardLinkDependencies {
  return {
    fetch: {
      fetch: (url: string) => fetch(url),
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
      },
      rulesetKV: {
        put: (key: string, value: string) => env.RULESET_KV.put(key, value),
        get: (key: string) => env.RULESET_KV.get(key),
      },
    },
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
    </script>
  </body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/process-card-link") {
      const payload = await request.json();
      const { url: targetUrl, region } = payload as { url?: string; region?: string };
      if (!targetUrl || !region) {
        return new Response(JSON.stringify({ error: "url and region are required" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const deps = buildDependencies(env);
      const result = await processCardLink(targetUrl, region, deps);
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
