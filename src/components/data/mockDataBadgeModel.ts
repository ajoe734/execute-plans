import {
  getLiveStatusSnapshot,
  type LiveStatusSnapshot,
} from "@/lib/bff/liveTransport";
import {
  getSeedHelperLiveBehavior,
  getSeedTaxonomyEntry,
  seedHelperEmptyReason,
  type SeedHelperCategory,
  type SeedHelperLiveBehavior,
} from "@/lib/bff-v1/seedTaxonomy";

export interface MockDataBadgeModel {
  helperName: string;
  category: SeedHelperCategory;
  behavior: SeedHelperLiveBehavior;
  label: string;
  title: string;
  description: string;
  tone: "warning" | "blocked" | "muted";
}

function isLiveConfigured(snapshot: LiveStatusSnapshot): boolean {
  return snapshot.configuredMode !== "mock";
}

export function getMockDataBadgeModel(
  helperName: string,
  snapshot: LiveStatusSnapshot = getLiveStatusSnapshot(),
): MockDataBadgeModel | null {
  if (!isLiveConfigured(snapshot)) return null;

  const entry = getSeedTaxonomyEntry(helperName);
  if (!entry || entry.category === "live_required") return null;

  const behavior = getSeedHelperLiveBehavior(helperName);
  const description = seedHelperEmptyReason(helperName);

  if (behavior === "disabled") {
    return {
      helperName,
      category: entry.category,
      behavior,
      label: "mock data disabled",
      title: "Mock-only helper disabled",
      description,
      tone: "blocked",
    };
  }

  if (behavior === "empty_state") {
    return {
      helperName,
      category: entry.category,
      behavior,
      label: "mock data hidden",
      title: "Live data not wired",
      description,
      tone: "warning",
    };
  }

  return {
    helperName,
    category: entry.category,
    behavior,
    label: "legacy mock data",
    title: "Legacy mock helper",
    description,
    tone: "muted",
  };
}
