// Shared "View Trade Journeys" cross-entry link builder.
//
// Cross-entry pages (Persona, Strategy, Deployment, Runtime, Incident,
// Cockpit, Trading Pulse, ...) do not own tenant_id/environment as first-class
// URL state, but may have received it as an incoming deep-link query param or
// from a canonical entity/runtime record. This helper preserves that param
// (when present) instead of silently resetting it to the Trade Journeys page
// defaults, supports both exact journey detail routes and filtered list routes,
// and attaches a return_to (+ optional return_label) when an origin location is
// supplied so Trade Journeys / journey detail can offer a real "back to origin"
// link instead of relying on browser history.
export interface TradeJourneyFocus {
  journeyId?: string | null;
  href?: string | null;
  tenantId?: string | null;
  environment?: string | null;
  personaId?: string | null;
  strategyId?: string | null;
  decisionId?: string | null;
  orderId?: string | null;
  brokerOrderId?: string | null;
}

export interface TradeJourneyLinkOrigin {
  pathname: string;
  search: string;
}

export function tradeJourneyHref(
  origin: TradeJourneyLinkOrigin | null | undefined,
  focus: TradeJourneyFocus,
  returnLabel?: string,
): string {
  const rawHref = typeof focus.href === "string" ? focus.href.trim() : "";
  const rawJourneyId = typeof focus.journeyId === "string" ? focus.journeyId.trim() : "";

  let basePath = "/management/trade-journeys";
  let existingParams = new URLSearchParams();

  if (rawHref.startsWith("/management/trade-journeys")) {
    const [withoutHash] = rawHref.split("#");
    const [pathPart, queryPart = ""] = withoutHash.split("?");
    basePath = pathPart.replace(/\/+$/, "");
    existingParams = new URLSearchParams(queryPart);
  } else if (rawJourneyId) {
    basePath = `/management/trade-journeys/${encodeURIComponent(rawJourneyId)}`;
  }

  const incoming = new URLSearchParams(origin?.search ?? "");
  const params = new URLSearchParams();
  const tenantId = (
    focus.tenantId
    ?? existingParams.get("tenant_id")
    ?? incoming.get("tenant_id")
    ?? ""
  ).trim();
  const rawEnvironment = (
    focus.environment
    ?? existingParams.get("environment")
    ?? incoming.get("environment")
    ?? ""
  ).trim();
  const environment = rawEnvironment.replace(/_running$/i, "");

  if (tenantId) params.set("tenant_id", tenantId);
  if (environment) params.set("environment", environment);

  if (basePath === "/management/trade-journeys") {
    const personaId = (focus.personaId ?? existingParams.get("persona_id") ?? "").trim();
    const strategyId = (focus.strategyId ?? existingParams.get("strategy_id") ?? "").trim();
    const decisionId = (focus.decisionId ?? existingParams.get("decision_id") ?? "").trim();
    const orderId = (focus.orderId ?? existingParams.get("order_id") ?? "").trim();
    const brokerOrderId = (focus.brokerOrderId ?? existingParams.get("broker_order_id") ?? "").trim();
    if (personaId) params.set("persona_id", personaId);
    if (strategyId) params.set("strategy_id", strategyId);
    if (decisionId) params.set("decision_id", decisionId);
    if (orderId) params.set("order_id", orderId);
    if (brokerOrderId) params.set("broker_order_id", brokerOrderId);
  }

  if (origin?.pathname) {
    const returnTo = `${origin.pathname}${origin.search || ""}`;
    params.set("return_to", returnTo);
    if (returnLabel) params.set("return_label", returnLabel);
  }

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
