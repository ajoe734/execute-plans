import type { RankingFormula } from "./dto";
import { paths } from "./paths";
import { detailPath, strictLiveDetailNormalized, strictLiveListNormalized } from "./domainReads";

export async function listRankingFormulas(): Promise<RankingFormula[]> {
  return strictLiveListNormalized("rankingFormulas.list", paths.rankingFormulas());
}

export async function getRankingFormula(id: string): Promise<RankingFormula | undefined> {
  return strictLiveDetailNormalized("rankingFormulas.get", detailPath(paths.rankingFormulas(), id));
}

export const rankingFormulas = {
  list: listRankingFormulas,
  get: getRankingFormula,
};
