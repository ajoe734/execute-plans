// Q16 — v5 mock list response. Deterministic exact counts; isolated adapter so it
// can be replaced by Pack D D22 pagination contract later.

export interface V5ListResponse<T> {
  items: T[];
  totalCount: number;
  /** Always true in v5 mock. Backend may flip to false when D22 adopts windowed counts. */
  totalCountExact: true;
}

export function v5List<T>(items: T[]): V5ListResponse<T> {
  return { items, totalCount: items.length, totalCountExact: true };
}
