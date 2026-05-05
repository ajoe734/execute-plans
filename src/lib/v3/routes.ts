// v3 §14 Canonical Routes. Resolves G33.

export const CANONICAL_ROUTES = {
  riskCenter: "/management/risk",
} as const;

export const ROUTE_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: "/management/risk-center", to: "/management/risk" },
];
