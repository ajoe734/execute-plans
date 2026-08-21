// Management AI — allowlisted UI action registry.
//
// The assistant is NOT allowed to operate arbitrary DOM selectors. It can only
// request actions that map 1:1 to entries below. Backend mutations must still
// go through the existing BFF action/command endpoint + HighRiskConfirm; this
// registry never auto-invokes a write.

import {
  CREATABLE_ENTITIES,
  isCreatableEntity,
  type CreatableEntity,
} from "@/lib/writeIntents/types";

export { CREATABLE_ENTITIES, isCreatableEntity, type CreatableEntity };

export type UiActionKind =
  | "navigate"
  | "openDrawer"
  | "selectEntity"
  | "setFilter"
  | "focusPanel"
  | "refreshCurrentView"
  | "runBffAction";

export interface UiAction {
  id?: string;
  kind: UiActionKind | string;
  label?: string;
  rationale?: string;
  params?: Record<string, unknown>;
  /** When true, FE never auto-executes — user must click / confirm. */
  requiresConfirmation?: boolean;
  correlationId?: string;
}

export interface UiActionDescriptor {
  kind: UiActionKind;
  description: string;
  paramsSchema: string;
  /** All write/mutation actions default to requiring user confirmation. */
  highRisk?: boolean;
}

/** What the assistant is told it may request. Sent in every nl/ask payload. */
export const AVAILABLE_UI_ACTIONS: readonly UiActionDescriptor[] = [
  { kind: "navigate", description: "Switch to an allowlisted route (/management/*, /platform/*, /agora/*)", paramsSchema: "{ path: string }" },
  { kind: "openDrawer", description: "Open a registered drawer (inspector, handoff, jobs, entityCreate, bulkResult, rollbackSaga, oodaPacket, loopRun, candidateReview)", paramsSchema: "{ drawer: string; entityId?: string; entityType?: string; entity?: string; [key: string]: unknown }" },
  { kind: "selectEntity", description: "Set the selected entity in NL context", paramsSchema: "{ kind: string; id: string }" },
  { kind: "setFilter", description: "Set a filter via URL search params", paramsSchema: "{ key: string; value: string }" },
  { kind: "focusPanel", description: "Focus an allowlisted panel (agentPanel, governanceQueue, operationsOverview, strategyWorkspace, terminalConsole, inspector, jobProgress)", paramsSchema: "{ panel: string }" },
  { kind: "refreshCurrentView", description: "Re-fetch the current view", paramsSchema: "{}" },
  {
    kind: "runBffAction",
    description: "Invoke an allowlisted BFF action via HighRiskConfirm flow",
    paramsSchema: "{ entityType: string; entityId: string; actionId: string; payload?: object; memo?: string }",
    highRisk: true,
  },
] as const;

export const ALLOWED_ROUTE_PREFIXES: readonly string[] = [
  "/management/",
  "/platform/",
  "/agora/",
  "/management",
  "/platform",
  "/agora",
] as const;

export const SUPPORTED_DRAWERS = [
  "inspector",
  "rightDrawer",
  "handoff",
  "jobs",
  "jobProgress",
  "entityCreate",
  "createEntity",
  "bulkResult",
  "rollbackSaga",
  "oodaPacket",
  "loopRun",
  "candidateReview",
] as const;

export type SupportedDrawer = typeof SUPPORTED_DRAWERS[number];

export const SUPPORTED_PANELS = [
  "agentPanel",
  "governanceQueue",
  "operationsOverview",
  "strategyWorkspace",
  "terminalConsole",
  "inspector",
  "jobProgress",
] as const;

export type SupportedPanel = typeof SUPPORTED_PANELS[number];

export interface UiActionExecuteCtx {
  navigate?: (path: string) => void;
  setSelectedEntity?: (kind: string, id: string) => void;
  setSearchParam?: (key: string, value: string) => void;
  refresh?: () => void;
  openDrawer?: (drawer: string, params?: Record<string, unknown>) => boolean | void | Promise<boolean | void>;
  focusPanel?: (panel: string, params?: Record<string, unknown>) => boolean | void | Promise<boolean | void>;
  requestConfirmation?: (action: UiAction, params: Record<string, unknown>) => boolean | void;
  runBffAction?: (action: UiAction, params: Record<string, unknown>) => Promise<UiActionExecuteResult> | UiActionExecuteResult;
  isActionExecuted?: (actionKey: string) => boolean;
}

export interface UiActionExecuteResult {
  ok: boolean;
  reason?: string;
  receipt?: string;
  actionId?: string;
  correlationId?: string;
}

export function isHighRiskAction(action: UiAction): boolean {
  if (action.requiresConfirmation) return true;
  if (action.kind === "runBffAction") return true;
  const desc = AVAILABLE_UI_ACTIONS.find((d) => d.kind === action.kind);
  return Boolean(desc?.highRisk);
}

/**
 * Generate a stable correlation key for an action to track execution status and prevent replay.
 */
export function getActionCorrelationKey(action: UiAction, turnId?: string, index?: number): string {
  if (action.id) return action.id;
  if (action.correlationId) return action.correlationId;
  const prefix = turnId ? `${turnId}:` : "";
  const idx = index !== undefined ? `${index}:` : "";
  const paramsKey = action.params ? JSON.stringify(action.params) : "";
  return `${prefix}${idx}${action.kind}:${paramsKey}`;
}

export function isValidUiAction(action: unknown): action is UiAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Partial<UiAction>;
  return typeof a.kind === "string" && a.kind.length > 0;
}

