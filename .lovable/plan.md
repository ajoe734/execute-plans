
# Pack E 落地調整計畫（依規劃團隊 2026-05-06 disposition）

規劃團隊已回覆全部 28 條問題，全部 19 條 spec-conflict-E 皆有明確處置。**E0 解除 gating，可直接進場**；E3/E5/E6 的 Pack D 依賴改為「v0-mock transitional stub」策略（明確標記、可替換）。

---

## A. 歸檔規劃團隊回覆（不改 src/）

1. 複製 `user-uploads://Pack_E_Planner_Response_2026-05-06.md` → `.lovable/feedback/2026-05-06-E/Pack_E_Planner_Response_2026-05-06.md`
2. 複製 `user-uploads://Pack_E_Disposition_2026-05-06.csv` → `.lovable/feedback/2026-05-06-E/Pack_E_Disposition.csv`
3. 更新 `.lovable/audits/spec-conflict-2026-05-06-E.md`：每條 E01–E19 標 RESOLVED + 對應 Q#/處置摘要；E19 標 no-op（route 已存在）
4. 更新 `.lovable/audits/INDEX.md`：Pack E 狀態改 RESOLVED (28/28)
5. 更新 `.lovable/spec/v5/Pantheon_v5_INDEX.md`：在「Disposition」段落鎖定 8 條 canonical 決策（見 §B）
6. 更新 `.lovable/plan.md`：新增 G 段「Pack E disposition 已收 → E0 啟動條件」+ 修訂 E0–E8 phase 表（Pack D 依賴改 stub 策略）
7. 更新 `mem://index.md` Core 與 `mem://features/v5-loop-os.md`：寫入下列 canonical 鎖定值

---

## B. canonical 鎖定（寫入 memory + v5 INDEX）

| 主題 | Canonical |
|---|---|
| 產品名 | Pantheon（Pathreon = legacy alias） |
| v4 vs v5 | v5 enum 僅 view-model；domain state 一律對應 v4 normative |
| BFF facade | `src/lib/bff/v5.ts`，掛 `bff.v5`；`src/lib/v5/` 只放 types/selectors/adapters/health/remediation/events |
| `PersonaExecutionHealth.mode` | `live \| paper \| shadow \| suspended`（seed adapter: active→live, retired→suspended, draft/sandbox→shadow） |
| `SentinelFinding.status` | `open \| acknowledged \| action_pending \| mitigating \| resolved \| dismissed`（SA accepted→acknowledged, executing→mitigating） |
| `RemediationAction.mode` | `advisory \| guarded_automation \| emergency_override`（automationLevel deprecated） |
| `InterventionItem` | SD 版 + 復原 `evidenceRefs?`；`recommendation` → `recommendedDecision`；`modifyAllowed` derived |
| Health scorer | `formulaVersion="v0-mock"`，weights 與 thresholds 見 Q8 |
| Sentinel mock | 依 Q9 deterministic derivation map |
| v5 mock action | 只動 `v5ActionOverlay`（in-memory, 30 min TTL），不寫回 seed |
| HIQ vs Approvals | coexist；不刪 `/management/approvals` |
| List response | `V5ListResponse<T> = {items, totalCount, totalCountExact:true}` |
| Event envelope | `{id, schemaVersion:1, channel, type, occurredAt, correlationId, payload}`，channel `v5.{loop\|sentinel\|intervention\|execution\|optimization}.*`，復用 `src/lib/bff/realtime.ts` |
| Permission | 復用 `usePermissions()`；emergency 走 HighRiskConfirm；`requiredCapabilities?` 預留 |

---

## C. Phase E0 落地（src/lib/v5 + src/lib/bff/v5.ts）

新建檔案：

