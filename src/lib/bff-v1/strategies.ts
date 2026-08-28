import * as seed from "@/mocks/seed";
import type { Strategy } from "./dto";
import { paths } from "./paths";
import { liveDetailOrSeed, liveListOrSeed } from "./domainReads";

export async function listStrategies(): Promise<Strategy[]> {
  return liveListOrSeed("strategies.list", paths.strategies(), seed.strategies);
}

export async function getStrategy(id: string): Promise<Strategy | undefined> {
  return liveDetailOrSeed("strategies.get", paths.strategy(id), seed.strategies.find((s) => s.id === id));
}

export const strategies = {
  list: listStrategies,
  get: getStrategy,
};
