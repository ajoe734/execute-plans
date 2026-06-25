// 2026-05-20 revamp — Oversight pages barrel.
// M1 stubs replaced by real implementations in M2 (core 7) and M3 (readiness 5).
// File kept as `_stubs.tsx` for compatibility with App.tsx route imports.

export {
  OneRingCockpitPage,
  PersonaFleetPage,
  HumanInboxPage,
  TradingPulsePage,
  EvolutionJournalPage,
  EvidenceExplorerPage,
  EvidencePacketDetailPage,
} from "./_core";

export {
  PersonaIntentTracesPage,
  PersonaIntentTraceDetailPage,
} from "./PersonaIntentTraces";

export { Ep5CanaryReadinessPage } from "./Ep5CanaryReadiness";
export { BrokerLiveReadinessPage } from "./BrokerLiveReadiness";
export { CapitalBindingLiveReadinessPage } from "./CapitalBindingLiveReadiness";
export { BffHaReadinessPage } from "./BffHaReadiness";
export { StrictPublishAuditPage } from "./StrictPublishAudit";
export { DataSourceManagementPage } from "./DataSourceManagement";
export { ManagementNlConsole } from "./NlConsole";
export { HumanGateDetailPage } from "./HumanGateDetail";
