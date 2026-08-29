import * as seed from "@/mocks/seed";
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
  liveDetailOrSeed,
  liveListOrSeed,
} from "./domainReads";
import {
  normalizeAlertTimestampFields,
  normalizeAlertTimestampList,
  normalizeIncidentTimestampFields,
  normalizeIncidentTimestampList,
} from "./eventTimestamps";

export async function listJobs(): Promise<Job[]> {
  return liveListOrSeed("jobs.list", paths.jobs(), seed.jobs);
}

export async function listRuntimes(): Promise<Runtime[]> {
  return liveListOrSeed("runtimes.list", paths.runtimes(), seed.runtimes);
}

export async function getRuntime(id: string): Promise<Runtime | undefined> {
  return liveDetailOrSeed("runtimes.get", detailPath(paths.runtimes(), id), seed.runtimes.find((r) => r.id === id));
}

export async function listAlerts(): Promise<Alert[]> {
  return liveListOrSeed<Alert>("alerts.list", paths.alerts(), seed.alerts as Alert[]).then(normalizeAlertTimestampList);
}

export async function getAlert(id: string): Promise<Alert | undefined> {
  return liveDetailOrSeed<Alert>("alerts.get", detailPath(paths.alerts(), id), seed.alerts.find((a) => a.id === id) as Alert | undefined).then(normalizeAlertTimestampFields);
}

export async function listIncidents(): Promise<Incident[]> {
  return liveListOrSeed<Incident>("incidents.list", paths.incidents(), seed.incidents as Incident[]).then(normalizeIncidentTimestampList);
}

export async function getIncident(id: string): Promise<Incident | undefined> {
  return liveDetailOrSeed<Incident>("incidents.get", paths.incident(id), seed.incidents.find((i) => i.id === id) as Incident | undefined).then(normalizeIncidentTimestampFields);
}

export async function listApprovals(): Promise<ApprovalRequest[]> {
  return liveListOrSeed("approvals.list", paths.approvals(), seed.approvals);
}

export async function getApproval(id: string): Promise<ApprovalRequest | undefined> {
  return liveDetailOrSeed("approvals.get", paths.approval(id), seed.approvals.find((a) => a.id === id));
}

export async function listAudit(): Promise<AuditEvent[]> {
  return liveListOrSeed("audit.list", paths.audit(), seed.auditEvents);
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
