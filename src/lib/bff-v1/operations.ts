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

export async function listApprovals(): Promise<ApprovalRequest[]> {
  return strictLiveList("approvals.list", paths.approvals());
}

export async function getApproval(id: string): Promise<ApprovalRequest | undefined> {
  return strictLiveDetail("approvals.get", paths.approval(id));
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
