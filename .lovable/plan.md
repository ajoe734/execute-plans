## 我看完 v5 SD 後的整體想法

這份 `Pantheon_v5_Closed_Loop_Supervisor_OS_SD_2026-05-06.md`（2,769 行、31 章）是 SA 的**對應實作設計**，跟 SA 配套，定義到「具體目錄、檔名、route、TS interface、mock derivation、phase 分工、acceptance」級別。整體品質高，可直接交給實作端，但有以下幾類問題需要先釐清。

---

## A. 與既有專案/文件的衝突

### A1. 與 v4 normative 層命名/職責衝突
- SD §4.1 要新建 `src/lib/v5/{types,bff,events,hooks,selectors,...}`，但專案已有 `src/lib/v4/`（normative spec layer）與 `src/lib/bff/`（既有 BFF facade）。
  - 衝突點：v4 是「規範型別」、v5 SD 是「閉環 view-model」。SD 沒有明說 v5 是否可 re-export / 依賴 v4 的 enum（如 `StrategyDeploymentStatus`）。
  - 風險：若 v5 自定 `LoopStatus`、`HealthStatus`、`InterventionSeverity`，又另有 v4 `StrategyReviewStatus`、`StrategyDeploymentStatus`，會出現「同一概念雙來源」。
- SD §3.2 把 BFF facade 放 `src/lib/v5/bff.ts`，但既有慣例是 `src/lib/bff/*`。SD §27 雖列為 Open Decision 但沒選定。

### A2. 與 Audit D 5 條 blockers 直接衝突
v5 SD 假設這些東西「已存在」並大量使用：
| SD 假設 | Pack D OPEN blocker |
|---|---|
| `LoopRun.nextAutomaticAction`、stage `timeoutMs`/SLA 倒數 | **D05** 狀態機 timeout/failureState 未定 |
| `RemediationAction.requiresHumanApproval` 對應 role gate | **D12** Role × Capability bundle 未定 |
| `bff.v5.controlRoom.get()` 一進來就要 currentUser/tenant/featureFlags | **D59/D51** `/bff/me` DTO 未列 |
| §9 列 13+ 種 v5 typed event（`loop.run.*`, `sentinel.finding.*`, `intervention.*`） | **D26** SSE channel payload schema 未列 |
| §13 Loop Runs 列表要顯示 totalCount / pagination | **D22** totalCount 未定 |

實作 v5 不解決這 5 條 = SD 的「technical acceptance #6/#7」會踩空、event 跟 totalCount 只能硬猜。

### A3. 與既有 Command Center / IA 衝突
- SD §5.2 / §27 第一條 Open Decision：Control Room 是否取代 Command Center「coexist first」— 但 §6 nav group 已把 Command Center 從一級 group 移除，會出現「舊 route 還在但 nav 沒入口」的不一致。
- SD §6 把 `Personas` 同時掛 Execution Loop 與 Multi-Persona System（§6.2 自承重複）；Phase E1 接受重複、E7 才整理 — 過渡期會出現雙入口閃爍。

### A4. 與 v4 收斂的 status enum 衝突
- SD §7.4 PersonaExecutionHealth.mode = `live | paper | shadow | paused`，但專案 `src/lib/v3/status.ts` / Persona seed 用的是 `active | paper | retired`（無 `shadow`、無 `paused`、無 `suspended`）。
- §15.6 又出現 `health.mode = suspended`，與 §7.4 enum 不一致（SD 內部矛盾）。

### A5. SD 內部不一致
- §7.9 SentinelFinding.status = `open | acknowledged | action_pending | mitigating | resolved | dismissed`，但 SA 原文是 `open | accepted | dismissed | executing | resolved | superseded`。SD 改了但沒註明 supersede SA。
- §7.8 RemediationAction 用 `mode: RemediationMode`（advisory/guarded_automation/emergency_override），SA 用 `automationLevel`（同三值但欄位名不同）。需明定哪個是 canonical。
- §7.10 InterventionItem 缺 SA 的 `modifyAllowed`、`evidenceRefs`、`recommendation` 三欄；多了 `requiredRoles`、`linkedApprovalId/linkedFindingId/linkedIncidentId`。需明定取捨。

---

## B. 不清楚 / 缺細節（必須回問規劃團隊）

1. **Health score 公式**（§20.2）只給文字描述，沒給權重數值。`computePersonaHealthScore` 的 input 與閾值（healthy ≥ ?, watch ≥ ? …）由實作端自訂？
2. **Sentinel 的 mock 來源**（§8.2）說「從 alerts/incidents 派生」，但 confidence、blastRadius、recommendedActions 沒派生規則 — 純文案 mock？
3. **Emergency action 真實性邊界**：§15.6 / §21.2 說 mock action 會「changes status & writes audit/realtime event」，但 `pause_persona_routing` 是否真的改 seed 的 persona？還是只在 v5 layer 暫存？影響其他既有頁面是否會看到變化。
4. **Realtime bus**：§9 要 v5 typed events，要不要復用 `src/lib/bff/realtime.ts` 的 mock SSE bus？SD 沒明說。
5. **Permission**：v5 page 用 `usePermissions()`（已存在）還是新建 v5 capability list？SD §27 沒列。
6. **i18n**：SD §22 列了 ~150 個新 key，要落到 `src/i18n/locales/{zh-TW,en-US}.ts`。沒說既有 `nav.*` 要不要重命名。
7. **Phase E1 "placeholder pages"** — 是 stub component（"Coming soon"）還是已有最小資料？影響 PR 大小切割。
8. **Test scope**：§24 列 unit + component + page integration + E2E。E2E 是 vitest-only 還是要新增 Playwright？目前專案只有 vitest。
9. **`/management/alpha-factory` route** 在 §6 nav 出現但既有 App.tsx 沒有此 route — SD 假設新建，但細節缺。
10. **Pantheon vs Pathreon 命名** — SA §19 Q1 還沒回答，SD 通篇用 Pantheon，需要確認。

