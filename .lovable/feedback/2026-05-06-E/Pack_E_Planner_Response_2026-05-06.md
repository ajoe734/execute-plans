# Pack E — Planner Disposition Response

日期：2026-05-06

用途：回覆 `.lovable/feedback/2026-05-06-E/Pack_E_Planner_Questions.md` 的 28 條規劃問題，供 Lovable 啟動 Phase E0。

## 總決策

- 產品名統一為 Pantheon；Pathreon 作為 legacy typo/alias。
- v5 是 closed-loop view-model / IA / Sentinel / HIQ 升級層，不取代 v4 normative type / status enum / permission / API contract。
- Pack E 採共融式重構：新增上層 closed-loop OS，保留現有管理頁為 drill-down / evidence / manual override。
- E0 可開始，但 Q12–Q16 明確標示為 Pack D blockers 的 transitional stub，不得宣稱為最終後端 contract。
- `Pack_E_Disposition_2026-05-06.csv` 為可直接交給 Lovable 的 disposition CSV。

## 逐條回覆

### Q1

**Answer**: Pantheon

**Addendum to**: SA §1 / SA §19 Q1 / all v5 docs

**Notes**: Canonical product name is Pantheon. Treat Pathreon as legacy typo/alias only; do not use it in routes, i18n keys, H1, filenames, or UI labels.

### Q2

**Answer**: b — v5 enums are view-model only; v4 remains normative source of truth

**Addendum to**: SD §7.1 / v5 INDEX / spec INDEX

**Notes**: LoopStatus, HealthStatus, AutonomyMode, RemediationMode, InterventionSeverity may exist only in v5 closed-loop UI layer. Strategy status, deployment status, action descriptors, permission/action semantics must import/map to v4 normative types when representing domain state. Do not expose v5 view enums as backend domain DTO replacements.

### Q3

**Answer**: a — implement src/lib/bff/v5.ts and mount under bff.v5

**Addendum to**: SD §3.2 / SD §8.1 / SD §27 row 5

**Notes**: Keep facade consistent with existing bff.* pattern. Use src/lib/v5 for types, selectors, adapters, health, remediation, events; use src/lib/bff/v5.ts for facade and attach it in src/lib/bff/client.ts as bff.v5.

### Q4

**Answer**: canonical PersonaExecutionHealth.mode = live | paper | shadow | suspended

**Addendum to**: SD §7.4 / SD §15.6

**Notes**: Remove paused from canonical enum. Mapping: active/deployed/live -> live; paper -> paper; draft/sandbox/review/testing -> shadow; retired/archived/suspended/restricted/disabled/paused -> suspended. If reason is needed, add optional suspendedReason rather than more mode values.

### Q5

**Answer**: Use SD status enum: open | acknowledged | action_pending | mitigating | resolved | dismissed

**Addendum to**: SA §8.5 / SD §7.9

**Notes**: SD supersedes SA for SentinelFinding.status. Mapping: SA accepted -> acknowledged; executing -> mitigating; superseded is not a status in E0. If needed later, represent supersession with optional supersededByFindingId and status dismissed or resolved depending on outcome.

### Q6

**Answer**: Use mode

**Addendum to**: SA RemediationAction / SD §7.8

**Notes**: Canonical field is mode: advisory | guarded_automation | emergency_override. SA automationLevel is deprecated alias and should not be emitted by bff.v5.

### Q7

**Answer**: SD supersedes SA, with one correction: restore optional evidenceRefs

**Addendum to**: SA §8.7 / SD §7.10

**Notes**: Use SD fields requiredRoles and linkedApprovalId/linkedFindingId/linkedIncidentId. Rename recommendation to recommendedDecision. Do not keep modifyAllowed as stored data; derive it from allowed decisions, requiredRoles, and source. Restore evidenceRefs?: EvidenceRef[] as optional because non-Sentinel interventions may need direct evidence without a linkedFindingId.

### Q8

**Answer**: Adopt formulaVersion v0-mock with explicit weights and thresholds

**Addendum to**: SD §20.2 / src/lib/v5/health.ts

