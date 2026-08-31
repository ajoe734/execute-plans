import type { SearchResult } from "./dto";
import { paths } from "./paths";
import { liveItemsFrom, strictLiveRead } from "./domainReads";

export async function search(q: string): Promise<SearchResult[]> {
  return strictLiveRead(
    "search",
    { method: "GET", path: paths.search(), query: { q } },
    (body) => liveItemsFrom<SearchResult>(body).slice(0, 20),
  );
}
