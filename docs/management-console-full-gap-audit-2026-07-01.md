# Pantheon Management Console Full Gap Audit - 2026-07-01

這是第二次完整重盤點，不沿用舊結論直接判斷。這次同時看四種證據：`src/App.tsx` route tree、`src/management/ManagementLayout.tsx` navigation tree、頁面資料來源/寫入方式、以及本機 browser 逐頁巡檢。

結論先講清楚：Management Console 不是「很多頁都該刪」。真正問題是 53 個一級入口裡，有一大群頁面已經可渲染但仍停在共用 list shell、seed/mock 顯示、toast-only 操作，或只有摘要 dashboard，尚未形成 production operator workflow。刪除候選很少；降級、合併、深開發候選很多。

## Re-Audit Evidence

- Source route inventory: `src/App.tsx` 目前掛載 106 條 `/management` route line，包含 index、renderable pages、detail pages、legacy aliases、hidden studios。
- Primary nav inventory: `src/management/ManagementLayout.tsx` 目前有 53 個一級 nav entry。
- Browser route walk: 本機 mock-mode FE `http://127.0.0.1:5174` 逐頁開啟 70 個固定入口，結果 70/70 可渲染。
  - 59 個是實際 renderable management surface。
  - 10 個是 legacy alias redirect。
  - 1 個是 `/management` landing redirect。
- Browser walk artifact was generated at `/tmp/pantheon-management-mock-route-audit.json` during this audit pass.
- Hosted FE deployment rechecked: `/deployment.json` returns 200 and currently reports dev commit `5e1bb75d3906d744bb9943814b269d12f4087e5b`, `VITE_BFF_MODE=live`, `VITE_BFF_FALLBACK=strict`; this is not the current MGMT-GAP-002 PR head `ec73da1fa4ad6d2cfe51d8da84eabe408d2d4ff1`.
- Hosted BFF rechecked during this pass: `/healthz` and the browser-style `OPTIONS /bff/management/data-sources` both timed out after 8 seconds. Earlier CORS 400 was fixed in root PR #2653, but current hosted proof is now blocked by BFF availability/timeouts, not by the old allow-header diff.
- Local FE validation for MGMT-GAP-002 remains:
  - `npm run test` passed, 99 files / 1007 tests.
  - `npm run build` passed with existing warnings.
  - `npm run lint` passed with existing warnings.
  - `e2e/18-perf.spec.ts`, `e2e/19-management-persona-100-flows.spec.ts`, and `e2e/21-management-canonical-reads.spec.ts` passed locally.

## Route Shape

The first-level nav is grouped as:

- Oversight: cockpit, persona-fleet, human-inbox, trading-pulse, evolution-journal, evidence, persona-intent.
- Performance & League: portfolio-book, persona-league, quarterly-ranking, performance-attribution.
- Live Readiness: readiness/ep5, readiness/broker-live, readiness/capital-binding-live, readiness/bff-ha, readiness/strict-publish.
- Advanced Registry: strategies, alpha-factory, personas, capital, ranking, rebalance, evolution, experiments, artifacts, lineage, loops.
- Operations: deployments, runtimes, risk, incidents, jobs, alerts, sentinel, interventions, approvals, governance, route policies, permissions, memory governance, consult rules, knowledge, postmortems.
- Capabilities: tools, mcp, skills, workflows, hooks, channels.
- System: llm-provider-auth, data-sources, audit, settings.

The alias routes currently redirect correctly for:

- `/management/control-room`, `/management/one-ring`, `/management/overview`, `/management/command-center` -> `/management/cockpit`
- `/management/risk-center` -> `/management/risk`
- `/management/capital-pools` -> `/management/capital`
- `/management/ranking-formulas` -> `/management/ranking/formulas`
- `/management/rebalances` -> `/management/rebalance`
- `/management/research` -> `/management/experiments`
- `/management/deployment` -> `/management/deployments`

Remaining duplicate detail aliases should still be cleaned up: `capital-pools/:id`, `ranking-formulas/:id`, `rebalances/:id`, and `research/:id` render detail pages directly instead of redirecting to canonical detail routes.

## Browser Walk Summary

All 70 fixed routes rendered, but the route types are uneven:

