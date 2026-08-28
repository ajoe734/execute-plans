import * as seed from "@/mocks/seed";
import type { RankingFormula } from "./dto";
import { paths } from "./paths";
import { detailPath, liveDetailOrSeedNormalized, liveListOrSeedNormalized } from "./domainReads";

export async function listRankingFormulas(): Promise<RankingFormula[]> {
  return liveListOrSeedNormalized("rankingFormulas.list", paths.rankingFormulas(), seed.rankingFormulas);
}

export async function getRankingFormula(id: string): Promise<RankingFormula | undefined> {
  return liveDetailOrSeedNormalized("rankingFormulas.get", detailPath(paths.rankingFormulas(), id), seed.rankingFormulas.find((s) => s.id === id));
}

export const rankingFormulas = {
  list: listRankingFormulas,
  get: getRankingFormula,
};
