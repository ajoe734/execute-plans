# Management AI runtime repoint plan

## Reality check (please confirm before I build)

I read the repo and the directive does not fully match what is actually wired. Please confirm the intent so I don't tear out the wrong path.

1. **Management AI 目前不走 Agora Ask。** `src/management/components/agent/AgentPanelBody.tsx` 使用 `@ai-sdk/react` 的 `useChat` + `DefaultChatTransport`，URL 是 `https://${VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/management-agent`，那支 Supabase Edge Function 內部呼叫 `https://ai.gateway.lovable.dev/v1`（`google/gemini-3-flash-preview`）。**這才是「Lovable AI sandbox runtime」**。
2. 搜尋全 src/：**沒有任何 Management AI code 引用** `/bff/agora/ask`、`postAsk`、`openAskSse`、`getAskSession`、`src/lib/bff/agora.ts`。`paths.agoraAsk()` 也不存在（只有 `agoraAskSessions` / `agoraAskSession`，給真正的 Agora UI 使用）。
3. 目錄是 `scripts/`，沒有 `execute-plans/scripts/`。`.lovable/preview-strict.env`、`.lovable/prod-strict.env` 不存在。
4. `/bff/management/nl/ask`、`/bff/management/ai/conversations/{id}` 目前 **不在** `paths.ts`、不在 `BE_WRITE_GAP_SPEC_2026-05-28.md`、沒有 live probe 證據顯示 BE 已上線。

→ 我會把真正的「Lovable AI sandbox runtime」（Supabase Edge Function `management-agent` + lovable-ai-gateway）拆掉，改打 BFF。請確認這就是你要的。

## What changes

### A. New BFF path builders (`src/lib/bff-v1/paths.ts`)
- `managementNlAsk()` → `/bff/management/nl/ask`
- `managementAiConversation(sessionId, traceId?)` → `/bff/management/ai/conversations/{id}?trace_id=...`

### B. New Management AI client (`src/lib/bff-v1/managementAi.ts`)
- `askManagementAi({ question, focus, context, sessionId })` → `POST` 上面的 path
  - Headers: `Content-Type: application/json`, `Idempotency-Key: <uuid>`, plus existing BFF auth via `headers.ts` (`setAuthProvider` / cookie / bearer)
  - Returns typed `{ answer, sessionId, traceId, providerStatus: { provider, runtime, status, used, fallback }, auditLog?: { href }, conversation?: { href } }`
- `fetchManagementAiConversation(sessionId, traceId?)` → `GET`, returns `{ turns: [...] }`
- 嚴格遵守 user rule：**FE 絕對不自己生成回答**。若 `providerStatus.used !== true` 或 `status ∈ {degraded, disabled, error}`，回傳 typed `ProviderDegraded` 結果，不做任何 client fallback。
- 不用 mock fallback（不掛 `withWriteFallback`）；若 BE 尚未實作，UI 顯示 degraded banner + retry，這符合 user 的「不可以由前端自己 fallback 回答」。

### C. Rewrite chat panel transport (`src/management/components/agent/AgentPanelBody.tsx`)
- 移除 `@ai-sdk/react` `useChat` + `DefaultChatTransport` + `FUNCTION_URL` 對 supabase edge function 的依賴。
- 改成簡單 submit→`askManagementAi`→render 的流程。`sessionId` 從上一次 response 帶回；首訊省略。
- 保留現有的 PromptInput / Conversation / Message UI 殼。
- 新增「provider 狀態列」顯示 `provider / runtime / status / used / fallback`，以及 `auditLog.href`、`conversation.href`（外開連結）。
- Resync / 切換 thread → 呼叫 `fetchManagementAiConversation(sessionId)` 拿 `turns` 重繪。
- chat_threads / chat_messages（Supabase 表）改成只存 `{thread_id, session_id, title, updated_at}` 對應；BE response 才是訊息真實來源。或者完全不存 thread state（先簡化）。**請選 (i) 保留 Supabase thread 索引、訊息走 BFF；或 (ii) 全部丟給 BFF，FE 不再寫 chat_threads/chat_messages。** 預設選 (ii)。
- 刪掉 `sanitizeHistoricalToolParts`、`PendingApproval`、tool-call/approval UI 殼（新 endpoint 沒有 tool calls 語意；如需要日後再加）。

### D. Delete now-dead code
- `supabase/functions/management-agent/index.ts` — 整支刪除（這是 Lovable AI gateway 入口）。
- 若 (ii) 採用，亦移除 chat_threads / chat_messages 相關的 Supabase 寫入；表 schema 保留以避免破壞 migration。

