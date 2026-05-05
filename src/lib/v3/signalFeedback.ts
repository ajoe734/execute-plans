// v3 §16 Signal Feedback Write Contract. Resolves G49 / G57.

export type SignalConfidence = 1 | 2 | 3 | 4 | 5;
export const SIGNAL_CONFIDENCE_SCALE: readonly SignalConfidence[] = [1, 2, 3, 4, 5];

export type SignalDecision = "agree" | "disagree" | "flag_suspicious";

export interface SignalFeedbackRequest {
  signalId: string;
  decision: SignalDecision;
  confidence: SignalConfidence;
  reason?: string;
  /** Edits within this window update the same record. */
  editWindowSeconds?: 30;
}

export interface SignalFeedbackValidationError {
  code: "reason_required_high_confidence_disagree" | "reason_required_flag" | "confidence_out_of_range";
}

export function validateSignalFeedback(req: SignalFeedbackRequest): SignalFeedbackValidationError[] {
  const errs: SignalFeedbackValidationError[] = [];
  if (req.confidence < 1 || req.confidence > 5) errs.push({ code: "confidence_out_of_range" });
  if (req.decision === "disagree" && req.confidence >= 4 && !req.reason) {
    errs.push({ code: "reason_required_high_confidence_disagree" });
  }
  if (req.decision === "flag_suspicious" && !req.reason) errs.push({ code: "reason_required_flag" });
  return errs;
}

export const SIGNAL_FEEDBACK_ENDPOINT = (signalId: string) =>
  `/bff/agora/signals/${signalId}/feedback`;
export const SIGNAL_FEEDBACK_EDIT_WINDOW_SECONDS = 30 as const;
