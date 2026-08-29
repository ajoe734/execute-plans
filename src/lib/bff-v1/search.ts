import * as seed from "@/mocks/seed";
import type { SearchResult } from "./dto";
import { paths } from "./paths";
import {
  delay,
  isLiveBffModeConfigured,
  liveItemsFrom,
  strictLiveRead,
} from "./domainReads";

export async function search(q: string): Promise<SearchResult[]> {
  if (isLiveBffModeConfigured()) {
    return strictLiveRead(
      "search",
      { method: "GET", path: paths.search(), query: { q } },
      (body) => liveItemsFrom<SearchResult>(body).slice(0, 20),
    );
  }
  const all = seed.searchableObjects() as SearchResult[];
  if (!q) return delay(all.slice(0, 8));
  const ql = q.toLowerCase();
  return delay(all.filter((o) => o.name.toLowerCase().includes(ql) || o.type.toLowerCase().includes(ql)).slice(0, 20));
}
