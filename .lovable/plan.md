## 為什麼現在 AI 「不會操作」

`supabase/functions/management-agent/index.ts` 目前只給 AI 10 個工具：7 個唯讀 BFF 查詢、`navigate`、3 個高風險批准（decide_inbox / create_ask / create_intervention / trigger_readiness）。**沒有任何「填表」或「一般寫入」工具**，所以它只能查、帶路、送批准——你看到的「不會幫我填內容」就是這個原因。

## 設計：四種風險等級 + 你每次決定

每個 tool 一個 `riskTier`，AI 呼叫時帶 `mode` 參數，前端浮窗用不同 UI 接：

| Tier | 行為 | UI |
|---|---|---|
| `auto` | 直接執行（讀取、標已讀、收藏、加備註） | 流裡顯示「✓ 已完成」 |
| `draft` | AI 不寫後端，回傳 form payload；前端 `navigate` 到目標頁並用 query/事件預填欄位 | 浮窗顯示「已填入草稿，請至 XX 檢查送出」 |
| `confirm` | AI 呼叫 `needsApproval` tool；停在 tool-call，等你按「批准/取消」 | 浮窗顯示批准卡（已有） |
| `agent` | 多步任務模式，AI 可連續呼叫多個 tool，每個 `confirm` 仍會停 | 浮窗顯示步驟列表 |

**「每次你決定」的機制**：浮窗 composer 右側加一排 chip——`自動 / 草稿 / 確認 / 代理`，預設 `確認`。chip 值放進 system prompt 的當輪 hint，AI 據此選擇 tool 行為（例如選「草稿」時禁用 `confirm` tool，只能用 `propose_*`）。

## 三個最先要的寫入動作（我選的）

挑「日常最痛、風險可控、有 BFF 端點」的：

1. **`propose_inbox_decision`**（草稿/確認雙模）— 預填批准/拒絕理由到 Human Inbox 該項目；草稿模式只 navigate + 帶 prefill，確認模式直接呼 `/bff/approvals/{id}/decision`。
2. **`propose_ask`**（草稿/確認）— AI 草擬「要問哪個 persona 什麼問題」，草稿模式跳到 /management/persona-fleet 並開 Ask drawer 預填；確認模式直送 `/bff/ask`。
3. **`annotate_evidence`**（auto tier）— 對 evidence 列表項目加備註/標籤，低風險自動執行，呼 `/bff/evidence/{id}/annotate`（若 BFF 還沒這 endpoint，先 mock 寫進 chat_messages 的 metadata，下一輪後端補）。

## 實作切點（最小集合）

```text
supabase/functions/management-agent/index.ts
  + 新增 tool: propose_inbox_decision, propose_ask, annotate_evidence
  + 每個 tool 加 riskTier metadata（寫在 description 字串）
  + system prompt 註入當輪 user-selected mode hint
  + stepCountIs(50) 改成 stepCountIs(80) for agent mode

src/management/components/agent/AgentPanelBody.tsx
  + composer 上方加 mode chip 列（自動/草稿/確認/代理）
  + sendMessage body 附 { mode } → edge function 拼 system hint
  + 處理新 tool part：
      - draft tool 完成 → 顯示「草稿已就緒」+ 按鈕「開啟頁面」
      - auto tool 完成 → 顯示綠勾條
  + 'navigate' tool 已存在，draft 工具 reuse 它 + sessionStorage 'agent_prefill'

src/management/pages/{human-inbox,persona-fleet}/...
  + 進入時 read sessionStorage 'agent_prefill'，若有就 prefill 對應 form
  + 用完 clear，避免殘留
```

## 不在這次範圍
- 不動 BFF / 後端 API（evidence annotate 若無就先 client-side stub）
- 不動 auth、不動浮窗 dragging/snap 行為
- 不擴增 readiness / sentinel 寫入工具
- 不做 agent 模式的長任務佇列 UI（這次代理模式只是允許連續多步，UI 仍走現有 message stream）

## 驗收

1. composer 預設 `確認`：問「拒絕 inbox 第一筆」→ AI 呼 `propose_inbox_decision` confirm 模式 → 浮窗出現批准卡 → 按批准 → BFF 200。
2. 切 `草稿`：問同樣問題 → AI 不送 API，浮窗顯示「草稿已就緒 開啟 Human Inbox」→ 點進去 → 該項目 reason textarea 已預填 AI 草稿。
3. 切 `自動`：問「幫第一筆 evidence 加個 tag follow-up」→ 浮窗綠勾「✓ 已加 tag」，不需確認。
4. 切 `代理`：問「檢查 cockpit、找出最差 persona、預填一個 ask 草稿」→ AI 連續呼 query_cockpit → query_persona_league → propose_ask(draft) → 最後一步顯示草稿卡。
5. 文字問題（無 tool）在任何 mode 下都不再重複（之前的 fix 維持）。
