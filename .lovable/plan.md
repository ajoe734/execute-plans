## 目標

把 `/management/cockpit` 右上的「詢問 Management」從 Phase 1 fixed_mock 升級為 **Phase 2 Lovable AI 代理**：使用者可用自然語言請 AI 回答問題、操作 UI、呼叫 BFF。

## 架構

```text
NL Console (React)
  └─ POST /functions/v1/management-agent  (SSE, useChat transport)
        └─ Lovable AI Gateway (google/gemini-3-flash-preview)
              └─ tool calls →  回傳工具結果給模型
                   ├─ navigate(href)              [client-side: 由前端執行]
                   ├─ query_cockpit / query_persona_league / query_portfolio_book / ...
                   ├─ query_human_inbox
                   ├─ decide_inbox_item(id, action, reason)     [needsApproval]
                   ├─ create_ask(target, question)              [needsApproval]
                   ├─ create_intervention(target, payload)      [needsApproval]
                   └─ trigger_readiness(check)                  [needsApproval]
        └─ 寫入 chat_messages（per-user 持久化）
```

- **Client-side tool**：`navigate` 由前端攔截（不寫 server execute），其他工具在 edge function 內呼叫現有 BFF（`pantheon-lupin-dev-bff...`，透過 `src/lib/bff-v1` 既有 paths）。
- **AI SDK**：`streamText` + `tool()` + `stepCountIs(50)`，回傳 `toUIMessageStreamResponse({ originalMessages, onFinish })`，在 `onFinish` 寫 DB。
- **高風險 tool 全部 `needsApproval: true`**：模型送出工具呼叫後，前端顯示「批准／拒絕」卡片，使用者確認才繼續執行——對齊 Pack D §D26 approval channel 與 two-man 規範，不繞過既有 governance。

## 後端：Supabase Edge Function

`supabase/functions/management-agent/index.ts`

1. CORS 標頭 + `OPTIONS` 短路 204。
2. 從 Authorization JWT 取得 `user.id`（要求登入；未登入回 401）。
3. 收 `{ messages, threadId }`，從 DB 載入 thread 的歷史 `UIMessage[]` 合併。
4. 用 `@ai-sdk/openai-compatible` 走 Lovable AI Gateway（`LOVABLE_API_KEY` 已存在）。
5. System prompt 帶：
   - 角色＝「Management Cockpit 操作助手」、必須中英對齊使用者語言、引用真實 BFF 資料、危險動作要解釋原因。
   - 可用 surface 列表（cockpit / persona-league / portfolio-book / human-inbox / trading-pulse / evidence / sentinel ...）。
6. 註冊 ~9 個 tools（schema 用 zod）；只讀工具 `execute()` 在 edge 內以 `fetch` 呼叫 dev BFF；寫入工具標 `needsApproval`。
7. `onFinish` 寫 `chat_messages`（user + assistant 各一筆）。

## 資料庫（Lovable Cloud）

新增 migration：

- `chat_threads` (`id uuid pk`, `user_id uuid`, `title text`, `created_at`, `updated_at`)
- `chat_messages` (`id uuid pk`, `thread_id uuid fk`, `user_id uuid`, `role text`, `parts jsonb`, `created_at`)
- RLS：兩張表都只允許 `auth.uid() = user_id` 讀／寫／刪。
- 索引：`chat_messages(thread_id, created_at)`、`chat_threads(user_id, updated_at desc)`。

## Auth

目前專案沒有任何 auth。新增：

- Email/Password + Google sign-in（Lovable Cloud 預設組合，依規範）。
- `/auth` 頁（登入／註冊 tabs）、`onAuthStateChange` 先設、再 `getSession`。
- `ProtectedRoute` 包住 `/management/*`，未登入導 `/auth`。
- 不建立 `profiles` 表（本次不需要使用者資料）。

## 前端

1. 新元件 `src/components/management/ManagementAgentConsole.tsx`：
   - 走 AI Elements（已在規範要求）：`Conversation`、`Message`、`MessageResponse`、`PromptInput` + `PromptInputFooter` + `PromptInputSubmit`、`Shimmer`、`Tool`（折疊預設關）。
   - `useChat({ id: threadId, transport: new DefaultChatTransport({ api: edgeFunctionUrl, headers: { Authorization: \`Bearer ${session.access_token}\` } }) })`。
   - 訊息 `parts` 渲染；assistant 無背景色，user bubble 用 `primary/primary-foreground`。
   - 攔截 `tool-navigate`：呼叫 `useNavigate()` 後回 `addToolResult({ output: { ok: true } })`。
   - 高風險 tool call 顯示「批准／拒絕」卡，按下後 `addToolResult` 帶 approve/deny → 模型自動續跑。
   - 自動聚焦輸入框（初始 / 送出後 / stream 完成 / 換 thread）。
2. 取代 `Cockpit.tsx` 右上既有的 `ManagementNlConsole`（保留檔案，掛 `@deprecated` 註記；不刪以維持 import 相容）。
3. **Thread sidebar + 路由**：依 chat-agent-ui-contract，新增 `/management/agent/:threadId` 路由，左側 thread 列表 + 新對話按鈕；`/management/agent` 自動建立或挑最近一筆並 navigate。Cockpit 右上的「詢問」按鈕改成開新分頁 `/management/agent/new`。
4. i18n：`management.agent.*` 新增繁中＋英文字串。

## 安全與保護

- 所有 BFF call 在 edge function 內進行，瀏覽器永遠看不到 dev BFF URL（用 Supabase secret 設 `PANTHEON_BFF_BASE_URL`，預設 `https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io`）。
- `needsApproval` 工具：edge function 不在 server 端執行（AI SDK 的 approval flow 預設行為），UI 顯示 confirmation card；approve 後仍由 edge function 端執行對應 BFF POST。
- Rate limit / 402：捕捉 gateway 錯誤，前端 toast「AI 用量已達上限／請稍候再試」。
- 不寫 `LOVABLE_API_KEY` 到前端。

## 範圍裁示

- 不動 Phase 1 `askManagementNl()`，舊邏輯保留供 fallback（gateway 失敗時用）。
- 本次只把 NL Console 接上；其他 management surface（cockpit panel 本身、persona-fleet 等）不改 UI。

## 不在本次

- Cross-thread search、訊息引用、檔案上傳、語音輸入、自訂 model 選擇 UI。
- Phase 3 ML 級 governance 整合（仍走既有 approval card）。

## 技術細節

- 模型：`google/gemini-3-flash-preview`。
- AI SDK：`ai` + `@ai-sdk/openai-compatible` + `@ai-sdk/react`。
- AI Elements：`bun x ai-elements@latest add conversation message prompt-input shimmer tool`。
- Markdown：`react-markdown`（assistant 訊息）。
- Edge function 名稱：`management-agent`，`verify_jwt = true`（預設）。
- Migration 一次落：兩張表 + RLS + 索引 + auth trigger 不需要。

## 驗收

1. 登入 → `/management/agent` 自動進新 thread；輸入「現在 cockpit 有什麼風險？」→ AI 呼叫 `query_cockpit` 工具 → 用真實 BFF 資料回答。
2. 說「幫我打開 Human Inbox」→ AI 觸發 `navigate("/management/human-inbox")` → 前端跳頁。
3. 說「批准 INB-123」→ 顯示批准卡 → 按 Approve → edge 執行 BFF 決策 → 回應結果。
4. 重新整理 `/management/agent/<id>` → 訊息完整還原。
5. 建第二個 thread → 兩個 thread 訊息不互相污染。
