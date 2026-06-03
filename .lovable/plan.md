## 計畫

1. **修正批准送回 AI SDK 的方式**
   - 目前 `resolveApproval()` 只呼叫 `addToolApprovalResponse()`，但畫面錯誤顯示 AI SDK 仍期待對應 `tool_create_intervention_...` 的 tool result。
   - 我會改成在批准/拒絕時同時補一筆符合 SDK 期待的 `addToolResult({ tool, toolCallId, output })`，再送 approval response，避免下一輪模型收到「有 tool call、沒有 tool result」的歷史。

2. **補強歷史訊息清理**
   - 載入 `chat_messages.parts` 時，將已下線工具或歷史 pending approval 視為不可繼續執行的歷史紀錄，不再被送回後端作為 active tool loop 的上下文阻塞。
   - 特別針對舊的 `create_intervention` / `annotate_evidence` 類工具，避免它們再觸發 tool-result validation error。

3. **後端串流前防呆**
   - 在 `management-agent` function 呼叫 `convertToModelMessages(messages)` 前，清理/正規化傳入訊息：移除或降級沒有結果的舊 tool call parts，保留文字對話與已完成工具結果。
   - 這樣即使資料庫已有壞掉的舊紀錄，也不會讓新訊息每次都卡在同一個 missing tool result。

4. **驗證**
   - 檢查 `create_intervention` 不再出現在 active tool set / confirm flow。
   - 用現有 thread reload 情境確認：舊批准卡不阻塞輸入、送出新訊息不再出現紅字 `Tool result is missing...`。