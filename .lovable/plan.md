# Management AI：解決截斷 + 圖片上傳

## 1. 為什麼還在截斷（根因）

目前 `AgentPanelBody.tsx` / `managementAi.ts` 有三層截斷：

1. **`RECENT_TURNS_LIMIT = 12`** — 每次發問只把最後 12 則塞進 `conversation.recentTurns` 給 BFF。對話一長，LLM 就「忘了」前面。
2. **`loadSession()` 會 `setTurns([])`** — 點側欄切換對話時先清空，再靠 BFF `/bff/management/ai/conversations/{id}` 回填。BFF 若回 `turns: []`（degraded/stale，現在實測就是 stale cache）→ 畫面變空，merge 也救不回來。
3. **沒有本地 per-session 快取** — 重新整理或切回舊對話，只能靠 BFF。BFF 一截，FE 也跟著截。

## 2. 修法（前端範圍）

### A. Per-session 本地快取（localStorage）
- key：`pantheon.mgmtAi.turns.v1.<sessionId>`，存該 session 完整 `ChatTurn[]`。
- 每次 `setTurns` 後 debounce 寫入；上限例如 500 turns / 1MB，超過就丟最舊。
- `loadSession(id)`：先從 localStorage hydrate 顯示，再 `resync(id)` merge BFF 結果（已 merge by id），BFF 回空也不會清畫面。
- `deleteSession`：同步清掉該 key。

### B. 拿掉「只送 12 則」的硬截
- `RECENT_TURNS_LIMIT` 改成可調且預設較大（例如 80 turns 或 ~32KB chars，以字元數為準）。
- 新增 `buildConversationPayload()`：
  - 若總 char 數 ≤ 上限 → 全送。
  - 超過 → 保留最後 N turns + 前面塞一段 `summary`（先用 client 端拼成「前 X 則摘要：…」純文字 placeholder；真正摘要交給 BFF/LLM 做。FE 不自己呼叫 LLM）。
- `summary` 欄位繼續維持 BFF 契約相容。

### C. `loadSession` 不再清空
- 拿掉 `setTurns([])`；先 hydrate localStorage，再 merge resync。
- `resyncNotice` 仍保留（BFF 空回 / 失敗顯示提示）。

### D. Diagnostic
- `console.debug` 印出 `local hydrated / resync merged / sent recentTurns count` 三個數字，方便之後判斷是 BFF 截還是 FE 截。

## 3. 圖片上傳到後端

### UI（在 `AgentPanelBody` composer 區）
- PromptInput footer 左側加一顆 paperclip icon button → 隱藏 `<input type="file" accept="image/*" multiple>`。
- 也支援：
  - **貼上**：textarea `onPaste` 抓 `clipboardData.files`。
  - **拖放**：composer 容器 `onDrop`。
- 預覽列：textarea 上方顯示縮圖 chips（檔名 + 大小 + ✕ 移除）。
- 限制：每張 ≤ 5MB、單次最多 4 張、總計 ≤ 15MB；超過給 inline error。

### 資料路徑
- 圖片轉 base64 data URL（`FileReader.readAsDataURL`），FE 不另外打 storage。
- `ManagementAiAskInput` 新增：
  ```ts
  attachments?: Array<{
    kind: "image";
    mimeType: string;   // image/png | image/jpeg | image/webp | image/gif
    filename: string;
    sizeBytes: number;
    dataBase64: string; // 不含 data:...;base64, 前綴
  }>;
  ```
- POST body 新增 `attachments` 欄位送到 `/bff/management/nl/ask`，由 BFF 轉給 OpenClaw / Codex multimodal。
- 沒附件就不送該欄位（保持向後相容）。

### 顯示
- User turn 渲染：文字下方顯示縮圖 grid（點開放大用 `<a target="_blank">` 開 data URL）。
- localStorage 快取也要存 attachments（含 base64），但加 per-turn size guard：若 turn 超過 800KB 就只存 metadata + 縮圖（壓成 max 256px webp）以免爆 quota。

### Assistant 回覆
- 不變。BFF 回來文字 / uiActions 照舊。

## 4. 不動的範圍

- 不碰 `/bff/management/nl/ask` 以外的 BFF 契約（只新增 optional `attachments`，向後相容）。
- 不加 Lovable AI fallback。degraded banner 行為不變。
- 不動 uiActionRegistry。
- 不動 BFF / 後端，純 FE 改動。

## 5. Files to touch

- `src/lib/bff-v1/managementAi.ts` — 加 `attachments` 欄位；`buildConversationPayload` helper。
- `src/management/components/agent/AgentPanelBody.tsx` — localStorage per-session cache、拿掉清空、附件 UI / paste / drop、user message render attachments。
- 新檔 `src/management/components/agent/attachmentUtils.ts` — file → base64、image 壓縮（canvas）、size guard。

## 6. Definition of Done

- 連發 30 則訊息、切走再切回來，畫面不會少。
- 重新整理頁面再點同一個 session，本地至少看得到原本的訊息（BFF 即使回空）。
- 點 paperclip 或貼上圖片，textarea 上方出現縮圖；送出後 user bubble 顯示縮圖；BFF payload 的 `attachments` 帶 base64。
- 對話長度 > 12 turns 時，BFF 收到的 `recentTurns` 不再只有 12（debug log 可驗證）。
- 不引入 Lovable AI fallback；degraded 行為不變。
