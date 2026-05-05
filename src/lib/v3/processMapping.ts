// v3 §3 Process-to-Surface Mapping. Resolves G13.
// Maps the 16 Console processes (Part 2) to their primary pages (Part 3).
// Source: v3 spec §3 + Part 2/3 cross-walk.

export interface ProcessSurfaceMapping {
  processId: string;
  processName: string;
  primaryRoute: string;
  detailRoute?: string;
  relatedTabs: string[];
}

export const PROCESS_SURFACE_MAPPING: readonly ProcessSurfaceMapping[] = [
  { processId: "P01", processName: "Strategy Discovery & Scaffolding",   primaryRoute: "/management/strategies",   detailRoute: "/management/strategies/:id", relatedTabs: ["Overview","Spec & Parameters"] },
  { processId: "P02", processName: "Strategy Replication & Validation",  primaryRoute: "/management/strategies",   detailRoute: "/management/strategies/:id", relatedTabs: ["Experiments","Performance"] },
  { processId: "P03", processName: "Strategy Review & Approval",         primaryRoute: "/management/governance",   detailRoute: "/management/governance/:id", relatedTabs: ["Governance"] },
  { processId: "P04", processName: "Paper / Live Deployment",            primaryRoute: "/management/deployments",  detailRoute: "/management/deployments/:id", relatedTabs: ["Paper / Live Execution"] },
  { processId: "P05", processName: "Live Operation & Risk Watch",        primaryRoute: "/management/risk",         relatedTabs: ["Risk & Alerts","Incidents"] },
  { processId: "P06", processName: "Incident Response",                  primaryRoute: "/management/incidents",    detailRoute: "/management/incidents/:id", relatedTabs: ["Incidents"] },
  { processId: "P07", processName: "Persona Lifecycle Management",       primaryRoute: "/management/personas",     detailRoute: "/management/personas/:id", relatedTabs: ["Identity & Role","Activity Monitor"] },
  { processId: "P08", processName: "Capital Pool Mandate & Binding",     primaryRoute: "/management/capital",      detailRoute: "/management/capital/:id", relatedTabs: ["Mandate","Persona Binding","Strategy Binding"] },
  { processId: "P09", processName: "Ranking Formula Lifecycle",          primaryRoute: "/management/ranking",      detailRoute: "/management/ranking/:id", relatedTabs: ["Performance & Ranking","Ranking Inputs"] },
  { processId: "P10", processName: "Quarterly Rebalance",                primaryRoute: "/management/rebalances",   detailRoute: "/management/rebalances/:id", relatedTabs: ["Rebalance History","Overrides & Audit"] },
  { processId: "P11", processName: "Evolution Steering",                 primaryRoute: "/management/evolution",    detailRoute: "/management/evolution/:id", relatedTabs: ["Evolution"] },
  { processId: "P12", processName: "Tools / MCP / Skill Onboarding",     primaryRoute: "/management/capabilities", detailRoute: "/management/capabilities/:kind/:id", relatedTabs: ["Tools / MCP / Skills"] },
  { processId: "P13", processName: "Memory Governance",                  primaryRoute: "/management/governance/memory", relatedTabs: ["Training & Memory"] },
  { processId: "P14", processName: "Training Update & Persona Memory",   primaryRoute: "/management/personas",     detailRoute: "/management/personas/:id", relatedTabs: ["Training & Memory","Evaluations"] },
  { processId: "P15", processName: "Insight Inbox Triage",               primaryRoute: "/management/governance",   relatedTabs: ["Lineage & Audit"] },
  { processId: "P16", processName: "Audit, Lineage & Postmortem",        primaryRoute: "/management/audit",        relatedTabs: ["Lineage & Audit"] },
] as const;
