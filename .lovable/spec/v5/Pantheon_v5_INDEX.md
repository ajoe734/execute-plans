# Pantheon v5 — Closed-Loop Supervisor OS — INDEX

**日期**：2026-05-06
**狀態**：SA + SD 收件中。實作待 Pack D blockers 與 Pack E conflicts 解決。

## 文件

| 檔案 | 角色 | 行數 |
|---|---|---|
| `Pantheon_v5_Closed_Loop_Supervisor_OS_SA_2026-05-06.md` | 系統分析 / IA / Loop / Sentinel / HIQ 概念設計 | — |
| `Pantheon_v5_Closed_Loop_Supervisor_OS_SD_2026-05-06.md` | 系統設計 / 目錄、route、TS interface、phase 分工 | 2,769 |

## 與 v4 的關係

```
v5 = IA + Loop view-model + Sentinel + HIQ 升級層
     ↓ 疊加於
v4 = normative 型別 / status enum / permission / API contract（source of truth）
     ↓ 疊加於
v3 / v2 / v1 = 歷史層
```

- v5 **不取代** v4 的 `StrategyReviewStatus` / `StrategyDeploymentStatus` / `ActionDescriptor` 等 normative type。
- v5 新增的 enum（`LoopStatus`、`HealthStatus`、`AutonomyMode`、`RemediationMode`、`InterventionSeverity`）為 view-model 層，**必要時應 re-export 或對應 v4 enum**，不得另創同義詞。
- v5 BFF facade 預定掛在 `bff.v5.*`（不取代既有 `bff.strategies / personas / jobs` 等）。

## 五大新一級 surface

```
/management/control-room       — Pantheon Control Room
/management/loops              — Loop Runs 列表
/management/loops/{research|execution|optimization}
/management/sentinel           — Sentinel Findings
/management/interventions      — Human Intervention Queue (HIQ)
```

## 七個 v5 domain model

`LoopStage` · `LoopRun` · `PersonaExecutionHealth` · `StrategyExecutionHealth` · `OptimizationRun` · `SentinelFinding` · `RemediationAction` · `InterventionItem` · `ControlRoomSummary`

## 落地 phase（SD §25）

E0 types+mock → E1 routing+nav → E2 Control Room → E3 Execution Loop → E4 Optimization Loop → E5 Sentinel → E6 HIQ → E7 IA stabilization → E8 QA/a11y/polish

## 待解事項

見 `.lovable/audits/spec-conflict-2026-05-06-E.md`（19 條）與 `.lovable/feedback/2026-05-06-E/Pack_E_Intake_Notes.md`。
