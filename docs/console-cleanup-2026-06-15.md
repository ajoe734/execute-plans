# Management Console Cleanup + BE Gap Backlog — 2026-06-15

Live probe basis: `https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io`
(dev, operator read). Byte sizes below = response payload size = data presence.

## A. What this change does (FE)

1. **Single console = Cockpit.** `/management/cockpit` (`OneRingCockpitPage`) is now
   the one and only management console. These all `Navigate → /management/cockpit`:
   `control-room`, `control-room-legacy`, `command-center`, `overview`,
   `overview-legacy`, `one-ring`. Loop-level detail stays at `/loops`, `/sentinel`,
   `/interventions`.
2. **Removed superseded pages** (dead code): `src/management/pages/v5/ControlRoom.tsx`
   and `src/management/pages/Overview.tsx` (old `ManagementOverview`).
3. **Removed the `legacy` nav group** in `ManagementLayout.tsx`.
4. **`/qa` is now dev-only** (`import.meta.env.DEV` guard) — not mounted in prod builds.
5. **Removed the entire Studios authoring layer** (8 pages + 3 components) — see §A2.
6. **Collapsed 4 duplicate readiness route-aliases to redirects** (`broker-live`,
   `capital-live`, `system/bff-ha`, `system/strict-publish` → canonical `readiness/*`).

## A2. Studios layer removed — rationale

The `/management/studios/*` section (StudiosOverview, FormulaStudio,
FitnessFormulaStudio, EvolutionStudio, AllocationStudio, RebalanceOpsStudio,
CapitalStudio, SkillSandboxStudio) was removed because, after a per-page audit:

- It was **100% mock with zero backend** — every action is a local `toast`
  ("queued"/"executed"); there is no `/bff/studios/*` endpoint of any kind.
- Its panels **already live on the entity detail pages**: `RiskBudgetPanel` +
  `BindingsMatrix` on `CapitalPoolDetail`, `AllocationSimulationPanel` on
  `RebalanceDetail`/`CapitalPoolDetail`, `ConstraintChecker`/`EvolutionRunsPanel`
  on the rebalance/evolution details. The studios just re-wrapped them behind a
  dropdown picker.
- It is **premature for the current product stage** (no real strategies, formulas,
  or rebalances exist yet to author).

Inbound links were repaired: the `RankingFormulasList` "create" redirect and the
`SkillDetail` "Open Sandbox Studio" tab were removed. When a real authoring/backtest
**backend** lands, the relevant studio can be reintroduced against the live contract
(FormulaStudio + SkillSandboxStudio are the strongest candidates to bring back).

Everything else is **kept** — every other feature page is a fully-built UI that is
on-vision for Pathreon. Pages that look "empty" are blocked on a **backend gap**,
not a frontend problem. The backlog below tracks those gaps so BE can be filled in.

## B. Kept-and-working (BE live + populated) — no action

`cockpit` (945KB), `persona-fleet` (187KB), `personas` (12KB), `capital`/`capital-pools`,
`deployments` (20KB), `runtimes` (15KB), `channels`, `alerts`, `governance` (ledger 1.2MB),
`audit` (150KB), `risk` (360KB), `portfolio-book`, `persona-league`, `quarterly-ranking`,
`performance-attribution`, `trading-pulse`, `persona-intent`, agora `daily`/`journal`/`inbox`.

## C. Kept, BE EXISTS but returns empty/degraded — upstream build gap

These pages are correct; they are empty because dev has no real strategy artifacts /
no signal producer / no market data (the known dev build gap, not BE wiring). Action:
confirm each renders the proper degraded/empty state; data arrives when the loop produces it.

| Page | Endpoint | State |
|---|---|---|
| strategies | `/bff/strategies` | `status:unavailable, source:missing` |
| approvals | `/bff/approvals` | empty |
| interventions | `/bff/v5/interventions` | empty |
| loops (runs) | `/bff/v5/loop-runs` | empty |
| jobs | `/bff/jobs` | empty |
| rebalance | `/bff/rebalances` | empty |
| incidents | `/bff/incidents` | empty |
| artifacts | `/bff/artifacts` | empty |
| skills | `/bff/skills` | `unavailable` |
| tools | `/bff/tools` | empty |
| mcp | `/bff/mcp-servers` | empty |
| evolution | `/bff/evolution-programs` | empty |
| experiments | `/bff/research-experiments` | thin |
| readiness/* (ep5/broker/capital/bff-ha/strict) | `/bff/management/readiness/*` | degraded/unavailable |
| sentinel | `/bff/v5/sentinel/findings` | thin |
| agora signals / postmortems | `/bff/agora/{signals,postmortems}` | empty |

## D. Kept, NO BE endpoint yet (404) — **BE TO BUILD** backlog

Built UIs with no backend at all. Keep the page; build the endpoint.

| Page (route) | Component | Missing endpoint |
|---|---|---|
| `/management/workflows` | WorkflowTemplates | `GET /bff/workflows` (+ templates CRUD) |
| `/management/hooks` | HookCronManager | `GET /bff/hooks` (cron/hook registry) |
| `/management/lineage` | LineageExplorer | `GET /bff/lineage` (data/artifact lineage graph) |
| `/management/knowledge` | KnowledgeInbox | `GET /bff/knowledge` (knowledge inbox) |
| `/management/alpha-factory` | AlphaFactoryBoard | `GET /bff/alpha-factory` (idea→strategy board) |
| `/management/data-sources` | DataSourceManagement | `GET /bff/management/data-sources` |
| `/management/governance/permissions` | PermissionMatrix | `GET /bff/management/permissions` |
| `/management/governance/memory` | MemoryGovernance | `GET /bff/management/memory-governance` |
| `/management/governance/consult` | ConsultRules | `GET /bff/management/consult-rules` |
| `/management/governance/policies` | RoutePolicies | route-policy list endpoint (per-persona `/bff/personas/{id}/route-policy` 404 in dev) |

Agora authoring surfaces (`trainer`, `persona-lab`, `skill-coaching`, `committee`,
`memory`, `evaluations`) are kept; their write/detail endpoints should be confirmed
against `/bff/agora/*` and `/bff/personas/*` as the persona-training BE lands.

## E. Notes

- Duplicate routes called out in the original inventory (`capital-pools`→`capital`,
  `ranking-formulas`→`ranking/formulas`, `rebalances`→`rebalance`, `research`→`experiments`,
  `mcp-tools`, `risk-center`, agora `market`/`decisions`/`eval`/`skills`) were **already**
  collapsed to `<Navigate>` redirects upstream — no further dedup needed; they preserve
  old bookmarks at zero cost.
