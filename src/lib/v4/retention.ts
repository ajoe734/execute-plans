// v4 / Pack C §C009 — Terminal state retention.

export type PurgePolicy = "no" | "no_if_deployed" | "yes_after_retention" | "admin_after_retention";

export interface RetentionPolicy {
  entityTerminalState: string;
  retentionDays: number;
  searchVisible: boolean;
  auditMutable: false;
  purgeAllowed: PurgePolicy;
}

export const RETENTION: readonly RetentionPolicy[] = [
  { entityTerminalState: "strategy.retired", retentionDays: 2555, searchVisible: true, auditMutable: false, purgeAllowed: "admin_after_retention" },
  { entityTerminalState: "persona.retired", retentionDays: 2555, searchVisible: true, auditMutable: false, purgeAllowed: "admin_after_retention" },
  { entityTerminalState: "artifact.deprecated", retentionDays: 2555, searchVisible: true, auditMutable: false, purgeAllowed: "no_if_deployed" },
  { entityTerminalState: "skill.deprecated", retentionDays: 1095, searchVisible: true, auditMutable: false, purgeAllowed: "admin_after_retention" },
  { entityTerminalState: "memory.deleted", retentionDays: 365, searchVisible: false, auditMutable: false, purgeAllowed: "yes_after_retention" },
  { entityTerminalState: "incident.closed", retentionDays: 2555, searchVisible: true, auditMutable: false, purgeAllowed: "no" },
  { entityTerminalState: "job.completed", retentionDays: 365, searchVisible: true, auditMutable: false, purgeAllowed: "yes_after_retention" },
] as const;
