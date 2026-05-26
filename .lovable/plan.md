## 根因

`supabase/functions/management-agent/index.ts` 的 `bffGet()` 和所有 BFF `fetch()` 完全沒帶 `Authorization` / `X-Tenant-Id` header，所以 dev BFF 回 401。錯誤被 tool 回傳給 LLM，LLM 老實複述「401 授權錯誤」。

## 變更

### 1. Edge function — 注入 BFF auth（前端優先、secret fallback）

`supabase/functions/management-agent/index.ts`:

- 在 POST handler 從 request body 讀 `bffAuth: { token?, tenantId? }`（前端傳）。
- Fallback：`Deno.env.get("PANTHEON_BFF_DEV_BEARER_TOKEN")` + `PANTHEON_BFF_TENANT_ID`。
- 新增 `bffHeaders(auth, mutation)` helper → 一律加 `Authorization: Bearer <token>`、`X-Tenant-Id`、`X-Correlation-Id`、`X-BFF-Api-Version: 2026-05-07`，mutation 再加 `Content-Type` + `Idempotency-Key`。
- 改 `bffGet(path, auth)` 與其他 8 個 `fetch(${BFF_BASE_URL}...)` 一律走 `bffHeaders`。
- tool error envelope 正規化：所有 BFF call 失敗 → 回 `{ ok: false, status, code, correlationId, message }`，不要把整段錯誤丟給模型解釋。

新增 secret：`PANTHEON_BFF_DEV_BEARER_TOKEN`（值 = `pantheon-dev-browser:reviewer`，與 `.env` `VITE_BFF_DEV_BEARER_TOKEN` 一致）。

### 2. 前端 — 把 token 傳給 edge function

`src/management/components/agent/AgentPanelBody.tsx`:

- 從 `@/lib/bff-v1/headers` 匯出的 `readBrowserAuthStorage()` + `VITE_BFF_DEV_BEARER_TOKEN` env 取得 `{ token, tenantId }`。
- `DefaultChatTransport` body 加上 `bffAuth: { token, tenantId }`（與現有 `mode` 並列）。

### 3. 前端 — 紅字錯誤卡，停止 LLM 解釋

`AgentPanelBody.tsx` tool rendering：

- 偵測 tool output `ok === false`（或 `status >= 400`）→ 渲染 `<ToolErrorCard>`：紅色邊框 + `AlertCircle` icon + 狀態碼 + i18nKey/message + `correlationId`（小字可複製）+ 「重試」按鈕（重新 invoke 同 tool args）。
- system prompt 增補一段："**When a tool returns `ok:false`, DO NOT narrate the error to the user. Output exactly one short line: `工具呼叫失敗，請見上方錯誤卡。` Then stop.**"
- text 重複偵測（先前修的）保留。

### 4. 文件

更新 `.lovable/plan.md` 記錄這次修補；無 spec 變更。

## 驗收

1. 切到 `confirm` 模式，問「啟動循環」→ `query_persona_league` 等工具回 200（network 看 edge function logs 確認帶了 Authorization）。
2. 故意把 secret 設錯 → tool 回 401 → UI 顯示紅字錯誤卡（含 correlationId），LLM 只說「工具呼叫失敗，請見上方錯誤卡」。
3. 真實 OIDC 接上後，前端 token 自動覆蓋 secret fallback，無需改 edge function。

## Out of scope

- BFF 本身的 mock-token 驗證邏輯
- 未來真正 OIDC token 的 refresh / silent renew（仍由 `useMe` + 401 interceptor 處理）
- Floating agent window UI 改版