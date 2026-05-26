## 問題

問問題後浮窗的 AI 一直重複同一段內容。

## 根因

`src/management/components/agent/AgentPanelBody.tsx` 的 `useChat` 設了：

```ts
sendAutomaticallyWhen: () => true
```

這個 callback 只要回 `true`，AI SDK 就會在每次訊息陣列更新後再 POST 一次到 edge function，把剛剛 stream 完的對話再丟一輪 → 看起來就是「同一段內容一直重複出現」。

預期用法是只在 assistant 已輸出 tool call 但還沒收到 tool result 時，才自動把 tool result 帶回 LLM 續跑。

## 修法（單檔，一行邏輯）

`src/management/components/agent/AgentPanelBody.tsx`：

1. 從 `ai` 匯入 `lastAssistantMessageIsCompleteWithToolCalls`。
2. 把 `sendAutomaticallyWhen: () => true` 改成 `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`。

這樣：
- 純文字問答：assistant stream 完就停，不會再自動觸發。
- `navigate` 等 tool：我們在 `useEffect` 裡呼叫 `addToolResult` 後，會自動再送一次讓 LLM 接著回應（原本就需要的行為）。

## 不在範圍

不動 edge function、不動浮窗 UI、不動 BFF / 認證。

## 驗收

1. 在浮窗問「Pantheon Management 是什麼？」→ 只回一次，不再重複。
2. 叫它「帶我去 persona fleet」→ 觸發 navigate tool、跳頁、AI 回一句確認後停。
3. 重新整理 → 對話歷史正確還原一次，不再被自動續送。
