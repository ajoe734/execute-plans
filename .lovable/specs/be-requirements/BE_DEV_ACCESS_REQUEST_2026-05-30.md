# BE Dev Access Request for Lovable Sandbox — 2026-05-30

> **目的**：讓 Lovable agent 的沙箱（執行 probe / CI 驗證的環境）能直接打到
> `pantheon-lupin-dev-bff` 做 write-path 驗證，免去每次都要 user 從本機/瀏覽器
> 手動跑 probe 再貼結果。

## 1. 問題現況

| 通道 | 結果 | 根因 |
|---|---|---|
| Lovable sandbox `curl https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io/health` | ❌ TCP connection timeout (10s) | sandbox egress 被 BE 防火牆 drop（IP 未列白） |
| Lovable headless 瀏覽器 fetch（origin = `*.lovableproject.com`） | ❌ `TypeError: Failed to fetch` (CORS preflight reject) | BFF `Access-Control-Allow-Origin` 只 allow `https://id-preview--*.lovable.app` 與 `https://pantheon-dev.lovable.app` |
| User 真實瀏覽器（origin = `id-preview--…lovable.app`） | ✅ 200 GET / 201 POST | 在白名單內 |
| **後果** | 所有 BE write-path 驗證都要 user 手動 trigger | agent 無法獨立完成 spec verification loop |

## 2. 我們希望 BE 開啟的權限

### 2.1 網路層 — 兩擇一

**A. IP allow-list（首選）**  
把 Lovable agent sandbox 的 egress IP / CIDR 加入 lupin BFF 的入站白名單。  
我會在此份文件交付後 24h 內透過下方腳本回報目前 egress IP（每個沙箱 session
重啟可能變動，請接受 `/24` 或更寬的 GCP / Cloudflare egress range）。

```bash
# Lovable sandbox 內執行：
curl -s https://api.ipify.org && echo
curl -s https://ifconfig.co/json | jq '{ip, asn, country}'
```

**B. 公開 dev BFF 走 lovable.dev 子網域 + CORS 擴白**  
若 IP allow-list 不便維運，請：
- 把 BFF DNS 暴露為 `pantheon-lupin-dev.lovable.app`（或 BE 自管 domain）
- CORS `Access-Control-Allow-Origin` 追加：
  - `https://*.lovableproject.com`
  - `https://*.sandbox.lovable.dev`
  - `https://b75d3452-f667-4cf4-893a-1061de45b347.lovableproject.com`

### 2.2 認證層

維持現有 dev bearer (`Bearer pantheon-dev-browser:reviewer`)。  
若需獨立 agent identity，請發一組：
- subject = `lovable-agent-ci`
- role = `reviewer`（read-all + dry-run write）+ `approver`（驗 HighRiskConfirm path）
- TTL = 90d，可 rotate

### 2.3 Dry-run 與資料污染保護

所有 probe 都會帶 `X-Dry-Run: 1` + `Idempotency-Key: probe-<uuid>`。請確認：

- [ ] 全部 P0/P1/P2 endpoints 在 `X-Dry-Run: 1` 下**不寫 state**、只回 typed envelope
- [ ] `X-Dry-Run: 1` 但 schema/權限不符仍回原本 422/403，方便 schema 驗證
- [ ] dev DB 有獨立 `agent-probe` schema 或 tenant，避免污染 BE 自家測試資料

### 2.4 預期 SLA

- BFF dev 維持 99% 上線（cold start 可接受）
- 每次 BE deploy 後跑一次 `scripts/probe-bff-write-paths.mjs` + `scripts/probe-persona-onboarding-endpoints.mjs`，**回貼結果到本 repo PR**
- 任何 spec breaking change 走 `.lovable/feedback/` 通道，**禁止靜默改 route**

## 3. 對應 Probe / Acceptance

開通後 agent 端會跑：

```bash
node scripts/probe-bff-write-paths.mjs
node scripts/probe-persona-onboarding-endpoints.mjs
node scripts/probe-create-persona-then-fleet.mjs
```

並把結果寫進 `.lovable/audits/be-write-gap-verification-<date>.md`。
全綠 → 自動撤 `src/lib/bff-v1/writeFallback.ts`、撤 `LiveStatusBanner` writeDegraded strip。

驗證範圍對齊 `.lovable/specs/be-requirements/BE_WRITE_GAP_SPEC_2026-05-28.md`
（15 open endpoints + Sentinel rule coverage）。

## 4. 交付物（我們需要 BE 回覆）

| # | 項目 | Owner | 目標日 |
|---|---|---|---|
| 1 | 回覆採 A (IP allow-list) 或 B (CORS+DNS) | BE platform | T+1d |
| 2 | 若 A：提供允許 CIDR 列表 + 變更 SLA | BE platform | T+2d |
| 3 | 若 B：發出 CORS update PR + 新 origin 上線 | BE platform | T+5d |
| 4 | 發出 agent CI bearer + rotate 流程 | BE auth owner | T+3d |
| 5 | 確認 `X-Dry-Run` 全 endpoint 不污染 state（測試報告） | BE per-service owner | T+7d |
| 6 | CI hook：BE deploy → 自動跑 3 支 probe → 結果回貼 | BE devops | T+10d |

## 5. 為何不能繼續走「user 手動 probe」

| 問題 | 影響 |
|---|---|
| 每次 spec 校驗 user 要開 DevTools 跑 script | 真實 user friction，違反 agent 自動化承諾 |
| `withWriteFallback` 一直掛著 | UX degraded、`writeOverlay` 30min TTL 假資料污染 UI |
| spec gap 收尾依賴非同步人工觸發 | release gate 無法 CI 化、SLA 不可預測 |
| 13 個 degraded persona / 0 Sentinel findings 等 rule coverage gap 永遠驗不到 | regression 風險累積 |

---

**Contact**: 本 repo issue 或 `.lovable/feedback/2026-05-30-agent-access/` 子目錄回覆。
