# v4 Normative Layer (Pack C)

Authoritative TypeScript representation of Pantheon Build Spec **v4** (`.lovable/spec/v4/`)
and Pack C remediation (`.lovable/feedback/2026-05-05-C/`).

**Conflict resolution order**: **v4 (here) → v3 → v2 → v1**.

This layer is additive. `src/lib/v3/*` continues to compile; types collapsed by Pack C
(e.g. `StrategyReviewStatus` 9→4, `StrategyDeploymentStatus` 8→5) are re-exported here
as the canonical version. v3 modules are marked `@deprecated` opportunistically.

## Modules → Pack C gaps

| File | Gap |
|---|---|
| `legacyMapping.ts` | C001 |
| `envelope.ts` | C002 |
| `tabMigration.ts` | C003 |
| `transitions.ts` | C006/C007 |
| `strategyInvariants.ts` | C008 |
| `retention.ts` | C009 |
| `optimisticLock.ts` | C010 |
| `branching.ts` | C011 |
| `renderHints.ts` | C012 |
| `permissionsMatrix.ts` | C013 |
| `actionDescriptor.ts` | C014/C015 |
| `emergencyOverride.ts` | C016 |
| `roleLattice.ts` | C017/C018 |
| `confirmToken.ts` | C019 |
| `highRiskCatalog.ts` | C020–C023 |
| `pagination.ts` | C024–C026 |
| `errorEnvelope.ts` | C027 |
| `idempotency.ts` | C028 |
| `sseProtocol.ts` | C029, channel catalog, C030–C032 |
| `handoffSla.ts` | C033–C037 |
| `mandateMonitor.ts` | C038 |
| `rankingMetric.ts` | C039 |
| `rebalanceQuorum.ts` | C040–C041 |
| `fxPolicy.ts` | C042 |
| `evolutionLimits.ts` | C043 |
| `experimentGate.ts` | C044 |
| `reproducibility.ts` | C045 |
| `i18nFormat.ts` | C046–C049 |
| `designTokens.ts` | C050–C051 |
| `componentSpecs.ts` | C052–C055 |
| `a11y.ts` | C056–C058 |
| `security.ts` | C064–C065 |
| `perfBudget.ts` | C063 |
| `glossary.ts` | C067 |
| `ownerMap.ts` | C070 |
| `strategyTabs.ts` | C071 |
| `personaLab.ts` | C072 |
| `rankingInputs.ts` | C073 |
| `rebalanceUiPatterns.ts` | C074 |
| `signalConfidence.ts` | C075 |
| `committeeTemplates.ts` | C076 |
| `dailyBriefKpi.ts` | C077 |
| `lifecycleBucketColors.ts` | C078 |

## Usage

```ts
import {
  StrategyReviewStatus,
  validateStrategyTriple,
  HIGH_RISK_CATALOG,
  HANDOFF_SLA,
} from "@/lib/v4";
```

Stage 1 of the Pack C rollout creates skeletons + the data tables that are pure constants
(no behavioral side effects). Stages 2–6 wire them into BFF / mutations / UI.