**Notes**: PersonaHealth score weights: performance 25%, risk 25%, executionQuality 20%, decisionQuality 15%, policyCompliance 10%, sentinelPenalty 5%. StrategyHealth score weights: performance 30%, risk 25%, executionQuality 20%, lifecycle/deployment consistency 10%, sentinel/incident penalty 15%. Thresholds: healthy >= 80; watch 65-79; degraded 45-64; critical < 45. Critical override: any critical open incident, emergency Sentinel finding, or hard risk breach forces critical regardless of numeric score. Label all output formulaVersion=v0-mock and keep scorer replaceable.

### Q9

**Answer**: Use deterministic Sentinel derivation map from alerts/incidents/jobs/runtime/persona health

**Addendum to**: SD §8.2 / SD §15.5 / SD §20

**Notes**: Severity mapping: incident.critical or alert.critical -> critical confidence 0.88; high -> warning confidence 0.76; medium -> watch confidence 0.62; low -> info confidence 0.45. Add +0.04 confidence per corroborating evidence, capped at 0.95. blastRadius is derived from relatedTarget/affected ids; expand strategy -> personas/capitalPool/deployments using seed relationships. Actions: drawdown/slippage/live-paper divergence -> reduce_allocation + switch_persona_to_shadow + start_evolution_run; runtime/MCP latency -> route_to_backup_runtime + open_incident; capital utilization/concentration -> freeze_rebalance + request_human_approval; approval SLA breach -> escalate intervention; critical incident -> emergency rollback/pause routing when target supports it.

### Q10

**Answer**: b — v5 mock actions only mutate v5 derived overlay state, not existing seed

**Addendum to**: SD §15.6 / SD §21.2

**Notes**: Do not write pause_persona_routing or switch_persona_to_shadow into existing seed personas/strategies. Maintain an in-memory v5ActionOverlay with 30 minute TTL, emit audit-like v5 event and realtime refresh. Existing pages remain stable unless they intentionally read v5 overlay.

### Q11

**Answer**: b — coexist: HIQ is unified entry; approvals remains drill-down/detail surface

**Addendum to**: SA §19 Q6 / SD §5 / SD §14

**Notes**: Do not remove /management/approvals in Pack E. /management/interventions aggregates approvals, Sentinel recommendations, incidents, policy exceptions, emergency reviews. Approval detail stays accessible for legacy workflows and drill-down.

### Q12

**Answer**: v5 may stub timeout/failureState until Pack D D05 resolves

**Addendum to**: SD §7.2 / SD §7.3 / Pack D D05

**Notes**: Use temporary timeoutPolicy=v0-mock: running stage warning at 15 min, blocked escalation at 60 min, emergency action review at 5 min, approval stages use existing approval SLA when present. Do not persist failureState as domain truth; show UI-only blocked/failed state and mark source=mockTimeoutPolicy.

### Q13

**Answer**: Use transitional requiredRoles now; add optional requiredCapabilities for future D12 alignment

**Addendum to**: SD §7.8 / Pack D D12

**Notes**: In E0-E6, requiredRoles uses existing role strings and usePermissions(). Add requiredCapabilities?: string[] but leave empty or derived best-effort. After Pack D D12, capability becomes source of truth and role becomes grouping hint.

### Q14

**Answer**: Do not block v5 on MeDto; use minimal mock session context until Pack D D59/D51

**Addendum to**: SD §7.11 / SD §12 / Pack D D59 D51

**Notes**: ControlRoomSummary E0 should not require currentUser or featureFlags. Use tenantId="demo", env and locale from existing platform store, and generatedAt/serverTime from Date.now(). Later replace with /bff/me once D59/D51 is resolved.

### Q15

**Answer**: Define v5 mock typed event envelope now; later align with Pack D D26

**Addendum to**: SD §9 / Pack D D26

**Notes**: Use envelope {id, schemaVersion:1, channel, type, occurredAt, correlationId, payload}. Transport uses existing mock realtime bus. Prefix channels as v5.loop.*, v5.sentinel.*, v5.intervention.*, v5.execution.*, v5.optimization.*. Do not claim this is final backend SSE schema.

### Q16

**Answer**: Use deterministic exact counts in v5 mock list responses

**Addendum to**: SD §13 / Pack D D22

**Notes**: For v5 only, return V5ListResponse<T> = {items, totalCount, totalCountExact:true}. Keep adapter isolated so it can be replaced by the Pack D pagination contract when D22 is settled.

### Q17

