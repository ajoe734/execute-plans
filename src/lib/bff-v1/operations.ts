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

export async function listJobs(): Promise<Job[]> {
  return strictLiveList("jobs.list", paths.jobs());
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

