// v4 / Pack C §C063 — Performance budgets.

export interface PerfTarget { id: string; metric: string; target: string }

export const PERF_BUDGET: readonly PerfTarget[] = [
  { id: "lcp", metric: "Initial LCP", target: "<= 2.5s on standard desktop" },
  { id: "tti", metric: "TTI", target: "<= 3.5s" },
  { id: "route_p95", metric: "Route transition p95", target: "<= 500ms with cached data" },
  { id: "table_p95", metric: "DataTable render p95 (200 rows)", target: "<= 500ms" },
  { id: "filter_p95", metric: "Filter interaction p95", target: "<= 300ms" },
  { id: "sse_p95", metric: "SSE event-to-paint p95", target: "<= 1000ms" },
  { id: "drawer_p95", metric: "Drawer open p95", target: "<= 200ms" },
  { id: "lineage_layout", metric: "LineageGraph 200 nodes first layout", target: "<= 1500ms" },
];
