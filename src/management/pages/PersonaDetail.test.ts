import { createElement } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolvePersonaForDetail } from "./personaDetailData";
import {
  PersonaDetail,
  personaHumanInboxUrl,
  personaWorkshopEntryUrl,
  resolvePersonaTradingPulseReturnHref,
  TRADING_PULSE_RETURN_HREF,
} from "./PersonaDetail";
import i18n from "@/i18n";
import { bffV1, setMockResolver, type CapitalPool, type Persona, type Strategy } from "@/lib/bff-v1";
import {
  getPersona,
  getPersonaManagement,
  normalizePersonaRiskPolicyChange,
  patchPersonaRisk,
  runPersonaAction,
} from "@/lib/bff-v1/personas";
import * as writes from "@/lib/bff-v1/writes";
import { usePlatform } from "@/platform/store";
import * as meSession from "@/lib/v4/session/me";
import { useAgoraWriteAccess } from "@/agora/useAgoraWriteAccess";
import { liveWriteGated } from "@/lib/bff-v1/writeGate";

vi.mock("@/agora/useAgoraWriteAccess", () => ({ useAgoraWriteAccess: vi.fn() }));
vi.mock("@/lib/bff-v1/writeGate", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/bff-v1/writeGate")>(),
  liveWriteGated: vi.fn(),
}));

const personasHoisted = vi.hoisted(() => ({
  actual: null as unknown as typeof import("@/lib/bff-v1/personas"),
}));

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
  personasHoisted.actual = actual;
  return {
    ...actual,
    getPersona: vi.fn(),
    getPersonaManagement: vi.fn().mockResolvedValue(undefined),
    patchPersonaRisk: vi.fn(actual.patchPersonaRisk),
  };
});

