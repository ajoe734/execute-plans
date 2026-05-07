// Pack D D17 + D22 — Canonical ListResponse envelope (Batch III).
// Source: .lovable/spec/v4/pack-d/Pantheon_Pack_D_BFF_API_Contract.md
//
// Differs from src/lib/v4/pagination.ts (Pack C §C024) by carrying:
//   - cursor.next / cursor.prev as a single object
//   - pageSize echo
//   - estimatedTotal? + totalCountExact discriminator
//   - 15-minute cursor TTL with CURSOR_EXPIRED / CURSOR_INVALID error codes
//
// Pack C envelope is preserved for back-compat; new endpoints SHOULD adopt
// `ListResponseV2`. Adapter `fromPackCEnvelope` provided for migration.

import type { ListResponse as ListResponseV1, PageInfo } from "./pagination";

export type CursorErrorCode = "CURSOR_EXPIRED" | "CURSOR_INVALID";

export interface CursorEnvelope {
  next?: string;
  prev?: string;
}

export interface ListResponseV2<T> {
  items: T[];
  cursor: CursorEnvelope;
  pageSize: number;
  estimatedTotal?: number;
  totalCountExact: boolean;
}

export const CURSOR_TTL_MS = 15 * 60 * 1000;

interface CursorRecord {
  offset: number;
  filterHash?: string;
  createdAt: number;
}

const cursorStore = new Map<string, CursorRecord>();
let cursorSeq = 0;

function gcCursors(now: number) {
  for (const [key, rec] of cursorStore) {
    if (now - rec.createdAt > CURSOR_TTL_MS) cursorStore.delete(key);
  }
}

export function issueCursor(offset: number, filterHash?: string): string {
  const now = Date.now();
  gcCursors(now);
  const id = `cur_${now.toString(36)}_${(++cursorSeq).toString(36)}`;
  cursorStore.set(id, { offset, filterHash, createdAt: now });
  return id;
}

export type CursorReadResult =
  | { ok: true; offset: number }
  | { ok: false; code: CursorErrorCode };

export function readCursor(token: string | undefined, expectedFilterHash?: string): CursorReadResult {
  if (!token) return { ok: true, offset: 0 };
  const rec = cursorStore.get(token);
  if (!rec) return { ok: false, code: "CURSOR_EXPIRED" };
  if (Date.now() - rec.createdAt > CURSOR_TTL_MS) {
    cursorStore.delete(token);
    return { ok: false, code: "CURSOR_EXPIRED" };
  }
  if (expectedFilterHash && rec.filterHash && rec.filterHash !== expectedFilterHash) {
    return { ok: false, code: "CURSOR_INVALID" };
  }
  return { ok: true, offset: rec.offset };
}

export function clearCursorStore(): void {
  cursorStore.clear();
  cursorSeq = 0;
}

export interface PaginateOptions {
  cursor?: string;
  pageSize?: number;
  filterHash?: string;
  /** When true (mock seed), report exact total; when false (audit/SSE feeds), set false. */
  exact?: boolean;
}

export type PaginateResult<T> =
  | { ok: true; envelope: ListResponseV2<T> }
  | { ok: false; code: CursorErrorCode };

export function paginate<T>(items: readonly T[], opts: PaginateOptions = {}): PaginateResult<T> {
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 50, 200));
  const exact = opts.exact !== false;
  const read = readCursor(opts.cursor, opts.filterHash);
  if (read.ok !== true) {
    return { ok: false, code: read.code };
  }
  const start = read.offset;
  const end = Math.min(start + pageSize, items.length);
  const slice = items.slice(start, end);
  const cursor: CursorEnvelope = {};
  if (end < items.length) cursor.next = issueCursor(end, opts.filterHash);
  if (start > 0) cursor.prev = issueCursor(Math.max(0, start - pageSize), opts.filterHash);
  return {
    ok: true,
    envelope: {
      items: slice,
      cursor,
      pageSize,
      estimatedTotal: exact ? items.length : undefined,
      totalCountExact: exact,
    },
  };
}

/** Adapter: wrap legacy Pack C ListResponse<T> into a Pack D ListResponseV2<T>. */
export function fromPackCEnvelope<T>(v1: ListResponseV1<T>, exact = true): ListResponseV2<T> {
  const info: PageInfo = v1.pageInfo;
  return {
    items: v1.data,
    cursor: { next: info.nextCursor },
    pageSize: info.pageSize,
    estimatedTotal: exact ? v1.data.length : undefined,
    totalCountExact: exact,
  };
}
