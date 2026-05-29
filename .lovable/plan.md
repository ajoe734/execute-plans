## 目標

把目前散在多個 audit / probe 檔案裡的「BE 還沒實作 / FE 只能 overlay 過渡」endpoint 全部收斂成一份**正式對 BE 團隊的需求規格書**，讓後端工程師可以直接 pick up 開票實作。

## 交付物

單一檔案：`.lovable/specs/be-requirements/BE_WRITE_GAP_SPEC_2026-05-28.md`

（同時更新 `mem://index.md` 把它列為 BE 需求 SoT，並在 `.lovable/audits/INDEX.md` 加索引）

## 規格書結構

### 0. Meta
- 版本 / 日期 / 作者 (FE) / 對象 (BE owner)
- 上游來源：Pack D BFF API Contract、Final OpenAPI 2026-05-07、Persona Onboarding Wizard Spec 2026-05-28
- 下游證據：`bff-backend-write-probe-2026-05-28.md`、`persona-onboarding-endpoint-probe-2026-05-28.md`
- Probe 環境：`pantheon-lupin-dev-bff.34.81.75.241.sslip.io`、bearer `pantheon-dev-browser:reviewer`、`X-Dry-Run: 1`

### 1. Headline 表（一眼看完）
| Group | Total | Open | Severity |
|---|---|---|---|
| P0-D Entity create | 9 | 1 | P1 |
| P1-A Action commands | 7 | 1 | P0 (HighRiskConfirm 阻斷) |
| P1-C v5 writes | 8 | 1 | P2 |
| P1-E Agora writes | 7 | 5 | P1 |
| Persona Onboarding (lifecycle/binding/plan/approval/runtime) | 8 | 7 | **P0** |
| Sentinel rule coverage | — | — | P2 (rule engine) |
| **Total open endpoints** | **31 + 8** | **15** | — |

### 2. 每個 open endpoint 的需求卡（每筆統一格式）

每張卡固定欄位：
- **Route + Method**
- **目前 probe 觀察**（status code、envelope 片段）
- **FE 已對接的呼叫位置**（檔案 + 函式）
- **Spec 出處**（Pack D 章節 / OpenAPI operationId / Wizard Spec §）
- **Request schema**（headers: Authorization / Idempotency-Key / X-Correlation-Id / X-BFF-Api-Version；body 欄位含型別、必填、範例）
- **Response schema**（成功 2xx envelope、典型 4xx：401/403/404/409/422、ErrorCode 走 Pack D 26-enum）
- **State machine 副作用**（哪個 entity 從哪個 state → 哪個 state、需要發哪個 SSE event）
- **Audit chain 要求**（D26 EvidenceKind、是否寫 audit-chain hash）
- **Permission / Role 要求**（Pack D Permission Contract）
- **Acceptance criteria**（probe 重跑要看到什麼 status / shape）
- **FE 移除 fallback 的判定條件**

涵蓋全部 15 條：

**P0 — Persona Onboarding (Wizard 4.1)**
1. `POST /bff/personas/{id}/actions/AdvanceLifecycle`（目前 410 deprecated，需確認新路徑或恢復）
2. `POST /bff/capital-pools/{id}/actions/ApprovePool`（410 deprecated 同上）
3. `POST /api/v1/bindings`（405）
4. `POST /api/v1/deployment-plans`（405）
5. `POST /api/v1/approval-decisions`（405）
6. `POST /bff/runtimes/{id}/actions/StartRuntime`（410 deprecated）
7. `GET /api/v1/operator/persona-management/{id}` 含 `data.health`（404 / F4 缺欄位）
8. （順帶）`/bff/personas/{id}/actions/AdvanceLifecycle` 等 deprecated 路徑的「新路徑」需 BE 文件化

**P0 — Action confirm**
9. `POST /bff/command-confirmations/{token}/confirm`（404，阻斷所有 HighRiskConfirm 二段式確認）

**P1 — Entity create**
10. `POST /bff/runtimes`（405）

**P1 — Agora**
11. `POST /bff/agora/signals`（405）
12. `POST /bff/agora/feedback`（404）
13. `POST /bff/agora/inbox/{id}/triage`（404）
14. `POST /bff/agora/skill-coaching`（404）
15. `POST /bff/agora/postmortems`（405）

**P2 — v5 batch**
16. `POST /bff/v5/interventions/batch-decide`（405）

### 3. 跨 endpoint 共通要求
- 26-code ErrorCode envelope 必須回 `{ error: { code, i18nKey, message, retryable, userActionable, details }, meta: { correlationId, … } }`
- Idempotency-Key replay 規則（24h 內重放回原 response）
- `X-Dry-Run: 1` 行為（驗證但不寫，回 200 + `meta.dryRun: true`）
- Deprecated route 退場政策：要嘛留 alias、要嘛在 OpenAPI 標明 replacement 路徑
- SSE channel 對映（`ENTITY_TO_SSE_CHANNEL`）需同步更新

### 4. Sentinel rule coverage 缺口（獨立節）
- 13 personas `degraded(85)` + reasons `persona_lifecycle_not_active` / `no_runtime_binding` → 0 findings
- BE rule engine 需新增覆蓋規則（FE 無法補）

### 5. 驗收流程
- BE 每批 deploy 後跑 `scripts/probe-bff-write-paths.mjs` + `scripts/probe-persona-onboarding-endpoints.mjs`
- 兩支 probe 全綠 → FE 撤掉對應 `withWriteFallback`、LiveStatusBanner degraded strip
- 加一張 CI gate matrix（routes × status code 期望）

### 6. 不在本規格範圍
- 任何 FE 修改（FE 已 land overlay fallback）
- 新 entity / 新 spec 設計（只 cover 對齊既有 spec 的缺口）

## 範圍邊界
- 純文件，不動程式碼
- 不重新 probe（直接引用 2026-05-28 兩份 probe 證據）
- 不更動 spec/v4 或 spec/current，只在 `.lovable/specs/be-requirements/` 下新增

按下 Implement 後就直接產出該規格書。