// Management AI — allowlisted UI action registry.
//
// The assistant is NOT allowed to operate arbitrary DOM selectors. It can only
// request actions that map 1:1 to entries below. Backend mutations must still
// go through the existing BFF action/command endpoint + HighRiskConfirm; this
// registry never auto-invokes a write.

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
  kind: UiActionKind;
  label?: string;
  rationale?: string;
  params?: Record<string, unknown>;
  /** When true, FE never auto-executes — user must click. */
  requiresConfirmation?: boolean;
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
  { kind: "navigate", description: "Switch to a /management/* route", paramsSchema: "{ path: string }" },
  { kind: "openDrawer", description: "Open a registered drawer", paramsSchema: "{ drawer: string; entityId?: string }" },
  { kind: "selectEntity", description: "Set the selected entity in NL context", paramsSchema: "{ kind: string; id: string }" },
  { kind: "setFilter", description: "Set a filter via URL search params", paramsSchema: "{ key: string; value: string }" },
  { kind: "focusPanel", description: "Focus a panel by id", paramsSchema: "{ panel: string }" },
  { kind: "refreshCurrentView", description: "Re-fetch the current view", paramsSchema: "{}" },
  {
    kind: "runBffAction",
    description: "Invoke an allowlisted BFF action via HighRiskConfirm flow",
    paramsSchema: "{ entityType: string; entityId: string; actionId: string; payload?: object }",
    highRisk: true,
  },
] as const;

const ALLOWED_ROUTE_PREFIXES = ["/management/"];

export interface UiActionExecuteCtx {
  navigate: (path: string) => void;
  setSelectedEntity: (kind: string, id: string) => void;
  setSearchParam: (key: string, value: string) => void;
  refresh: () => void;
}

export interface UiActionExecuteResult {
  ok: boolean;
  reason?: string;
}

export function isHighRiskAction(action: UiAction): boolean {
  if (action.requiresConfirmation) return true;
  const desc = AVAILABLE_UI_ACTIONS.find((d) => d.kind === action.kind);
  return Boolean(desc?.highRisk);
}

export function executeUiAction(action: UiAction, ctx: UiActionExecuteCtx): UiActionExecuteResult {
  const params = (action.params ?? {}) as Record<string, unknown>;
  switch (action.kind) {
    case "navigate": {
      const path = String(params.path ?? "");
      if (!ALLOWED_ROUTE_PREFIXES.some((p) => path.startsWith(p))) {
        return { ok: false, reason: `Route not allowlisted: ${path}` };
      }
      ctx.navigate(path);
      return { ok: true };
    }
    case "selectEntity": {
      const kind = params.kind ? String(params.kind) : "";
      const id = params.id ? String(params.id) : "";
      if (!kind || !id) return { ok: false, reason: "selectEntity requires { kind, id }" };
      ctx.setSelectedEntity(kind, id);
      return { ok: true };
    }
    case "setFilter": {
      const key = params.key ? String(params.key) : "";
      if (!key) return { ok: false, reason: "setFilter requires { key }" };
      ctx.setSearchParam(key, String(params.value ?? ""));
      return { ok: true };
    }
    case "refreshCurrentView": {
      ctx.refresh();
      return { ok: true };
    }
    case "openDrawer":
    case "focusPanel":
      return { ok: false, reason: `${action.kind} not yet wired to a panel registry` };
    case "runBffAction":
      // Backend mutation must always go through HighRiskConfirm; FE never auto-runs.
      return { ok: false, reason: "runBffAction must be routed through HighRiskConfirm" };
    default:
      return { ok: false, reason: `Unknown action kind: ${(action as UiAction).kind}` };
  }
}
