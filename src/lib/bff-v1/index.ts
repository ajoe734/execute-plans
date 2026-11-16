// BFF Contract v1 — public surface.
// VITE_BFF_MODE = "mock" (default) | "live".

export * from "./dto";
export * from "./errors";
export * from "./headers";
export * from "./paths";
export * from "./client";
export * from "./sse/channels";
export * from "./sse/protocol";
export * from "./sse/bridge";
export * from "./sse/liveSse";
export * from "./lists";
export * from "./degradation";
export * from "./useLiveListV1";
export * from "./writes";
export * from "./me";
export * from "./writeGate";
export * from "./personas";
export * from "./liveStatus";
export * from "./liveTransport";
export * from "./seedTaxonomy";
export * from "./capitalPools";
export * from "./strategies";
export * from "./rankingFormulas";
export * from "./rebalances";
export * from "./deployments";
export * from "./evolution";
export * from "./research";
export * from "./artifacts";
export * from "./capabilities";
export * from "./operations";
export * from "./governance";
export * from "./search";
export * from "./writeOverlay";
export * from "./evidenceOperations";
export * from "./v5";
export * from "./management";
export * from "./managementConsoleReads";
export * from "./shellSummary";
export * from "./agora/types";
export * from "./agora/governance";
export * from "./tradeJournal";
export * from "./agora/interaction";
export * from "./managementDataSources";
export * from "./managementAi";
export * from "./loopTruthTypes";
export * from "./tradeJourneys";
export * from "./commandReceipt";
export * from "./eventTimestamps";
export * from "./domainReads";
export * from "./runtimeEnv";
export * from "./bffV1";
export { runActionSafe, type RunActionSafeOpts } from "./runActionSafe";
export { useLiveList, useRealtimeStatus } from "./useLiveList";

// Explicit re-exports to resolve `export *` ambiguity between modules that
// declare identically-named symbols for different domains. Pick the
// canonical version actually consumed via this barrel elsewhere in src.
export type { EvidenceRef } from "./v5";
export type { CommandResponse } from "./dto";
export {
  type ContextRef,
  type ResolveContextRequest,
  type EligibilityRequest,
  type SubmitInteractionRequest,
  interaction,
} from "./agora/interaction";
export {
  type MeetingsRead,
  type MeetingParticipant,
  type MeetingConvenedBy,
  type MeetingSummaryItem,
  type MeetingsListData,
  type MeetingProposalDownstream,
  type MeetingProposalItem,
  type MeetingProposalsData,
  type MeetingTypeRule,
  type MeetingScheduleEntry,
  type MeetingRefusalEntry,
  type MeetingCatalogueData,
  type MeetingCaseFileItem,
  type MeetingPreReadInterpretation,
  type MeetingRoundPosition,
  type MeetingRound,
  type MeetingSynthesis,
  type MeetingWritebackEntry,
  type MeetingAttributionRecord,
  type MeetingUsage,
  type MeetingDetail,
  type ConveneMeetingInput,
  type ConveneMeetingReceipt,
  type ListMeetingsFilters,
  type ListMeetingProposalsFilters,
  MEETINGS_REASON_UNKNOWN,
  isPrivateMemoryItem,
  stripPrivateMemory,
  getMeetings,
  getMeetingProposals,
  getMeetingCatalogue,
  getMeetingDetail,
  conveneMeeting,
  meetings,
} from "./meetings";
export {
  attribution,
  getAttributionOutliers,
  getAttributionRecord,
  getShadowComparison,
  settlementLabelKind,
  type AttributionRead,
  type AttributionRecordItem,
  type ShadowArm,
  type ShadowComparisonData,
} from "./attribution";
