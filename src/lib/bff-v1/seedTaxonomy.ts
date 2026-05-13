import taxonomyJson from "./seed-taxonomy.json";

export type SeedHelperCategory = "live_required" | "mock_only_dev" | "deprecated" | "deferred";

export interface SeedTaxonomyEntry {
  name: string;
  category: SeedHelperCategory;
  seed_source?: string;
  live_routes?: string[];
  replacement?: string;
  follow_up_tasks?: string[];
  priority?: string;
  notes?: string;
}

export type SeedHelperLiveBehavior = "live_required" | "disabled" | "empty_state" | "legacy_mock";

interface SeedTaxonomyDocument {
  schema_version: number;
  helpers: SeedTaxonomyEntry[];
}

const taxonomy = taxonomyJson as SeedTaxonomyDocument;
const helperByName = new Map(taxonomy.helpers.map((helper) => [helper.name, helper]));

function readEnv(): Record<string, string | undefined> {
  const viteEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  return { ...viteEnv, ...nodeEnv };
}

export function isLiveBffModeConfigured(): boolean {
  const env = readEnv();
  if (env.MODE === "test" || env.NODE_ENV === "test") return false;
  return env.VITE_BFF_MODE === "live";
}

export function getSeedTaxonomyEntry(helperName: string): SeedTaxonomyEntry | undefined {
  return helperByName.get(helperName);
}

export function getSeedHelperCategory(helperName: string): SeedHelperCategory | undefined {
  return getSeedTaxonomyEntry(helperName)?.category;
}

export function getSeedHelperLiveBehavior(helperName: string): SeedHelperLiveBehavior {
  const category = getSeedHelperCategory(helperName);
  if (category === "mock_only_dev") return "disabled";
  if (category === "deferred") return "empty_state";
  if (category === "deprecated") return "legacy_mock";
  return "live_required";
}

export function seedHelperUsesMockDataInLive(helperName: string): boolean {
  const behavior = getSeedHelperLiveBehavior(helperName);
  return behavior === "disabled" || behavior === "empty_state" || behavior === "legacy_mock";
}

export function seedHelperMustReturnEmptyInLive(helperName: string): boolean {
  if (!isLiveBffModeConfigured()) return false;
  const behavior = getSeedHelperLiveBehavior(helperName);
  return behavior === "disabled" || behavior === "empty_state";
}

export function seedHelperEmptyReason(helperName: string): string {
  const entry = getSeedTaxonomyEntry(helperName);
  if (!entry) return "No seed taxonomy entry is registered for this helper.";
  if (entry.category === "mock_only_dev") {
    return "Development-only helper disabled while VITE_BFF_MODE=live.";
  }
  if (entry.category === "deferred") {
    const followUp = entry.follow_up_tasks?.join(", ");
    return followUp
      ? `Live route deferred; waiting for ${followUp}.`
      : "Live route deferred; seed data is hidden in live mode.";
  }
  if (entry.category === "deprecated") {
    return entry.replacement ?? "Deprecated seed helper still awaits command/client migration.";
  }
  return "Live-required helper; seed fallback is not labeled as helper-owned mock data.";
}
