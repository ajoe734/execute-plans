// v4 / Pack C §C024–C026 — Cursor pagination + filter/sort.

export interface ListRequest {
  cursor?: string;
  pageSize?: number;
  /** e.g. "updatedAt,-riskLevel" */
  sort?: string;
  filter?: Record<string, string | string[]>;
}

export interface PageInfo {
  nextCursor?: string;
  hasNextPage: boolean;
  pageSize: number;
}

export interface ListResponse<T> {
  data: T[];
  pageInfo: PageInfo;
}

export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 200;

export function clampPageSize(n: number | undefined): number {
  if (!n || n <= 0) return PAGE_SIZE_DEFAULT;
  return Math.min(n, PAGE_SIZE_MAX);
}

export interface SortClause { field: string; direction: "asc" | "desc" }
export function parseSort(sort?: string): SortClause[] {
  if (!sort) return [];
  return sort.split(",").map((tok) => tok.startsWith("-")
    ? { field: tok.slice(1), direction: "desc" as const }
    : { field: tok, direction: "asc" as const });
}

export function buildFilterQuery(filter?: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!filter) return out;
  for (const [k, v] of Object.entries(filter)) {
    out[`filter[${k}]`] = Array.isArray(v) ? v.join(",") : v;
  }
  return out;
}
