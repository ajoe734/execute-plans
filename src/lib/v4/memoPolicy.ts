// Planner Response §E4 (2026-05-07) — Memo policy by action risk class.
// Source: §6.E4.

export type ActionRiskClass = "low" | "medium" | "high" | "critical" | "break_glass";

export interface MemoPolicy {
  required: boolean;
  minChars: number;
  recommendsIncidentRef: boolean;
}

export const MEMO_POLICY_BY_RISK: Readonly<Record<ActionRiskClass, MemoPolicy>> = {
  low:         { required: false, minChars: 0,  recommendsIncidentRef: false },
  medium:      { required: false, minChars: 0,  recommendsIncidentRef: false },
  high:        { required: true,  minChars: 40, recommendsIncidentRef: false },
  critical:    { required: true,  minChars: 80, recommendsIncidentRef: true  },
  break_glass: { required: true,  minChars: 80, recommendsIncidentRef: true  },
};

export const MEMO_MAX_CHARS = 2000 as const;

export const MEMO_ALLOWED_FEATURES = {
  markdownLite: true,
  mentions: true,           // @user, @role:risk_officer
  externalLinks: false,     // only internal evidence refs
} as const;

export type MemoValidation =
  | { ok: true }
  | { ok: false; reason: "TOO_SHORT" | "TOO_LONG" | "REQUIRED" };

export function validateMemo(
  text: string | undefined,
  risk: ActionRiskClass,
): MemoValidation {
  const policy = MEMO_POLICY_BY_RISK[risk];
  const t = (text ?? "").trim();
  if (policy.required && t.length === 0) return { ok: false, reason: "REQUIRED" };
  if (t.length > MEMO_MAX_CHARS) return { ok: false, reason: "TOO_LONG" };
  if (policy.required && t.length < policy.minChars) return { ok: false, reason: "TOO_SHORT" };
  return { ok: true };
}

export const MEMO_POLICY_SOURCE = "planner-response-2026-05-07" as const;