```
src/lib/v5/
  index.ts              barrel
  types.ts              7 domain models（Q2/Q4/Q5/Q6/Q7 canonical）
  enums.ts              LoopStatus / HealthStatus / AutonomyMode / RemediationMode / InterventionSeverity
  events.ts             V5EventEnvelope + channel/type 常數（Q15/Q19）
  list.ts               V5ListResponse<T>（Q16）
  health.ts             computePersonaHealthScore / computeStrategyHealthScore（Q8/Q25, formulaVersion="v0-mock"）
  sentinel.ts           deriveFindings(seed) — Q9 mapping
  remediation.ts        action catalogue + advisory/guarded/emergency 分流（Q24）
  overlay.ts            v5ActionOverlay（in-memory, 30 min TTL, Q10/Q27）
  adapters/
    persona.ts          seed.persona → PersonaExecutionHealth（Q4 mapping）
    strategy.ts         seed.strategy → StrategyExecutionHealth
    loopRun.ts          derive LoopRun from seed/jobs/approvals/alerts/incidents（Q27）
    intervention.ts     unify approvals + sentinel + incidents + policy exceptions（Q11）
  timeoutPolicy.ts      v0-mock: running 15min warn / blocked 60min escalate / emergency 5min review（Q12）
  __tests__/            health.test.ts / sentinel.test.ts / overlay.test.ts / adapters.test.ts

src/lib/bff/v5.ts       facade: controlRoom / loops / personas / strategies / sentinel / interventions / remediation
                        - controlRoom.get() 用最小 mock session（tenantId="demo"）（Q14）
                        - list 一律回 V5ListResponse（Q16）
                        - 寫操作經 overlay + emit v5 event + emit legacy data refresh（Q22）
src/lib/bff/client.ts   掛 bff.v5
```

驗收（vitest）：
- 7 個 type 與 enum 命名與 disposition 完全一致
- health scorer 對固定 input 產出固定 score 與 status，含 critical override
- sentinel deriver 對固定 seed 產出固定 findings + actions
- overlay 30 min TTL；不會修改 seed
- bff.v5.controlRoom.get() 不依賴未存在的 MeDto
- V5ListResponse.totalCountExact === true

---

## D. 後續 phase 修訂（不在本次執行，僅鎖定計畫）

| Phase | 範圍 | gating |
|---|---|---|
| **E0**（本次）| src/lib/v5 + src/lib/bff/v5.ts + tests | 已解除 |
| E1 | App.tsx routes + nav；Command Center 移 Legacy（Q17）；Personas dedupeKey（Q18）；alpha-factory 維持（Q21）；i18n keys | E0 |
| E2 | `/management/control-room`；E2 acceptance 後 `/management` index 預設 control-room（Q23） | E1 |
| E3 | `/management/loops/execution` + Persona Health Matrix；用 timeoutPolicy v0-mock（Q12） | E0 |
| E4 | `/management/loops/optimization` | E0 |
| E5 | `/management/sentinel`；advisory/guarded/emergency 分流（Q24） | E0 |
| E6 | `/management/interventions`；不動 `/management/approvals`（Q11） | E5 |
| E7 | IA 收斂；command-center 處置（redirect 或藏 legacy）；personas 去重 | E2–E6 |
| E8 | a11y / i18n coverage / reduced motion / vitest | 全部 |

---

## E. 不會做（明確排除）

- 不寫回 seed（personas/strategies/deployments）
- 不引入 localStorage / DB / Playwright
- 不刪 `/management/approvals` 或 `/management/command-center`
- 不改 `src/lib/v4/`
- 本次 E0 不動 `App.tsx`、`ManagementLayout.tsx`、`SideNav.tsx`、i18n locale（留給 E1）

---

## F. 驗收

- A 的 7 份歸檔/更新檔案完成，spec-conflict-E 全標 RESOLVED
- C 的 v5 layer 與 bff.v5 facade 落地、tests 全綠
- memory `mem://index.md` 與 `mem://features/v5-loop-os.md` 反映 §B canonical 鎖定
- 既有頁面（Command Center / Approvals / Personas）行為無變化（因為僅新增 v5 層、未改 seed）

核准後即進入 default mode 執行 A + C，然後等指示推進 E1。
