// 2026-05-20 revamp §8 + design ruling §1.
// HARD RULE: Phase 1 = fixed_mock ONLY. No direct Lovable AI Gateway call.
// No `google/gemini-*` model call from FE. Strict mode MUST NOT silently
// fall back to mock or external AI.

export type ManagementNlProvider = "fixed_mock";

export type ManagementNlIntent =
  | "show_human_needed"
  | "summarize_persona_fleet"
  | "summarize_trading_pulse"
  | "summarize_ep5_blockers"
  | "summarize_recent_evolution"
  | "open_evidence_packet"
  | "explain_current_page"
  | "explain_selected_anomaly"
  | "unknown";

export const MANAGEMENT_NL_INTENTS: readonly ManagementNlIntent[] = [
  "show_human_needed",
  "summarize_persona_fleet",
  "summarize_trading_pulse",
  "summarize_ep5_blockers",
  "summarize_recent_evolution",
  "open_evidence_packet",
  "explain_current_page",
  "explain_selected_anomaly",
  "unknown",
] as const;

export interface ManagementNlAsk {
  prompt: string;
  intent?: ManagementNlIntent;
  /** Optional explicit object reference (e.g. evidence packet id). */
  objectRef?: string;
}

export interface ManagementNlAnswer {
  intent: ManagementNlIntent;
  provider: ManagementNlProvider;
  /** Deterministic answer body. Never generative. */
  summary: string;
  bullets?: string[];
  /** Routes / deep-links the user can navigate to. Never executes mutations. */
  followups: Array<{ label: string; href: string }>;
  /** When intent touches a human gate, this is the only safe action. */
  humanGateHref?: string;
  /** True iff hard-coded responder refused to answer (high/critical risk). */
  refused: boolean;
}

/** Tiny rule-based intent classifier (no LLM). */
export function classifyIntent(prompt: string): ManagementNlIntent {
  const p = prompt.toLowerCase();
  if (/explain.*(this|current).*(page|view|screen)|where am i|what.*looking at/.test(p)) return "explain_current_page";
  if (/explain.*(this|selected|that).*anomaly|why.*flagged/.test(p)) return "explain_selected_anomaly";
  if (/human|approval|gate|inbox|need.*me/.test(p)) return "show_human_needed";
  if (/fleet|persona.*(status|health|all)/.test(p)) return "summarize_persona_fleet";
  if (/trading|pulse|pnl|sharpe|drawdown/.test(p)) return "summarize_trading_pulse";
  if (/ep5|canary.*blocker|readiness/.test(p)) return "summarize_ep5_blockers";
  if (/evolution|mutation|improv/.test(p)) return "summarize_recent_evolution";
  if (/evidence|packet/.test(p)) return "open_evidence_packet";
  return "unknown";
}

export interface ManagementNlContext {
  routePath: string;
  pageLabel?: string;
  selectedEntityKind?: "persona" | "strategy" | "capital_pool" | "deployment" | "anomaly" | "evidence";
  selectedEntityId?: string;
  visibleAnomalyIds?: string[];
}
