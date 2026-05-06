// v4 / Pack C §C075 — Signal confidence labels (1-5) + reason rules.

export interface ConfidenceLevel {
  value: 1 | 2 | 3 | 4 | 5;
  labelZh: string;
  labelEn: string;
  reasonRequired: boolean;
  reasonMinChars?: number;
}

export const SIGNAL_CONFIDENCE: readonly ConfidenceLevel[] = [
  { value: 1, labelZh: "確定錯誤",     labelEn: "Definitely invalid", reasonRequired: true,  reasonMinChars: 20 },
  { value: 2, labelZh: "可能錯誤",     labelEn: "Likely invalid",     reasonRequired: true,  reasonMinChars: 20 },
  { value: 3, labelZh: "不確定",       labelEn: "Uncertain",          reasonRequired: false },
  { value: 4, labelZh: "可能正確",     labelEn: "Likely valid",       reasonRequired: true,  reasonMinChars: 20 },
  { value: 5, labelZh: "高度確信正確", labelEn: "Definitely valid",   reasonRequired: true,  reasonMinChars: 20 },
] as const;

export function validateConfidenceFeedback(value: 1 | 2 | 3 | 4 | 5, reason?: string): string | null {
  const def = SIGNAL_CONFIDENCE.find((c) => c.value === value)!;
  if (!def.reasonRequired) return null;
  if (!reason || reason.length < (def.reasonMinChars ?? 0)) {
    return `reason required (min ${def.reasonMinChars} chars)`;
  }
  return null;
}
