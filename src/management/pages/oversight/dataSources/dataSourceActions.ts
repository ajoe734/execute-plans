// Data source actions metadata and allowedActions evaluator (SD-SRCM-04).

import type { SourceAllowedActions } from "@/lib/bff-v1/managementDataSources";

export type DataSourceActionKey =
  | "validate"
  | "canary"
  | "enable"
  | "disable"
  | "degrade"
  | "resume"
  | "schedule"
  | "replace"
  | "retire";

export interface ActionDefinition {
  key: DataSourceActionKey;
  labelKey: string;
  descKey: string;
  confirmationRequired: boolean;
  reasonRequired: boolean;
  destructive?: boolean;
  warningKey?: string;
  allowedField: keyof Omit<SourceAllowedActions, "blockedReasons">;
}

export const DATA_SOURCE_ACTIONS: ActionDefinition[] = [
  {
    key: "validate",
    labelKey: "mgmt.dataSources.actions.validate",
    descKey: "mgmt.dataSources.actions.validateDesc",
    confirmationRequired: false,
    reasonRequired: true,
    allowedField: "canValidate",
  },
  {
    key: "canary",
    labelKey: "mgmt.dataSources.actions.canary",
    descKey: "mgmt.dataSources.actions.canaryDesc",
    confirmationRequired: false,
    reasonRequired: true,
    allowedField: "canCanary",
  },
  {
    key: "enable",
    labelKey: "mgmt.dataSources.actions.enable",
    descKey: "mgmt.dataSources.actions.enableDesc",
    confirmationRequired: true,
    reasonRequired: true,
    warningKey: "mgmt.dataSources.actions.enableWarning",
    allowedField: "canEnable",
  },
  {
    key: "disable",
    labelKey: "mgmt.dataSources.actions.disable",
    descKey: "mgmt.dataSources.actions.disableDesc",
    confirmationRequired: false,
    reasonRequired: true,
    destructive: true,
    allowedField: "canDisable",
  },
  {
    key: "degrade",
    labelKey: "mgmt.dataSources.actions.degrade",
    descKey: "mgmt.dataSources.actions.degradeDesc",
    confirmationRequired: false,
    reasonRequired: true,
    destructive: true,
    allowedField: "canDegrade",
  },
  {
    key: "resume",
    labelKey: "mgmt.dataSources.actions.resume",
    descKey: "mgmt.dataSources.actions.resumeDesc",
    confirmationRequired: false,
    reasonRequired: true,
    allowedField: "canResume",
  },
  {
    key: "schedule",
    labelKey: "mgmt.dataSources.actions.changeSchedule",
    descKey: "mgmt.dataSources.actions.changeScheduleDesc",
    confirmationRequired: false,
    reasonRequired: true,
    allowedField: "canChangeSchedule",
  },
  {
    key: "replace",
    labelKey: "mgmt.dataSources.actions.replace",
    descKey: "mgmt.dataSources.actions.replaceDesc",
    confirmationRequired: true,
    reasonRequired: true,
    destructive: true,
    allowedField: "canReplace",
  },
  {
    key: "retire",
    labelKey: "mgmt.dataSources.actions.retire",
    descKey: "mgmt.dataSources.actions.retireDesc",
    confirmationRequired: true,
    reasonRequired: true,
    destructive: true,
    warningKey: "mgmt.dataSources.actions.retireWarning",
    allowedField: "canRetire",
  },
];

export function isActionAllowed(
  actionKey: DataSourceActionKey,
  allowedActions?: SourceAllowedActions,
): { allowed: boolean; reasons: string[] } {
  if (!allowedActions) {
    return { allowed: false, reasons: ["no_allowed_actions_provided"] };
  }

  const def = DATA_SOURCE_ACTIONS.find((a) => a.key === actionKey);
  if (!def) {
    return { allowed: false, reasons: ["unknown_action"] };
  }

  const allowed = Boolean(allowedActions[def.allowedField]);
  return {
    allowed,
    reasons: allowed ? [] : allowedActions.blockedReasons ?? ["action_not_permitted_by_server_policy"],
  };
}
