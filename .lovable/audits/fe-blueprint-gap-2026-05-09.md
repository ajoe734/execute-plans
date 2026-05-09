# 前端 vs 設計藍圖 — 完整盤點 (2026-05-09)

對照來源：
- v4 + Pack D (normative)
- v5 SA/SD (IA / Loop / Sentinel / HIQ 升級層)
- 2026-05-07 Final BFF Contract（FROZEN）
- 2026-05-07 Planner Response（34 條，wire-up 已 LANDED）
- 2026-05-08 Planner Stage 2 Audit
- 2026-05-08 spec-conflict-G FE batch 2+3 LANDED
- 2026-05-08 Live Wiring Alignment Patch LANDED
- 2026-05-09 BFF Live Probe（`bff-live-probe-2026-05-09.md`）

**整體狀態**：規格層 233/233 RESOLVED；FE 實作層 ~98% 完成；**364/364 tests green**。
真正剩下的工作分四類：A 等待後端 / B 等待規格 backport / C 純 FE 小尾巴 / D 觀察項。

---

## A. 阻塞於後端實作（**FE 端無事可做**）

來源：2026-05-09 live probe — 43 個 canonical endpoint 中只 4 個有實作（~9%）。

| 類別 | 缺漏 endpoint | FE 影響 |
|---|---|---|
| **Session 三件套** | `/bff/me`、`/bff/auth/refresh`、`/bff/logout` 全 404 | 無法 bootstrap；目前靠 mock 模式運作。 |
| **Decide 半邊缺** | list 有實作（401），但 `/approvals/{id}/decide`、`/v5/interventions/{id}/decide` 全 404 | list→decide 流程無法跑 live。 |
| **Canonical action** | `POST /bff/actions/{type}/{id}/{actionId}` 未註冊 | 所有 entity action 在 live 模式只能 fallback 或失敗。 |
| **Entity registries** | strategies / personas / capital-pools / rebalances / deployments / jobs / alerts / incidents / audit / artifacts / runtimes / mcp-tools / skills / channels / tools / ranking-formulas / research-experiments / agora/* / 多數 v5/* | ~91% 頁面在 live 模式會 404。 |
| **OpenAPI 自描述** | `GET /openapi.json → 500` | FE/QA 無法自動驗證 path catalog。 |

**FE 對應措施**（皆已落地）：
- `.env.example` 預設 `VITE_BFF_MODE=mock`
- `VITE_BFF_FALLBACK=auto` 容錯；`strict` 可選
- `paths.ts` 已對齊 canonical，舊路徑保留 `@deprecated` alias

**動作**：把 probe 報告同步給 backend lupin team；FE 端不動。

---

## B. 等待規格 backport（FE 已就緒）

| ID | 等待 | FE 狀態 |
|---|---|---|
| A1 | Final OpenAPI YAML 加 `ActionCommandStatus` schema | `FE_READY_OPENAPI_BACKPORT_PENDING` |
| A2 | Pack D D21 markdown 補 26 條 ErrorCode | `FE_READY_PACKD_BACKPORT_PENDING` |
| A3 | AsyncAPI 把 `correlationId` 標 required | `FE_READY_ASYNCAPI_BACKPORT_PENDING`（FE 用 `ensureCorrelationId()` 補值） |

**動作**：等 backport 落地後改 disposition flag，無 code 變動。

---

## C. 純 FE 小尾巴（可立即清掉）

### C1. v3 lib 殘留 (`src/lib/v3/`)
v4 已 supersede，但 v3 目錄仍存在。
- 加 deprecation header 或保留為 legacy shim
- 可選：ESLint `no-restricted-imports` 阻擋新引用

### C2. `src/lib/v5/timeoutPolicy.ts` superseded
被 `src/lib/v4/asyncTransitionPolicy.ts` 取代，CHANGELOG 已標 deprecated。可同 C1 加 lint rule。

### C3. axe smoke 覆蓋 v5 五頁
`src/test/a11y-axe-smoke.test.tsx` 目前覆蓋核心頁，建議擴及 `ControlRoom / ResearchLoop / ExecutionLoop / OptimizationLoop / Sentinel / Interventions / PersonaHealthMatrix`。

### C4. spec-conflict-G G05（觀察項）
overlay TTL (30 min) vs audit append (永久) 不對稱。
- 已決策：audit 走 overlay 30 min + `ephemeral` badge
- 仍可加 tooltip「mock 環境暫存事件，30 分鐘後清除」

### C5. UI 入口若干尚未跑過實機驗收
（皆已 wire-up，但建議 walkthrough 確認）
- IncidentDetail → 「View Rollback Saga」按鈕 → `RollbackSagaDrawer`
- HighRiskConfirm → cooldown banner + two-man distinct-user 檢查
- Settings → Break-Glass tab → `validateForceTransition`
- GovernanceQueue → `reviewerQuorum` 進度條
- DataTable density toggle / LineageGraph node-limit warning（`uiBudgets`）

---

## D. v5 Phase E 觀察項（非缺漏，但可深化）

E0–E6 已落地（見 mem://features/v5-loop-os）。下列為「規格允許更深入但目前 minimal」的點：

| 頁面 | 行數 | 可深化方向 |
|---|---:|---|
| `ControlRoom.tsx` | 333 | 7 區塊已 render；可加跨區塊 drill-down + saved view |
| `Sentinel.tsx` | 359 | 列表/篩選/動作齊；可加 timeline 比對檢視 |
| `Interventions.tsx` | 250 | accept/modify/decline 三按鈕齊；可加 batch decide |
| `ResearchLoop / ExecutionLoop / OptimizationLoop` | 135–177 | 各 loop run timeline 已 render；stage detail drawer 可加 evidence 拓展 |
| `PersonaHealthMatrix.tsx` | 78 | 矩陣已 render；可加 trend sparkline |

這些都不是 spec 要求未達，是「v5 SD 允許的延伸」。優先級低於 A/B/C。

---

## E. 已完成（不再追蹤）

- ✅ Pack A+B+C+D+E+F 全 LANDED（233 條 spec gap）
- ✅ spec-conflict-G FE batch 2+3 LANDED（G01/G05/G06/G07/G09/G12/G13/G14）
- ✅ Planner Response 2026-05-07 全 34 條 wire-up
- ✅ BFF v1 Live Wiring Alignment Patch（paths/headers/fallback/SSE auth）
- ✅ Planner Stage 2 Audit（EvidenceKind 三層化、normalizeRedactedEvidenceRef、ensureCorrelationId、12-role canonical）
- ✅ v0 mock create writeOverlay（30min TTL）
- ✅ Test-mode pinning（test 強制 mock）

---

## 建議執行順序

1. **C1+C2** — 純 docs/lint，10 分鐘
2. **C3** — axe smoke 擴覆 v5 五頁，30 分鐘
3. **C5** — 跑一輪實機 walkthrough，發現問題回填
4. **A** — 把 probe 報告丟給 lupin backend team，等 endpoint 上線
5. **B** — 等 Planner backport
6. **D** — 待 product 排序

---

## Out of Scope（不做）

- 修改 backend 實作（lupin BE team）
- 修改 OpenAPI / AsyncAPI / Pack D markdown（B 組 Planner）
- 改 design token / route slug / business logic
- 重寫 v3/v4 已 frozen 的 DTO
