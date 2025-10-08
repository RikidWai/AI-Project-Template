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

    return new Response("Not Found", { status: 404 });
  },
};
