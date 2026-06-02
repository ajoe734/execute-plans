## 問題

截圖裡 `annotate_evidence` 同時顯示兩張卡：
1. 灰色「此工具已下線（歷史紀錄）」(stale badge — 預期)
2. 紅色「工具呼叫失敗 · annotate_evidence (404)」(舊錯誤卡 — 不該再出現)

第二張卡是 2026-05-28 移除 `annotate_evidence` 之前已經寫進 `chat_messages.parts` 的歷史 output。移除工具後，渲染邏輯只擋了 `Tool` collapsible (`{!isStale && <Tool>...`)，但下方的紅色錯誤橫幅、draft 橫幅、approval 橫幅都沒有 `isStale` gate，所以仍會渲染。

## 修改範圍

只動 `src/management/components/agent/AgentPanelBody.tsx` 的 `ToolBlock` (約 698–775 行)。

把 `isStale` 變成單一截斷點：當工具已從 `ACTIVE_TOOL_NAMES` 下線、或是 historical approval 時，**只**渲染灰色 stale badge，**不**渲染：
- 紅色 error 卡 (`isError` block, ~728–753)
- draft 橫幅 (`isDraft && completed`, ~755–763)
- approval 橫幅 (`needsApproval`, ~767+)
- 任何後續輸出按鈕

做法：把 728 行起的後續區塊全部包在 `{!isStale && (...)}` 內，或在每個區塊條件最前面 `&& !isStale`。傾向前者，diff 小且語意清楚。

## 不動什麼

- `ACTIVE_TOOL_NAMES` 名單不動。
- 不動 BE / edge function / DB — 歷史紀錄留著沒問題，只是 UI 不再渲染舊錯誤。
- 不動 active 工具的 error 渲染（active 工具該繼續顯示紅卡）。

## 驗證

1. Cockpit chat 重新整理 → 截圖中的紅色 404 卡消失，只剩灰色 stale badge。
2. 任何 active 工具（例：`request_sentinel_remediation`）若回 404，紅色 error 卡仍照常顯示。
3. Draft / approval 橫幅在 active 工具上仍正常。
