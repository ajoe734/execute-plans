## 問題
小幫手回覆裡的「Evolution Journal (進化日誌)」這類 markdown 連結是用 `Streamdown` 預設渲染成 `<a target="_blank">`，所以一律新開分頁。你要的是在同一個視窗用 react-router 換頁。

## 修法（純 FE，1 個小改動）

### 1. `src/components/ai-elements/message.tsx` — `MessageResponse` 改寫 `a` renderer
在 `Streamdown` 加 `components={{ a: SmartLink }}`：
- 用 `useNavigate()` 攔截 click
- 判斷「站內連結」= `href` 以 `/` 開頭，或同 origin 且非 `mailto:` / `tel:` / 不同 host
  - 站內：`e.preventDefault(); navigate(pathname + search + hash)`，**不加** `target`
  - 站外：保留 `target="_blank" rel="noopener noreferrer"` + 小 ExternalLink icon（沿用既有 lucide）
- 全部走 design system class（`text-primary underline-offset-2 hover:underline`），無自製顏色

### 2. 給 agent prompt 補一條建議（`supabase/functions/management-agent/index.ts` `BASE_SYSTEM_PROMPT`）
> 站內導航**優先用 `navigate` 工具**而不是在 markdown 裡寫 `[文字](/management/...)`；只有當你要列出多個可點目標供使用者自選時才用 markdown 連結，而且只寫站內相對路徑（以 `/` 開頭），不要寫絕對 URL。

這條只是品味建議，主修正在 #1。

### 3. 不動的東西
- `navigate` 工具本身（原本就是 react-router `nav(href)`，運作正常）
- 「開啟頁面」按鈕（既有 UX）
- 其他用 `MessageResponse` 的地方（同步受惠）

## 驗收
1. 回覆中「Evolution Journal (進化日誌)」之類站內連結 → 點下去**同視窗**切到 `/management/evolution-journal`，不再 `_blank`
2. 真正的外部連結（`https://...` 非同 host）仍以新分頁開啟並有 icon
3. 既有 Streamdown markdown 樣式（程式碼、清單、math、mermaid）不受影響

要我進 build mode 套上嗎？