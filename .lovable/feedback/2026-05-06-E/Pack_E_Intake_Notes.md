# Pack E Intake Notes — 2026-05-06

**對象**：規劃團隊
**目的**：在 Lovable 進入 Pack E 落地（E0 types + mock）前，請逐條回覆下列問題。回覆後另存 `.lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv`。

## 來源

1. v5 SA §19 Open Questions（10 條）
2. v5 SD §27 Open Design Decisions（6 條）
3. Lovable 審視 v5 SD 後新增疑問與衝突（19 條，見 `.lovable/audits/spec-conflict-2026-05-06-E.md`）

去重合併後共 **28 條**。

---

## 第一優先（gating Phase E0；不解不能寫 type）

| ID | 來源 | 問題 |
|---|---|---|
| Q1 | SA §19 Q1 | 產品名 Pantheon vs Pathreon — 全文以哪個為準？ |
| Q2 | E01 | v5 enum 是否 re-export v4？或為 view-model 專用？ |
| Q3 | E02 / SD §27 row 5 | `bff.v5.*` 掛點：`src/lib/bff/v5.ts`（建議）vs `src/lib/v5/bff.ts`？ |
| Q4 | E10 | `PersonaExecutionHealth.mode` canonical = `live\|paper\|shadow\|suspended`？seed adapter 對照？ |
| Q5 | E11 | `SentinelFinding.status` 採 SD 版（6 值）supersede SA 版？ |
| Q6 | E12 | `RemediationAction` 欄位名 `mode` 取代 SA `automationLevel`？ |
| Q7 | E13 | `InterventionItem` 是否 supersede SA 版？SA 三欄（modifyAllowed / evidenceRefs / recommendation）取捨？ |
| Q8 | E14 | Health score 預設權重與閾值（healthy/watch/degraded/critical 切點）？ |
| Q9 | E15 | Sentinel mock 派生 mapping（severity / confidence / blastRadius / actions）？ |
| Q10 | E16 | v5 mock action 是否寫回 seed？或只動 v5 derived layer？ |
| Q11 | SA §19 Q6 | HIQ 是否取代既有 `/management/approvals`？ |

## 第二優先（gating Phase E1–E6）

| ID | 來源 | 問題 |
|---|---|---|
| Q12 | E03 / Pack D D05 | LoopStage timeout / failureState — 等 Pack D 回應或 v5 自行 stub？ |
| Q13 | E04 / Pack D D12 | Remediation requiredRoles 對應 capability id — 等 Pack D 或 v5 自行 stub？ |
| Q14 | E05 / Pack D D59 | ControlRoomSummary 引用 MeDto — 等 Pack D 或 v5 假設最小欄位？ |
| Q15 | E06 / Pack D D26 | v5 typed event envelope — 等 Pack D 或 v5 先定 mock envelope？ |
| Q16 | E07 / Pack D D22 | LoopRuns totalCount — 等 Pack D 或 v5 先 deterministic？ |
| Q17 | E08 | Command Center 過渡期掛 Legacy group 可接受？ |
| Q18 | E09 | Personas E1 雙入口可接受、E7 收斂？ |
| Q19 | E17 | Realtime bus 復用 `src/lib/bff/realtime.ts`？v5 channel topic prefix 規範？ |
| Q20 | E18 | v5 沿用 `usePermissions()`？ |
| Q21 | E19 | `/management/alpha-factory` route 來源（新建 stub vs 既有 rename）？ |
| Q22 | SA §19 Q? / SD §27 row 6 | v5 event 採 typed event + 既有 data refresh，請確認？ |

## 第三優先（gating Phase E7–E8 / polish）

| ID | 來源 | 問題 |
|---|---|---|
| Q23 | SD §27 row 1 | Control Room 取代 Command Center 的時點（建議 E2 acceptance 後）？ |
| Q24 | SD §27 row 2 | Sentinel action 採 guarded mock（low/mid）+ HighRiskConfirm（emergency）？ |
| Q25 | SD §27 row 3 | Persona health scoring 標 `mock formula v0`？ |
| Q26 | SD §27 row 4 | E1 nav 重複允許、E7 清理 — 確認？ |
| Q27 | SA §19 其他 | LoopRun 是否需要持久化（DB）？或永遠是衍生 view-model？ |
| Q28 | SA §19 其他 | Sentinel evidence 引用既有 alert/incident id 即可，不另存 evidence table？ |

---

## 回覆格式建議

```csv
id,answer,addendum_to,notes
Q1,Pantheon,—,SA §1 採 Pantheon
Q2,re-export v4,SD §7.1,view-model 專用 enum 限本層
...
```

完成後置於 `.lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv`，Lovable 即可啟動 E0。
