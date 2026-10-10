import type {
  Alert,
  ApprovalRequest,
  AuditEvent,
  Incident,
  Job,
  Runtime,
} from "./dto";
import { paths } from "./paths";
import {
  detailPath,
  strictLiveDetail,
  strictLiveList,
} from "./domainReads";
import {
  normalizeAlertTimestampFields,
  normalizeAlertTimestampList,
  normalizeIncidentTimestampFields,
  normalizeIncidentTimestampList,
} from "./eventTimestamps";

import { cancelJob, retryJob } from "./writes";

export function normalizeJobFields<T>(raw: T | undefined): T | undefined {
  if (!raw || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  const patched = { ...record };
  if (!patched.id && patched.job_id) patched.id = patched.job_id;
  if (!patched.job_id && patched.id) patched.job_id = patched.id;
  if (!patched.kind && (patched.job_type || patched.source)) {
    patched.kind = patched.job_type || patched.source;
  }
  if (!patched.startedAt && (patched.started_at || patched.created_at)) {
    patched.startedAt = patched.started_at || patched.created_at;
  }
  if (!patched.owner && patched.source) {
    patched.owner = patched.source;
  }
  return patched as T;
}

export function normalizeJobList<T>(rows: T[]): T[] {
  return rows.map((row) => normalizeJobFields(row) as T);
}

export async function listJobs(): Promise<Job[]> {
  return strictLiveList<Job>("jobs.list", paths.jobs()).then(normalizeJobList);
}

export async function getJob(id: string): Promise<Job | undefined> {
  return strictLiveDetail<Job>("jobs.get", paths.job(id)).then(normalizeJobFields);
}

export async function listRuntimes(): Promise<Runtime[]> {
  return strictLiveList("runtimes.list", paths.runtimes());
}

export async function getRuntime(id: string): Promise<Runtime | undefined> {
  return strictLiveDetail("runtimes.get", detailPath(paths.runtimes(), id));
}

export async function listAlerts(): Promise<Alert[]> {
  return strictLiveList<Alert>("alerts.list", paths.alerts()).then(normalizeAlertTimestampList);
}

export async function getAlert(id: string): Promise<Alert | undefined> {
  return strictLiveDetail<Alert>("alerts.get", detailPath(paths.alerts(), id)).then(normalizeAlertTimestampFields);
}

export async function listIncidents(): Promise<Incident[]> {
  return strictLiveList<Incident>("incidents.list", paths.incidents()).then(normalizeIncidentTimestampList);
}

export async function getIncident(id: string): Promise<Incident | undefined> {
  return strictLiveDetail<Incident>("incidents.get", paths.incident(id)).then(normalizeIncidentTimestampFields);
}

/** Single read-boundary projection of Governance owner fields into the display DTO. */
export function normalizeApprovalFields<T>(raw: T | undefined): T | undefined {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  if (r.decision_state === undefined && r.target_id === undefined && r.target_version === undefined && !r.decision_context && !r.decisionContext) return raw;
  const out = { ...r };
  const chk = (v: unknown): [string | undefined, boolean] =>
    v === undefined ? [undefined, false] : typeof v === "string" && v.trim() ? [v.trim(), false] : [undefined, true];
  const pair = (a: unknown, b: unknown): [string | undefined, boolean] => {
    const [v1, b1] = chk(a), [v2, b2] = chk(b);
    return b1 || b2 || (v1 && v2 && v1 !== v2) ? [undefined, true] : [v1 ?? v2, false];
  };
  const [topId, bTId] = pair(r.target_id, r.targetId), [topVer, bTVer] = pair(r.target_version, r.targetVersion);
  const rawDc = r.decision_context ?? r.decisionContext, bDc = rawDc !== undefined && (typeof rawDc !== "object" || !rawDc);
  const dc = !bDc && typeof rawDc === "object" ? (rawDc as Record<string, unknown>) : undefined;
  const rawGc = dc ? (dc.governance_chain ?? dc.governanceChain) : undefined, bGc = rawGc !== undefined && (typeof rawGc !== "object" || !rawGc);
  const gc = !bGc && typeof rawGc === "object" ? (rawGc as Record<string, unknown>) : undefined;
  const [chainId, bCId] = pair(gc?.target_id, gc?.targetId), [chainVer, bCVer] = pair(gc?.target_version, gc?.targetVersion);
  const badId = Boolean(bTId || bCId || (topId && chainId && topId !== chainId));
  const badVer = Boolean(bTVer || bCVer || (topVer && chainVer && topVer !== chainVer));
  const conflict = Boolean(badId || badVer || bDc || bGc || r.targetConflict || r.target_conflict);
  out.targetConflict = conflict;
  out.targetId = conflict ? undefined : (topId ?? chainId);
  out.targetVersion = conflict ? undefined : (topVer ?? chainVer);
  if (!conflict && gc && (chainId || chainVer)) {
    out.decisionContext = { governanceChain: { ...(chainId ? { targetId: chainId } : {}), ...(chainVer ? { targetVersion: chainVer } : {}) } };
  } else if (conflict) {
    delete out.decisionContext;
  }
  out.id ??= r.approval_id ?? r.decision_id;
  out.kind ??= r.target_type;
  out.subject ??= out.targetId ?? (conflict ? undefined : r.target_id);
  out.requester ??= r.owner_user_id;
  out.riskLevel ??= r.risk_level;
  out.createdAt ??= r.created_at;
  const ds = r.decision_state;
  const final = ds === "decided" ? r.decision : ds;
  out.state =
    final === "approved" || final === "approved_with_conditions" ? "approved"
    : final === "rejected" ? "rejected"
    : ds === "pending" || ds === "proposed" || ds === "under_review" ? "pending"
    : ds === "revoked" || ds === "superseded" ? ds
    : ds !== undefined ? "unknown"
    : typeof r.state === "string" ? r.state
    : "unknown";
  return out as T;
}

export async function listApprovals(): Promise<ApprovalRequest[]> {
  return strictLiveList<ApprovalRequest>("approvals.list", paths.approvals()).then((rows) => rows.map((r) => normalizeApprovalFields(r) as ApprovalRequest));
}

export async function getApproval(id: string): Promise<ApprovalRequest | undefined> {
  return strictLiveDetail<ApprovalRequest>("approvals.get", paths.approval(id)).then(normalizeApprovalFields);
}

export async function listAudit(): Promise<AuditEvent[]> {
  return strictLiveList("audit.list", paths.audit());
}

export const jobs = {
  list: listJobs,
  get: getJob,
  cancel: cancelJob,
  retry: retryJob,
};

export const runtimes = {
  list: listRuntimes,
  get: getRuntime,
};

export const alerts = {
  list: listAlerts,
  get: getAlert,
};

export const incidents = {
  list: listIncidents,
  get: getIncident,
};

export const approvals = {
  list: listApprovals,
  get: getApproval,
};

export const audit = {
  list: listAudit,
};
