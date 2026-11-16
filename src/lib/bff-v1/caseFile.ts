// Decision case-file views (FE-DECISION-CASE-FILE-VIEWS-20261113).
// Typed reader over the BFF `case_file_view` that BFF-DECISION-CASE-FILE-VIEWS-20261113
// adds to existing reads (OODA packet detail, Agora committee session / memos).
// Nothing is defaulted or synthesised: a missing or non-ok view becomes `unavailable`
// with the recorded reason.
import { bffFetch } from "./client";
import { BffError } from "./errors";
import { paths } from "./paths";

export interface CaseFileItem {
  item_id: string;
  kind?: string | null;
  excerpt?: string | null;
  source_owner?: string | null;
  source_id?: string | null;
  retrieval_mode?: string | null;
  retrieval_score?: number | null;
}
export interface CaseFileGroup {
  status?: string | null;
  reason?: string | null;
  items: CaseFileItem[];
  unavailable: unknown[];
  truncated: boolean;
}
export interface CaseFile {
  case_file_id: string;
  digest?: string | null;
  decision_type?: string | null;
  persona_id?: string | null;
  composed_at?: string | null;
  groups: Record<string, CaseFileGroup>;
  private_items_withheld?: number;
}
export interface CaseFileCitations {
  cited_item_ids: string[];
  unresolved_item_ids: string[];
}
export interface CaseFileDecision extends CaseFileCitations {
  kind?: string | null;
  status?: string | null;
  case_file_id?: string | null;
  case_file_scope?: string | null;
  none_applicable_reason?: string | null;
}
export interface CaseFileClaim extends CaseFileCitations {
  claim?: string | null;
}
export interface CaseFileContribution {
  persona_id?: string | null;
  event_id?: string | null;
  recommendation?: string | null;
  role?: string | null;
  claims: CaseFileClaim[];
  summary_cited_item_ids?: string[];
  summary_unresolved_item_ids?: string[];
}
export interface CaseFileRejection {
  persona_id?: string | null;
  contribution_id?: string | null;
  reason?: string | null;
  cited: boolean;
}
/** Raw view as returned by the BFF; either `case_files` (packet) or `case_file` (panel/memo). */
export interface CaseFileView {
  status: "ok" | "unavailable" | string;
  reason?: string | null;
  case_file?: CaseFile | null;
  case_files?: CaseFile[];
  decisions?: CaseFileDecision[];
  contributions?: CaseFileContribution[];
  rejected_contributions?: CaseFileRejection[];
}

export type CaseFileRead =
  | { state: "ok"; view: CaseFileView }
  | { state: "unavailable"; reason: string };

export const REASON_VIEW_NOT_RETURNED = "case_file_view_not_returned";
export const REASON_OWNER_UNAVAILABLE = "owner_unavailable";

/** Interpret an untyped `case_file_view` value; anything not a well-formed view is unavailable. */
export function readCaseFileView(raw: unknown): CaseFileRead {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { state: "unavailable", reason: REASON_VIEW_NOT_RETURNED };
  }
  const view = raw as CaseFileView;
  if (view.status !== "ok") {
    return { state: "unavailable", reason: view.reason || REASON_OWNER_UNAVAILABLE };
  }
  const hasCases = Array.isArray(view.case_files) ? view.case_files.length > 0 : !!view.case_file;
  if (!hasCases) return { state: "unavailable", reason: "invalid_owner_response" };
  return { state: "ok", view };
}

/** OODA packet detail → its case-file view (existing read; no new route). */
export async function getPacketCaseFileView(packetId: string, signal?: AbortSignal): Promise<CaseFileRead> {
  let raw: unknown;
  try {
    raw = await bffFetch({ method: "GET", path: paths.oodaPacket(packetId), signal });
  } catch (err) {
    if (err instanceof BffError) {
      return { state: "unavailable", reason: err.envelope.error.cause ?? err.code };
    }
    return { state: "unavailable", reason: REASON_OWNER_UNAVAILABLE };
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as { data?: { case_file_view?: unknown } };
  return readCaseFileView(body.data?.case_file_view);
}
