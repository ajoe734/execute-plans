# MGMT-LOAD-004 Route Split Evidence

Date: 2026-07-01
Base commit: `8ad6e034e9f8`
Branch: `task/MGMT-LOAD-004`

## Scope

- Replaced eager management and Agora route imports in `src/App.tsx` with route-level lazy modules.
- Split route modules into management Evidence, oversight, readiness, performance, v5, registry/detail, operations, phase2, studios, and Agora clusters.
- Added a reusable route lazy wrapper with Suspense fallback and route-scoped ErrorBoundary handling for chunk fetch/render failures.
- Deferred CommandPalette internals until search is opened.
- Deferred Management AI panel body until the floating panel is opened.

## Bundle Evidence

Baseline before this change, from `npm run build` on `origin/dev` at `8ad6e034e9f8`:

| Asset | Size | Gzip |
|---|---:|---:|
| `dist/assets/index-YYs14pWr.js` | 5,503.12 kB | 1,603.58 kB |

After route splitting, from `npm run build` on this branch:

| Asset | Size | Gzip |
|---|---:|---:|
| `dist/assets/index-CnqyqvrU.js` | 861.18 kB | 269.76 kB |
| `dist/assets/PlatformShell-UsqXV4r3.js` | 55.83 kB | 17.02 kB |
| `dist/assets/ManagementLayout-DgQN0-3g.js` | 24.25 kB | 7.55 kB |
| `dist/assets/evidence-CmKt7_be.js` | 63.17 kB | 13.37 kB |
| `dist/assets/registry-B2rotSUj.js` | 265.62 kB | 63.84 kB |
| `dist/assets/v5-LnSCMiS4.js` | 52.19 kB | 11.74 kB |
| `dist/assets/operations-6wVqV0Bj.js` | 84.59 kB | 17.44 kB |
| `dist/assets/agora-D4lAAyjN.js` | 1,285.00 kB | 411.21 kB |

Evidence route-specific async chunk gzip is `13.37 kB`, below the `150 kB` budget excluding shared vendor/cache chunks. The initial app entry gzip is `214.75 kB`, below the `800 kB` initial management JS budget.

Known build warnings observed before and after this change:

- CSS minifier warning: `Expected identifier but found "-"`.
- Rollup circular chunk warning for `runActionSafe` re-exported through `src/lib/bff-v1/legacy.ts`.
- Some lazy, non-Evidence chunks remain larger than 500 kB, especially Agora and markdown/mermaid language assets; these are no longer pulled by direct Evidence navigation.

## Route Smoke

Command:

```sh
FRONTEND_BASE_URL=http://127.0.0.1:8081 npx playwright test e2e/19-route-split.spec.ts --project=chromium
```

Result: `3 passed`.

Coverage:

- Direct `/management/evidence` navigation loads the Evidence route cluster and does not request registry, v5, or Agora route modules.
- Redirect aliases `/management/deployment/:id`, `/management/openclaw-llm-auth`, and `/management/control-room` still canonicalize under the lazy route graph.
- Aborted lazy Evidence chunk fetch renders the route error boundary instead of a blank page.

## Pending Hosted Probe

The hosted p75/p95 Evidence timing probe requires this branch to merge to `dev` and deploy to the Pantheon dev FE host so `/deployment.json` reports the merged commit. Run `npm run probe:route-load` after deployment and append the hosted timing artifact path before final `done` closeout.
