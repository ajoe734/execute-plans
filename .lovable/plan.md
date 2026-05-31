# FE 收尾：切到新 BFF + 回歸驗證

BE 已交付（PR #661）：
- Dev BFF：`https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io`
- Staging BFF：`https://pantheon-lupin-staging-bff.104.155.223.192.sslip.io`
- Bearer `pantheon-dev-browser:reviewer` 仍有效
- Caddy IaC 化（dev+staging 都已 reload，/health 200）

## 步驟

1. **更新 FE 的 BFF base URL（4 個檔，全文取代舊 IP `34.81.75.241`）**
   - `.env.development.example` → dev URL
   - `.env.dev.example` → 確認/同步（目前指向 `35.236.178.81`，需更新或保留視 BE 約定）
   - `.env.staging-live.example` → staging URL（若檔內有寫死）
   - `e2e/helpers/env.ts` 預設值 → dev URL
   - `scripts/probe-bff-write-paths.mjs` fallback 預設值 → dev URL
   - 同步搜尋 `34.81.75.241` 確保全清乾淨（包含 audits 內歷史紀錄保留不動，只改 runtime 用到的）

2. **跑 3 支 probe + 寫驗證報告**
   ```bash
   node scripts/probe-bff-write-paths.mjs
   node scripts/probe-persona-onboarding-endpoints.mjs
   node scripts/probe-create-persona-then-fleet.mjs
   ```
   產出 `.lovable/audits/be-access-verification-2026-05-31.md`：
   - §1 新 BFF 連線確認（dev+staging /health）
   - §2 31 write endpoints BEFORE(05-28) vs AFTER(05-31) 對照
   - §3 8 persona onboarding stages 狀態
   - §4 create-persona-then-fleet 一致性
   - §5 剩餘 gap（若有）→ 給 BE owner

3. **依驗證結果更新 memory**
   - 若仍是 23/31 通：memory 維持，僅更新 BFF URL
   - 若新增綠燈：更新 `mem://audits/bff-write-gap-2026-05-28` 條目分子數
   - 若全綠：標 CLOSED + 留 TODO（下一輪 PR 撤 `withWriteFallback` / `LiveStatusBanner` writeDegraded）

4. **回填 BE response 確認檔**（若 sandbox 已 sync 到 `.lovable/feedback/2026-05-30-agent-access/be-response-2026-05-31.md`）
   - 加上 FE side 「✅ env updated / ✅ probe rerun / link to verification report」段落
   - 若還沒 sync：把回填內容附在驗證報告同一份的 §0

## 不做

- 不撤 `withWriteFallback`（要等剩餘 endpoint 全綠 PR 再做，避免一次太多動）
- 不動 `src/lib/bff-v1/paths.ts`（base URL 是從 env 讀，不寫死）
- 不動 src/ 任何 runtime 程式碼

## 技術說明

- 預覽現在 console 還在打舊 IP `34.81.75.241`（network log 證實），原因是 `.env`（runtime 用的，autogen）還是舊值；env 範例檔改完後 Lovable Cloud 會把 `.env` 重生，preview 就會切過去。
- Probe 用 dev bearer + `X-Dry-Run: 1`，不污染 BE 真實資料，~30 秒跑完。
- 不更動 `src/integrations/supabase/client.ts` 與 `src/integrations/supabase/types.ts`。
