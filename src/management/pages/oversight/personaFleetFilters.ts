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

export interface PersonaFleetViewFilters {
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
    return { q: focus, purpose: "all", dataScope: "all", archived: "include", pageSize: PERSONA_FLEET_PAGE_SIZE };
  }
  const archived: ManagementPersonaFleetArchived = filters.archived ? "only" : "exclude";
  return {
    q: filters.q || undefined,
    purpose: "trading",
    dataScope: filters.dataScope,
    archived,
    pageSize: PERSONA_FLEET_PAGE_SIZE,
    pageToken,
  };
}
