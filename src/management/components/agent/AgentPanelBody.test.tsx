import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AgentPanelBody } from "./AgentPanelBody";
import { bffWrites } from "@/lib/bff-v1/writes";

vi.mock("@/lib/bff-v1/managementAi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bff-v1/managementAi")>("@/lib/bff-v1/managementAi");
  return {
    ...actual,
    fetchAssistantModeStatus: vi.fn().mockResolvedValue({
      ok: true,
      status: { kernelEnabled: true, controlMode: { active: false, state: "inactive" } },
    }),
    fetchManagementAiConversationList: vi.fn().mockResolvedValue({
      kind: "ok",
      conversations: [],
    }),
    fetchManagementAiConversation: vi.fn().mockResolvedValue({
      kind: "ok",
      turns: [],
    }),
  };
});

describe("AgentPanelBody — UI Actions & Confirmation Workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders assistant UI action buttons with risk indicators and executes navigate action", async () => {
    const mockTurn = {
      id: "turn_ast_1",
      role: "assistant",
      text: "I can help you view strategies or retire a persona.",
      uiActions: [
        {
          kind: "navigate",
          label: "前往策略列表",
          params: { path: "/management/strategies" },
        },
        {
          kind: "runBffAction",
          label: "退役 Persona",
          rationale: "退役過期策略 Persona",
          params: { entityType: "persona", entityId: "p_gamma", actionId: "retire" },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_test_01";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "測試對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("測試對話");
    fireEvent.click(sessionItem);

    const navBtn = await screen.findByRole("button", { name: /前往策略列表/i });
    const runBffBtn = await screen.findByRole("button", { name: /退役 Persona/i });
    expect(navBtn).toBeInTheDocument();
    expect(runBffBtn).toBeInTheDocument();

    fireEvent.click(navBtn);

    await waitFor(() => {
      expect(screen.getByText("已執行")).toBeInTheDocument();
    });
  });

  it("opens HighRiskConfirm on runBffAction click and executes confirmed write with receipt readback", async () => {
    const runActionSpy = vi.spyOn(bffWrites, "runAction").mockResolvedValue({
      ok: true,
      data: { actionId: "au_persona_retire_999", status: "completed" },
      auditEventId: "au_persona_retire_999",
      correlationId: "corr_test_777",
      idempotencyKey: "idem_test_888",
      legacy: { ok: true, audit: { id: "au_persona_retire_999" } as never },
    });

    const mockTurn = {
      id: "turn_ast_2",
      role: "assistant",
      text: "請確認是否執行退役。",
      uiActions: [
        {
          kind: "runBffAction",
          label: "RETIRE_PERSONA",
          rationale: "退役測試 Persona 專案",
          params: { entityType: "persona", entityId: "p_test", actionId: "retire" },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_test_02";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "退役對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/personas"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("退役對話");
    fireEvent.click(sessionItem);

    const runBffBtn = await screen.findByRole("button", { name: /RETIRE_PERSONA/i });
    fireEvent.click(runBffBtn);

    // Modal description matching rationale should be visible
    const desc = await screen.findByText("退役測試 Persona 專案");
    expect(desc).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    const dialogScope = within(dialog);

    // Type required memo (at least 40 chars for high risk memo policy)
    const memoTextarea = dialog.querySelector("textarea")!;
    fireEvent.change(memoTextarea, {
      target: { value: "This is a detailed audit memo exceeding forty characters for retirement." },
    });

    // Find and click the confirm button in dialog
    const confirmBtn = dialogScope.getByRole("button", { name: "確認" });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(runActionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "persona",
          id: "p_test",
          action: "retire",
          correlationId: expect.stringContaining("turn_ast_2:0:runBffAction"),
          idempotencyKey: expect.stringContaining("turn_ast_2:0:runBffAction"),
        }),
        expect.objectContaining({
          correlationId: expect.stringContaining("turn_ast_2:0:runBffAction"),
          idempotencyKey: expect.stringContaining("turn_ast_2:0:runBffAction"),
        }),
      );
    });

    // Readback description should be rendered as feedback
    await waitFor(() => {
      expect(screen.getByText(/au_persona_retire_999/i)).toBeInTheDocument();
    });
  });

  it("passes provider-supplied correlationId and idempotencyKey through to bffWrites.runAction", async () => {
    const runActionSpy = vi.spyOn(bffWrites, "runAction").mockResolvedValue({
      ok: true,
      data: { actionId: "au_pool_freeze_001", status: "completed" },
      auditEventId: "au_pool_freeze_001",
      correlationId: "custom_corr_999",
      idempotencyKey: "custom_idem_888",
      legacy: { ok: true, audit: { id: "au_pool_freeze_001" } as never },
    });

    const mockTurn = {
      id: "turn_ast_3",
      role: "assistant",
      text: "請確認凍結資金池。",
      uiActions: [
        {
          id: "action_freeze_pool_1",
          correlationId: "custom_corr_999",
          kind: "runBffAction",
          label: "FREEZE_POOL",
          rationale: "緊急凍結資金池",
          params: {
            entityType: "capitalPool",
            entityId: "pool_alpha",
            actionId: "freeze",
            idempotencyKey: "custom_idem_888",
          },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_test_03";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "凍結對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/pools"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("凍結對話");
    fireEvent.click(sessionItem);

    const runBffBtn = await screen.findByRole("button", { name: /FREEZE_POOL/i });
    fireEvent.click(runBffBtn);

    const dialog = screen.getByRole("dialog");
    const dialogScope = within(dialog);
    const memoTextarea = dialog.querySelector("textarea")!;
    fireEvent.change(memoTextarea, {
      target: { value: "Detailed memo for capital pool freeze action exceeding forty characters." },
    });

    const confirmBtn = dialogScope.getByRole("button", { name: "確認" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(runActionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "capitalPool",
          id: "pool_alpha",
          action: "freeze",
          correlationId: "custom_corr_999",
          idempotencyKey: "custom_idem_888",
        }),
        expect.objectContaining({
          correlationId: "custom_corr_999",
          idempotencyKey: "custom_idem_888",
        }),
      );
    });
  });

  it("blocks replay / double execution when action has already executed", async () => {
    const runActionSpy = vi.spyOn(bffWrites, "runAction");

    const mockTurn = {
      id: "turn_ast_4",
      role: "assistant",
      text: "先前已執行的動作。",
      uiActions: [
        {
          id: "action_nav_already_done",
          kind: "navigate",
          label: "前往已造訪頁面",
          params: { path: "/management/strategies" },
        },
      ],
      actionFeedback: {
        action_nav_already_done: "已執行",
      },
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_test_04";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "已執行對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("已執行對話");
    fireEvent.click(sessionItem);

    const navBtn = await screen.findByRole("button", { name: /前往已造訪頁面/i });
    expect(navBtn).toBeDisabled();
    fireEvent.click(navBtn);

    expect(runActionSpy).not.toHaveBeenCalled();
  });

  it("executes focusPanel for allowlisted panel like governanceQueue", async () => {
    const mockTurn = {
      id: "turn_ast_5",
      role: "assistant",
      text: "請聚焦治理隊列。",
      uiActions: [
        {
          kind: "focusPanel",
          label: "聚焦治理審查",
          params: { panel: "governanceQueue" },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_test_05";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "治理對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("治理對話");
    fireEvent.click(sessionItem);

    const focusBtn = await screen.findByRole("button", { name: /聚焦治理審查/i });
    fireEvent.click(focusBtn);

    await waitFor(() => {
      expect(screen.getByText("已執行")).toBeInTheDocument();
    });
  });

  it("opens EntityCreateDrawer when openDrawer has an allowlisted entity type", async () => {
    const mockTurn = {
      id: "turn_ast_6",
      role: "assistant",
      text: "建立一個新的策略專案。",
      uiActions: [
        {
          kind: "openDrawer",
          label: "建立策略",
          params: { drawer: "entityCreate", entity: "strategy" },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_test_06";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "建立對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("建立對話");
    fireEvent.click(sessionItem);

    const createBtn = await screen.findByRole("button", { name: /建立策略/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText("已執行")).toBeInTheDocument();
      // EntityCreateDrawer is open and visible
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("fails closed and does not open EntityCreateDrawer when openDrawer has an unknown entity type", async () => {
    const mockTurn = {
      id: "turn_ast_7",
      role: "assistant",
      text: "嘗試建立未知實體。",
      uiActions: [
        {
          kind: "openDrawer",
          label: "建立未知實體",
          params: { drawer: "entityCreate", entity: "malicious_or_unknown_type" },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_test_07";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "未知實體對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("未知實體對話");
    fireEvent.click(sessionItem);

    const createBtn = await screen.findByRole("button", { name: /建立未知實體/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      // Must not open dialog
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // Records explicit unsupported error feedback
      expect(screen.getByText(/Entity 'malicious_or_unknown_type' not supported/i)).toBeInTheDocument();
    });
  });

  it("fails closed and never opens HighRiskConfirm or calls bffWrites when an unknown high-risk action kind is clicked", async () => {
    const runActionSpy = vi.spyOn(bffWrites, "runAction");

    const mockTurn = {
      id: "turn_ast_8_unknown_high_risk",
      role: "assistant",
      text: "嘗試執行未註冊的高風險動作。",
      uiActions: [
        {
          id: "act_malicious_write",
          kind: "customDangerousBffMutation",
          label: "執行危險動作",
          rationale: "嘗試略過註冊表執行後端寫入",
          requiresConfirmation: true,
          params: {
            entityType: "system",
            entityId: "kernel",
            actionId: "wipeData",
          },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_test_08";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "未知高風險對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("未知高風險對話");
    fireEvent.click(sessionItem);

    const dangerousBtn = await screen.findByRole("button", { name: /執行危險動作/i });
    fireEvent.click(dangerousBtn);

    await waitFor(() => {
      // Must not open HighRiskConfirm dialog
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // Must not call bffWrites.runAction
      expect(runActionSpy).not.toHaveBeenCalled();
      // Feedback records unsupported action type
      expect(screen.getByText(/不支援的動作類型 \(customDangerousBffMutation\)/i)).toBeInTheDocument();
    });
  });
});