| Type | Routes | Audit reading |
| --- | --- | --- |
| Core oversight dashboards | cockpit, persona-fleet, human-inbox, trading-pulse, evolution-journal, evidence, persona-intent | Keep. These are distinct operator jobs, but several still depend on seed/live fallback semantics and need stricter degraded states. |
| Shared registry list shell | strategies, personas, capital, ranking/formulas, rebalance, evolution, experiments, artifacts, deployments, runtimes, incidents, jobs, approvals, governance, route policies, tools, mcp, skills, channels, audit | Do not delete only because they look similar. The shared shell is acceptable; each domain needs deeper detail workflows and better empty/degraded states. |
| Action-heavy dashboards | ranking, sentinel, interventions, risk, alerts, alpha-factory, persona-league, settings, formula studio | Highest risk of looking production-ready while actions are not all durable. Needs write receipts and clearer production/mock boundaries. |
| Canonical-read pages fixed by MGMT-GAP-002 | data-sources, permissions, memory, consult, lineage, workflows, hooks, knowledge | Reads are now wired to canonical BFF helpers. Writes are still incomplete on several pages. |
| Readiness pages | ep5, broker-live, capital-binding-live, bff-ha, strict-publish | Keep, but production mode must not show seed-positive readiness when live proof is unavailable. |
| Hidden/developer tools | studios/formula, studios/skill-sandbox | Useful, but should not be first-class production operator surfaces until backend authoring contracts exist. |

## What Feels Repeated

The repeated feeling is real, but it comes from three different causes:

1. Many registry pages share `ObjectListPage`: strategies, personas, capital, ranking formulas, rebalances, evolution, experiments, artifacts, deployments, tools, MCP, skills, and channels. This should stay as a common shell, but each page needs domain-specific actions, detail previews, lifecycle receipts, and evidence panels.
2. Many operations pages are table-first: incidents, jobs, alerts, approvals, governance, route policies, audit. These should stay separate because they answer different operator questions, but filters, bulk actions, and drilldowns need to become more domain-aware.
3. Some pages are mock/studio concepts exposed too prominently: settings, postmortems, formula studio, skill sandbox. These create the strongest sense of "UI page inflation" because they are visibly interactive but not production-backed enough.

## Needs Adjustment

1. Hosted BFF availability must be stabilized before any production-level claim.
   - Root CORS allow-header fix was merged in pantheon PR #2653.
   - Current recheck is timeout on `/healthz` and browser preflight, so execute-plans PR #124 cannot be considered production complete yet.

2. Detail aliases need canonical redirects.
   - List aliases mostly redirect, but some detail aliases still render directly.
   - This makes the IA cleanup look done while duplicate URL surfaces remain.

3. The shared list shell needs domain differentiation.
   - Keep the shell.
   - Add per-domain columns, status semantics, primary actions, evidence links, and degraded/empty states.

4. Local-only write affordances must become durable BFF commands.
   - Affected examples: ranking recalculate/freeze/publish/override, workflow run, knowledge promote/dismiss, consult-rule submit, memory approve/reject/merge, settings save/break-glass, formula backtest, skill sandbox run, several detail-page "queued" toasts.

5. Mock/live boundaries need to be visible and strict.
   - Browser walk showed `MOCK` banners in mock mode, which is good.
   - The production gate must also prove strict-live mode shows degraded/empty truth rather than confident seed data when BFF is down.

6. LLM Provider Auth still has a deployment/runtime gap.
   - During the local route walk, assistant provider/mode/status calls attempted hosted BFF requests and produced CORS/network console errors.
   - That page needs either a same-origin/proxied BFF path in dev, or a clearer unavailable state when hosted BFF is down.

## Needs Deletion Or Demotion

Delete very little. Demote or hide these until contracts exist:

- `settings`: split into real operator settings versus development-only mock persistence/break-glass controls. The current page has local inputs and toast-only save/break-glass behavior.
- `postmortems`: currently has local `SEED`; either wire to canonical postmortem/evidence BFF or remove from top-level nav.
- `studios/formula`: keep as developer/studio tool, not production operator nav, until formula authoring/backtest/publish contracts exist.
- `studios/skill-sandbox`: keep as developer/studio tool, not production operator nav, until execution traces and cost/readback are backend-backed.
- Residual standalone command/NL pages should stay retired behind redirects or be removed once the floating agent panel has production coverage.

