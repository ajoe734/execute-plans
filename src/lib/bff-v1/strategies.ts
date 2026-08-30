import type { Strategy } from "./dto";
import { paths } from "./paths";
import { strictLiveDetail, strictLiveList } from "./domainReads";

export async function listStrategies(): Promise<Strategy[]> {
  return strictLiveList("strategies.list", paths.strategies());
}

export async function getStrategy(id: string): Promise<Strategy | undefined> {
  return strictLiveDetail("strategies.get", paths.strategy(id));
}

export const strategies = {
  list: listStrategies,
  get: getStrategy,
};

