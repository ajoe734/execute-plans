# BE Write-Gap Verification — 2026-05-30

> **TL;DR — 無法獨立驗證**。Sandbox 對 `pantheon-lupin-dev-bff.34.81.75.241.sslip.io`
> 無 outbound HTTPS（`curl` 10s timeout, connection refused），Lovable headless
> 瀏覽器從 `*.lovableproject.com` origin 發 request 也被 BFF CORS reject
> （只允許 `id-preview--*.lovable.app`）。**需 user 從本機/CI 跑 probe**，或在
> 真實預覽分頁的 DevTools 貼下方 snippet 後把結果回貼。

## 環境

| 項目 | 值 |
|---|---|
| BFF base | https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io |
| Sandbox `curl /health` | ❌ Connection timed out (10s) |
| Lovable headless browser fetch | ❌ `TypeError: Failed to fetch` (CORS) |
| User 預覽 GET (從 context 看) | ✅ 200 (cockpit/alerts/portfolio-book/persona-league/jobs) |
| 最近 write-path probe (使用者本機) | 2026-05-28 → 8 OPEN / 23 implemented |

## 規格 vs 最新已知狀態（以 2026-05-28 probe + spec 比對）

來源：`.lovable/audits/bff-backend-write-probe-2026-05-28.md` + `.lovable/audits/persona-onboarding-endpoint-probe-2026-05-28.md`。

### 15 個 spec open endpoints

| # | Pri | Endpoint | 2026-05-28 | 2026-05-30 | 備註 |
|---|---|---|---|---|---|
| 1 | P0 | POST `/bff/personas/{id}/actions/AdvanceLifecycle` | 410 deprecated | ❓ unverified | spec 已標 deprecated；BE 需提供 replacement |
| 2 | P0 | POST `/bff/capital-pools/{id}/actions/ApprovePool` | 410 deprecated | ❓ unverified | 同上 |
| 3 | P0 | POST `/api/v1/bindings` | 405 | ❓ unverified | persona onboarding step 2c blocker |
| 4 | P0 | POST `/api/v1/deployment-plans` | 405 | ❓ unverified | step 3 blocker |
| 5 | P0 | POST `/api/v1/approval-decisions` | 405 | ❓ unverified | step 4 blocker |
| 6 | P0 | POST `/bff/runtimes/{id}/actions/StartRuntime` | 410 deprecated | ❓ unverified | step 5 blocker |
| 7 | P0 | GET  `/api/v1/operator/persona-management/{id}` | 404 | ❓ unverified | F4 health parity |
| 8 | P0 | POST `/bff/command-confirmations/{token}/confirm` | 404 | ❓ unverified | 所有 HighRiskConfirm blocker |
| 9 | P1 | POST `/bff/runtimes` | 405 | ❓ unverified | runtime 新建 |
| 10 | P1 | POST `/bff/agora/signals` | 405 | ❓ unverified | |
| 11 | P1 | POST `/bff/agora/feedback` | 404 | ❓ unverified | |
| 12 | P1 | POST `/bff/agora/inbox/{id}/triage` | 404 | ❓ unverified | |
| 13 | P1 | POST `/bff/agora/skill-coaching` | 404 | ❓ unverified | |
| 14 | P1 | POST `/bff/agora/postmortems` | 405 | ❓ unverified | |
| 15 | P2 | POST `/bff/v5/interventions/batch-decide` | 405 | ❓ unverified | |

### 23 個原本 implemented (regression watch)

未驗，但因 read-path 在最近 traffic 仍 200，**推測 implementation 仍在**。

### Sentinel rule coverage

2026-05-28：13 個 persona `degraded (score 85)` (reasons:
`persona_lifecycle_not_active` + `no_runtime_binding`) → 0 findings。
2026-05-30：❓ 未驗。

---

## 怎麼幫我重跑（任一即可）

### A. 本機 CLI（最快，~30 秒）
```bash
node scripts/probe-bff-write-paths.mjs           > /tmp/p1.md
node scripts/probe-persona-onboarding-endpoints.mjs > /tmp/p2.md
node scripts/probe-create-persona-then-fleet.mjs > /tmp/p3.md
```
把三個檔案內容貼回 chat 即可。

### B. 真實預覽分頁 DevTools Console（無需本機）
打開 `https://id-preview--b75d3452-f667-4cf4-893a-1061de45b347.lovable.app/management/cockpit` →
F12 → Console 貼下列腳本：

```js
(async()=>{const B="https://pantheon-lupin-dev-bff.34.81.75.241.sslip.io";
const H={"content-type":"application/json","authorization":"Bearer pantheon-dev-browser:reviewer","x-bff-api-version":"2026-05-07","x-dry-run":"1"};
const E=[
["P0","POST","/bff/personas/persona-dev/actions/AdvanceLifecycle",{action:"submit_for_review"}],
["P0","POST","/bff/capital-pools/cp-dev/actions/ApprovePool",{decision:"approve"}],
["P0","POST","/api/v1/bindings",{persona_id:"persona-dev",capital_pool_id:"cp-dev"}],
["P0","POST","/api/v1/deployment-plans",{binding_id:"bind-dev",stage:"paper"}],
["P0","POST","/api/v1/approval-decisions",{plan_id:"plan-dev",decision:"approve"}],
["P0","POST","/bff/runtimes/runtime-dev/actions/StartRuntime",{}],
["P0","GET","/api/v1/operator/persona-management/persona-dev",null],
["P0","POST","/bff/command-confirmations/token-dev/confirm",{decision:"confirm"}],
["P1","POST","/bff/runtimes",{deployment_id:"dep-dev",name:"probe"}],
["P1","POST","/bff/agora/signals",{title:"probe",body:"x"}],
["P1","POST","/bff/agora/feedback",{target_id:"x",rating:1}],
["P1","POST","/bff/agora/inbox/inbox-dev/triage",{decision:"ack"}],
["P1","POST","/bff/agora/skill-coaching",{skill_id:"skill-dev",note:"x"}],
["P1","POST","/bff/agora/postmortems",{incident_id:"inc-dev",summary:"x"}],
["P2","POST","/bff/v5/interventions/batch-decide",{ids:["i-dev"],decision:"approve"}]];
const out=[];for(const[p,m,r,b]of E){try{const x=await fetch(B+r,{method:m,headers:H,body:b?JSON.stringify(b):undefined});out.push(`${p} ${x.status} ${m} ${r}`)}catch(e){out.push(`${p} ERR ${m} ${r} ${e.message}`)}}
console.log(out.join("\n"));copy(out.join("\n"));})();
```
→ 結果會自動 copy 到剪貼簿，貼回 chat。

---

## 收到結果後我會做什麼

1. 全綠 → 更新 `mem://index.md` + `BE_WRITE_GAP_SPEC_2026-05-28.md` 標 CLOSED；移除 `src/lib/bff-v1/writeFallback.ts` 的 NOT_IMPLEMENTED 分支；撤掉 `LiveStatusBanner` writeDegraded strip。
2. 部分綠 → spec 表加 `verified_2026_05_30` 欄位；只對綠 row 撤 fallback；其餘維持。
3. 仍紅 → spec 文件保留，BE owner 收件。
