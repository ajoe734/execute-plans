
# 藍圖 vs 現況差異盤點（重新逐節核對）

之前說「~95%」是太鬆的口徑。我重新對 Spec Part 3（Management 頁面）/ Part 5（Agora 頁面）/ Part 8（QA Checklist）逐節對檔，下面是**真正還沒做完**的條目（不含已完成項）。

---

## A. 結構性差異（路由 / 大頁面缺漏）

| # | Spec | 現況 | 評級 |
|---|---|---|---|
| A1 | `/management/risk`（Spec §18 Risk Center 路由） | 只有 `/management/risk-center`（別名）+ `/risk` 已 alias，OK | ✓ |
| A2 | Strategy Detail 13 tabs | 都在 | ✓ |
| A3 | Persona Detail 14 tabs | 都在 | ✓ |
| A4 | Capital Pool Detail 13 tabs | 都在 | ✓ |
| A5 | **Evolution Detail — `Constraints` / `Alerts` / `Approvals` 三個 spec tab** | 缺 `constraints`、`alerts`、`approvals` 三個獨立 tab（目前只有 direction/fitness/mutation/runs/candidates/promotion/freeze/config/experiments/lineage/audit） | **缺** |
| A6 | **Incident Detail Sections（11 條）** | 目前只有 5 個 tab：timeline/affected/root/postmortem/audit。Spec 列：Summary / Timeline / Linked Alerts / Affected Strategies / Affected Capital / Root Cause / Actions Taken / Mitigation / Postmortem / Training Feedback / Evolution Constraint / Audit。**Mitigation、Training Feedback、Evolution Constraint、Affected Capital 沒有獨立 section**（功能藏在 postmortem tab 裡） | **缺** |
| A7 | **Performance Ranking 6 個 scope tabs** | `RankingDashboard` 只列 strategies 一張表，沒有 Persona / Strategy / Alpha Family / Capital Pool / Paper / Live 六個 scope 切換、沒有 Recalculate / Freeze / Publish / Override / Compare 五個動作 | **缺** |
| A8 | Command Center `Pending Management Actions`、`Recent State Transitions` 兩個 grid block | 有 lifecycle / approvals / risk / jobs / persona / capital / alerts / agora incoming / events，已對齊 | ✓ |

---

## B. 行為性差異（spec 列了動作但 UI 沒掛）

| # | Spec 動作 | 現況 |
|---|---|---|
| B1 | Persona Detail → `Test as Persona`（Tools/MCP/Skills tab） | 沒有 |
| B2 | Persona Detail → `Run evaluation` / `Restrict tools temporarily`（Activity tab） | 沒有 |
| B3 | Strategy Performance tab → `Compare to benchmark`（已做 ✓） | ✓ |
| B4 | Rebalance → `Publish Report` | 沒有對應按鈕 |
| B5 | Evolution → `Inspect Candidate`（候選列詳情面板） | 列出但沒有 inspect drawer |
| B6 | Runtime → `Disable New Deployments` | 已做 6 個 actions，但 spec 第 4 個是 "Disable New Deployments"，目前是 quarantine（語意接近，但 label 不同） |
| B7 | Deployment → `Schedule Deployment` 動作 | 沒有 schedule action |

---

## C. QA Checklist 還沒對到的項目

| # | QA 項 | 現況 |
|---|---|---|
| C1 | High-Risk QA：`Emergency Kill shows critical confirmation` | 找不到對應 emergency kill 入口 |
| C2 | High-Risk QA：`Change Ranking Formula active version shows confirmation` | Ranking 沒有 active 版本切換 UI |
| C3 | Confirmation modal 必含 `Audit memo field` | HighRiskConfirm 是否強制 memo 我尚未驗證 |
| C4 | Agora `Insight Inbox → promote to strategy idea / attach to strategy / create research task / create training example` 四個動作 | 需驗證 |
| C5 | Agora `Memory Review → approve / reject / edit / merge / move` 五個動作 | 需驗證 |

---

## D. 之前回報「100% 完成 P0/P1/P2」實際狀況

- **P0 Strategy sweep / Performance**：完成 ✓
- **P0 Runtime 6 actions**：完成 ✓（但 label 與 spec 第 4 個「Disable New Deployments」不一致）
- **P0 Incident sections**：**只做了 postmortem→training feedback wiring**，但 spec 要求 11 個獨立 section / 4 個獨立按鈕，仍缺 Mitigation / Training Feedback / Evolution Constraint / Affected Capital 獨立 tab+section
- **P1 MCP per-tool schema**：完成 ✓
- **P1 Deployment Reduce Allocation**：完成 ✓
- **P2 shadcn i18n**：完成 ✓

**所以前一輪的「~95%」過度樂觀，誠實值大約 88–90%。**

---

## E. 真正的剩餘工作（建議分三批）

### Batch 1 — Spec 結構落差（最該補）
1. Evolution Detail：補 `constraints` / `alerts` / `approvals` 三 tab
2. Incident Detail：把 `mitigation` / `trainingFeedback` / `evolutionConstraint` / `affectedCapital` 從 postmortem 拆出獨立 section（共 11 區塊到位）
3. Ranking Dashboard：6 scope tabs + Recalculate/Freeze/Publish/Override/Compare 動作 + Active formula version 切換（含 HighRiskConfirm）

### Batch 2 — 動作補齊
4. Persona Detail：`Test as Persona` / `Run evaluation` / `Restrict tools temporarily` 三按鈕（mock mutation）
5. Rebalance：`Publish Report` 動作
6. Deployment：`Schedule Deployment` 動作
7. Evolution：候選 `Inspect` drawer
8. Runtime：把 quarantine label 對齊 spec 「Disable New Deployments」（或新增）

### Batch 3 — QA 補齊
9. HighRiskConfirm 強制 memo 欄位驗證
10. Emergency Kill 入口（Runtime / Strategy）
11. Agora Insight Inbox / Memory Review 動作完整盤點 + 補齊

---

## F. 想請你決定

要不要照 **Batch 1 → 2 → 3** 的順序逐批做？還是只挑 Batch 1（spec 結構性落差）就好？或你想先看哪一頁實際截圖再決定？