Do not delete these just because their layouts rhyme: human-inbox, sentinel, interventions, approvals, alerts, incidents, persona-fleet, ranking/persona-league/quarterly-ranking, and registry lists. They are different operator workflows.

## Needs Deep Development

- Ranking dashboard: canonical ranking aggregate, durable recalculate/freeze/publish/override commands, readback audit, and approval linkage.
- Alpha factory: real idea-to-strategy lanes, scaffold/replicate commands, evidence lineage, queue states, and write receipts.
- Lineage explorer: canonical read is wired; still needs root traversal, evidence packet links, drilldown, graph state persistence, and degraded proof.
- Workflows and hooks: canonical reads are wired; run/toggle/edit/create/delete must become durable commands with audit receipts.
- Knowledge inbox: canonical read is wired; promote/dismiss must persist to knowledge/evidence/audit.
- Governance subpages:
  - permissions: grant changes need RBAC-aware BFF writes.
  - memory governance: approve/reject/merge must persist.
  - consult rules: add/update/delete/submit must persist.
  - route policies: list/detail/write parity still needs production proof.
- Readiness pages: each readiness page needs strict live proof, not seed-positive checklists during outage.
- Performance & League: portfolio, league, quarterly, and attribution should keep their routes but need drilldowns, canonical snapshots, and action receipts.
- LLM Provider Auth: provider status, reauth, mode activation, usage summary, and orchestrator status need reliable CORS/proxy and degraded behavior.
- Data Source Management: canonical read is wired; credential state, ingestion status, provider diagnostics, and remediation actions still need backend depth.

## Execution Tasks

- MGMT-GAP-001 - IA cleanup and duplicate route consolidation.
  - Done for top-level aliases.
  - Follow-up: redirect duplicate detail aliases to canonical detail URLs.

- MGMT-GAP-002 - Canonical management reads and browser proof.
  - FE canonical read wiring is implemented for data-sources, permissions, memory, consult, lineage, workflows, hooks, and knowledge.
  - Root BFF CORS header fix merged in pantheon PR #2653.
  - Not complete: execute-plans PR #124 still has a failed integration gate, and current hosted BFF health/preflight rechecks time out.

- MGMT-GAP-003 - BFF canonical read endpoints.
  - Mostly done at contract level.
  - Needs operational availability proof on hosted dev BFF.

- MGMT-GAP-004 - Durable write contracts.
  - Pending for governance, ranking, workflow, hook, knowledge, settings, studio actions, and several detail-page actions.

- MGMT-GAP-005 - Domain depth.
  - Pending for ranking, alpha-factory, readiness, performance drilldowns, lineage drilldowns, data-source diagnostics, and LLM provider auth.

- MGMT-GAP-006 - Deployment and hosted browser gate.
  - Pending. Must prove FE deployed commit, BFF `/healthz`, BFF preflight, browser console without CORS failures, and no seed fallback text in strict-live mode.

- MGMT-GAP-007 - Final 70-route production audit.
  - Pending. Acceptance should replay this audit shape against hosted strict-live FE after MGMT-GAP-002/004/005/006 are merged and deployed.

## Fleet Assignment

- Codex lane: maintain this audit, close route-alias acceptance, implement or review MGMT-GAP-004 write proof where scoped, and run MGMT-GAP-007 final acceptance.
- Claude lane: finish execute-plans PR #124 canonical read closeout and keep FE pages aligned with the BFF contracts.
- Gemini lane: deepen BFF/domain contracts for MGMT-GAP-005, especially ranking, alpha-factory, readiness, lineage, data-source diagnostics, and LLM Provider Auth.
- Gemini2 lane: own MGMT-GAP-006 deployment proof: BFF availability, preflight, hosted browser probe, and PR/check reruns.

## Current Production-Level Status

Not production-complete yet.

- Local FE route audit is strong: 70/70 management entry routes render.
- Local tests/build/lint/e2e for MGMT-GAP-002 pass.
- Root BFF CORS fix is merged.
- Hosted BFF currently times out, and execute-plans PR #124 is still open with a failed integration gate.

The next hard gate is to stabilize hosted BFF, rerun PR #124 integration-gate, merge #124, wait for FE dev deployment, then replay the 70-route strict-live audit.