---

## C. 我的規劃工作（本輪要做）

本輪在 plan 模式下**只做文件層**：把 v5 SA 與 v5 SD 收進 `.lovable/spec/v5/`，把上述衝突/疑問結構化交給規劃團隊，並把 Pack E 落地階段寫進 `.lovable/plan.md`。**不寫任何 `src/` 程式碼**（理由：SD §25 Phase E0 本身就需要先解 §A1/A2/A4/A5 的衝突，否則 v5 types 一寫就要返工）。

### C1. 新建檔案（spec 歸檔）
1. `.lovable/spec/v5/Pantheon_v5_Closed_Loop_Supervisor_OS_SA_2026-05-06.md`（從 user-uploads 複製）
2. `.lovable/spec/v5/Pantheon_v5_Closed_Loop_Supervisor_OS_SD_2026-05-06.md`（從 user-uploads 複製）
3. `.lovable/spec/v5/Pantheon_v5_INDEX.md` — 標註 v5 是 IA + view-model 升級層，疊加於 v4 normative 之上；v4 仍是 status enum / permission / API contract 的 source of truth
4. `.lovable/spec/INDEX.md`（更新）— 在 normative order 上方加 v5 SA/SD 說明

### C2. 新建檔案（衝突盤點與 intake）
5. `.lovable/audits/spec-conflict-2026-05-06-E.md` — 把上述 §A 五類衝突 + §B 十條疑問逐條編號（E01–E15+），每條給：衝突描述 / 影響 / 建議解法 / 對應 SA/SD 條號 / 對應 Pack D ID
6. `.lovable/audits/spec-conflict-2026-05-06-E-summary.csv` — 同樣表格 csv 版
7. `.lovable/audits/INDEX.md`（更新）— 新增列 `spec-conflict-2026-05-06-E`
8. `.lovable/feedback/2026-05-06-E/Pack_E_Intake_Notes.md` — 規劃團隊 intake：把 SA §19 Open Questions（10 條）+ SD §27 Open Decisions（6 條）+ 本輪 §B 疑問（10 條）合併去重，標出哪些是 E0 gating

### C3. 更新藍圖與 memory
9. `.lovable/plan.md`（新增段落）— Pack E 落地計畫，照 SD §25 的 E0–E8 phase 分工，每 phase 列入 gating（哪些 Pack D blocker / Pack E conflict 必須先解）
10. `mem://index.md` Core 段加：`v5 SA+SD (2026-05-06) 為 IA / Loop view-model / Sentinel 升級層；疊加於 v4，不取代 v4 normative type；落地等 Pack D blockers + Pack E conflicts 解決`
11. `mem://features/v5-loop-os`（新建）— 7 個 v5 domain model 名稱、5 個一級 surface route、Sentinel 三層 automation level、SD 內部矛盾索引

### C4. 不會做（明確排除）
- 不建 `src/lib/v5/`、不寫 LoopRun/Sentinel mock seed、不新建任何 route 或 page
- 不改 `src/lib/v4/`、不改 SideNav、不改 `App.tsx`
- 不改任何 i18n locale
- 不執行 build 或 vitest

---

## D. 落地階段（規劃，本輪不執行）

| Phase | 範圍 | 前置 |
|---|---|---|
| **Pack E intake**（本輪）| 上述 11 份檔案 | 無 |
| **E-Resolve** | 規劃團隊回 §B 10 條疑問、§A 5 類衝突、Pack D 5 blockers | intake |
| E0 v5 mock + types | `src/lib/v5/*` + `bff.v5.*` | E-Resolve |
| E1 Routing + Nav | `App.tsx` + `ManagementLayout.tsx` + i18n | E0 |
| E2 Control Room | `/management/control-room` | E1 |
| E3 Execution Loop | `/management/loops/execution` + Persona Health Matrix | E0 + Pack D D05 |
| E4 Optimization Loop | `/management/loops/optimization` + pipeline | E0 |
| E5 Sentinel Findings | `/management/sentinel` | E0 + Pack D D26 |
| E6 Human Intervention Queue | `/management/interventions` | E5 |
| E7 IA stabilization | SideNav 重排、舊 group 收進 Legacy | E2–E6 |
| E8 QA / a11y / polish | 測試 + i18n 覆蓋 + reduced motion | 全部 |

---

## E. 驗收（本輪）

- 11 份檔案皆建立 / 更新，命名一致、可被 INDEX 索引
- `.lovable/plan.md` 與 `mem://index.md` 同步反映 v5
- `spec-conflict-2026-05-06-E.md` 至少含 §A 5 條衝突 + §A4/A5 SD 內部矛盾 4 條 + §B 10 條疑問，共 ≥19 條
- 不動任何 `src/` 與 `.lovable/spec/v4/`

核准後即進入 default mode 執行上述檔案建立 / 更新。
