// BFF Contract v1 — toast-aware mutation wrapper (canonical surface).
//
// `runActionSafe` is the UI-facing wrapper around `tryRunAction` (writes.ts):
//   1. Auto-stamps correlationId + idempotencyKey at the seam.
//   2. Surfaces illegal_transition / state_conflict via toast.error.
//   3. Keeps the typed legacy MutationResult for callers that need it.
//
// Use this in any component that mutates state. For result-style call sites
// (no toast, custom UI), import `tryRunAction` from `@/lib/bff-v1` directly.

import { toast } from "sonner";
import type { RunActionInput, MutationResult } from "@/lib/bff/mutations";
import { tryRunAction, type RunActionV1Options } from "@/lib/bff-v1";
import { commandReceiptDescription } from "./commandReceipt";
import i18n from "@/i18n";

const ttl = (key: string, fallback: string) =>
  i18n.exists(key) ? i18n.t(key) : fallback;

export interface RunActionSafeOpts extends RunActionV1Options {
  /** Suppress the success toast (rejection toasts are always shown). */
  silent?: boolean;
  /** Override the success toast title. */
  successTitle?: string;
  /** Override the success toast description. */
  successDescription?: string;
}

export async function runActionSafe(
  input: RunActionInput,
  opts: RunActionSafeOpts = {},
): Promise<MutationResult> {
  const { silent, successTitle, successDescription, ...v1opts } = opts;
  const r = await tryRunAction(input, v1opts);
  if (r.ok === true) {
    if (!silent) {
      toast.success(successTitle ?? ttl("toast.actionApplied", "Action applied"), {
        description: successDescription ?? commandReceiptDescription(r.envelope, {
          fallback: `${input.kind} · ${input.action}`,
        }),
      });
    }
    return r.envelope.legacy;
  }
  const err = r.error;
  const isIllegal = err.details?.reason === "illegal_transition";
  toast.error(
    isIllegal
      ? ttl("toast.illegalTransition", "Illegal state transition")
      : ttl("toast.failed", "Action failed"),
    { description: isIllegal ? `${input.kind} · ${input.action}` : err.message },
  );
  return {
    ok: false,
    audit: {
      id: "au_failed",
      actor: "—",
      action: `${input.kind.toLowerCase()}.${input.action}`,
      target: input.id,
      ts: new Date().toISOString(),
      outcome: "rejected",
      correlationId: err.correlationId,
    },
    message: err.message,
    rejected: isIllegal ? "illegal_transition" : (err.details?.reason as MutationResult["rejected"]),
    correlationId: err.correlationId,
  };
}
