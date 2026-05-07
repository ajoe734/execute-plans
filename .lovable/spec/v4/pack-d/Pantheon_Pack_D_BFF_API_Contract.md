# Pantheon Pack D-C — BFF API Contract / Error / Pagination / Filtering

**版本**：Pack-D-2026-05-06 / Sub-pack D-C
**對應 Audit D**：D17–D25（9 條）
**狀態**：Canonical
**重要**：所有 BFF endpoint 須遵守本契約；現有 `withOverlay` / mock 適配器需逐步收斂。

---

## D17 — Cursor 失效 fallback

```ts
type CursorErrorCode = "CURSOR_EXPIRED" | "CURSOR_INVALID";
```

**Cursor TTL**：15 minutes default。

**UI fallback**：
1. 顯示 toast「列表游標已失效，已重新載入」。
2. 保留 filter / sort。
3. 清空 cursor，重抓第一頁。
4. 若 multi-select 進行中，清除 selection 並提示。

---

## D18 — Filter Operator Grammar

```text
filter[field][op]=value
```

**Allowed ops**：`eq, ne, in, nin, gt, gte, lt, lte, contains, startsWith, between, exists`

**Example**：
```text
/bff/strategies?filter[risk][in]=high,critical&filter[updatedAt][gte]=2026-05-01T00:00:00Z
```

---

## D19 — Sort

```text
sort=field,-updatedAt,name
```

1. 無 prefix = asc。
2. `-` prefix = desc。
3. null default last。
4. Override：`sort=field:asc:nullsFirst`。

---

## D20 — ErrorDetails Discriminated Union

```ts
type ErrorDetails =
  | { kind: "validation"; fields: Record<string, string[]> }
  | { kind: "state_conflict"; expectedVersion?: number; actualVersion?: number }
  | { kind: "permission"; missingCapabilities: string[] }
  | { kind: "cursor"; cursorError: "CURSOR_EXPIRED" | "CURSOR_INVALID" }
  | { kind: "rate_limit"; retryAfterSec: number }
  | { kind: "transition"; from: string; action: string; allowedActions: string[] }
  | { kind: "idempotency"; idempotencyKey: string; replayed: boolean };
```

---

## D21 — ErrorCode Master

```text
VALIDATION_FAILED
AUTH_REQUIRED
TOKEN_EXPIRED
REFRESH_FAILED
PERMISSION_DENIED
CAPABILITY_MISSING
TENANT_SCOPE_MISMATCH
FEATURE_DISABLED
STATE_CONFLICT
ILLEGAL_TRANSITION
CONFIRM_TOKEN_REQUIRED
CONFIRM_TOKEN_EXPIRED
CONFIRM_TOKEN_REUSED
CONFIRM_TOKEN_BINDING_MISMATCH
TWO_MAN_REQUIRED
COOLDOWN_ACTIVE
CURSOR_EXPIRED
CURSOR_INVALID
RATE_LIMITED
IDEMPOTENCY_CONFLICT
BACKEND_UNAVAILABLE
SSE_REPLAY_UNAVAILABLE
UNKNOWN_ERROR
```

i18n：`errors.<ErrorCode>`。

---

## D22 — ListResponse Envelope（Blocker）

```ts
type ListResponse<T> = {
  items: T[];
  cursor: { next?: string; prev?: string };
  pageSize: number;
  estimatedTotal?: number;
  totalCountExact: boolean;
};
```

| List 類型 | totalCountExact |
|---|---|
| entity registry lists | true |
| governance queue | true |
| loop runs | true（mock；backend 可 exact） |
| audit feed | false / estimated |
| realtime event feed | false / optional |
| infinite notification feed | false / optional |

---

## D23 — BulkActionResponse

```ts
type BulkActionResponse<T> = {
  ok: boolean;
  partial: boolean;
  summary: { requested: number; succeeded: number; failed: number };
  results: Array<{
    id: string;
    ok: boolean;
    data?: T;
    error?: BffErrorPayload;
  }>;
};
```

HTTP：207 Multi-Status preferred；若 proxy 不支援可 200，但 envelope.partial 必須 true。

---

## D24 — Attachment Policy

```ts
type AttachmentPolicy = {
  maxSizeMb: number;
  allowedMimeTypes: string[];
  scanRequired: boolean;
};
```

| Type | Max | Mime |
|---|---:|---|
| image | 10MB | image/png, image/jpeg, image/webp |
| document | 25MB | application/pdf, text/plain, text/csv |
| artifact metadata | 100MB | application/json, text/csv |
| model/container artifact | pre-signed only | backend-specific |

Scan：`pending_scan → clean → rejected`。

---

## D25 — Rate Limit Headers

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
Retry-After
X-RateLimit-Scope
```

UI：remaining < 10% 顯示 warning；429 顯示 retryAfter countdown。

---

## 落地階段建議

- Batch II：D20 ErrorDetails / D21 ErrorCode 集中至 `src/lib/v4/errors.ts`
- Batch III（需 BFF）：D17/D22 cursor + envelope；D18/D19 query string 解析；D23/D24/D25
