# Pack BE-Gap-Delta-v2: 補上深掘發現

把 2026-05-24 第二輪深掘的兩項新發現追加到 `.lovable/audits/bff-backend-gap-2026-05-24-delta.md`。

## 改動內容

### 1. 追加新缺漏（第 26 條）
- `GET /bff/command-confirmations/{token}` — 後端未註冊，回 `{"detail":"Not Found"}`（非 canonical envelope）
- 影響：confirm-token 查詢流程無法走 live，FE 永遠 fallback mock

### 2. 追加 schema 偏差（1 條）
- 後端錯誤 envelope = `{"detail": {"error": {...}}}`（多包一層 `detail`）
- Pack D §error envelope 要求 = `{"error": {...}, "meta": {"correlationId": "..."}}`
- 影響：FE `safeAdapt` 會自動降級，但 audit trail 失去 `correlationId`
- 修法：後端剝掉外層 `detail`，並補上 `meta.correlationId`

### 3. 追加已驗證 OK 的 detail-by-id 清單
列出本輪用真實 ID 驗證通過的 ~20 條 detail 端點（personas/{id}、capital-pools/{id}、jobs/{id}、v5/loop-runs/{id} 等），證明這些不在缺漏範圍。

### 4. 更新統計
- 缺漏：25 → **26**
- 新增 schema 偏差欄位：1
- 結論段補一句：除了 §8/§9 大批 404 + CORS 之外，剩餘只有 `command-confirmations/{token}` 與 error envelope 兩項零星缺漏

## 不動的部分
- FE 程式碼 0 改動
- `mem://index.md` 不動（delta 文件路徑已在前一版 plan 紀錄）
- 其他 audit 文件不動
