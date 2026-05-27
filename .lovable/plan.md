這張圖的問題不是載入卡住，而是 AI SDK 的工具批准流程斷掉了：assistant 產生了 `create_intervention` 這個需要人工批准的 tool call，但前端沒有成功把對應的 tool result 回填到同一個 tool call，所以下一次送訊息時 SDK 判定歷史訊息不完整，顯示：`Tool result is missing for tool call ...`。

我會這樣修：

1. **修正 pending approval 偵測**
   - 不只掃 `input-available`，也處理 AI SDK 可能出現的 `approval-requested` 狀態。
   - 確認 `toolCallId`、`toolName` 取值完整，避免有 tool 卡片但批准列沒抓到。

2. **修正批准/拒絕回填方式**
   - 將目前的 `addToolResult(...)` 改成符合目前 AI SDK docs 的 tool output 回填模式。
   - 讓按「批准 / 拒絕」後，該 tool part 會變成有 output 的完成狀態，而不是仍留在缺 result 的狀態。

3. **避免壞掉的舊 thread 一直重播錯誤**
   - 對從資料庫載入的歷史訊息做一次 normalization：若最後一段 assistant message 含有未完成的需要批准 tool call，前端會把它視為 pending，明確顯示批准列；必要時提供「拒絕並繼續」的安全出口。
   - 不會自動批准任何高風險動作。

4. **加強 debug console 輸出**
   - 在 pending approval 變化、批准/拒絕 click、tool result 回填後，輸出 `threadId / toolName / toolCallId / state / status`。
   - 若仍出現 `Tool result is missing`，console 會列出是哪一筆 message、哪個 tool call 缺 result。

5. **驗證**
   - 用目前這種「我要建立新的交易人格」流程檢查：產生 `create_intervention` → 出現批准列 → 按批准/拒絕 → 不再出現 `Tool result is missing`，且 input 可以繼續使用。