**Answer**: Yes — keep Command Center in Legacy / Advanced during transition

**Addendum to**: SD §6 / SD §27 row 1

**Notes**: Phase E1 must not create a route with no nav entry. Add a Legacy or Advanced group containing /management/command-center and /management/overview until Control Room acceptance is passed.

### Q18

**Answer**: Yes — Personas dual entry is acceptable in E1; dedupe in E7

**Addendum to**: SD §6 / SD §6.2

**Notes**: Use dedupeKey="personas" in nav config or equivalent active-state logic so the sidebar does not double-highlight. E7 decides final placement or changes Execution Loop item to /management/loops/execution?focus=personas.

### Q19

**Answer**: Reuse existing src/lib/bff/realtime.ts mock bus

**Addendum to**: SD §9

**Notes**: Topic prefixes: v5.loop.run.*, v5.loop.stage.*, v5.execution.health.*, v5.optimization.run.*, v5.sentinel.finding.*, v5.sentinel.action.*, v5.intervention.*. Also emit existing data refresh events where useful for legacy refetch.

### Q20

**Answer**: Use existing usePermissions() in Pack E; do not create a separate v5 capability system yet

**Addendum to**: SD permission usage / Pack D D12

**Notes**: For emergency and high-risk actions, use HighRiskConfirm plus existing role permission checks. Add TODO hooks for requiredCapabilities after Pack D D12.

### Q21

**Answer**: Route already exists: /management/alpha-factory uses AlphaFactoryBoardPage

**Addendum to**: Conflict E19 / SD §6

**Notes**: Mark E19 as resolved/no-op for current main branch. Keep Research Loop link to /management/alpha-factory. No stub or rename needed.

### Q22

**Answer**: Yes — use typed v5 events plus existing data refresh in parallel

**Addendum to**: SD §9 / SD §27 row 6

**Notes**: Typed event drives v5 reducers/cards. Existing data refresh events keep legacy pages and useLiveList behavior working. This is transitional until Pack D D26 finalizes channel payload schema.

### Q23

**Answer**: Staged replacement: default index after E2; command-center redirect only after E7

**Addendum to**: SD §5.2 / SD §27 row 1

**Notes**: After E2 acceptance, /management should open /management/control-room. Keep /management/command-center reachable under Legacy/Advanced until E7 IA stabilization. At E7, either redirect command-center to control-room or keep as hidden legacy route based on operator feedback.

### Q24

**Answer**: Yes — advisory no-op, guarded mock executes overlay action, emergency requires HighRiskConfirm

**Addendum to**: SD §15.6 / SD §21.2 / SD §27 row 2

**Notes**: Advisory actions only create recommendation. Guarded automation can update v5 overlay, audit, and realtime event. Emergency override always requires HighRiskConfirm, creates emergency_review InterventionItem, and writes audit/realtime records.

### Q25

**Answer**: Yes — label health scoring as mock formula v0 and make replaceable

**Addendum to**: SD §20.2 / SD §27 row 3

**Notes**: Expose formulaVersion="v0-mock" in PersonaExecutionHealth and StrategyExecutionHealth. Implement scoring as pure functions with inputs object and options so backend/LLM scoring can replace it later.

### Q26

**Answer**: Yes — allow E1 nav duplication; clean up in E7

**Addendum to**: SD §6.2 / SD §27 row 4

**Notes**: Duplication is acceptable only when the same route is reached through different mental models. Use dedupeKey and avoid duplicate routes with conflicting labels.

### Q27

**Answer**: LoopRun is derived view-model in Pack E; no DB/localStorage persistence

**Addendum to**: SA §19 derived / SD §8 / SD §25

**Notes**: Derive LoopRun from seed/jobs/approvals/alerts/incidents plus v5 in-memory overlay. Overlay TTL is 30 minutes. Refresh may reset mock state. Do not introduce localStorage or DB persistence in Pack E.

### Q28

**Answer**: Yes — evidence references existing entities; no separate evidence table in Pack E

**Addendum to**: SA §19 derived / SD §7.7 / SD §7.9

**Notes**: Use EvidenceRef pointing to alert, incident, job, audit, metric, strategy, persona, deployment, runtime, policy, or approval. For synthetic metrics, embed snapshot value in EvidenceRef. No independent evidence store/table until backend requires it.

