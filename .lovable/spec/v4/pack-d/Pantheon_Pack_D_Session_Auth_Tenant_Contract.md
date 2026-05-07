# Pantheon Pack D-G — Session / Auth / Tenant / i18n / Time Contract

**版本**：Pack-D-2026-05-06 / Sub-pack D-G
**對應 Audit D**：D51–D59（9 條）
**狀態**：Canonical
**重要**：`/bff/me` 為 frontend 啟動 session 唯一 DTO；不得拆散查詢。

---

## D51 + D59 — MeResponse DTO（Blocker）

```ts
type MeResponse = {
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  };
  tenant: {
    id: string;
    name: string;
    tz: string;
    locale: string;
    baseCurrency?: string;
  };
  roles: Role[];
  capabilities: Capability[];
  env: "dev" | "staging" | "prod";
  featureFlags: Record<string, boolean>;
  serverTime: string;          // ISO UTC, used for clock offset
  sessionExpiresAt: string;    // ISO UTC
  permissionsVersion: string;  // 變更觸發強制 refetch
};
```

**Cache**：
- in-memory TTL = 30s
- `visibilitychange` 若 >30s 則 refresh
- 收到 403 / permission change event → force refresh

---

## D52 — 401 / Refresh

```text
1. 401 → 嘗試 silent refresh 一次。
2. retry original request 一次。
3. 若仍 401 → clear session + redirect login。
4. concurrent 401 共用同一 refresh promise。
5. 永不 infinite retry。
```

---

## D53 — Tenant Scope Priority

```text
1. explicit route tenant param / subdomain（須授權）
2. session selected tenant
3. token default tenant
4. ambiguous → backend deny
```

BFF 必送 `X-Tenant-Id` header。UI 不得偽造未授權 tenant scope。

---

## D54 — Logout Cache Invalidate

**清除**：
```text
react-query cache
bff in-memory cache
v5ActionOverlay
SSE connection
permission cache
confirm token store
current user / session
```

**保留**：
```text
非敏感 UI prefs：theme, locale（若 user 已選）
```

---

## D55 — Locale Priority

```text
user preference
→ tenant default
→ browser language
→ zh-TW（current build default）
```

---

## D56 — Locale Fallback Chain

```text
resolvedLocale
→ language family
→ tenant.locale
→ zh-TW
→ en-US
```

**Mapping**：
```text
zh-Hant → zh-TW
zh      → zh-TW
en      → en-US
```

---

## D57 — UI Time Zone

```text
user.tz → tenant.tz → browser tz → UTC
```

所有 audit timestamps 儲存 UTC ISO。

---

## D58 — Numeric / Currency Format

- 數字格式綁 `resolvedLocale`。
- Currency code from entity / `tenant.baseCurrency`。

---

## 落地階段建議

- Batch II（可獨立）：建立 `src/lib/v4/session/me.ts` mock MeResponse + `useMeQuery` hook（30s cache）；i18n locale fallback 函式。
- Batch III（需 BFF）：實際 `/bff/me` endpoint、401 refresh interceptor、`X-Tenant-Id` 注入。
- 即刻可做：將散落 `currentUser` / `mockUser` 收斂至 `useMe()` 單一來源。
