// Planner Response §E3 (2026-05-07) — Optimistic-lock conflict toast helper.
// FE behavior: show toast, refetch entity, do not auto-retry destructive action.

import { toast } from "@/hooks/use-toast";
import type { BffError } from "@/lib/bff-v1/errors";

export interface StateConflictToastArgs {
  entityLabel?: string;
  onRefetch?: () => void;
  onCompare?: () => void;
}

/** Show standard STATE_CONFLICT toast + invoke refetch hook. */
export function showStateConflictToast(err: BffError, args: StateConflictToastArgs = {}): void {
  if (err.code !== "STATE_CONFLICT") return;
  const details = (err.details ?? {}) as { expectedVersion?: number; actualVersion?: number };
  const desc =
    details.expectedVersion !== undefined && details.actualVersion !== undefined
      ? `expected v${details.expectedVersion}, server has v${details.actualVersion}`
      : "version mismatch";
  toast({
    title: args.entityLabel ? `${args.entityLabel}: state conflict` : "State conflict",
    description: desc,
    variant: "destructive",
  });
  // Caller is responsible for refetch + diff UI.
  args.onRefetch?.();
}

export function isStateConflict(err: unknown): err is BffError {
  return !!err && typeof err === "object" && (err as BffError).code === "STATE_CONFLICT";
}