describe("PersonaDetail", () => {
  beforeEach(() => {
    vi.mocked(liveWriteGated).mockReset().mockResolvedValue(true);
    vi.mocked(useAgoraWriteAccess).mockReset().mockReturnValue({
      agoraCapabilities: [], capabilities: [], roles: ["operator"], loading: false,
      interactionAllowed: false, interactionDisabledReason: null,
      writeAllowed: true, writeDisabledReason: null,
    });
    setMockResolver(undefined);
    usePlatform.getState().setRole("admin");
    vi.mocked(getPersona).mockReset();
    vi.mocked(getPersonaManagement).mockReset().mockResolvedValue(undefined);
    vi.mocked(patchPersonaRisk)
      .mockReset()
      .mockImplementation((...args) => personasHoisted.actual.patchPersonaRisk(...args));
    vi.mocked(bffV1.strategies.listForPersona).mockReset().mockResolvedValue([]);
    vi.mocked(bffV1.capitalPools.list).mockReset().mockResolvedValue([]);
    vi.mocked(bffV1.audit.list).mockReset().mockResolvedValue([]);
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

      expect(await screen.findByText(/^(僅供研究|Research Only)$/i)).toBeInTheDocument();
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
        expect(screen.queryByText(/^(research_only|僅供研究|Research Only)$/i)).not.toBeInTheDocument();
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
  describe("strategy pool tab (FE-PERSONA-POOL-VIEWS-20261112)", () => {
    const persona: Persona = {
      id: "persona-pool", name: "Pool persona", owner: "operator", updatedAt: "2026-11-13T00:00:00Z",
      state: "approved", risk: "low", archetype: "quant", routedStrategies: 0, successRate: 0,
    };
    const open = async () => {
      render(createElement(MemoryRouter, { initialEntries: ["/management/personas/persona-pool"] },
        createElement(Routes, null,
          createElement(Route, { path: "/management/personas/:id", element: createElement(PersonaDetail) }))));
      const tab = await screen.findByRole("tab", { name: /策略池|Strategy Pool/i });
      fireEvent.pointerDown(tab); fireEvent.mouseDown(tab); fireEvent.pointerUp(tab); fireEvent.mouseUp(tab); fireEvent.click(tab);
    };

    it("renders pool members from the BFF persona detail read", async () => {
      vi.mocked(getPersona).mockResolvedValue(persona);
      vi.mocked(getPersonaManagement).mockResolvedValue({
        data: { persona: { id: "persona-pool", lifecycle_state: "paper_running" }, strategyPool: {
          current: { tenant_id: "t", persona_id: "persona-pool", pool_version: 2, digest: "d2", members: [
            { artifact_ref: "artifact-momentum", checksum: "sha256:" + "a".repeat(64), stage: "active", risk_weight: 0.4, baseline_ref: "approved-gate-baseline" }] },
          versions: [], memberVirtualBooks: [], health: null, cycles: [], openDemands: [] } },
        meta: { surfaces: { strategy_pool: { status: "ok" }, strategy_pool_versions: { status: "ok" },
          member_virtual_books: { status: "ok" }, pool_health: { status: "unavailable", reason: "latest_cycle_observation_missing" },
          autonomy_cycles: { status: "ok" }, open_demands: { status: "ok" } } },
      });
      await open();
      expect(await screen.findByTestId("pool-member-artifact-momentum")).toBeInTheDocument();
      expect(screen.getByTestId("pool-health-unavailable").textContent).toContain("latest_cycle_observation_missing");
      expect(screen.getByTestId("pool-persona-state").textContent).toBe("運行中");
    });
  });
  describe("daily cycle tab (FE-PERSONA-CYCLE-VIEWS-20261112)", () => {
    const persona: Persona = {
      id: "persona-cycle", name: "Cycle persona", owner: "operator", updatedAt: "2026-11-13T00:00:00Z",
      state: "approved", risk: "low", archetype: "quant", routedStrategies: 0, successRate: 0,
    };
    const ok = { status: "ok" };
    const open = async () => {
      render(createElement(MemoryRouter, { initialEntries: ["/management/personas/persona-cycle"] },
        createElement(Routes, null,
          createElement(Route, { path: "/management/personas/:id", element: createElement(PersonaDetail) }))));
      const tab = await screen.findByRole("tab", { name: /每日循環|Daily Cycle/i });
      fireEvent.pointerDown(tab); fireEvent.mouseDown(tab); fireEvent.pointerUp(tab); fireEvent.mouseUp(tab); fireEvent.click(tab);
    };

    it("renders cycle packets, memory, memos, harness and experiences from the BFF read; unavailable sections stay unavailable", async () => {
      vi.mocked(getPersona).mockResolvedValue(persona);
      vi.mocked(getPersonaManagement).mockResolvedValue({
        data: { persona: { id: "persona-cycle" }, personaCycle: {
          cycle: { health: { status: "failed", last_packet_id: "pkt-2", stage: "failed", failure_reason: "risk_veto" },
            packets: [
              { packet_id: "pkt-2", stage: "failed", updated_at: "2026-11-13T01:00:00Z", phase: "terminal", failure_reason: "risk_veto", harness_version: 2 },
              { packet_id: "pkt-1", stage: "closed", updated_at: "2026-11-12T01:00:00Z", phase: "terminal", failure_reason: null, harness_version: 1 }] },
          memorySummary: { returned: 1, limit: 100, entries: [{ memory_id: "mem-1", memory_type: "episodic", written_at: "2026-11-12T02:00:00Z", source_event_id: "ev-1", summary: "learned a thing" }] },
          consultationMemos: null,
          harness: { active_version: 2, versions: [
            { schema_version: 1, persona_id: "persona-cycle", version: 1, parent_version: null, patch_id: null, created_at: "2026-11-01T00:00:00Z", created_by: "operator", content_digest: "d1" },
            { schema_version: 1, persona_id: "persona-cycle", version: 2, parent_version: 1, patch_id: "patch-9", created_at: "2026-11-10T00:00:00Z", created_by: "review", content_digest: "d2" }] },
          harnessExperiences: [{ memory_id: "mem-x", source_event_id: "ev-9", written_at: "2026-11-12T03:00:00Z", summary: "exp",
            experience: { cue: "gap", lesson: "size down", outcome: "improved", confidence: 0.7, evidence_refs: [], harness_version: 2, proposal_ids: [] } }],
        } },
        meta: { surfaces: { persona_cycles: ok, persona_memory_summary: ok,
          persona_consultation_memos: { status: "unavailable", reason: "no_consultation_memos" },
          persona_harness: ok, harness_experiences: ok } },
      });
      await open();
      expect(await screen.findByTestId("cycle-packet-pkt-2")).toBeInTheDocument();
      expect(screen.getByTestId("cycle-failure-pkt-2").textContent).toContain("risk_veto");
      expect(screen.getByTestId("cycle-memory").textContent).toContain("learned a thing");
      expect(screen.getByTestId("cycle-memos-unavailable").textContent).toContain("no_consultation_memos");
      expect(screen.getByTestId("cycle-harness-v2").textContent).toContain("patch-9");
      expect(screen.getByTestId("cycle-experiences").textContent).toContain("size down");
    });
  });

  describe("Trading Pulse contextual header return link (FE-TRADING-PULSE-PERSONA-RETURN-20261122)", () => {
    const pulsePersona: Persona = {
      id: "persona-2448c7053e33ea48da47",
      name: "青禾｜2330 台股 Paper 學習 R3",
      owner: "operator",
      updatedAt: "2026-11-22T12:00:00Z",
      state: "approved",
      lifecycleStatus: "paper_running",
      risk: "low",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0.5,
    };

    it("accepts only the canonical fixed in-site /management/trading-pulse return target and rejects direct, foreign, or other-origin state", () => {
      expect(resolvePersonaTradingPulseReturnHref({ returnTo: TRADING_PULSE_RETURN_HREF })).toBe(
        "/management/trading-pulse",
      );
      for (const invalidState of [
        undefined,
        null,
        "",
        "/management/trading-pulse",
        ["/management/trading-pulse"],
        {},
        { returnTo: "" },
        { returnTo: "#" },
        { returnTo: "/management/personas" },
        { returnTo: "/management/persona-fleet" },
        { returnTo: "/management/trading-pulse?tab=rankings" },
        { returnTo: "/management/trading-pulse#top" },
        { returnTo: "/management/trading-pulse/extra" },
        { returnTo: "https://app.dev.mvl-cap.tw/management/trading-pulse" },
        { returnTo: "https://evil.example/management/trading-pulse" },
        { returnTo: "//evil.example/management/trading-pulse" },
        { returnTo: "javascript:alert(1)" },
      ]) {
        expect(resolvePersonaTradingPulseReturnHref(invalidState)).toBeNull();
      }
    });

    it("renders a visible bilingual return link in PersonaDetail header actions when opened from Trading Pulse and navigates back without writes", async () => {
      vi.mocked(getPersona).mockResolvedValue(pulsePersona);
      const runActionSpy = vi.spyOn(writes, "runAction");
      runActionSpy.mockClear();

      for (const [locale, expectedLabel] of [
        ["zh-TW", "返回交易脈動"],
        ["en-US", "Back to Trading Pulse"],
      ] as const) {
        await i18n.changeLanguage(locale);
        const view = render(
          createElement(
            MemoryRouter,
            {
              initialEntries: [
                {
                  pathname: `/management/personas/${pulsePersona.id}`,
                  state: { returnTo: "/management/trading-pulse" },
                },
              ],
            },
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/management/personas/:id",
                element: createElement(PersonaDetail),
              }),
              createElement(Route, {
                path: "/management/trading-pulse",
                element: createElement("h1", null, locale === "zh-TW" ? "交易脈動" : "Trading Pulse"),
              }),
            ),
          ),
        );

        expect(await screen.findByRole("heading", { level: 1, name: pulsePersona.name })).toBeInTheDocument();
        const returnLink = screen.getByRole("link", { name: expectedLabel });
        expect(returnLink).toHaveAttribute("href", "/management/trading-pulse");
        fireEvent.click(returnLink);
        expect(
          await screen.findByRole("heading", { level: 1, name: locale === "zh-TW" ? "交易脈動" : "Trading Pulse" }),
        ).toBeInTheDocument();
        expect(runActionSpy).not.toHaveBeenCalled();
        view.unmount();
      }
      await i18n.changeLanguage("zh-TW");
    });

    it.each([
      ["direct navigation without state", "/management/personas/persona-2448c7053e33ea48da47"],
      [
        "navigation from Persona Fleet",
        {
          pathname: "/management/personas/persona-2448c7053e33ea48da47",
          state: { returnTo: "/management/persona-fleet" },
        },
      ],
      [
        "navigation with untrusted foreign URL in state",
        {
          pathname: "/management/personas/persona-2448c7053e33ea48da47",
          state: { returnTo: "https://evil.example/management/trading-pulse" },
        },
      ],
    ] as const)("does not render a Trading Pulse return link on %s", async (_label, initialEntry) => {
      vi.mocked(getPersona).mockResolvedValue(pulsePersona);
      await i18n.changeLanguage("zh-TW");

      render(
        createElement(
          MemoryRouter,
          { initialEntries: [initialEntry] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/management/personas/:id",
              element: createElement(PersonaDetail),
            }),
          ),
        ),
      );

      expect(await screen.findByRole("heading", { level: 1, name: pulsePersona.name })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /返回交易脈動|Back to Trading Pulse/i })).not.toBeInTheDocument();
      const pulseAnchors = screen
        .queryAllByRole("link")
        .filter((a) => a.getAttribute("href") === "/management/trading-pulse");
      expect(pulseAnchors).toHaveLength(0);
    });
  });

  describe("paper Persona risk-tier editor and effective policy status (FE-PERSONA-RISK-PROFILE-CHANGE-20261123)", () => {
    beforeEach(() => {
      vi.spyOn(meSession, "useMe").mockReturnValue({
        me: {
          user: { id: "operator-1", displayName: "Operator", email: "operator@example.test" },
          tenant: { id: "t_default", name: "Default", tz: "Asia/Taipei", locale: "zh-TW" },
          roles: ["ops"], capabilities: ["persona.view", "persona.edit"], env: "dev",
          featureFlags: {}, serverTime: "2026-11-23T02:00:00Z",
          sessionExpiresAt: "2026-11-23T10:00:00Z", permissionsVersion: "v1",
        },
        loading: false, error: null, refresh: vi.fn(),
      });
    });
    afterEach(() => vi.restoreAllMocks());

    const paperPersonaId = "persona-6507750312870d03a241";
    const basePaperPersona: Persona = {
      id: paperPersonaId,
      name: "青禾｜2330 台股 Paper 學習 R1",
      owner: "pantheon-dev-operator-a",
      updatedAt: "2026-11-23T01:00:00Z",
      state: "approved",
      lifecycleStatus: "paper_running",
      capitalMode: "paper",
      deploymentStage: "paper",
      paperLedgerId: "paper-ledger-06d4775a9b6a8f63b311",
      runtimeBindingId: "rb-06d4775a9b6a8f63b311",
      risk: "low",
      archetype: "quant",
      routedStrategies: 1,
      successRate: 0.52,
      riskPolicyChange: {
        requestedRisk: "low",
        effectiveRisk: "low",
        status: "effective",
        policyVersion: "1.0",
        approvalId: "apv-risk-profile-550ae83ccfeaafa69ec1",
      },
    };

    const renderPersonaDetail = (personaId = paperPersonaId, search = "") =>
      render(
        createElement(
          MemoryRouter,
          { initialEntries: [`/management/personas/${encodeURIComponent(personaId)}${search}`] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/management/personas/:id",
              element: createElement(PersonaDetail),
            }),
          ),
        ),
      );

    it("reads the agreed camelCase policy contract without promoting shadow snake_case fields", () => {
      expect(normalizePersonaRiskPolicyChange(undefined)).toBeNull();
      expect(normalizePersonaRiskPolicyChange(null)).toBeNull();
      expect(
        normalizePersonaRiskPolicyChange({
          requestedRisk: "medium",
          effectiveRisk: "low",
          status: "pending_approval",
          policyVersion: "1.0",
          approvalId: "apv-1",
        }),
      ).toEqual({
        requestedRisk: "medium",
        effectiveRisk: "low",
        status: "pending_approval",
        policyVersion: "1.0",
        approvalId: "apv-1",
      });
      expect(
        normalizePersonaRiskPolicyChange({
          requested_risk: "HIGH",
          effective_risk: null,
          status: "failed",
          policy_version: 2,
          approval_id: "",
          resolution: { reason: "risk_policy_profile_mapping_unapproved" },
        }),
      ).toEqual({
        requestedRisk: null,
        effectiveRisk: null,
        status: "failed",
        policyVersion: null,
        approvalId: null,
      });
    });

    it.each([
      ["read-only deployment", false, false],
      ["write authority still loading", true, true],
    ])("disables operator Edit for %s", async (_label, writeAllowed, loading) => {
      vi.mocked(getPersona).mockResolvedValue(basePaperPersona);
      vi.mocked(useAgoraWriteAccess).mockReturnValue({
        ...vi.mocked(useAgoraWriteAccess)(), writeAllowed, loading,
      });
      renderPersonaDetail();
      const edit = await screen.findByTestId("persona-risk-edit-button");
      expect(edit).toBeDisabled();
      fireEvent.click(edit);
      expect(screen.queryByTestId("persona-risk-editor")).not.toBeInTheDocument();
      expect(patchPersonaRisk).not.toHaveBeenCalled();
    });

    it("saves through a visible risk editor from the identity tab and preserves that tab", async () => {
      vi.mocked(getPersona).mockResolvedValueOnce(basePaperPersona).mockResolvedValue({
        ...basePaperPersona, riskPolicyChange: {
          ...basePaperPersona.riskPolicyChange!, requestedRisk: "high", status: "pending_approval",
        },
      });
      vi.mocked(patchPersonaRisk).mockResolvedValueOnce(basePaperPersona);
      renderPersonaDetail(paperPersonaId, "?tab=identity");
      const edit = await screen.findByTestId("persona-risk-edit-button");
      fireEvent.click(edit);
      expect(await screen.findByRole("dialog")).toBeVisible();
      expect(screen.getByTestId("persona-risk-tier-select")).toBeVisible();
      fireEvent.change(screen.getByTestId("persona-risk-tier-select"), { target: { value: "high" } });
      fireEvent.click(screen.getByTestId("persona-risk-save-button"));
      await waitFor(() => expect(patchPersonaRisk).toHaveBeenCalledWith(
        paperPersonaId, { risk: "high" }, expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(/身分|Identity/);
    });

    it("disables an open editor if write authority is revoked before save", async () => {
      vi.mocked(getPersona).mockResolvedValue(basePaperPersona);
      const view = renderPersonaDetail();
      fireEvent.click(await screen.findByTestId("persona-risk-edit-button"));
      expect(await screen.findByTestId("persona-risk-tier-select")).toBeVisible();
      vi.mocked(useAgoraWriteAccess).mockReturnValue({
        ...vi.mocked(useAgoraWriteAccess)(), writeAllowed: false,
      });
      view.rerender(createElement(MemoryRouter, {
        initialEntries: [`/management/personas/${paperPersonaId}`],
      }, createElement(Routes, null, createElement(Route, {
        path: "/management/personas/:id", element: createElement(PersonaDetail),
      }))));
      expect(screen.queryByTestId("persona-risk-save-button")).not.toBeInTheDocument();
      expect(screen.getByTestId("persona-risk-readonly-hint")).toBeVisible();
      expect(patchPersonaRisk).not.toHaveBeenCalled();
    });

    it("exercises save and authoritative GET refetch on the actual PATCH/GET request path with Idempotency-Key when policy is effective", async () => {
      await i18n.changeLanguage("zh-TW");
      const requests: Array<{
        method: string;
        path: string;
        headers: Record<string, string>;
        body?: unknown;
      }> = [];

      let serverState: Persona = { ...basePaperPersona };

      setMockResolver((method, path) => {
        if (path === `/bff/personas/${paperPersonaId}` && method.toUpperCase() === "GET") {
          return async (req) => {
            requests.push({ method: req.method, path: req.path, headers: req.headers });
            return {
              kind: "json",
              status: 200,
              body: { data: serverState, meta: { snapshot_at: "2026-11-23T02:00:00Z" } },
            };
          };
        }
        if (path === `/bff/personas/${paperPersonaId}` && method.toUpperCase() === "PATCH") {
          return async (req) => {
            requests.push({
              method: req.method,
              path: req.path,
              headers: req.headers,
              body: req.body,
            });
            const requested = (req.body as { risk?: string })?.risk as "low" | "medium" | "high";
            // Simulate PATCH returning intermediate state while authoritative GET returns full verified policyVersion/approvalId
            serverState = {
              ...serverState,
              risk: requested,
              updatedAt: "2026-11-23T02:01:00Z",
              riskPolicyChange: {
                requestedRisk: requested,
                effectiveRisk: requested,
                status: "effective",
                policyVersion: "2.0",
                approvalId: "apv-risk-profile-medium-v2",
              },
            };
            return {
              kind: "json",
              status: 200,
              body: {
                data: {
                  ...serverState,
                  riskPolicyChange: {
                    requestedRisk: requested,
                    effectiveRisk: "low",
                    status: "pending_approval",
                    policyVersion: "1.0",
                    approvalId: "apv-stale-patch-body",
                  },
                },
                meta: { snapshot_at: "2026-11-23T02:01:00Z" },
              },
            };
          };
        }
        return undefined;
      });
      vi.mocked(getPersona).mockImplementation((id) => personasHoisted.actual.getPersona(id));

      renderPersonaDetail();

      expect(await screen.findByTestId("persona-risk-policy-status")).toBeInTheDocument();
      expect(screen.getByTestId("persona-risk-policy-state")).toHaveTextContent("已生效");
      expect(screen.getByTestId("persona-requested-risk")).toHaveTextContent("低風險");
      expect(screen.getByTestId("persona-effective-risk")).toHaveTextContent("低風險");
      expect(screen.getByTestId("persona-risk-policy-version")).toHaveTextContent("1.0");
      expect(screen.getByTestId("persona-risk-approval-id")).toHaveTextContent("apv-risk-profile-550ae83ccfeaafa69ec1");

      const editButton = screen.getByTestId("persona-risk-edit-button");
      expect(editButton).not.toBeDisabled();
      fireEvent.click(editButton);

      const select = await screen.findByTestId("persona-risk-tier-select");
      expect(select).toHaveValue("low");
      fireEvent.change(select, { target: { value: "medium" } });
      expect(select).toHaveValue("medium");

      const saveButton = screen.getByTestId("persona-risk-save-button");
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.queryByTestId("persona-risk-editor")).not.toBeInTheDocument();
      });

      // Verify actual HTTP requests: initial GET -> PATCH -> authoritative GET
      expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        `GET /bff/personas/${paperPersonaId}`,
        `PATCH /bff/personas/${paperPersonaId}`,
        `GET /bff/personas/${paperPersonaId}`,
      ]);
      const patchReq = requests[1];
      expect(patchReq.body).toEqual({ risk: "medium" });
      expect(patchReq.headers["Idempotency-Key"]).toMatch(/^idk_/);

      // Authoritative GET state wins over intermediate PATCH response body
      expect(screen.getByTestId("persona-risk-policy-state")).toHaveTextContent("已生效");
      expect(screen.getByTestId("persona-requested-risk")).toHaveTextContent("中風險");
      expect(screen.getByTestId("persona-effective-risk")).toHaveTextContent("中風險");
      expect(screen.getByTestId("persona-risk-policy-version")).toHaveTextContent("2.0");
      expect(screen.getByTestId("persona-risk-approval-id")).toHaveTextContent("apv-risk-profile-medium-v2");
    });

    it("maps pending_approval vs effectiveRisk faithfully on save and reload without claiming unapproved risk is effective", async () => {
      await i18n.changeLanguage("zh-TW");
      const pendingPersona: Persona = {
        ...basePaperPersona,
        risk: "high",
        riskPolicyChange: {
          requestedRisk: "high",
          effectiveRisk: "low",
          status: "pending_approval",
          policyVersion: "1.0",
          approvalId: "apv-risk-profile-550ae83ccfeaafa69ec1",
        },
      };

      vi.mocked(getPersona)
        .mockResolvedValueOnce(basePaperPersona)
        .mockResolvedValueOnce(pendingPersona);
      vi.mocked(patchPersonaRisk).mockResolvedValueOnce(pendingPersona);

      renderPersonaDetail();

      const editButton = await screen.findByTestId("persona-risk-edit-button");
      fireEvent.click(editButton);

      const select = await screen.findByTestId("persona-risk-tier-select");
      fireEvent.change(select, { target: { value: "high" } });
      fireEvent.click(screen.getByTestId("persona-risk-save-button"));

      await waitFor(() => {
        expect(screen.getByTestId("persona-risk-policy-state")).toHaveTextContent("待核准");
      });
      expect(screen.getByTestId("persona-requested-risk")).toHaveTextContent("高風險 (high)");
      expect(screen.getByTestId("persona-effective-risk")).toHaveTextContent("低風險 (low)");
      expect(screen.getByTestId("persona-risk-policy-hint")).toHaveTextContent(
        "新風險等級請求（高風險 (high)）已記錄並等待治理核准；核准前仍維持目前實際生效風險等級（低風險 (low)）。",
      );
    });

    it.each([
      ["zh-TW", "low"],
      ["zh-TW", null],
      ["en-US", "low"],
      ["en-US", null],
    ] as const)("shows pending exposure guards in %s with effectiveRisk=%s", async (language, effectiveRisk) => {
      const previousLanguage = i18n.language;
      await i18n.changeLanguage(language);
      vi.mocked(getPersona).mockResolvedValue({
        ...basePaperPersona,
        risk: "high",
        riskPolicyChange: {
          requestedRisk: "high", effectiveRisk, status: "pending_approval",
          policyVersion: effectiveRisk ? "1.0" : null,
          approvalId: effectiveRisk ? "apv-existing-low" : null,
        },
      });
      const view = renderPersonaDetail();
      try {
        const hint = await screen.findByTestId("persona-risk-policy-hint");
        expect(hint).toBeVisible();
        expect(screen.getByTestId("persona-risk-policy-state")).toHaveTextContent(
          language === "zh-TW" ? "待核准" : "Pending Approval",
        );
        expect(screen.getByTestId("persona-requested-risk")).toHaveTextContent(
          language === "zh-TW" ? "高風險 (high)" : "High (high)",
        );
        expect(screen.getByTestId("persona-effective-risk")).toHaveTextContent(
          effectiveRisk
            ? language === "zh-TW" ? "低風險 (low)" : "Low (low)"
            : language === "zh-TW" ? "尚未生效" : "Not effective",
        );
        const requiredMessages = language === "zh-TW" ? [
          "請求與實際生效等級不同或尚未核准時，暫停加碼及新增曝險",
          "真正減倉或平倉仍可依一般防護規則進行",
          "舊的生效等級不代表已授權新增風險",
        ] : [
          "While requested and effective tiers differ or approval is pending, increases and new exposure are held",
          "genuine reductions or closures may proceed under normal guards",
          "an older effective tier does not authorize new risk",
        ];
        for (const message of requiredMessages) expect(hint).toHaveTextContent(message);
        expect(patchPersonaRisk).not.toHaveBeenCalled();
      } finally {
        view.unmount();
        await i18n.changeLanguage(previousLanguage);
      }
    });

    it("maps pending_approval with null effectiveRisk and failed status on reload faithfully", async () => {
      await i18n.changeLanguage("zh-TW");
      vi.mocked(getPersona).mockResolvedValueOnce({
        ...basePaperPersona,
        risk: "medium",
        riskPolicyChange: {
          requestedRisk: "medium",
          effectiveRisk: null,
          status: "pending_approval",
          policyVersion: null,
          approvalId: null,
        },
      });

      const view = renderPersonaDetail();

      expect(await screen.findByTestId("persona-risk-policy-state")).toHaveTextContent("待核准");
      expect(screen.getByTestId("persona-requested-risk")).toHaveTextContent("中風險 (medium)");
      expect(screen.getByTestId("persona-effective-risk")).toHaveTextContent("尚未生效");
      expect(screen.getByTestId("persona-risk-policy-version")).toHaveTextContent("未綁定");
      expect(screen.getByTestId("persona-risk-approval-id")).toHaveTextContent("尚無核准紀錄");
      expect(screen.getByTestId("persona-risk-policy-hint")).toHaveTextContent(
        "新風險等級請求（中風險 (medium)）已記錄並等待治理核准；目前尚無已驗證生效的風險政策。",
      );
      view.unmount();

      vi.mocked(getPersona).mockResolvedValueOnce({
        ...basePaperPersona,
        risk: "high",
        riskPolicyChange: {
          requestedRisk: "high",
          effectiveRisk: "low",
          status: "failed",
          policyVersion: "1.0",
          approvalId: "apv-risk-profile-550ae83ccfeaafa69ec1",
          reason: "paper_risk_change_binding_readback_failed",
        },
      });

      renderPersonaDetail();
      expect(await screen.findByTestId("persona-risk-policy-state")).toHaveTextContent("變更失敗");
      expect(screen.getByTestId("persona-risk-policy-hint")).toHaveTextContent(
        "paper_risk_change_binding_readback_failed",
      );
    });

    it("surfaces request loss/error on PATCH and post-PATCH GET refetch, and reuses Idempotency-Key on same-tier retry", async () => {
      await i18n.changeLanguage("zh-TW");
      vi.mocked(getPersona).mockResolvedValue(basePaperPersona);
      vi.mocked(patchPersonaRisk)
        .mockRejectedValueOnce(new Error("HTTP 503 Paper risk change unavailable"))
        .mockResolvedValueOnce({
          ...basePaperPersona,
          risk: "medium",
          riskPolicyChange: {
            requestedRisk: "medium",
            effectiveRisk: "low",
            status: "pending_approval",
            policyVersion: "1.0",
            approvalId: "apv-risk-profile-550ae83ccfeaafa69ec1",
          },
        });

      renderPersonaDetail();

      fireEvent.click(await screen.findByTestId("persona-risk-edit-button"));
      fireEvent.change(await screen.findByTestId("persona-risk-tier-select"), {
        target: { value: "medium" },
      });
      fireEvent.click(screen.getByTestId("persona-risk-save-button"));

      const errAlert = await screen.findByTestId("persona-risk-edit-error");
      expect(errAlert).toHaveTextContent("風險等級變更失敗：HTTP 503 Paper risk change unavailable");
      expect(screen.getByTestId("persona-risk-editor")).toBeInTheDocument();

      const firstKey = vi.mocked(patchPersonaRisk).mock.calls[0]?.[2]?.idempotencyKey;
      expect(firstKey).toMatch(/^idk_/);

      // Retry same tier ("medium") -> reuses identical Idempotency-Key; simulate GET refetch failure on second attempt
      vi.mocked(getPersona).mockRejectedValueOnce(new Error("GET readback network timeout"));
      fireEvent.click(screen.getByTestId("persona-risk-save-button"));

      await waitFor(() => {
        expect(screen.getByTestId("persona-risk-edit-error")).toHaveTextContent(
          "風險等級請求已送出，但重新讀取權威生效狀態（GET）失敗：GET readback network timeout",
        );
      });
      const secondKey = vi.mocked(patchPersonaRisk).mock.calls[1]?.[2]?.idempotencyKey;
      expect(secondKey).toBe(firstKey);
      // A PATCH body cannot replace the last verified GET when refetch fails.
      expect(screen.getByTestId("persona-requested-risk")).toHaveTextContent("低風險");
    });

    it("protects against rapid repeat clicks while PATCH/GET save is in flight", async () => {
      await i18n.changeLanguage("zh-TW");
      vi.mocked(getPersona).mockResolvedValue(basePaperPersona);

      let resolvePatch!: (value: Persona) => void;
      vi.mocked(patchPersonaRisk).mockImplementationOnce(
        () =>
          new Promise<Persona>((resolve) => {
            resolvePatch = resolve;
          }),
      );

      renderPersonaDetail();

      fireEvent.click(await screen.findByTestId("persona-risk-edit-button"));
      fireEvent.change(await screen.findByTestId("persona-risk-tier-select"), {
        target: { value: "high" },
      });

      const saveButton = screen.getByTestId("persona-risk-save-button");
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);

      expect(patchPersonaRisk).toHaveBeenCalledTimes(1);
      expect(saveButton).toBeDisabled();

      const updated: Persona = {
        ...basePaperPersona,
        risk: "high",
        riskPolicyChange: {
          requestedRisk: "high",
          effectiveRisk: "high",
          status: "effective",
          policyVersion: "3.0",
          approvalId: "apv-risk-profile-high-v3",
        },
      };
      vi.mocked(getPersona).mockResolvedValue(updated);
      resolvePatch(updated);

      await waitFor(() => {
        expect(screen.getByTestId("persona-effective-risk")).toHaveTextContent("高風險 (high)");
      });
      expect(patchPersonaRisk).toHaveBeenCalledTimes(1);
    });

    it("does not expose unsafe display-only PATCH on older BFF payloads lacking riskPolicyChange or when status is unavailable", async () => {
      await i18n.changeLanguage("zh-TW");
      const legacyPaperPersona: Persona = {
        ...basePaperPersona,
        riskPolicyChange: undefined,
      };
      vi.mocked(getPersona).mockResolvedValueOnce(legacyPaperPersona);

      const view = renderPersonaDetail();

      expect(await screen.findByTestId("persona-risk-policy-status")).toBeInTheDocument();
      expect(screen.getByTestId("persona-risk-policy-state")).toHaveTextContent(
        "未提供生效狀態（舊版回應）",
      );
      expect(screen.getByTestId("persona-risk-policy-hint")).toHaveTextContent(
        "後端未回傳權威風險政策變更狀態（riskPolicyChange），已停用風險等級編輯以避免僅修改顯示標籤。",
      );
      const editButton = screen.getByTestId("persona-risk-edit-button");
      expect(editButton).toBeDisabled();
      fireEvent.click(editButton);
      expect(screen.queryByTestId("persona-risk-editor")).not.toBeInTheDocument();
      expect(patchPersonaRisk).not.toHaveBeenCalled();
      view.unmount();

      // Explicit status="unavailable" from BFF when Capital owner is unreachable
      vi.mocked(getPersona).mockResolvedValueOnce({
        ...basePaperPersona,
        riskPolicyChange: {
          requestedRisk: null,
          effectiveRisk: null,
          status: "unavailable",
          policyVersion: null,
          approvalId: null,
        },
      });

      renderPersonaDetail();
      expect(await screen.findByTestId("persona-risk-policy-state")).toHaveTextContent("暫無資料");
      expect(screen.getByTestId("persona-risk-edit-button")).toBeDisabled();
      expect(screen.queryByTestId("persona-risk-editor")).not.toBeInTheDocument();
    });

    it("enforces read-only access for unprivileged/viewer sessions while still displaying authoritative risk status", async () => {
      await i18n.changeLanguage("zh-TW");
      vi.mocked(getPersona).mockResolvedValue(basePaperPersona);
      const useMeSpy = vi.spyOn(meSession, "useMe").mockReturnValue({
        me: {
          user: { id: "u_viewer", displayName: "Viewer", email: "viewer@pantheon.local" },
          tenant: { id: "t_default", name: "Default", tz: "Asia/Taipei", locale: "zh-TW" },
          roles: ["viewer"],
          capabilities: ["persona.view"],
          env: "dev",
          featureFlags: {},
          serverTime: "2026-11-23T02:00:00Z",
          sessionExpiresAt: "2026-11-23T10:00:00Z",
          permissionsVersion: "v1",
        },
        loading: false,
        error: null,
        refresh: vi.fn(),
      });

      try {
        renderPersonaDetail();

        expect(await screen.findByTestId("persona-risk-policy-status")).toBeInTheDocument();
        expect(screen.getByTestId("persona-risk-policy-state")).toHaveTextContent("已生效");
        expect(screen.getByTestId("persona-risk-readonly-hint")).toHaveTextContent(
          "目前工作階段為唯讀或無操作員權限，僅可檢視風險政策狀態。",
        );
        const editButton = screen.getByTestId("persona-risk-edit-button");
        expect(editButton).toBeDisabled();
        fireEvent.click(editButton);
        expect(screen.queryByTestId("persona-risk-editor")).not.toBeInTheDocument();
        expect(patchPersonaRisk).not.toHaveBeenCalled();
      } finally {
        useMeSpy.mockRestore();
      }
    });
  });
});