export async function executeUiAction(
  action: UiAction,
  ctx: UiActionExecuteCtx = {},
): Promise<UiActionExecuteResult> {
  if (!isValidUiAction(action)) {
    return { ok: false, reason: "Invalid UI action structure" };
  }

  const actionKey = getActionCorrelationKey(action);
  if (ctx.isActionExecuted?.(actionKey)) {
    return { ok: false, reason: "Action already executed (replay prevented)" };
  }

  const params = (action.params ?? {}) as Record<string, unknown>;

  switch (action.kind) {
    case "navigate": {
      const rawPath = typeof params.path === "string" ? params.path.trim() : "";
      if (!rawPath) {
        return { ok: false, reason: "navigate requires { path: string }" };
      }
      if (!ALLOWED_ROUTE_PREFIXES.some((p) => rawPath === p || rawPath.startsWith(p.endsWith("/") ? p : `${p}/`))) {
        return { ok: false, reason: `Route not allowlisted: ${rawPath}` };
      }
      if (!ctx.navigate) {
        return { ok: false, reason: "navigate handler not available in execution context" };
      }
      ctx.navigate(rawPath);
      return { ok: true };
    }

    case "selectEntity": {
      const kind = params.kind !== undefined && params.kind !== null ? String(params.kind).trim() : "";
      const id = params.id !== undefined && params.id !== null ? String(params.id).trim() : "";
      if (!kind || !id) {
        return { ok: false, reason: "selectEntity requires { kind, id }" };
      }
      if (!ctx.setSelectedEntity) {
        return { ok: false, reason: "setSelectedEntity handler not available in execution context" };
      }
      ctx.setSelectedEntity(kind, id);
      return { ok: true };
    }

    case "setFilter": {
      const key = params.key !== undefined && params.key !== null ? String(params.key).trim() : "";
      if (!key) {
        return { ok: false, reason: "setFilter requires { key }" };
      }
      if (!ctx.setSearchParam) {
        return { ok: false, reason: "setSearchParam handler not available in execution context" };
      }
      const value = params.value !== undefined && params.value !== null ? String(params.value) : "";
      ctx.setSearchParam(key, value);
      return { ok: true };
    }

    case "refreshCurrentView": {
      if (ctx.refresh) {
        ctx.refresh();
        return { ok: true };
      }
      if (typeof window !== "undefined" && typeof window.location?.reload === "function") {
        window.location.reload();
        return { ok: true };
      }
      return { ok: true };
    }

    case "openDrawer": {
      const drawer = params.drawer !== undefined && params.drawer !== null ? String(params.drawer).trim() : "";
      if (!drawer) {
        return { ok: false, reason: "openDrawer requires { drawer: string }" };
      }
      const isSupported = SUPPORTED_DRAWERS.includes(drawer as SupportedDrawer);
      if (!isSupported && !ctx.openDrawer) {
        return { ok: false, reason: `Drawer '${drawer}' not supported or registered` };
      }
      if (drawer === "entityCreate" || drawer === "createEntity") {
        const rawEntity = params.entity !== undefined ? params.entity : params.entityType !== undefined ? params.entityType : "persona";
        if (typeof rawEntity !== "string" || !isCreatableEntity(rawEntity.trim())) {
          return { ok: false, reason: `Entity '${String(rawEntity)}' not supported for ${drawer} drawer` };
        }
      }
      if (ctx.openDrawer) {
        const handled = await ctx.openDrawer(drawer, params);
        if (handled === false) {
          return { ok: false, reason: `Drawer '${drawer}' not supported or registered` };
        }
        return { ok: true };
      }
      if (!isSupported) {
        return { ok: false, reason: `Drawer '${drawer}' not supported or registered` };
      }
      return { ok: true };
    }

    case "focusPanel": {
      const panel = params.panel !== undefined && params.panel !== null ? String(params.panel).trim() : "";
      if (!panel) {
        return { ok: false, reason: "focusPanel requires { panel: string }" };
      }
      const isSupported = SUPPORTED_PANELS.includes(panel as SupportedPanel);
      if (!isSupported && !ctx.focusPanel) {
        return { ok: false, reason: `Panel '${panel}' not supported or registered` };
      }
      if (ctx.focusPanel) {
        const handled = await ctx.focusPanel(panel, params);
        if (handled === false) {
          return { ok: false, reason: `Panel '${panel}' not supported or registered` };
        }
        return { ok: true };
      }
      if (!isSupported) {
        return { ok: false, reason: `Panel '${panel}' not supported or registered` };
      }
      return { ok: true };
    }

    case "runBffAction": {
      const entityType = params.entityType !== undefined && params.entityType !== null ? String(params.entityType).trim() : "";
      const entityId = params.entityId !== undefined && params.entityId !== null ? String(params.entityId).trim() : "";
      const actionId = params.actionId !== undefined && params.actionId !== null ? String(params.actionId).trim() : "";
      if (!entityType || !entityId || !actionId) {
        return { ok: false, reason: "runBffAction requires { entityType, entityId, actionId }" };
      }

      // Backend mutation must ALWAYS flow through HighRiskConfirm confirmation.
      if (ctx.runBffAction) {
        const result = await ctx.runBffAction(action, params);
        return {
          correlationId: actionKey,
          ...result,
        };
      }
      if (ctx.requestConfirmation) {
        ctx.requestConfirmation(action, params);
        return { ok: true, reason: "Confirmation requested", correlationId: actionKey };
      }
      return { ok: false, reason: "runBffAction must be routed through HighRiskConfirm", correlationId: actionKey };
    }

    default:
      return { ok: false, reason: `Unknown action kind: ${(action as UiAction).kind}` };
  }
}
