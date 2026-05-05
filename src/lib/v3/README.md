# v3 Normative Layer

Authoritative TypeScript representation of Pantheon Build Spec **v3** (`.lovable/spec/v3/`).
This folder is **additive**: existing `src/lib/*` modules continue to work; new code MUST import from here.

Conflict resolution order: **v3 (here) → v2 → v1 base spec**.

## Modules

| File | Spec section | Gaps resolved |
|---|---|---|
| `status.ts` | §4 Canonical Status / State Machines | G01, G14, G15 |
| `permissions.ts` | §5 Permission Truth Tables | G02 |
| `highRiskActions.ts` | §6 High-Risk Actions / Confirm Token | G03, G66, G86 |
| `environment.ts` | §7 Environment Model / Action Gating | G04 |
| `availableActions.ts` | §8 ActionDescriptor contract | G05, G67 |
| `capitalPoolMandate.ts` | §9 Capital Pool Mandate Schema | G16 |
| `rankingMatrix.ts` | §10 Ranking Formula / Metric Matrix | G17, G31 |
| `rebalanceWorkflow.ts` | §11 Quarterly Rebalance Workflow | G18, G32, G68 |
| `evolutionSchemas.ts` | §12 Evolution Constraints / Alerts / Approvals | G19 |
| `pageTabs.ts` | §13 Management Page Tab Corrections | G28, G29, G30 |
| `routes.ts` | §14 Canonical Routes | G33 |
| `agoraHandoff.ts` | §15 Agora Handoff Schema | G48, G65 |
| `signalFeedback.ts` | §16 Signal Feedback Write Contract | G49, G57 |
| `agoraKpi.ts` | §17 Daily Brief / KPI Formulas | G56 |
| `committeeEvidence.ts` | §18 Committee Evidence Pack | G51, G58 |
| `processMapping.ts` | §3 Process-to-Surface Mapping | G13 |
| `medium-low/` | Pack B §1–§45 (G06–G92 M/L) | 64 M/L gaps |

## Usage

```ts
import { STRATEGY_LIFECYCLE, type StrategyLifecycleStatus } from "@/lib/v3/status";
import { highRiskActions, requestConfirmToken } from "@/lib/v3/highRiskActions";
import { canRoleInvoke } from "@/lib/v3/permissions";
```

Migration path: every new feature uses v3; legacy code is migrated opportunistically when touched.
