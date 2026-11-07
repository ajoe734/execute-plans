import { createElement } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolvePersonaForDetail } from "./personaDetailData";
import { PersonaDetail, personaHumanInboxUrl, personaWorkshopEntryUrl } from "./PersonaDetail";
import { bffV1, type CapitalPool, type Persona, type Strategy } from "@/lib/bff-v1";
import { getPersona, getPersonaManagement, runPersonaAction } from "@/lib/bff-v1/personas";
import * as writes from "@/lib/bff-v1/writes";

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    bffV1: {
      ...actual.bffV1,
      capitalPools: { ...actual.bffV1.capitalPools, list: vi.fn().mockResolvedValue([]) },
      strategies: { ...actual.bffV1.strategies, listForPersona: vi.fn().mockResolvedValue([]) },
      audit: { ...actual.bffV1.audit, list: vi.fn().mockResolvedValue([]) },
    },
  };
});

vi.mock("@/lib/bff-v1/personas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1/personas")>();
  return {
    ...actual,
    getPersona: vi.fn(),
    getPersonaManagement: vi.fn().mockResolvedValue(undefined),
  };
});

describe("PersonaDetail", () => {
  beforeEach(() => {
    vi.mocked(getPersona).mockReset();
    vi.mocked(getPersonaManagement).mockReset().mockResolvedValue(undefined);
    vi.mocked(bffV1.strategies.listForPersona).mockReset().mockResolvedValue([]);
    vi.mocked(bffV1.capitalPools.list).mockReset().mockResolvedValue([]);
  });

  it("resolves persona detail from the BFF persona endpoint", async () => {
    const persona: Persona = {
      id: "ps_detail",
      name: "Detail Persona",
      owner: "you",
      updatedAt: "2026-05-10T00:00:00.000Z",
      state: "draft",
      risk: "low",
      archetype: "macro",
      routedStrategies: 0,
      successRate: 0,
    };

    vi.mocked(getPersona).mockResolvedValue(persona);

    await expect(resolvePersonaForDetail("ps_detail")).resolves.toMatchObject({
      id: "ps_detail",
      name: "Detail Persona",
    });
    expect(getPersona).toHaveBeenCalledWith("ps_detail");
  });

  it("builds a persona-scoped Human Inbox entry URL", () => {
    expect(personaHumanInboxUrl("persona/tw equity")).toBe(
      "/management/human-inbox?persona=persona%2Ftw%20equity",
    );
  });

  it("builds a focus-preserving canonical Workshop interaction entry", () => {
    const url = personaWorkshopEntryUrl({
      workshopId: "ws/persona 1",
      mode: "compare",
      participantIds: ["persona-a", "persona-b"],
      picker: "recommended",
      returnTo: "/management/personas/persona-a?tab=tradeJournal",
      returnLabel: "Persona A",
      source: { kind: "persona", id: "persona-a", version: "v7" },
      targetStrategy: { id: "strategy-a", version: "spec-v3" },
      environment: "research",
      evidenceCutoff: "2026-07-17T01:02:03Z",
    });
    const parsed = new URL(url, "https://example.test");
    expect(parsed.pathname).toBe("/agora/strategy-workshop/ws%2Fpersona%201");
    expect(parsed.searchParams.get("mode")).toBe("compare");
    expect(parsed.searchParams.get("participants")).toBe("persona-a,persona-b");
    expect(parsed.searchParams.get("return_to")).toBe("/management/personas/persona-a?tab=tradeJournal");
    expect(parsed.searchParams.get("source_kind")).toBe("persona");
    expect(parsed.searchParams.get("source_id")).toBe("persona-a");
    expect(parsed.searchParams.get("source_version")).toBe("v7");
    expect(parsed.searchParams.get("picker")).toBe("recommended");
    expect(parsed.searchParams.get("target_strategy_id")).toBe("strategy-a");
    expect(parsed.searchParams.get("target_strategy_version")).toBe("spec-v3");
    expect(parsed.searchParams.get("advice_environment")).toBe("research");
    expect(parsed.searchParams.get("evidence_cutoff")).toBe("2026-07-17T01:02:03Z");
  });

  describe("saved Quarterly Ranking navigation", () => {
    it.each(["ps_detail", "persona/tw equity"])(
      "links to persona-scoped saved rankings for %s and submits no command",
      async (personaId) => {
        vi.mocked(getPersona).mockResolvedValue({
          id: personaId,
          name: "Detail Persona",
          owner: "you",
          updatedAt: "2026-05-10T00:00:00.000Z",
          state: "draft",
          risk: "low",
          archetype: "macro",
          routedStrategies: 0,
          successRate: 0,
        } as Persona);
        const runActionSpy = vi.spyOn(writes, "runAction");
        runActionSpy.mockClear();

        render(
          createElement(
            MemoryRouter,
            { initialEntries: [`/management/personas/${encodeURIComponent(personaId)}`] },
            createElement(
              Routes,
              null,
              createElement(Route, { path: "/management/personas/:id", element: createElement(PersonaDetail) }),
            ),
          ),
        );

        const link = await waitFor(() => {
          const el = screen
            .getAllByRole("link")
            .find((a) => a.getAttribute("href")?.startsWith("/management/rankings"));
          expect(el).toBeTruthy();
          return el as HTMLElement;
        });
        const href = link.getAttribute("href") ?? "";
        const parsed = new URL(href, "https://example.test");
        expect(parsed.pathname).toBe("/management/rankings");
        expect(parsed.searchParams.get("tab")).toBe("quarterly");
        expect(parsed.searchParams.get("persona")).toBe(personaId);
        fireEvent.click(link);
        expect(runActionSpy).not.toHaveBeenCalled();
      },
    );
  });

  describe("runPersonaAction operations", () => {
    it("dispatches restrict_tools with PersonaAction envelope to canonical /bff/v1/commands", async () => {
      const runActionSpy = vi.spyOn(writes, "runAction").mockResolvedValueOnce({
        ok: true,
        data: { commandId: "cmd-restrict-1", status: "accepted" },
      } as any);

      const res = await runPersonaAction("ps_detail", "restrict_tools", { memo: "temporary restriction" });

      expect(runActionSpy).toHaveBeenCalledWith(
        {
          kind: "Persona",
          id: "ps_detail",
          action: "restrict_tools",
          memo: "temporary restriction",
          reason: undefined,
          confirmToken: undefined,
          payload: { memo: "temporary restriction" },
        },
        {
          correlationId: undefined,
          idempotencyKey: undefined,
          confirmToken: undefined,
        },
      );
      expect(res).toMatchObject({ ok: true, data: { commandId: "cmd-restrict-1" } });
    });

    it("dispatches suspend with confirmToken and PersonaAction envelope to canonical /bff/v1/commands", async () => {
      const runActionSpy = vi.spyOn(writes, "runAction").mockResolvedValueOnce({
        ok: true,
        data: { commandId: "cmd-suspend-1", status: "accepted" },
      } as any);

      const res = await runPersonaAction("ps_detail", "suspend", {
        memo: "suspend memo",
        confirmToken: "ctok_suspend_99",
      });

      expect(runActionSpy).toHaveBeenCalledWith(
        {
          kind: "Persona",
          id: "ps_detail",
          action: "suspend",
          memo: "suspend memo",
          reason: undefined,
          confirmToken: "ctok_suspend_99",
          payload: { memo: "suspend memo", confirmToken: "ctok_suspend_99" },
        },
        {
          correlationId: undefined,
          idempotencyKey: undefined,
          confirmToken: "ctok_suspend_99",
        },
      );
      expect(res).toMatchObject({ ok: true, data: { commandId: "cmd-suspend-1" } });
    });

    it("dispatches retire with confirmToken and PersonaAction envelope to canonical /bff/v1/commands", async () => {
      const runActionSpy = vi.spyOn(writes, "runAction").mockResolvedValueOnce({
        ok: true,
        data: { commandId: "cmd-retire-1", status: "accepted" },
      } as any);

      const res = await runPersonaAction("ps_detail", "retire", {
        memo: "retire memo",
        confirmToken: "ctok_retire_99",
      });

      expect(runActionSpy).toHaveBeenCalledWith(
        {
          kind: "Persona",
          id: "ps_detail",
          action: "retire",
          memo: "retire memo",
          reason: undefined,
          confirmToken: "ctok_retire_99",
          payload: { memo: "retire memo", confirmToken: "ctok_retire_99" },
        },
        {
          correlationId: undefined,
          idempotencyKey: undefined,
          confirmToken: "ctok_retire_99",
        },
      );
      expect(res).toMatchObject({ ok: true, data: { commandId: "cmd-retire-1" } });
    });
  });

  describe("header lifecycle display", () => {
    it("renders canonical lifecycleStatus research_only instead of contradictory legacy draft state while preserving paper readiness", async () => {
      vi.mocked(getPersona).mockResolvedValue({
        id: "persona-dev-lifecycle-39057282435",
        name: "DEV ACCEPTANCE ONLY: Persona lifecycle JWT 39057282435",
        owner: "pantheon-dev-operator-a",
        updatedAt: "2026-10-19T01:13:49.473740Z",
        state: "draft",
        lifecycleStatus: "research_only",
        risk: "low",
        archetype: "generalist",
        routedStrategies: 0,
        successRate: 0,
      });
      const runActionSpy = vi.spyOn(writes, "runAction");
      runActionSpy.mockClear();

      render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/management/personas/persona-dev-lifecycle-39057282435"] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/management/personas/:id", element: createElement(PersonaDetail) }),
          ),
        ),
      );

      expect(await screen.findByText("research_only")).toBeInTheDocument();
      expect(screen.queryByText(/^(draft|草稿)$/i)).not.toBeInTheDocument();
      expect(screen.getByText(/0\/5 · persona-dev-lifecycle-39057282435/)).toBeInTheDocument();
      expect(screen.getByText("未升級")).toBeInTheDocument();
      expect(runActionSpy).not.toHaveBeenCalled();
    });

    it.each([undefined, "", "   "])(
      "preserves the legacy state display when canonical lifecycleStatus is %j",
      async (lifecycleStatus) => {
        vi.mocked(getPersona).mockResolvedValue({
          id: "ps_legacy",
          name: "Legacy Persona",
          owner: "you",
          updatedAt: "2026-05-10T00:00:00.000Z",
          state: "draft",
          lifecycleStatus,
          risk: "low",
          archetype: "macro",
          routedStrategies: 0,
          successRate: 0,
        });

        render(
          createElement(
            MemoryRouter,
            { initialEntries: ["/management/personas/ps_legacy"] },
            createElement(
              Routes,
              null,
              createElement(Route, { path: "/management/personas/:id", element: createElement(PersonaDetail) }),
            ),
          ),
        );

        expect(await screen.findByText("草稿")).toBeInTheDocument();
        expect(screen.queryByText("research_only")).not.toBeInTheDocument();
      },
    );
  });

  describe("persona-be19a1fac471247f2b2a capital binding and strategy ownership tabs", () => {
    const realPersona: Persona = {
      id: "persona-be19a1fac471247f2b2a",
      name: "青禾｜2330 台股 Paper 學習 R2",
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "approved",
      lifecycleStatus: "paper_active",
      risk: "low",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0.56,
    };

    const realStrategy: Strategy = {
      id: "strategy-persona-298e138c136c9840b0e4",
      name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
      owner: "operator",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "approved",
      risk: "low",
      alpha: "alpha.tw.2330",
      capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
      personaIds: ["persona-be19a1fac471247f2b2a"],
      pnl30d: null,
      sharpe: null,
      drawdown: null,
    };

    const realPool: CapitalPool = {
      id: "pool-persona-paper-298e138c136c9840b0e4",
      name: "pool-persona-paper-298e138c136c9840b0e4",
      owner: "treasury",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "approved",
      risk: "low",
      currency: "USD",
      allocated: Number.NaN,
      utilized: Number.NaN,
      riskBudget: Number.NaN,
    };

    it("renders strategy-persona-298e138c136c9840b0e4 and pool-persona-paper-298e138c136c9840b0e4 on capitalBinding and strategyOwnership tabs", async () => {
      vi.mocked(getPersona).mockResolvedValue(realPersona);
      vi.mocked(bffV1.strategies.listForPersona).mockResolvedValue([realStrategy]);
      const pools = Array.from({ length: 25 }, (_, index) =>
        index === 24
          ? realPool
          : {
              ...realPool,
              id: `pool-other-${index + 1}`,
              name: `Other Pool ${index + 1}`,
            },
      );
      vi.mocked(bffV1.capitalPools.list).mockResolvedValue(pools);

      const selectTab = async (tabNamePattern: RegExp) => {
        const tab = await screen.findByRole("tab", { name: tabNamePattern });
        fireEvent.pointerDown(tab);
        fireEvent.mouseDown(tab);
        fireEvent.pointerUp(tab);
        fireEvent.mouseUp(tab);
        fireEvent.click(tab);
      };

      render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/management/personas/persona-be19a1fac471247f2b2a"] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/management/personas/:id", element: createElement(PersonaDetail) }),
          ),
        ),
      );

      await selectTab(/資金綁定|Capital Binding/i);
      expect(await screen.findByText("pool-persona-paper-298e138c136c9840b0e4")).toBeInTheDocument();
      expect(screen.getByText(/strategy-persona-298e138c136c9840b0e4/)).toBeInTheDocument();
      expect(bffV1.strategies.listForPersona).toHaveBeenCalledWith("persona-be19a1fac471247f2b2a");

      await selectTab(/策略歸屬|Strategy Ownership/i);
      expect(
        await screen.findByText("青禾｜2330 台股 Paper 學習 R2 Paper Strategy"),
      ).toBeInTheDocument();
      expect(screen.getByText("strategy-persona-298e138c136c9840b0e4")).toBeInTheDocument();
      const routesTab = screen
        .getAllByRole("tab")
        .find((tab) => (tab.getAttribute("id") ?? "").endsWith("trigger-routes"));
      expect(routesTab).toBeDefined();
      fireEvent.pointerDown(routesTab!);
      fireEvent.mouseDown(routesTab!);
      fireEvent.pointerUp(routesTab!);
      fireEvent.mouseUp(routesTab!);
      fireEvent.click(routesTab!);
      expect(await screen.findByText("alpha.tw.2330")).toBeInTheDocument();
      expect("persona_id" in (realStrategy as unknown as Record<string, unknown>)).toBe(false);
      expect("persona_ids" in (realStrategy as unknown as Record<string, unknown>)).toBe(false);
      expect("personaId" in (realStrategy as unknown as Record<string, unknown>)).toBe(false);
      expect("capital_pool_id" in (realStrategy as unknown as Record<string, unknown>)).toBe(false);
    });

    it("renders unavailable and not no results when strategyOwnership or capitalBinding read fails", async () => {
      vi.mocked(getPersona).mockResolvedValue(realPersona);
      vi.mocked(bffV1.strategies.listForPersona).mockRejectedValue(new Error("strategy read failed"));
      vi.mocked(bffV1.capitalPools.list).mockRejectedValue(new Error("capital read failed"));

      const selectTab = async (tabNamePattern: RegExp) => {
        const tab = await screen.findByRole("tab", { name: tabNamePattern });
        fireEvent.pointerDown(tab);
        fireEvent.mouseDown(tab);
        fireEvent.pointerUp(tab);
        fireEvent.mouseUp(tab);
        fireEvent.click(tab);
      };

      render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/management/personas/persona-be19a1fac471247f2b2a"] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/management/personas/:id", element: createElement(PersonaDetail) }),
          ),
        ),
      );

      await selectTab(/策略歸屬|Strategy Ownership/i);
      expect(await screen.findByText(/^(無資料|Unavailable)$/i)).toBeInTheDocument();
      expect(screen.queryByText(/^(查無結果|No results found\.?)$/i)).not.toBeInTheDocument();

      await selectTab(/資金綁定|Capital Binding/i);
      expect(await screen.findByText(/^(無資料|Unavailable)$/i)).toBeInTheDocument();
      expect(screen.queryByText(/^(查無結果|No results found\.?)$/i)).not.toBeInTheDocument();
    });

    it("renders authoritative 5/5 Paper Persona readiness instead of false 0/5 onboarding when persona-management returns verified Paper bundle state", async () => {
      vi.mocked(getPersona).mockResolvedValue({
        ...realPersona,
        state: "paper_running",
        lifecycleStatus: "paper_running",
        capitalMode: "paper",
        deploymentStage: "paper",
        paperLedgerId: "paper-ledger-298e138c136c9840b0e4",
        legacyPaperCapitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
        deploymentPlanId: "plan-persona-paper-298e138c136c9840b0e4",
        runtimeBindingId: "rb-a1c3ada3d5894d57bc2e012f337753be",
        runtimeId: "rt-535a82a3",
      } as unknown as Persona);
      vi.mocked(getPersonaManagement).mockResolvedValue({
        data: {
          persona: {
            id: "persona-be19a1fac471247f2b2a",
            name: "青禾｜2330 台股 Paper 學習 R2",
            lifecycle_state: "draft",
            status: "active",
            metadata: {
              lifecycle_state: "paper_running",
              capital_mode: "paper",
              deployment_stage: "paper",
              paper_ledger_id: "paper-ledger-298e138c136c9840b0e4",
              persona_capital_binding_id: "pcb-persona-paper-298e138c136c9840b0e4",
              deployment_plan_id: "plan-persona-paper-298e138c136c9840b0e4",
              approval_decision_id: "apv-persona-paper-artifact-298e138c136c9840b0e4",
              runtime_binding_id: "rb-a1c3ada3d5894d57bc2e012f337753be",
              runtime_id: "rt-535a82a3",
              provisioning_authoritative_readback: {
                deployment: {
                  plan_id: "plan-persona-paper-298e138c136c9840b0e4",
                  saga_status: "completed",
                  progress_status: "completed",
                },
                runtime_binding: {
                  runtime_binding_id: "rb-a1c3ada3d5894d57bc2e012f337753be",
                  runtime_id: "rt-535a82a3",
                  plan_id: "plan-persona-paper-298e138c136c9840b0e4",
                  status: "active",
                  deployment_mode: "paper",
                },
                paper_worker: {
                  runtime_id: "rt-535a82a3",
                  status: "active",
                  paper_runtime_state: "active",
                },
              },
            },
          },
          bindings: [
            {
              id: "pcb-persona-paper-298e138c136c9840b0e4",
              status: "active",
              approval_decision_id: "apv-persona-paper-298e138c136c9840b0e4",
              capital_pool: {
                id: "pool-persona-paper-298e138c136c9840b0e4",
                status: "active",
              },
            },
          ],
          deploymentPlans: [],
          approvals: [],
          runtimeBindings: [
            {
              id: "rb-a1c3ada3d5894d57bc2e012f337753be",
              runtime_id: "rt-535a82a3",
              plan_id: "plan-persona-paper-298e138c136c9840b0e4",
              status: "active",
              deployment_mode: "paper",
            },
          ],
          health: {
            status: "healthy",
            reasons: [],
            activeSessions: 0,
          },
        },
        meta: {
          surfaces: {
            persona_bindings: { status: "ok", count: 1 },
            deployment_plans: { status: "unavailable", count: 0 },
            approvals: { status: "unavailable", count: 0 },
            persona_health: { status: "ok", count: 1 },
          },
        },
      });

      render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/management/personas/persona-be19a1fac471247f2b2a"] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/management/personas/:id", element: createElement(PersonaDetail) }),
          ),
        ),
      );

      expect(await screen.findByText(/5\/5 · persona-be19a1fac471247f2b2a/)).toBeInTheDocument();
      expect(screen.getByText(/Paper runtime · 0 個 active session/i)).toBeInTheDocument();
      expect(screen.getByText(/rt-535a82a3/)).toBeInTheDocument();
      expect(screen.queryByText(/0\/5 · persona-be19a1fac471247f2b2a/)).not.toBeInTheDocument();
      expect(screen.queryByText("未建立")).not.toBeInTheDocument();
      expect(getPersonaManagement).toHaveBeenCalledWith("persona-be19a1fac471247f2b2a");
    });

    it("renders unavailable instead of not-created and does not infer 5/5 from flat IDs when persona-management is unavailable", async () => {
      vi.mocked(getPersona).mockResolvedValue({
        ...realPersona,
        state: "paper_running",
        lifecycleStatus: "paper_running",
        capitalMode: "paper",
        deploymentStage: "paper",
        paperLedgerId: "paper-ledger-298e138c136c9840b0e4",
        deploymentPlanId: "plan-persona-paper-298e138c136c9840b0e4",
        runtimeBindingId: "rb-a1c3ada3d5894d57bc2e012f337753be",
        runtimeId: "rt-535a82a3",
      } as unknown as Persona);
      vi.mocked(getPersonaManagement).mockRejectedValue(new Error("persona-management unavailable"));

      render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/management/personas/persona-be19a1fac471247f2b2a"] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/management/personas/:id", element: createElement(PersonaDetail) }),
          ),
        ),
      );

      expect(await screen.findByText(/1\/5 · persona-be19a1fac471247f2b2a/)).toBeInTheDocument();
      expect(screen.getAllByText(/^(暫無資料|unavailable)$/i).length).toBeGreaterThanOrEqual(4);
      expect(screen.queryByText("未建立")).not.toBeInTheDocument();
      expect(screen.queryByText(/5\/5 · persona-be19a1fac471247f2b2a/)).not.toBeInTheDocument();
    });
  });
});
