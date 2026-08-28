// @deprecated 2026-06-03 — Superseded by `src/lib/bff-v1/managementAi.ts`,
// which routes through Pantheon BFF (`POST /bff/management/nl/ask`) →
// OpenClaw gateway adapter / Codex provider. This Phase 1 fixed-mock
// responder is kept only as a strict/gateway refusal sentinel; no UI surface
// is allowed to use it for runtime answers. Remove after BE confirms
// `/bff/management/nl/ask` is live and probe row is green.
//
// Phase 1 fixed-mock NL responder. NO network. NO AI gateway.
// Strict mode handling is at the caller: when strict, callers MUST raise an
// error before invoking this (see askManagementNl()).


import {
  type ManagementNlAnswer, type ManagementNlAsk, type ManagementNlIntent,
  classifyIntent,
} from "@/lib/v5/management/nl";

export class ManagementNlError extends Error {
  readonly code: "FEATURE_DISABLED" | "STRICT_REFUSED" | "GATEWAY_FORBIDDEN";
  constructor(code: ManagementNlError["code"], message: string) {
    super(message);
    this.name = "ManagementNlError";
    this.code = code;
  }
}

export interface ManagementNlEnv {
  /** "fixed_mock" only in Phase 1 (per design ruling §1). */
  provider: "fixed_mock";
  /** Gateway enable flag — Phase 1 default `false`. */
  gatewayEnabled: boolean;
  /** Strict mode = error instead of mock fallback. */
  strict: boolean;
}

const HIGH_RISK_INTENTS: ReadonlySet<ManagementNlIntent> = new Set([
  "summarize_ep5_blockers", // touches human gates → only human-gate href
]);

/**
 * Phase 1 entry point. Throws when strict (must not silently mock).
 * Never performs a network call. Never invokes any AI gateway.
 */
export function askManagementNl(ask: ManagementNlAsk, env: ManagementNlEnv): ManagementNlAnswer {
  if (env.strict) {
    throw new ManagementNlError(
      "STRICT_REFUSED",
      "Management NL Console is not available in strict mode (Phase 1 mock-only).",
    );
  }
  if (env.gatewayEnabled) {
    // Hard guard: even if a future operator flips the env flag, FE refuses
    // to talk to any external AI gateway directly. Phase 2 must route via BFF.
    throw new ManagementNlError(
      "GATEWAY_FORBIDDEN",
      "Phase 1 forbids direct AI gateway calls; route via Pantheon BFF (Phase 2).",
    );
  }
  if (env.provider !== "fixed_mock") {
    throw new ManagementNlError(
      "FEATURE_DISABLED",
      `Unsupported NL provider: ${String(env.provider)}`,
    );
  }
  const intent = ask.intent ?? classifyIntent(ask.prompt);
  return respondFixed(intent, ask);
}

function respondFixed(intent: ManagementNlIntent, ask: ManagementNlAsk): ManagementNlAnswer {
  if (HIGH_RISK_INTENTS.has(intent)) {
    return {
      intent,
      provider: "fixed_mock",
      summary: "This question touches a human gate. Open the Human Inbox to act.",
      followups: [{ label: "Open Human Inbox", href: "/management/human-inbox" }],
      humanGateHref: "/management/human-inbox",
      refused: false,
    };
  }
  switch (intent) {
    case "show_human_needed":
      return {
        intent, provider: "fixed_mock",
        summary: "Items needing a human are aggregated in Human Inbox.",
        bullets: [
          "Approvals: shown with required role and consequences.",
          "Sentinel findings: critical first.",
          "Ask channel: persona-initiated questions.",
        ],
        followups: [{ label: "Open Human Inbox", href: "/management/human-inbox" }],
        refused: false,
      };
    case "summarize_persona_fleet":
      return {
        intent, provider: "fixed_mock",
        summary: "Persona Fleet groups personas by ring bearer with OODA stage, autonomy mode, and performance delta.",
        followups: [{ label: "Open Persona Fleet", href: "/management/persona-fleet" }],
        refused: false,
      };
    case "summarize_trading_pulse":
      return {
        intent, provider: "fixed_mock",
        summary: "Trading Pulse compares paper / canary / live vs configured baselines (default: previous artifact, 7d rolling, last review).",
        followups: [{ label: "Open Trading Pulse", href: "/management/trading-pulse" }],
        refused: false,
      };
    case "summarize_recent_evolution":
      return {
        intent, provider: "fixed_mock",
        summary: "Evolution Journal shows before/after for the most recent mutations and their verdicts.",
        followups: [{ label: "Open Evolution Journal", href: "/management/evolution-journal" }],
        refused: false,
      };
    case "open_evidence_packet": {
      const id = (ask.objectRef ?? "").trim();
      return {
        intent, provider: "fixed_mock",
        summary: id
          ? `Opening evidence packet ${id}.`
          : "Evidence Explorer lists all packets with type, hash, and linked objects.",
        followups: [{
          label: id ? `Open packet ${id}` : "Open Evidence Explorer",
          href: id ? `/management/evidence/${encodeURIComponent(id)}` : "/management/evidence",
        }],
        refused: false,
      };
    }
    case "explain_current_page":
      return {
        intent, provider: "fixed_mock",
        summary: "I can't see your current page from this mock provider. Use the side nav to explain what you're looking at, or pick a deep-link below.",
        followups: [
          { label: "Pathreon Management Cockpit", href: "/management/cockpit" },
          { label: "Persona Fleet", href: "/management/persona-fleet" },
        ],
        refused: false,
      };
    case "explain_selected_anomaly":
      return {
        intent, provider: "fixed_mock",
        summary: ask.objectRef
          ? `Anomaly ${ask.objectRef}: open Critical Anomaly Panel for why + recommended action.`
          : "Pick an anomaly card to see why it fired.",
        followups: [
          { label: "Critical Anomalies", href: "/management/cockpit" },
          { label: "Sentinel", href: "/management/sentinel" },
        ],
        refused: false,
      };
    case "unknown":
    default:
      return {
        intent: "unknown", provider: "fixed_mock",
        summary: "I didn't recognise that question. Try one of these surfaces:",
        followups: [
          { label: "Pathreon Management Cockpit", href: "/management/cockpit" },
          { label: "Human Inbox", href: "/management/human-inbox" },
          { label: "Trading Pulse", href: "/management/trading-pulse" },
          { label: "Evidence Explorer", href: "/management/evidence" },
        ],
        refused: true,
      };
  }
}

/** Read env flags (defaults: mock-only + gateway disabled + non-strict). */
export function readManagementNlEnv(): ManagementNlEnv {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const provider = (env.VITE_MANAGEMENT_NL_PROVIDER ?? "fixed_mock") as ManagementNlEnv["provider"];
  const gatewayEnabled = String(env.VITE_MANAGEMENT_NL_GATEWAY_ENABLED ?? "false") === "true";
  const strict = String(env.VITE_BFF_FALLBACK ?? "auto") === "strict";
  return { provider, gatewayEnabled, strict };
}
