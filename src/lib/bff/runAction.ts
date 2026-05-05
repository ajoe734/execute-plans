// Phase 14/15 — UI wrapper around bff.mutations.runAction that:
//   1. surfaces illegal_transition rejections via toast.error
//   2. keeps the typed MutationResult for callers that need it
//
// Use this in any component that previously called bff.mutations.runAction
// directly, so users get consistent feedback when a state-machine guard fires
// or when a mutation lands.

import { toast } from "sonner";
import { bff } from "@/lib/bff/client";
import type { RunActionInput, MutationResult } from "@/lib/bff/mutations";
import i18n from "@/i18n";

const ttl = (key: string, fallback: string) =>
  i18n.exists(key) ? i18n.t(key) : fallback;

export interface RunActionSafeOpts {
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
  const result = await bff.mutations.runAction(input);
  if (!result.ok && result.rejected === "illegal_transition") {
    toast.error(ttl("toast.illegalTransition", "Illegal state transition"), {
      description: `${input.kind} · ${input.action}`,
    });
  } else if (!result.ok) {
    toast.error(ttl("toast.failed", "Action failed"), {
      description: result.message,
    });
  } else if (!opts.silent) {
    toast.success(opts.successTitle ?? ttl("toast.actionApplied", "Action applied"), {
      description: opts.successDescription ?? `${input.kind} · ${input.action}`,
    });
  }
  return result;
}
