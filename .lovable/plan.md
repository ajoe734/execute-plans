## 又一個 FE 自造的「假工具」

你看到的「指令接受但未執行」這次是 agent 端的問題，不是 BE。實況：

1. **`annotate_evidence` 工具呼叫的路徑 `POST /bff/evidence/{id}/annotate` 根本不存在於 BFF spec**。Pack D contract 與 Final OpenAPI 都只有 `GET /bff/management/evidence`（read-only explorer）。FE 在 `management-agent/index.ts` 自己捏了一個寫入端點，所以每次呼叫必 404。
2. **Evolution Journal 也沒有 BFF write 端點**——目前只有頁面（read view），沒有任何 `POST /bff/journal/*` 之類的路由。
3. **更糟的是模型在工具結果回來之前就先「敘事成功」**：先說「我已經將剛才所有的觀測證據...彙整並標註在 Evidence 與 Evolution Journal 中」，接著 `annotate_evidence` 才回 404。錯誤卡有跳出來、最後一行也吐了「工具呼叫失敗」——但前面那段「我已標註」是純幻覺，這比工具壞掉本身更危險（你之後拿這段去對帳就會 mismatch）。
4. **Sentinel 對 13 個 degraded persona 沒 finding** 是另一個獨立的 BE 觀測：persona 在 draft 狀態時 lifecycle 健康分扣到 85 但 Sentinel rule 沒涵蓋這條（屬於 BE 的 rule gap，不是 FE 能修的）。本輪不處理，只在 audit 裡記下。

## 修法（純 FE / agent prompt，不動 BE）

### 1. 移除 `annotate_evidence` 工具
- `supabase/functions/management-agent/index.ts`：
  - 刪掉 `annotate_evidence` 整個 tool 定義
  - `BASE_SYSTEM_PROMPT` 移除所有 `annotate_evidence` 字樣（出現在 auto-mode 描述、Low-risk write 行、auto/draft mode hint 段）
  - 加新規則：「Evidence wall 與 Evolution Journal 在當前 BFF 沒有任何寫入端點，只有 read explorer (`GET /bff/management/evidence`)。如果使用者要求『記錄到 evidence / 標註 / 寫進 journal / 留下對帳』，**不要假裝完成**——直接回覆『目前只能查詢，不能寫入，請走 Human Inbox / Ask 通道留下備註』，並用 `navigate` 帶到 `/management/evidence` 或 `/management/human-inbox`。」
  - mode filter（draft / auto）相應移除 `delete tools.annotate_evidence`

### 2. 加「不可預先宣稱成功」prompt 規則
在 BASE_SYSTEM_PROMPT 加 anti-hallucination 段：
> CRITICAL — 不可預敘成功：在工具結果回來之前，不能用過去式描述任何寫入動作（「我已經...」「已標註」「已寫入」「已彙整到 X」）。叫工具前用未來式（「我將呼叫 ...」），結果回來後再依 `ok: true/false` 報告。對於 Evidence wall、Evolution Journal、Audit log 這類審計實體**永遠不能宣稱已寫入**，除非該寫入路徑被明確列在 Tool catalogue 內。

### 3. AgentPanelBody whitelist
- `ACTIVE_TOOL_NAMES` 保留 `annotate_evidence` 字串於 STALE 區，這樣舊 chat session 的歷史紀錄仍能正確標示「Historical Record / 此工具已下線」而不會跳 approval card。
- 改法：把 `annotate_evidence` 從 `ACTIVE_TOOL_NAMES` 移除（它自然就會被 stale logic 渲染為歷史記錄）。

### 4. Audit 文件
- `.lovable/audits/bff-backend-write-gap-2026-05-28.md` 新增 row：
  - `POST /bff/evidence/{id}/annotate` → **NOT IN SPEC** （tool 是 FE 偽造，已下線）
  - `POST /bff/journal/*` → **NOT IN SPEC**（無對應 BE 路由）
- `.lovable/audits/persona-no-delete-2026-05-28.md` 同類 sibling，新增第二份 `.lovable/audits/agent-fake-evidence-write-2026-05-28.md` 記錄：問題、根因、修法、anti-hallucination prompt 全文。

### 5. （獨立 BE gap，本輪不處理，只記）
- Sentinel rule 對 `persona_lifecycle_not_active` + `no_runtime_binding` 沒產生 finding。寫進 audit 當待辦交給 BE/Sentinel 規則組，FE 無法代修。

## 不做的事
- 不打算把 evidence/journal 寫入用 writeOverlay 假裝完成（這是審計實體，本地 overlay 比直接拒絕還危險）
- 不動 BE / 不發 migration
- 不改 Sentinel rule（不是 FE 範圍）

## 驗收
1. agent 在任何模式下都不再列出 `annotate_evidence` 工具
2. 同樣那句「請幫我把剛才的觀測寫進 evidence / journal」會得到「目前只能查詢」+ navigate 到 evidence explorer，**不會再有 404 工具失敗卡**
3. 模型不會在工具回來前說「我已標註」——可用同樣 prompt 重跑驗證
4. 舊 chat thread 內歷史的 `annotate_evidence` 卡片渲染為「Historical Record」而非 approval 卡
5. edge function 重新部署成功

要我進入 build 模式按計畫做嗎？