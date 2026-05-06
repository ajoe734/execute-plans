// v4 / Pack C §C011 — Branching return paths.

export interface BranchRule {
  machine: string;
  branchState: string;
  nextStates: readonly string[];
  limit: string;
}

export const BRANCHING: readonly BranchRule[] = [
  { machine: "Review", branchState: "changes_requested", nextStates: ["pending", "approved"], limit: "max 3 cycles before escalation" },
  { machine: "Review", branchState: "rejected", nextStates: [], limit: "terminal; create new review request" },
  { machine: "Experiment", branchState: "failed", nextStates: ["queued", "archived"], limit: "max 2 retries" },
  { machine: "Deployment", branchState: "failed", nextStates: ["scheduled", "rolled_back", "cancelled"], limit: "requires incident if live" },
  { machine: "Incident", branchState: "mitigated", nextStates: ["resolved", "investigating"], limit: "must attach mitigation note" },
  { machine: "Rebalance", branchState: "changes_requested", nextStates: ["simulation_ready", "ranking_calculated"], limit: "reviewer chooses rollback step" },
] as const;
