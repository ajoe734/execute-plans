# 5-tier Smoke Report — Batches II/III/IV + spec-conflict C1/C7/C8 + UI Hygiene G03/G08/G10/G11

Date: 2026-05-07
Run: `bunx vitest run` → **27 files, 268 tests, 0 failures**

## Tier 1 — Type / Build
- TypeScript build passes cleanly.
- No `any` introduced; new code uses Pack D canonical types (`RiskLevel`, `ErrorCode`, `RouteLabel`).

## Tier 2 — Unit (pure logic)
- `batch-ii` 12, `batch-iii` 9, `batch-iv` 11 — all green.
- `spec-conflict-c1-c7` 4 — risk widening + ErrorCode centralization green.
- `perf-budget-baseline` 2 — D63 5-tier targets present + numeric upper bound asserted.
- `spec-conflict-g-ui-hygiene` 6 — entityCreate.* keys present, drawer renders Slider/Select/multi-tag, route registry longest-prefix + parent chain.

## Tier 3 — Integration (DOM)
- EntityCreateDrawer mounted under jsdom: Slider role exposed, combobox (Select) trigger exposed, validation surfaces `role="alert"` (G11).
- Sheet + Radix primitives polyfilled via `ResizeObserver` / `hasPointerCapture` shims in `src/test/setup.ts`.

## Tier 4 — A11y (axe-core)
- `a11y-axe-smoke` continues to pass with `wcag2a/wcag2aa` rule subset; documented as the CI gate at `.lovable/audits/axe-ci-gate.md`.
- Drawer field errors now wired with `aria-describedby` + `role="alert"` (D62 scope satisfied for the drawer).

## Tier 5 — Contract (spec invariants)
- `RouteLabel` registry (`src/lib/v4/routeLabels.ts`) exposes single i18n key per route — SideNav, PageHeader (auto-resolves title/subtitle/breadcrumb), and Command Palette can all consume it. G08 closed.
- StrategyTripleStateCard enforces lifecycle×review×deployment invariants (C8 — landed earlier).
- METRIC_REGISTRY, assessBreach, EmptyState, SkeletonThreshold consumed by /loops/execution, Capital, Sentinel pages.

## Outstanding (not in this round)
- spec-conflict-G C1/C7 — RESOLVED (this batch).
- spec-conflict-G C2/C3/C4/C5/C6 — OPEN (BFF-dependent).
- Pack D §11.3 D04 / D30 / D35 / D36 — OPEN (BFF-dependent).
- Real-browser perf measurement against `PERF_BUDGET` — recommend Lighthouse CI in deploy pipeline.
