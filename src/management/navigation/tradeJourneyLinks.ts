// Shared "View Trade Journeys" cross-entry link builder.
//
// Cross-entry pages (Persona, Strategy, Deployment, Runtime, Incident,
// Cockpit, ...) do not own tenant_id/environment as first-class URL state,
// but may have received it as an incoming deep-link query param. This
// helper preserves that param (when present) instead of silently resetting
// it to the Trade Journeys page defaults, and always attaches a return_to
// (+ optional return_label) so Trade Journeys / journey detail can offer a
// real "back to origin" link instead of relying on browser history.
export interface TradeJourneyFocus {
  personaId?: string;
  strategyId?: string;
  decisionId?: string;
  orderId?: string;
  brokerOrderId?: string;
}

export interface TradeJourneyLinkOrigin {
  pathname: string;
  search: string;
}

export function tradeJourneyHref(
  origin: TradeJourneyLinkOrigin,
  focus: TradeJourneyFocus,
  returnLabel?: string,
): string {
  const incoming = new URLSearchParams(origin.search);
  const params = new URLSearchParams();
  const tenantId = incoming.get("tenant_id");
  const environment = incoming.get("environment");
  if (tenantId) params.set("tenant_id", tenantId);
  if (environment) params.set("environment", environment);
  if (focus.personaId) params.set("persona_id", focus.personaId);
  if (focus.strategyId) params.set("strategy_id", focus.strategyId);
  if (focus.decisionId) params.set("decision_id", focus.decisionId);
  if (focus.orderId) params.set("order_id", focus.orderId);
  if (focus.brokerOrderId) params.set("broker_order_id", focus.brokerOrderId);
  const returnTo = `${origin.pathname}${origin.search || ""}`;
  params.set("return_to", returnTo);
  if (returnLabel) params.set("return_label", returnLabel);
  return `/management/trade-journeys?${params.toString()}`;
}
