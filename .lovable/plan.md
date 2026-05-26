# Management AI — 測試版免登入

讓 `/management/agent` 在無 auth session 下也能直接使用，並從 `/management/cockpit` 一鍵進入。

## 變更

### 1. 路由 / 入口
- **`src/App.tsx`** — 移除 `/management/agent/*` 外的 `ProtectedRoute` 包裝（保留 `/auth` 路由檔案但不強制）。
- **`src/management/pages/Cockpit.tsx`** — 把舊的 `<ManagementNlConsole/>` drawer 改為一顆按鈕「詢問 AI Management」，直接 `nav('/management/agent')`，不再導去 `/auth`。

### 2. Edge Function（`supabase/functions/management-agent/index.ts`）
- 移除 `Authorization: Bearer` 強制檢查，改用 request body 帶來的 `anonId`（client localStorage 產生）。
- 用 `SUPABASE_SERVICE_ROLE_KEY` 建立 admin client，繞過 RLS 寫入 `chat_threads` / `chat_messages`。
- `chat_threads.user_id` / `chat_messages.user_id` 以 `anonId`（text）存入。
- 加上 `console.warn("[management-agent] TEST MODE: no auth")` 與回應 header `X-Pantheon-Test-Mode: true`。
- `supabase/config.toml` 加入：
  ```
  [functions.management-agent]
  verify_jwt = false
  ```

### 3. DB Migration
- `chat_threads.user_id` 與 `chat_messages.user_id` 改為 `text NOT NULL`（原為 `uuid`）。
- DROP 既有 4+4 條 `auth.uid() = user_id` RLS policies。
- 改為 `USING (true) WITH CHECK (true)` 全開（測試版，僅 service role 寫入，client 不直接 query 這些表）。
- 註解標註：`-- TEST MODE: re-enable per-user RLS before production`。

### 4. Frontend（`src/management/pages/agent/ManagementAgent.tsx`）
- 移除 `useAuth()`、`accessToken`、`supabase.auth.*` 相關程式。
- 新增 `getAnonId()`：從 `localStorage.pantheon.anonId` 讀取，若無則產生 `anon-<crypto.randomUUID()>` 並寫入。
- `chat_threads` / `chat_messages` 的 select / insert / delete 直接帶 `.eq('user_id', anonId)`（透過 service role 的 edge function 或暫時關閉 RLS 後 client 也能讀 — 見下方技術細節）。
- `DefaultChatTransport` 不再帶 `Authorization` header，改在 `body` 帶 `{ threadId, anonId }`。
- Sidebar 底部把 email + signOut 改為「Test mode · {anonId 後 6 碼}」+ 「清除對話」按鈕。
- 加一條頂部 banner：「測試版：未啟用登入，所有對話為公開可讀」。

### 5. 保留但停用
- `src/lib/auth/AuthProvider.tsx`、`src/lib/auth/ProtectedRoute.tsx`、`src/pages/Auth.tsx` — 保留檔案，加 `@deprecated test-bypass` 註解。
- `App.tsx` 仍掛 `<AuthProvider>` 以避免 import 連鎖錯誤，但不再被 agent 路由使用。

## 技術細節

**Thread / message 讀寫**：為避免在 client 也走 service role（不安全且需要新 edge function），最簡作法是 migration 直接把 RLS 放開（`USING (true)`），client 端用 anon key 即可 CRUD，並用 `user_id = anonId` 自行 scope。Edge function 寫入時同樣帶 anonId。代價：任何人能讀別人的 thread（測試版可接受，banner 明示）。

**Anon id 持久化**：`localStorage`，清除瀏覽器資料會產生新 id（舊 thread 仍在 DB，但找不到入口）。

## 驗收
1. 無痕視窗 → `/management/cockpit` → 點「詢問 AI」→ 進到 `/management/agent`，無 redirect。
2. 輸入「這系統怎麼使用？」→ Gemini 串流回覆。
3. 重新整理 `/management/agent/<id>` → 對話保留。
4. 不同瀏覽器 → 各自獨立 thread 清單。
5. 頂部明確顯示「測試版未啟用登入」banner。

## 安全提醒
測試版 AI endpoint 公開：任何人可消耗 Lovable AI 額度、讀取其他 anonId 對話。**上線前必須**：
- 還原 RLS 為 `auth.uid() = user_id`
- 還原 `verify_jwt = true`
- 還原 ProtectedRoute