import { sha256 } from "./hash";
import type { FetchPerkPageInput, FetchedPage, SnapshotStore } from "./types";

export interface FetchDependencies {
  fetch: (url: string) => Promise<{ text(): Promise<string> }>;
  snapshotStore: SnapshotStore;
  now?: () => Date;
}

export async function fetchPerkPage(
  input: FetchPerkPageInput,
  deps: FetchDependencies,
): Promise<FetchedPage> {
  const response = await deps.fetch(input.url);
  const content = await response.text();
  const contentHash = await sha256(content);
  const snapshotKey = `snapshots/${input.region.toLowerCase()}/${contentHash}.html`;
  await deps.snapshotStore.put(snapshotKey, content, {
    metadata: {
      url: input.url,
      region: input.region,
    },
    contentType: "text/html",
  });

  const fetchedAt = (deps.now ? deps.now() : new Date()).toISOString();
  return {
    url: input.url,
    content,
    contentHash,
    snapshotKey,
    fetchedAt,
  };
}
