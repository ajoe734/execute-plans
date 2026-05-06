// v4 / Pack C §C070 — Owner per spec H2 section.

export type SpecOwner = "SA" | "SD" | "Product" | "FrontendLead" | "BackendLead" | "Security";

export interface SectionOwner {
  section: string;
  owner: SpecOwner;
  reviewers: readonly SpecOwner[];
}

export const SECTION_OWNERS: readonly SectionOwner[] = [
  { section: "C001-C005 Spec governance", owner: "SA", reviewers: ["Product", "FrontendLead"] },
  { section: "C006-C012 State machines", owner: "SA", reviewers: ["BackendLead", "FrontendLead"] },
  { section: "C013-C018 Permissions", owner: "SA", reviewers: ["Security", "Product"] },
  { section: "C019-C023 High-risk", owner: "SA", reviewers: ["Security", "BackendLead"] },
  { section: "C024-C032 BFF / Realtime", owner: "SD", reviewers: ["BackendLead", "FrontendLead"] },
  { section: "C033-C037 Handoff", owner: "SA", reviewers: ["Product", "BackendLead"] },
  { section: "C038-C042 Capital/Ranking/Rebalance", owner: "SA", reviewers: ["Product", "BackendLead"] },
  { section: "C043-C045 Evolution/Experiment", owner: "SA", reviewers: ["Product"] },
  { section: "C046-C049 i18n", owner: "FrontendLead", reviewers: ["Product"] },
  { section: "C050-C055 UI/Components", owner: "FrontendLead", reviewers: ["Product"] },
  { section: "C056-C058 Accessibility", owner: "FrontendLead", reviewers: ["Product"] },
  { section: "C059-C063 Acceptance/Perf", owner: "SD", reviewers: ["FrontendLead", "BackendLead"] },
  { section: "C064-C066 Security", owner: "Security", reviewers: ["BackendLead"] },
  { section: "C067-C070 Spec structure", owner: "SA", reviewers: ["Product"] },
  { section: "C071-C078 Implementation specifics", owner: "SD", reviewers: ["FrontendLead"] },
];