### E. Agora 隔離（cleanup，非 Management AI 阻擋線）
- `src/lib/bff/agora.ts`、`paths.agoraAskSessions/agoraAskSession` 全部 **保留**（真正 Agora UI 還在用：`AgoraLayout`、`AskPersonas`、`Watchlist`、`SignalDetail` + tests）。
- 加一條 ESLint `no-restricted-imports`：禁止 `src/management/**` import `@/lib/bff/agora` 或 `paths.agoraAsk*`，避免日後再被混用。
- `src/lib/bff-v1/seed.ts` 對 `bffAgora` 的引用屬於 mock seed，不動。

### F. Probe / release gate cleanup
- `scripts/probe-bff-routes.mjs` — 移除 `["GET", "/bff/agora/ask/sessions"]` 那一列（如要保留 Agora probe 就改成 Agora-only section），改新增：
  - `POST /bff/management/nl/ask`，斷言 `data.answer`、`data.providerStatus|provider_status`、`providerStatus.provider/runtime/status/used`
- `scripts/probe-bff-authenticated-live.mjs` — 同步替換 `/bff/agora/ask/sessions` 條目。
- `scripts/probe-bff-write-paths.mjs` — 移除 `P1-E /bff/agora/ask/sessions` row，新增 Management NL ask row。
- `scripts/aggregate-release-gate.mjs` — 從 Management gate 移除 `/bff/agora/ask/sessions`，加入 `/bff/management/nl/ask`。

### G. 更新 active dev BFF URL（34.81.75.241 → 35.201.239.38）
僅改 active configs，**不動歷史 audits**（per directive）：
- `.env`（目前 active 唯一還留舊 IP 的檔；其他 `.env.*.example` 已是新 IP）
- 確認 `scripts/probe-bff-*` defaults 已是新 IP（grep 結果顯示已正確；只 double-check）
- 不存在的檔 (`.lovable/preview-strict.env`、`.lovable/prod-strict.env`) → 跳過，不會憑空建立。

### H. Definition of Done（會在最後跑這幾條 grep 並貼結果）
- `rg "src/lib/bff/agora" src/management` → 0 hit
- `rg "/bff/agora/ask|agoraAsk" src/management` → 0 hit
- `rg "functions.supabase.co/management-agent|management-agent" src/` → 0 hit
- `rg "/bff/management/nl/ask" src/lib/bff-v1` → ≥1 hit
- `rg "/bff/management/ai/conversations" src/lib/bff-v1` → ≥1 hit
- `rg "34.81.75.241" .env .github scripts` → 0 hit
- providerStatus.used !== true / status degraded 時 UI 顯示 degraded banner，無 model 回應。

## Technical notes
- 既有 `src/lib/bff-v1/managementNl.ts`（Phase 1 fixed_mock）會被新 `managementAi.ts` 客戶端 supersede；保留檔但加 `@deprecated`，避免破壞 Console UI（如果有）。需要時可另開一張票完整下線。
- 因為 BE `/bff/management/nl/ask` 尚未驗證上線，FE 落地後第一次 live probe 會回 404 / 501，這時 UI 應顯示 degraded（不是 mock 回答）。我會把這條 gap 加進 `BE_WRITE_GAP_SPEC` 對外需求 SoT。
- 不動 `src/lib/bff-v1/managementNl.ts` 的 strict/gateway 守門邏輯（Phase 1 contract）；新流程不過它。

## Files I expect to touch
- `src/lib/bff-v1/paths.ts` (add 2 builders)
- `src/lib/bff-v1/managementAi.ts` (new)
- `src/management/components/agent/AgentPanelBody.tsx` (rewrite transport)
- `supabase/functions/management-agent/index.ts` (delete)
- `eslint.config.js` (no-restricted-imports for `src/management/**`)
- `scripts/probe-bff-routes.mjs`
- `scripts/probe-bff-authenticated-live.mjs`
- `scripts/probe-bff-write-paths.mjs`
- `scripts/aggregate-release-gate.mjs`
- `.env`
- `.lovable/specs/be-requirements/BE_WRITE_GAP_SPEC_2026-05-28.md` (add NL ask + conversations rows)

## Open questions
1. **Thread persistence**：用 (i) 保留 Supabase chat_threads 當側欄索引、訊息由 BFF 提供；或 (ii) 完全丟給 BFF，前端不再寫 Supabase 表？我預設 (ii)。
2. **管理 AI tool-calls / approvals**：新的 `/bff/management/nl/ask` shape 看起來是單輪 Q/A，不含 tool 呼叫或 approval 半完成 state。確認舊的 ToolCard / approval UI 全部 **可以拆掉** 嗎？
3. `src/lib/bff-v1/managementNl.ts`（fixed_mock NL Console）是否還有 UI surface？我會 grep 確認，但需要你拍板：找到就一併拆，或先 `@deprecated` 留待後續。
