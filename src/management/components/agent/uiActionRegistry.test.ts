import { describe, expect, it, vi } from "vitest";
import {
  AVAILABLE_UI_ACTIONS,
  AVAILABLE_UI_ACTION_KINDS,
  isKnownUiActionKind,
  ALLOWED_ROUTE_PREFIXES,
  SUPPORTED_DRAWERS,
  SUPPORTED_PANELS,
  CREATABLE_ENTITIES,
  isCreatableEntity,
  executeUiAction,
  getActionCorrelationKey,
  isHighRiskAction,
  isValidUiAction,
  type UiAction,
  type UiActionExecuteCtx,
} from "./uiActionRegistry";

describe("uiActionRegistry", () => {
  describe("AVAILABLE_UI_ACTIONS schema and allowlist", () => {
    it("contains all seven registered UI action kinds", () => {
      const kinds = AVAILABLE_UI_ACTIONS.map((a) => a.kind);
      expect(kinds).toEqual([
        "navigate",
        "openDrawer",
        "selectEntity",
        "setFilter",
        "focusPanel",
        "refreshCurrentView",
        "runBffAction",
      ]);
    });

    it("exports AVAILABLE_UI_ACTION_KINDS matching AVAILABLE_UI_ACTIONS", () => {
      expect(AVAILABLE_UI_ACTION_KINDS).toEqual([
        "navigate",
        "openDrawer",
        "selectEntity",
        "setFilter",
        "focusPanel",
        "refreshCurrentView",
        "runBffAction",
      ]);
    });

    it("marks runBffAction as highRisk", () => {
      const runBff = AVAILABLE_UI_ACTIONS.find((a) => a.kind === "runBffAction");
      expect(runBff?.highRisk).toBe(true);
    });

    it("allows standard application route prefixes", () => {
      expect(ALLOWED_ROUTE_PREFIXES).toContain("/management/");
      expect(ALLOWED_ROUTE_PREFIXES).toContain("/platform/");
      expect(ALLOWED_ROUTE_PREFIXES).toContain("/agora/");
    });

    it("includes standard drawer registrations", () => {
      expect(SUPPORTED_DRAWERS).toContain("inspector");
      expect(SUPPORTED_DRAWERS).toContain("handoff");
      expect(SUPPORTED_DRAWERS).toContain("jobs");
      expect(SUPPORTED_DRAWERS).toContain("entityCreate");
      expect(SUPPORTED_DRAWERS).toContain("bulkResult");
      expect(SUPPORTED_DRAWERS).toContain("rollbackSaga");
    });

    it("includes standard panel registrations", () => {
      expect(SUPPORTED_PANELS).toContain("agentPanel");
      expect(SUPPORTED_PANELS).toContain("governanceQueue");
      expect(SUPPORTED_PANELS).toContain("operationsOverview");
      expect(SUPPORTED_PANELS).toContain("strategyWorkspace");
      expect(SUPPORTED_PANELS).toContain("terminalConsole");
      expect(SUPPORTED_PANELS).toContain("inspector");
      expect(SUPPORTED_PANELS).toContain("jobProgress");
    });

    it("includes all 9 creatable entities in CREATABLE_ENTITIES", () => {
      expect(CREATABLE_ENTITIES).toEqual([
        "strategy",
        "persona",
        "capitalPool",
        "rankingFormula",
        "rebalance",
        "deployment",
        "evolutionProgram",
        "researchExperiment",
        "artifact",
      ]);
    });
  });

  describe("isKnownUiActionKind", () => {
    it("returns true for all 7 registered action kinds", () => {
      for (const kind of AVAILABLE_UI_ACTION_KINDS) {
        expect(isKnownUiActionKind(kind)).toBe(true);
      }
    });

    it("returns false for unregistered or invalid action kinds", () => {
      expect(isKnownUiActionKind("unknownAction")).toBe(false);
      expect(isKnownUiActionKind("customDangerousBffMutation")).toBe(false);
      expect(isKnownUiActionKind("")).toBe(false);
      expect(isKnownUiActionKind(null)).toBe(false);
      expect(isKnownUiActionKind(undefined)).toBe(false);
      expect(isKnownUiActionKind(123)).toBe(false);
    });
  });

  describe("isCreatableEntity", () => {
    it("returns true for all valid CreatableEntity members", () => {
      for (const entity of CREATABLE_ENTITIES) {
        expect(isCreatableEntity(entity)).toBe(true);
      }
    });

    it("returns false for invalid or unknown entity strings", () => {
      expect(isCreatableEntity("invalid")).toBe(false);
      expect(isCreatableEntity("user")).toBe(false);
      expect(isCreatableEntity("evil_payload")).toBe(false);
      expect(isCreatableEntity("")).toBe(false);
      expect(isCreatableEntity(null)).toBe(false);
      expect(isCreatableEntity(undefined)).toBe(false);
      expect(isCreatableEntity(123)).toBe(false);
    });
  });

  describe("isHighRiskAction", () => {
    it("returns true for runBffAction", () => {
      expect(isHighRiskAction({ kind: "runBffAction" })).toBe(true);
    });

    it("returns true when requiresConfirmation is set for a valid action", () => {
      expect(isHighRiskAction({ kind: "navigate", requiresConfirmation: true })).toBe(true);
    });

    it("returns false for unregistered action kinds even if requiresConfirmation is true", () => {
      expect(isHighRiskAction({ kind: "unknownDangerousAction", requiresConfirmation: true })).toBe(false);
      expect(isHighRiskAction({ kind: "arbitraryAction" })).toBe(false);
    });

    it("returns false for ordinary read/navigation actions without confirmation flag", () => {
      expect(isHighRiskAction({ kind: "navigate" })).toBe(false);
      expect(isHighRiskAction({ kind: "selectEntity" })).toBe(false);
      expect(isHighRiskAction({ kind: "setFilter" })).toBe(false);
      expect(isHighRiskAction({ kind: "focusPanel" })).toBe(false);
      expect(isHighRiskAction({ kind: "refreshCurrentView" })).toBe(false);
      expect(isHighRiskAction({ kind: "openDrawer" })).toBe(false);
    });
  });

  describe("getActionCorrelationKey and isValidUiAction", () => {
    it("uses action id or correlationId when available", () => {
      expect(getActionCorrelationKey({ id: "act_123", kind: "navigate" })).toBe("act_123");
      expect(getActionCorrelationKey({ correlationId: "corr_abc", kind: "selectEntity" })).toBe("corr_abc");
    });

    it("synthesizes deterministic correlation key from turnId, index, and params", () => {
      const key1 = getActionCorrelationKey(
        { kind: "navigate", params: { path: "/management/strategies" } },
        "turn_01",
        0,
      );
      const key2 = getActionCorrelationKey(
        { kind: "navigate", params: { path: "/management/strategies" } },
        "turn_01",
        0,
      );
      expect(key1).toBe(key2);
      expect(key1).toContain("turn_01:0:navigate:");
    });

    it("validates action structure", () => {
      expect(isValidUiAction({ kind: "navigate" })).toBe(true);
      expect(isValidUiAction(null)).toBe(false);
      expect(isValidUiAction({})).toBe(false);
      expect(isValidUiAction({ kind: "" })).toBe(false);
    });
  });

  describe("executeUiAction — Action Execution & Validation", () => {
    describe("navigate", () => {
      it("navigates to allowlisted routes", async () => {
        const navigate = vi.fn();
        const res = await executeUiAction(
          { kind: "navigate", params: { path: "/management/strategies" } },
          { navigate },
        );
        expect(res.ok).toBe(true);
        expect(navigate).toHaveBeenCalledWith("/management/strategies");
      });

      it("rejects non-allowlisted routes", async () => {
        const navigate = vi.fn();
        const res = await executeUiAction(
          { kind: "navigate", params: { path: "/admin/secret" } },
          { navigate },
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("Route not allowlisted");
        expect(navigate).not.toHaveBeenCalled();
      });

      it("rejects missing path parameter", async () => {
        const navigate = vi.fn();
        const res = await executeUiAction({ kind: "navigate", params: {} }, { navigate });
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("navigate requires { path: string }");
      });

      it("reports missing navigate handler in context", async () => {
        const res = await executeUiAction(
          { kind: "navigate", params: { path: "/management/personas" } },
          {},
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("navigate handler not available");
      });
    });

    describe("selectEntity", () => {
      it("sets selected entity in context", async () => {
        const setSelectedEntity = vi.fn();
        const res = await executeUiAction(
          { kind: "selectEntity", params: { kind: "strategy", id: "strat_alpha_01" } },
          { setSelectedEntity },
        );
        expect(res.ok).toBe(true);
        expect(setSelectedEntity).toHaveBeenCalledWith("strategy", "strat_alpha_01");
      });

      it("rejects missing kind or id", async () => {
        const setSelectedEntity = vi.fn();
        const res1 = await executeUiAction(
          { kind: "selectEntity", params: { kind: "strategy" } },
          { setSelectedEntity },
        );
        expect(res1.ok).toBe(false);
        expect(res1.reason).toContain("selectEntity requires { kind, id }");

        const res2 = await executeUiAction(
          { kind: "selectEntity", params: { id: "strat_alpha_01" } },
          { setSelectedEntity },
        );
        expect(res2.ok).toBe(false);
        expect(setSelectedEntity).not.toHaveBeenCalled();
      });

      it("reports missing setSelectedEntity handler", async () => {
        const res = await executeUiAction(
          { kind: "selectEntity", params: { kind: "persona", id: "p_1" } },
          {},
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("setSelectedEntity handler not available");
      });
    });

    describe("setFilter", () => {
      it("sets search filter param", async () => {
        const setSearchParam = vi.fn();
        const res = await executeUiAction(
          { kind: "setFilter", params: { key: "env", value: "paper" } },
          { setSearchParam },
        );
        expect(res.ok).toBe(true);
        expect(setSearchParam).toHaveBeenCalledWith("env", "paper");
      });

      it("rejects missing key", async () => {
        const setSearchParam = vi.fn();
        const res = await executeUiAction({ kind: "setFilter", params: {} }, { setSearchParam });
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("setFilter requires { key }");
      });
    });

    describe("refreshCurrentView", () => {
      it("invokes refresh handler", async () => {
        const refresh = vi.fn();
        const res = await executeUiAction({ kind: "refreshCurrentView" }, { refresh });
        expect(res.ok).toBe(true);
        expect(refresh).toHaveBeenCalled();
      });
    });

    describe("openDrawer", () => {
      it("routes supported drawers through ctx.openDrawer", async () => {
        const openDrawer = vi.fn().mockReturnValue(true);
        const res = await executeUiAction(
          { kind: "openDrawer", params: { drawer: "inspector", entityId: "strat_101", entityType: "strategy" } },
          { openDrawer },
        );
        expect(res.ok).toBe(true);
        expect(openDrawer).toHaveBeenCalledWith("inspector", {
          drawer: "inspector",
          entityId: "strat_101",
          entityType: "strategy",
        });
      });

      it("rejects unsupported drawer names and does not call ctx.openDrawer", async () => {
        const openDrawer = vi.fn().mockReturnValue(true);
        const res = await executeUiAction(
          { kind: "openDrawer", params: { drawer: "unsupportedNonExistentDrawer" } },
          { openDrawer },
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("not supported or registered");
        expect(openDrawer).not.toHaveBeenCalled();
      });

      it("rejects missing drawer param", async () => {
        const res = await executeUiAction({ kind: "openDrawer", params: {} }, {});
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("openDrawer requires { drawer: string }");
      });

      it("routes entityCreate with allowlisted entity through ctx.openDrawer", async () => {
        const openDrawer = vi.fn().mockReturnValue(true);
        const res = await executeUiAction(
          { kind: "openDrawer", params: { drawer: "entityCreate", entity: "strategy" } },
          { openDrawer },
        );
        expect(res.ok).toBe(true);
        expect(openDrawer).toHaveBeenCalledWith("entityCreate", {
          drawer: "entityCreate",
          entity: "strategy",
        });
      });

      it("routes createEntity with allowlisted entityType through ctx.openDrawer", async () => {
        const openDrawer = vi.fn().mockReturnValue(true);
        const res = await executeUiAction(
          { kind: "openDrawer", params: { drawer: "createEntity", entityType: "capitalPool" } },
          { openDrawer },
        );
        expect(res.ok).toBe(true);
        expect(openDrawer).toHaveBeenCalledWith("createEntity", {
          drawer: "createEntity",
          entityType: "capitalPool",
        });
      });

      it("defaults to persona when entity/entityType are omitted for entityCreate", async () => {
        const openDrawer = vi.fn().mockReturnValue(true);
        const res = await executeUiAction(
          { kind: "openDrawer", params: { drawer: "entityCreate" } },
          { openDrawer },
        );
        expect(res.ok).toBe(true);
        expect(openDrawer).toHaveBeenCalledWith("entityCreate", {
          drawer: "entityCreate",
        });
      });

      it("rejects entityCreate with unsupported entity value and does not call ctx.openDrawer", async () => {
        const openDrawer = vi.fn().mockReturnValue(true);
        const res = await executeUiAction(
          { kind: "openDrawer", params: { drawer: "entityCreate", entity: "unknown_entity" } },
          { openDrawer },
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("Entity 'unknown_entity' not supported for entityCreate drawer");
        expect(openDrawer).not.toHaveBeenCalled();
      });

      it("rejects createEntity with unsupported entityType value and does not call ctx.openDrawer", async () => {
        const openDrawer = vi.fn().mockReturnValue(true);
        const res = await executeUiAction(
          { kind: "openDrawer", params: { drawer: "createEntity", entityType: "secret_hacker_entity" } },
          { openDrawer },
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("Entity 'secret_hacker_entity' not supported for createEntity drawer");
        expect(openDrawer).not.toHaveBeenCalled();
      });
    });

    describe("focusPanel", () => {
      it("routes panel focus through ctx.focusPanel", async () => {
        const focusPanel = vi.fn().mockReturnValue(true);
        const res = await executeUiAction(
          { kind: "focusPanel", params: { panel: "agentPanel" } },
          { focusPanel },
        );
        expect(res.ok).toBe(true);
        expect(focusPanel).toHaveBeenCalledWith("agentPanel", { panel: "agentPanel" });
      });

      it("succeeds for allowlisted panel when registered", async () => {
        const res = await executeUiAction(
          { kind: "focusPanel", params: { panel: "governanceQueue" } },
          {},
        );
        expect(res.ok).toBe(true);
      });

      it("rejects non-allowlisted panel even if matching DOM element exists (no DOM fallback)", async () => {
        const dummyDiv = document.createElement("div");
        dummyDiv.id = "arbitraryDomElement";
        dummyDiv.scrollIntoView = vi.fn();
        dummyDiv.focus = vi.fn();
        document.body.appendChild(dummyDiv);

        const res = await executeUiAction(
          { kind: "focusPanel", params: { panel: "arbitraryDomElement" } },
          {},
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("not supported or registered");
        expect(dummyDiv.scrollIntoView).not.toHaveBeenCalled();

        document.body.removeChild(dummyDiv);
      });

      it("rejects non-allowlisted panel and does not call ctx.focusPanel", async () => {
        const focusPanel = vi.fn().mockReturnValue(true);
        const res = await executeUiAction(
          { kind: "focusPanel", params: { panel: "unknownPanel" } },
          { focusPanel },
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("not supported or registered");
        expect(focusPanel).not.toHaveBeenCalled();
      });

      it("rejects missing panel param", async () => {
        const res = await executeUiAction({ kind: "focusPanel", params: {} }, {});
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("focusPanel requires { panel: string }");
      });
    });

    describe("runBffAction", () => {
      it("rejects missing parameters", async () => {
        const res = await executeUiAction(
          { kind: "runBffAction", params: { entityType: "persona" } },
          {},
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("runBffAction requires { entityType, entityId, actionId }");
      });

      it("requires confirmation when invoked without confirmed handler", async () => {
        const res = await executeUiAction(
          {
            kind: "runBffAction",
            params: { entityType: "persona", entityId: "p_alpha", actionId: "retire" },
          },
          {},
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("must be routed through HighRiskConfirm");
      });

      it("triggers confirmation request when ctx.requestConfirmation is supplied", async () => {
        const requestConfirmation = vi.fn();
        const action: UiAction = {
          kind: "runBffAction",
          params: { entityType: "persona", entityId: "p_alpha", actionId: "retire" },
        };
        const res = await executeUiAction(action, { requestConfirmation });
        expect(res.ok).toBe(true);
        expect(res.reason).toBe("Confirmation requested");
        expect(requestConfirmation).toHaveBeenCalledWith(action, action.params);
      });

      it("executes confirmed action when ctx.runBffAction is supplied", async () => {
        const runBffAction = vi.fn().mockResolvedValue({
          ok: true,
          receipt: "command/audit au_1234 · status completed · idem id_abc",
          actionId: "retire",
        });
        const action: UiAction = {
          kind: "runBffAction",
          params: { entityType: "persona", entityId: "p_alpha", actionId: "retire" },
        };
        const res = await executeUiAction(action, { runBffAction });
        expect(res.ok).toBe(true);
        expect(res.receipt).toContain("au_1234");
        expect(runBffAction).toHaveBeenCalledWith(action, action.params);
      });
    });

    describe("Replay Prevention & Correlation", () => {
      it("prevents double execution when action correlation key is already recorded as executed", async () => {
        const navigate = vi.fn();
        const action: UiAction = {
          id: "act_nav_01",
          kind: "navigate",
          params: { path: "/management/strategies" },
        };

        const ctx: UiActionExecuteCtx = {
          navigate,
          isActionExecuted: (key) => key === "act_nav_01",
        };

        const res = await executeUiAction(action, ctx);
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("Action already executed (replay prevented)");
        expect(navigate).not.toHaveBeenCalled();
      });
    });

    describe("Unsupported / Unknown Action Kinds", () => {
      it("returns explicit unsupported error for unknown action kind", async () => {
        const res = await executeUiAction(
          { kind: "deleteRepository" as never, params: {} },
          {},
        );
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("Unknown action kind: deleteRepository");
      });
    });
  });
});
