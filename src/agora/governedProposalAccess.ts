import type { GovernedProposal, ProposalAction } from "@/lib/bff-v1/agora/governance";
import { capabilitiesAllow, type AgoraWriteAccess } from "@/agora/useAgoraWriteAccess";

const PROPOSAL_ACTION_ROLES = new Set([
  "admin", "operator", "ops", "reviewer", "approver", "research_lead",
  "risk_officer", "strategy_manager",
]);
const APPROVAL_ROLES = new Set(["admin", "reviewer", "approver"]);
const PROPOSAL_ACTION_CAPABILITY = "agora.workshop.v1";

export function proposalActionDisabledReason(
  action: ProposalAction,
  proposal: GovernedProposal,
  access: AgoraWriteAccess,
): string | null {
  if (access.loading) return "Checking governance permissions…";
  const executionAuthority = proposal.execution_authority ?? proposal.governed_action_link?.execution_authority;
  if (executionAuthority !== "none") {
    return "Governance controls require an explicit no-execution authority proof.";
  }
  if (!access.writeAllowed) return access.writeDisabledReason ?? "Governance writes are disabled.";
  const roles = access.roles.map((role) => role.toLowerCase());
  if (!roles.some((role) => PROPOSAL_ACTION_ROLES.has(role))) {
    return "Governance actions require an operator, reviewer, approver, risk, strategy, research, or admin role.";
  }
  if (!capabilitiesAllow(access.agoraCapabilities, [PROPOSAL_ACTION_CAPABILITY])) {
    return `Governance actions require the authoritative ${PROPOSAL_ACTION_CAPABILITY} capability.`;
  }
  if (action === "approve") {
    if (!roles.some((role) => APPROVAL_ROLES.has(role))) {
      return "Approval requires the reviewer, approver, or admin role.";
    }
    if (!proposal.proposer) return "Approval is disabled because the proposal proposer identity is unavailable.";
    if (!access.actorId) return "Approval is disabled because the current actor identity is unavailable.";
    if (proposal.proposer === access.actorId) return "Proposal self-approval is forbidden.";
  }
  return null;
}
