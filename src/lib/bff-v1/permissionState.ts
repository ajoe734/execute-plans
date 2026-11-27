// FE-VIEWER-APPROVALS-NO-PERMISSION-STATE-20261126: typed no-permission answer.
//
// The BFF answers a read the caller's role cannot perform with a typed 403:
//   { error: { code: "FORBIDDEN", details: { permission_state: "no_permission", surface } } }
// That is an honest answer, not a data failure: the section renders a visible
// no-permission state while the rest of the page loads. Only that exact shape
// counts. An untyped 403, a 401, a 5xx or a network error stays an error.
// scripts/accept-management-hosted-production.mjs mirrors this rule.
import { BffError } from "./errors";

export const NO_PERMISSION_STATE = "no_permission";

/** True only for a 403 BffError whose details carry permission_state=no_permission. */
export function isNoPermissionError(err: unknown): err is BffError {
  return err instanceof BffError && err.status === 403 &&
    (err.details as { permission_state?: unknown } | undefined)?.permission_state === NO_PERMISSION_STATE;
}

/** The surface the BFF named in a typed no-permission answer, when present. */
export function noPermissionSurface(err: unknown): string | undefined {
  if (!isNoPermissionError(err)) return undefined;
  const surface = (err.details as { surface?: unknown } | undefined)?.surface;
  return typeof surface === "string" && surface.trim() ? surface : undefined;
}

/** Outcome of one section read: loaded, honestly not permitted, or failed. */
export type SectionReadState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "no_permission"; surface?: string }
  | { status: "error"; message: string };

export function sectionReadFailure(err: unknown): SectionReadState {
  if (isNoPermissionError(err)) return { status: "no_permission", surface: noPermissionSurface(err) };
  return { status: "error", message: err instanceof Error ? err.message : String(err) };
}
