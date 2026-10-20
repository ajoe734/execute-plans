import type { SearchResult } from "./dto";
import { paths } from "./paths";
import { liveItemsFrom, strictLiveRead } from "./domainReads";

const SEARCH_TYPE_MAP: Record<string, SearchResult["type"]> = {
  strategy: "Strategy",
  persona: "Persona",
  capitalpool: "CapitalPool",
  rankingformula: "RankingFormula",
  rebalance: "Rebalance",
  deployment: "Deployment",
  researchexperiment: "ResearchExperiment",
  experiment: "Experiment",
  artifact: "Artifact",
  loop: "Loop",
  oversight: "Oversight",
};

export async function search(q: string): Promise<SearchResult[]> {
  return strictLiveRead(
    "search",
    { method: "GET", path: paths.search(), query: { q } },
    (body) => liveItemsFrom<SearchResult>(body).slice(0, 20).map((item) => {
      const mapped = SEARCH_TYPE_MAP[String(item.type ?? "").replace(/_/g, "").toLowerCase()];
      return mapped ? { ...item, type: mapped } : item;
    }),
  );
}
