我檢查到問題不只是 UI：目前批准狀態只改在前端 `useChat` 記憶體裡，沒有回寫到 `chat_messages.parts`。所以重新載入或切回對話後，資料庫仍是 `approval-requested`，前端又把整段歷史所有 pending approvals 掃出來，才會出現你截圖裡 19 個「明明批准過還一直冒出來」的卡片。

修復計畫：

1. **只把目前最後一輪 assistant 的 approval 當成可處理項目**
   - 修改 `src/management/components/agent/AgentPanelBody.tsx`。
   - `pendingApprovals` 不再掃整個歷史訊息。
   - 只檢查最後一則 assistant message；歷史裡殘留的 `approval-requested` 不再阻塞輸入、不再出現在底部總 approval queue。
   - 歷史 tool 卡片如果還是舊狀態，只顯示為歷史紀錄，不給「批准/拒絕」按鈕。

2. **批准/拒絕後立即持久化到資料庫**
   - 在 `resolveApproval()` 裡，除了本地 `setMessages()`，也同步更新該 thread 對應 `chat_messages.parts`。
   - 將 matching `approval.id` 的 part 從：
     - `state: "approval-requested"`
     轉成：
     - `state: "approval-responded"`
     - `approval: { id, approved, reason }`
   - 這樣重新整理、切換 thread 後不會復活。

3. **後端 function 也補一層同步防線**
   - 修改 `supabase/functions/management-agent/index.ts`。
   - 當 `addToolApprovalResponse()` 送出下一次 stream request 時，edge function 在呼叫模型前先把 incoming assistant messages 裡已變更的 approval/tool parts 回寫到 `chat_messages`。
   - 避免前端更新成功但 stream 中斷時，下次又從舊 DB 狀態復活。

4. **清掉目前這個 thread 的舊 pending 視覺污染**
   - 因為既有資料裡已經有歷史 `approval-requested`，前端 active-only 規則會先讓它們不再阻塞。
   - 若你再次按批准/拒絕，新的狀態會被寫回；舊歷史不再需要人工一個個按。

5. **驗證**
   - 檢查 approval queue count：不應再從整個 history 撈出 19 個。
   - 批准一個高風險 tool 後，切換 thread / reload，該 approval 不應再回到 pending。
   - 確認仍能正常送出下一輪工具結果，不破壞 AI SDK `sendAutomaticallyWhen` 流程。