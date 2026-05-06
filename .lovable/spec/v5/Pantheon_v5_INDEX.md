# Pantheon v5 — Closed-Loop Supervisor OS — INDEX

**日期**：2026-05-06
**狀態**：SA + SD 已收件；規劃團隊 disposition 已完成（28/28）；E0 已落地於 `src/lib/v5/` + `src/lib/bff/v5.ts`，18 tests passing。

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

## 規劃團隊 disposition (2026-05-06) — canonical 鎖定

| 主題 | Canonical |
|---|---|
| 產品名 | **Pantheon**（Pathreon = legacy alias） |
| v4 vs v5 | v5 enum 僅 view-model；domain state 對應 v4 normative |
| BFF facade | `src/lib/bff/v5.ts`，掛 `bff.v5`；`src/lib/v5/` 放 types/selectors/adapters/health/remediation/events |
| `PersonaExecutionHealth.mode` | `live \| paper \| shadow \| suspended` |
| `SentinelFinding.status` | `open \| acknowledged \| action_pending \| mitigating \| resolved \| dismissed` |
| `RemediationAction.mode` | `advisory \| guarded_automation \| emergency_override`（automationLevel deprecated） |
| `InterventionItem` | SD 版 + 復原 `evidenceRefs?`；`recommendation` → `recommendedDecision`；`modifyAllowed` derived |
| Health scorer | `formulaVersion="v0-mock"`，weights/thresholds 見 `src/lib/v5/health.ts` |
| Sentinel | deterministic derivation（`src/lib/v5/sentinel.ts`） |
| v5 mock action | 只動 `v5ActionOverlay`（in-memory, 30 min TTL） |
| HIQ vs Approvals | coexist；不刪 `/management/approvals` |
| List response | `V5ListResponse<T> = {items, totalCount, totalCountExact:true}` |
| Event envelope | `{id, schemaVersion:1, channel, type, occurredAt, correlationId, payload}` 復用 `src/lib/bff/realtime.ts` |
| Permission | 復用 `usePermissions()`；emergency 走 HighRiskConfirm；`requiredCapabilities?` 預留 |

## 待解事項

19 條 spec-conflict-E 已全數 RESOLVED — 詳見 `.lovable/audits/spec-conflict-2026-05-06-E.md` 與 `.lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv`。
