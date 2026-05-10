// v4 normative layer barrel export.
// Pack C 78 gaps as canonical TS modules. Resolution order: v4 > v3 > v2 > v1.

export * from "./legacyMapping";
export * from "./envelope";
export * from "./tabMigration";
export * from "./transitions";
export * from "./strategyInvariants";
export * from "./retention";
export * from "./optimisticLock";
export * from "./branching";
export * from "./renderHints";
export * from "./permissionsMatrix";
export * from "./actionDescriptor";
export * from "./emergencyOverride";
export * from "./roleLattice";
export * from "./confirmToken";
export * from "./highRiskCatalog";
export * from "./pagination";
export * from "./errorEnvelope";
export * from "./idempotency";
export * from "./sseProtocol";
export * from "./handoffSla";
export * from "./handoffRuntime";
export * from "./mandateMonitor";
export * from "./mandateRuntime";
export * from "./auditImmutability";
export * from "./rankingMetric";
export * from "./rebalanceQuorum";
export * from "./fxPolicy";
export * from "./evolutionLimits";
export * from "./experimentGate";
export * from "./reproducibility";
export * from "./i18nFormat";
export * from "./designTokens";
export * from "./componentSpecs";
export * from "./a11y";
export * from "./security";
export * from "./perfBudget";
export * from "./glossary";
export * from "./ownerMap";
export * from "./strategyTabs";
export * from "./personaLab";
export * from "./rankingInputs";
export * from "./rebalanceUiPatterns";
export * from "./signalConfidence";
export * from "./committeeTemplates";
export * from "./dailyBriefKpi";
export * from "./lifecycleBucketColors";
// Pack D Batch II additions (selective re-export to avoid name clashes)
export {
  ERROR_CODES,
  isErrorCode,
  errorI18nKey,
  DISABLED_REASON_CODES,
  isDisabledReasonCode,
  disabledReasonI18nKey,
} from "./errorCodes";
export type { ErrorCode } from "./errorCodes";
export {
  mockMe,
  fetchMe,
  refreshSession,
  logoutSession,
  invalidateMe,
  useMe,
  hasCapability,
} from "./session/me";
export type {
  MeResponse,
  MeUser,
  MeTenant,
  Capability as MeCapability,
} from "./session/me";

// Pack D Batch III additions
export {
  CURSOR_TTL_MS,
  issueCursor,
  readCursor,
  clearCursorStore,
  paginate,
  fromPackCEnvelope,
} from "./listEnvelope";
export type {
  ListResponseV2,
  CursorEnvelope,
  CursorErrorCode,
  PaginateOptions,
  PaginateResult,
} from "./listEnvelope";
export {
  SSE_SCHEMA_VERSION,
  makeSseEnvelope,
  isSseEventEnvelope,
} from "./sseEnvelope";
export type {
  SseEventEnvelope,
  SseChannelKind,
} from "./sseEnvelope";

// Pack D Batch IV additions (provisional v0-mock)
export {
  newUuid,
  newCorrelationId,
  newCausationFromEvent,
  deriveChild,
  rootCorrelation,
} from "./correlation";
export type { CorrelationFields } from "./correlation";
export { assessBreach } from "./capitalBreach";
export type { BreachLevel, BreachInputs, BreachAssessment } from "./capitalBreach";
export {
  ASYNC_TRANSITION_DEFAULTS,
  findTransition,
  transitionTimeoutFor,
} from "./asyncTransitions";
export type { AsyncTransitionDescriptor, FailureReasonCode } from "./asyncTransitions";
export { METRIC_REGISTRY, findMetric } from "./metricRegistry";
export type { MetricDef, MetricUnit } from "./metricRegistry";
