import type {
  ManagementPersonaFleetArchived,
  ManagementPersonaFleetDataScope,
  ManagementPersonaFleetQuery,
  ManagementPersonaFleetRow,
} from "@/lib/bff-v1/management";

/** Server-owned classification only: names, ids and capital mode are never inspected here. */
export function isNonProductionPersonaFleetRow(row: ManagementPersonaFleetRow): boolean {
  return row.dataScope === "test";
}

export function productionPersonaFleetRows(rows: ManagementPersonaFleetRow[]): ManagementPersonaFleetRow[] {
  return rows.filter((row) => row.personaPurpose !== "advisory_assistant" && !isNonProductionPersonaFleetRow(row));
}

export type PersonaFleetDataFilter = ManagementPersonaFleetDataScope;

export const PERSONA_FLEET_PAGE_SIZE = 20;

/** Normal fleet is trading-only; `unknown` is the explicit path to provenance-free legacy records. */
export type PersonaFleetPurposeFilter = "trading" | "unknown";

export interface PersonaFleetViewFilters {
  purpose: PersonaFleetPurposeFilter;
  dataScope: PersonaFleetDataFilter;
  archived: boolean;
  q: string;
}

const DATA_FILTERS: readonly PersonaFleetDataFilter[] = ["regular", "test", "unknown"];

/**
 * Explicit legacy mapping for bookmarks: `?tab=production` -> regular data,
 * `?tab=non-production` -> test data. New links use `?data=`.
 */
export function personaFleetDataFilterFromParams(params: URLSearchParams): PersonaFleetDataFilter {
  const data = params.get("data")?.trim().toLowerCase();
  if (data && (DATA_FILTERS as readonly string[]).includes(data)) return data as PersonaFleetDataFilter;
  const tab = params.get("tab")?.trim().toLowerCase();
  if (tab === "non-production" || tab === "nonproduction") return "test";
  return "regular";
}

export function personaFleetPurposeFromParams(params: URLSearchParams): PersonaFleetPurposeFilter {
  return params.get("purpose")?.trim().toLowerCase() === "unknown" ? "unknown" : "trading";
}

export function personaFleetArchivedFromParams(params: URLSearchParams): boolean {
  const value = (params.get("archived") ?? params.get("scope"))?.trim().toLowerCase();
  return value === "only" || value === "archived" || value === "1" || value === "true";
}

/**
 * A focused persona link locates the exact authorized record regardless of the
 * list filters: all purposes, data scopes and archive state, matched by id.
 */
export function personaFleetQuery(
  filters: PersonaFleetViewFilters,
  focus: string,
  pageToken: string | undefined,
): ManagementPersonaFleetQuery {
  if (focus) {
    return { q: focus, purpose: "all", dataScope: "all", archived: "include", pageSize: PERSONA_FLEET_PAGE_SIZE, pageToken };
  }
  const archived: ManagementPersonaFleetArchived = filters.archived ? "only" : "exclude";
  return personaFleetScopedQuery(filters, archived, pageToken, PERSONA_FLEET_PAGE_SIZE);
}

/** Same filters with an explicit archive state; used for the scoped archived count (page size 1, no row enrichment needed). */
export function personaFleetScopedQuery(
  filters: PersonaFleetViewFilters,
  archived: ManagementPersonaFleetArchived,
  pageToken: string | undefined,
  pageSize: number,
): ManagementPersonaFleetQuery {
  return {
    q: filters.q || undefined,
    purpose: filters.purpose,
    dataScope: filters.dataScope,
    archived,
    pageSize,
    pageToken,
  };
}
