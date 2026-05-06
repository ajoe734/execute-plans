// v4 / Pack C §C017–C018 — Role lattice + tenant scope.

import type { Role } from "./permissionsMatrix";

/** Pack C C017: admin does NOT auto-inherit business approvals; risk_officer required for live/capital destructive. */
export const ROLE_NOTES: Record<Role, string> = {
  admin: "platform control; not sufficient alone for capital/live approval",
  research_lead: "outranks strategy_manager for research actions",
  strategy_manager: "subordinate to research_lead for research actions",
  risk_officer: "independent; required for risk/live/capital destructive actions",
  capital_manager: "independent; required for allocation/rebalance actions",
  capability_admin: "independent; required for tools/MCP/skills",
  system_operator: "independent; required for runtime/deployment execution",
  reviewer: "independent; can decide assigned reviews only",
};

/** Pack C C018: v4 frontend + BFF is single-tenant; UI must not show tenant switcher. */
export const SINGLE_TENANT = true as const;
