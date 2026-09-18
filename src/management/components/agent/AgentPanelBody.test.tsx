import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AgentPanelBody } from "./AgentPanelBody";
import { bffWrites } from "@/lib/bff-v1/writes";
import * as toastModule from "@/hooks/use-toast";
import * as mgmtAi from "@/lib/bff-v1/managementAi";
import { agentPanel } from "./useAgentPanel";

vi.mock("@/lib/bff-v1/writes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bff-v1/writes")>("@/lib/bff-v1/writes");
  return { ...actual, requestConfirmToken: vi.fn(async (request) => ({
    data: { confirmToken: "ct-test-paper-confirm", requiredPhrase: `${request.actionId} ${request.entityId}`, expiresAt: new Date(Date.now() + 300000).toISOString() },
  })) };
});

vi.mock("@/lib/bff-v1/managementAi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bff-v1/managementAi")>("@/lib/bff-v1/managementAi");
  return {
    ...actual,
    fetchAssistantModeStatus: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
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
    streamManagementAi: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      answer: "Mock answer",
    }),
    startAssistantProviderReauth: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      reauth: {
        provider: "codex",
        status: "pending",
        userCode: "TEST-CODE-1234",
        reauthSessionId: "reauth_1",
        verificationUri: "https://auth.example.com",
        verificationUriComplete: "https://auth.example.com",
        expiresAt: null,
        intervalSeconds: 5,
        credentialExchange: null,
      },
    }),
    activateAssistantControlMode: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      controlMode: { active: true, state: "active", mode: "kernel_debug" },
    }),
    deactivateAssistantControlMode: vi.fn().mockResolvedValue({
      ok: true,
      kind: "ok",
      controlMode: { active: false, state: "inactive" },
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

  it.each(["accepted", "completed"])("checks the owner after %s admission before reporting paper execution", async (admissionStatus) => {
    const toastSpy = vi.spyOn(toastModule, "toast");
    const runActionSpy = vi.spyOn(bffWrites, "runAction").mockResolvedValue({
      ok: true,
      data: { actionId: "cmd_pause_runtime_001", status: admissionStatus as "accepted" | "completed" },
      auditEventId: "cmd_pause_runtime_001",
      correlationId: "corr_pause_777",
      idempotencyKey: "idem_pause_888",
      legacy: { ok: true, audit: { id: "cmd_pause_runtime_001" } as never },
    });

    const getOperatorCommandSpy = vi.spyOn(bffWrites, "getOperatorCommand").mockResolvedValue({
      command_id: "cmd_pause_runtime_001",
      type: "PausePaperRuntime",
      target: { type: "Runtime", id: "rt_paper_001" },
      status: admissionStatus === "completed" ? "failed" : "executed",
      submitted_at: new Date().toISOString(),
      result: { degraded_mode: false, authoritative_readback: {
        runtime_id: "rt_paper_001", runtime_binding_id: "rb_paper_001", deployment_mode: "paper", status: "paused",
      } },
      error: admissionStatus === "completed" ? { code: "OWNER_REJECTED", message: "Owner rejected pause" } : undefined,
    });

    const mockTurn = {
      id: "turn_ast_pause_1",
      role: "assistant",
      text: "請確認暫停 PAPER 運行環境。",
      uiActions: [
        {
          id: "act_pause_paper_1",
          kind: "runBffAction",
          label: "PAUSE_PAPER_RUNTIME",
          rationale: "暫停異常 PAPER 運行環境",
          params: {
            entityType: "Runtime",
            entityId: "rt_paper_001",
            actionId: "PausePaperRuntime",
            bounded_duration_minutes: 60,
            duration_seconds: 3600,
            reason: "Risk mitigation pause",
          },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_paper_pause_01";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "暫停環境對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/operations"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("暫停環境對話");
    fireEvent.click(sessionItem);

    const pauseBtn = await screen.findByRole("button", { name: /PAUSE_PAPER_RUNTIME/i });
    fireEvent.click(pauseBtn);

    const dialog = screen.getByRole("dialog");
    const dialogScope = within(dialog);

    // HighRiskConfirm shows description and token
    await waitFor(() => {
      expect(screen.getByText(/暫停異常 PAPER 運行環境/i)).toBeInTheDocument();
    });

    const memoTextarea = dialog.querySelector("textarea")!;
    fireEvent.change(memoTextarea, {
      target: { value: "Detailed audit memo exceeding forty characters for pausing paper runtime." },
    });

    const tokenInput = dialog.querySelectorAll("input")[0]!;
    fireEvent.change(tokenInput, {
      target: { value: "PausePaperRuntime rt_paper_001" },
    });

    const confirmBtn = dialogScope.getByRole("button", { name: "確認" });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    // Exactly 1 POST via runAction with runtime_id and bounded business parameters
    await waitFor(() => {
      expect(runActionSpy).toHaveBeenCalledTimes(1);
      expect(runActionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "Runtime",
          id: "rt_paper_001",
          action: "PausePaperRuntime",
          bounded_duration_minutes: 60,
          duration_seconds: 3600,
          reason: "Risk mitigation pause",
        }),
        expect.objectContaining({
          confirmToken: "ct-test-paper-confirm",
        }),
      );
    });

    // Informational toast at admission
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "指令已受理",
      }),
    );

    if (admissionStatus === "completed") {
      await waitFor(() => expect(screen.getByText(/Owner rejected pause/)).toBeInTheDocument());
      expect(screen.queryByText(/已成功執行/)).not.toBeInTheDocument();
      return;
    }

    // Polled getOperatorCommand and updated feedback to terminal success
    await waitFor(() => {
      expect(getOperatorCommandSpy).toHaveBeenCalledWith("cmd_pause_runtime_001", expect.anything());
      expect(screen.getByText(/已成功執行 \(terminal status: executed\)/i)).toBeInTheDocument();
    });

    // Success toast shown after execution
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/PAUSE_PAPER_RUNTIME 執行成功/i),
      }),
    );
  });

  it("rejects executed command receipt when degraded_mode is true", async () => {
    const toastSpy = vi.spyOn(toastModule, "toast");
    vi.spyOn(bffWrites, "runAction").mockResolvedValue({
      ok: true,
      data: { actionId: "cmd_degraded_001", status: "accepted" },
      auditEventId: "cmd_degraded_001",
      correlationId: "corr_degraded_777",
      idempotencyKey: "idem_degraded_888",
      legacy: { ok: true, audit: { id: "cmd_degraded_001" } as never },
    });

    vi.spyOn(bffWrites, "getOperatorCommand").mockResolvedValue({
      command_id: "cmd_degraded_001",
      type: "PausePaperRuntime",
      target: { type: "Runtime", id: "rt_paper_002" },
      status: "executed",
      submitted_at: new Date().toISOString(),
      result: { degraded_mode: true }, // degraded!
    });

    const mockTurn = {
      id: "turn_ast_degraded_1",
      role: "assistant",
      text: "測試降級拒絕。",
      uiActions: [
        {
          id: "act_pause_paper_degraded",
          kind: "runBffAction",
          label: "PAUSE_DEGRADED",
          rationale: "測試降級模式拒絕",
          params: {
            entityType: "Runtime",
            entityId: "rt_paper_002",
            actionId: "PausePaperRuntime",
          },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_paper_degraded_01";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "降級對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/operations"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("降級對話");
    fireEvent.click(sessionItem);

    const pauseBtn = await screen.findByRole("button", { name: /PAUSE_DEGRADED/i });
    fireEvent.click(pauseBtn);

    const dialog = screen.getByRole("dialog");
    const dialogScope = within(dialog);

    const memoTextarea = dialog.querySelector("textarea")!;
    fireEvent.change(memoTextarea, {
      target: { value: "Detailed audit memo exceeding forty characters for degraded test." },
    });

    const tokenInput = dialog.querySelectorAll("input")[0]!;
    fireEvent.change(tokenInput, {
      target: { value: "PausePaperRuntime rt_paper_002" },
    });

    const confirmBtn = dialogScope.getByRole("button", { name: "確認" });
    await waitFor(() => expect(confirmBtn).not.toBeDisabled());
    fireEvent.click(confirmBtn);

    // Polled getOperatorCommand and rejected degraded execution
    await waitFor(() => {
      expect(screen.getByText(/降級執行被拒絕/i)).toBeInTheDocument();
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/執行失敗/i),
        variant: "destructive",
      }),
    );
  });

  it("keeps a delayed receipt in its original conversation when another uses the same action ID", async () => {
    let finishRead!: (receipt: Awaited<ReturnType<typeof bffWrites.getOperatorCommand>>) => void;
    const receipt = new Promise<Awaited<ReturnType<typeof bffWrites.getOperatorCommand>>>((resolve) => { finishRead = resolve; });
    const read = vi.spyOn(bffWrites, "getOperatorCommand").mockReturnValue(receipt);
    const write = vi.spyOn(bffWrites, "runAction");
    const action = { id: "shared-action", kind: "runBffAction", label: "PAUSE_SHARED", params: {
      entityType: "Runtime", entityId: "rt-session-A", actionId: "PausePaperRuntime",
    } };
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: "session-A", title: "Conversation A", updatedAt: Date.now() },
      { id: "session-B", title: "Conversation B", updatedAt: Date.now() - 1 },
    ]));
    localStorage.setItem("pantheon.mgmtAi.turns.v1.session-A", JSON.stringify([{
      id: "turn-A", role: "assistant", text: "A action", createdAt: Date.now(), uiActions: [action],
      actionCommands: { "shared-action": { commandId: "cmd-session-A", actionId: "PausePaperRuntime",
        entityType: "Runtime", entityId: "rt-session-A", status: "accepted", updatedAt: Date.now() } },
    }]));
    localStorage.setItem("pantheon.mgmtAi.turns.v1.session-B", JSON.stringify([{
      id: "turn-B", role: "assistant", text: "B action", createdAt: Date.now(), uiActions: [action],
    }]));
    render(<MemoryRouter><AgentPanelBody /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Conversation A"));
    await waitFor(() => expect(read).toHaveBeenCalledWith("cmd-session-A", expect.anything()));
    fireEvent.click(screen.getByText("Conversation B"));
    expect(await screen.findByText("B action")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PAUSE_SHARED/ })).not.toBeDisabled();
    await act(async () => finishRead({
      command_id: "cmd-session-A", type: "PausePaperRuntime", target: { type: "Runtime", id: "rt-session-A" },
      status: "executed", submitted_at: new Date().toISOString(),
      result: { authoritative_readback: { runtime_id: "rt-session-A", runtime_binding_id: "rb-A", deployment_mode: "paper", status: "paused" } },
    }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("pantheon.mgmtAi.turns.v1.session-A")!)[0].actionCommands["shared-action"].status).toBe("executed"));
    expect(JSON.parse(localStorage.getItem("pantheon.mgmtAi.turns.v1.session-B")!)[0].actionCommands).toBeUndefined();
    expect(screen.queryByText(/cmd-session-A 已成功/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PAUSE_SHARED/ })).not.toBeDisabled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each([
    ["accepted", "valid"], ["executed", "valid"], ["executed", "wrong-command"],
    ["executed", "wrong-target-case"], ["executed", "missing-owner-readback"],
  ])("reads cached %s command with %s receipt without resubmitting", async (cachedStatus, receiptCase) => {
    const runActionSpy = vi.spyOn(bffWrites, "runAction");
    const getOperatorCommandSpy = vi.spyOn(bffWrites, "getOperatorCommand").mockResolvedValue({
      command_id: receiptCase === "wrong-command" ? "cmd_OTHER" : "cmd_persisted_terminal_999",
      type: "PausePaperRuntime",
      target: { type: "Runtime", id: receiptCase === "wrong-target-case" ? "RT_PAPER_RELOAD" : "rt_paper_reload" },
      status: "executed",
      submitted_at: new Date().toISOString(),
      result: { degraded_mode: false, ...(receiptCase === "missing-owner-readback" ? {} : { authoritative_readback: {
        runtime_id: "rt_paper_reload", runtime_binding_id: "rb_paper_reload", deployment_mode: "paper", status: "paused",
      } }) },
    });

    const actionKey = "act_reload_1";
    const mockTurn = {
      id: "turn_reload_1",
      role: "assistant",
      text: "重載對話測試。",
      uiActions: [
        {
          id: "act_reload_1",
          kind: "runBffAction",
          label: "PAUSE_PAPER_RUNTIME",
          params: {
            entityType: "Runtime",
            entityId: "rt_paper_reload",
            actionId: "PausePaperRuntime",
          },
        },
      ],
      actionCommands: {
        [actionKey]: {
          commandId: "cmd_persisted_terminal_999",
          actionId: "PausePaperRuntime",
          entityType: "Runtime",
          entityId: "rt_paper_reload",
          status: cachedStatus,
          updatedAt: Date.now() - 5000,
        },
      },
      actionFeedback: {
        [actionKey]: "指令 cmd_persisted_terminal_999 已受理，處理中…",
      },
      createdAt: Date.now() - 5000,
    };

    const sessionId = "ses_reload_test_01";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "重載對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/operations"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("重載對話");
    fireEvent.click(sessionItem);

    // Refetches the exact same commandId without calling runAction (0 POST submissions)
    await waitFor(() => {
      expect(getOperatorCommandSpy).toHaveBeenCalledWith("cmd_persisted_terminal_999", expect.anything());
    });
    expect(runActionSpy).not.toHaveBeenCalled();

    if (receiptCase !== "valid") {
      await waitFor(() => expect(screen.getByText(/驗證不匹配/)).toBeInTheDocument());
      expect(screen.queryByText(/已成功執行/)).not.toBeInTheDocument();
      return;
    }
    // Updates to terminal status
    await waitFor(() => {
      expect(screen.getByText(/已成功執行 \(terminal status: executed\)/i)).toBeInTheDocument();
    });
  });
});

describe("AgentPanelBody — F11 Codex Reauth & Focus Panel Flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("executes focusPanel for agentPanel using real agentPanel store API", async () => {
    const openSpy = vi.spyOn(agentPanel, "open");
    const mockTurn = {
      id: "turn_ast_focus_agent_panel",
      role: "assistant",
      text: "請開啟 Agent Panel。",
      uiActions: [
        {
          kind: "focusPanel",
          label: "聚焦 Agent 助理",
          params: { panel: "agentPanel" },
        },
      ],
      createdAt: Date.now() - 1000,
    };

    const sessionId = "ses_test_focus_agent";
    localStorage.setItem("pantheon.mgmtAi.sessions.v1", JSON.stringify([
      { id: sessionId, title: "聚焦 Agent 對話", updatedAt: Date.now() },
    ]));
    localStorage.setItem(`pantheon.mgmtAi.turns.v1.${sessionId}`, JSON.stringify([mockTurn]));

    render(
      <MemoryRouter initialEntries={["/management/strategies"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const sessionItem = await screen.findByText("聚焦 Agent 對話");
    fireEvent.click(sessionItem);

    const focusBtn = await screen.findByRole("button", { name: /聚焦 Agent 助理/i });
    fireEvent.click(focusBtn);

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
      expect(screen.getByText("已執行")).toBeInTheDocument();
    });
  });

  it("handles Codex reauth when control mode is inactive: renders ProviderReauthNotice failure, opens control dialog, and activates control mode with controlTargetMode", async () => {
    const toastSpy = vi.spyOn(toastModule, "toast");
    vi.mocked(mgmtAi.fetchAssistantModeStatus).mockResolvedValue({
      ok: true,
      kind: "ok",
      status: { kernelEnabled: true, controlMode: { active: false, state: "inactive" } },
    });
    vi.mocked(mgmtAi.streamManagementAi).mockResolvedValue({
      ok: false,
      kind: "provider_degraded",
      providerStatus: {
        provider: "codex",
        runtime: "openclaw_gateway_agent_cli",
        status: "degraded",
        used: false,
        fallback: "rule_based",
        operatorAction: "reauth_codex_service_user",
        displayMessage: "Codex authentication required.",
        runId: "run_reauth_inactive_1",
      },
      sessionId: "ses_reauth_inactive",
      traceId: "trace_reauth_inactive",
      answer: "AI provider 暫時不可用，目前改用規則式摘要。",
      auditLogHref: null,
      conversationHref: null,
      uiActions: [],
      message: "Codex auth required",
    });

    render(
      <MemoryRouter initialEntries={["/management/operations"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    // Send a message to trigger provider_degraded
    const textarea = screen.getByPlaceholderText(/跟 Management AI 說話/i);
    fireEvent.change(textarea, { target: { value: "Trigger degraded provider" } });
    fireEvent.submit(textarea.closest("form")!);

    // Degraded banner appears with "重新登入" button
    const reauthBtn = await screen.findByRole("button", { name: /重新登入/i });
    expect(screen.getByText("Codex authentication required.")).toBeInTheDocument();

    // Click "重新登入" when control mode is inactive
    fireEvent.click(reauthBtn);

    // ProviderReauthNotice should display failure notice indicating control mode is needed
    await waitFor(() => {
      expect(screen.getByText(/Reauth 失敗：需要先啟用 control mode。/i)).toBeInTheDocument();
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "需要 Control mode",
        description: "需要先啟用 control mode。",
      }),
    );

    // Control Dialog should be open
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Control mode")).toBeInTheDocument();

    // Enter passphrase and activate control mode
    const passphraseInput = dialog.querySelector("#mgmt-ai-control-passphrase")!;
    fireEvent.change(passphraseInput, { target: { value: "test-kernel-pass" } });

    const activateBtn = within(dialog).getByRole("button", { name: "Activate" });
    fireEvent.click(activateBtn);

    await waitFor(() => {
      expect(mgmtAi.activateAssistantControlMode).toHaveBeenCalledWith(
        expect.objectContaining({
          passphrase: "test-kernel-pass",
          mode: "kernel_debug",
          reason: "Codex provider reauth",
        }),
      );
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Control mode active",
      }),
    );
  });

  it("handles successful Codex reauth when control mode is active: calls startAssistantProviderReauth and renders active reauth session notice", async () => {
    const toastSpy = vi.spyOn(toastModule, "toast");
    vi.mocked(mgmtAi.fetchAssistantModeStatus).mockResolvedValue({
      ok: true,
      kind: "ok",
      status: {
        kernelEnabled: true,
        controlMode: { active: true, state: "active", mode: "kernel_debug" },
      },
    });
    vi.mocked(mgmtAi.streamManagementAi).mockResolvedValue({
      ok: false,
      kind: "provider_degraded",
      providerStatus: {
        provider: "codex",
        runtime: "openclaw_gateway_agent_cli",
        status: "degraded",
        used: false,
        fallback: "rule_based",
        operatorAction: "reauth_codex_service_user",
        displayMessage: "Codex session expired.",
        runId: "run_reauth_success_1",
      },
      sessionId: "ses_reauth_success",
      traceId: "trace_reauth_success",
      answer: "AI provider 暫時不可用，目前改用規則式摘要。",
      auditLogHref: null,
      conversationHref: null,
      uiActions: [],
      message: "Codex auth required",
    });
    vi.mocked(mgmtAi.startAssistantProviderReauth).mockResolvedValue({
      ok: true,
      kind: "ok",
      reauth: {
        provider: "codex",
        status: "pending",
        userCode: "TEST-CODE-9999",
        verificationUri: "https://auth.codex.example/device",
        verificationUriComplete: "https://auth.codex.example/device?code=TEST-CODE-9999",
        reauthSessionId: "reauth_sess_alpha",
        expiresAt: null,
        intervalSeconds: 5,
        credentialExchange: {
          bffHandlesCredentials: true,
          frontendHandlesCredentials: false,
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/management/operations"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const textarea = screen.getByPlaceholderText(/跟 Management AI 說話/i);
    fireEvent.change(textarea, { target: { value: "Trigger degraded provider" } });
    fireEvent.submit(textarea.closest("form")!);

    const reauthBtn = await screen.findByRole("button", { name: /重新登入/i });
    fireEvent.click(reauthBtn);

    await waitFor(() => {
      expect(mgmtAi.startAssistantProviderReauth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "codex",
          reason: "Codex session expired.",
          traceId: "run_reauth_success_1",
        }),
      );
    });

    // ProviderReauthNotice renders successful pending state with code, session, and verification link
    await waitFor(() => {
      expect(screen.getByText(/Codex reauth pending/i)).toBeInTheDocument();
      expect(screen.getByText(/code=TEST-CODE-9999/i)).toBeInTheDocument();
      expect(screen.getByText(/session=reauth_sess_alpha/i)).toBeInTheDocument();
      expect(screen.getByText(/bff_credentials=true frontend_credentials=false/i)).toBeInTheDocument();
    });

    const loginLink = screen.getByRole("link", { name: /login/i });
    expect(loginLink).toHaveAttribute("href", "https://auth.codex.example/device?code=TEST-CODE-9999");

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Codex reauth started",
        description: "code TEST-CODE-9999",
      }),
    );
  });

  it("handles expired Codex reauth session (HTTP 403): renders failure in ProviderReauthNotice and re-opens control dialog", async () => {
    const toastSpy = vi.spyOn(toastModule, "toast");
    vi.mocked(mgmtAi.fetchAssistantModeStatus).mockResolvedValue({
      ok: true,
      kind: "ok",
      status: {
        kernelEnabled: true,
        controlMode: { active: true, state: "active", mode: "kernel_debug" },
      },
    });
    vi.mocked(mgmtAi.streamManagementAi).mockResolvedValue({
      ok: false,
      kind: "provider_degraded",
      providerStatus: {
        provider: "codex",
        runtime: "openclaw_gateway_agent_cli",
        status: "degraded",
        used: false,
        fallback: "rule_based",
        operatorAction: "reauth_codex_service_user",
        displayMessage: "Codex token expired.",
        runId: "run_reauth_expired_1",
      },
      sessionId: "ses_reauth_expired",
      traceId: "trace_reauth_expired",
      answer: "AI provider 暫時不可用，目前改用規則式摘要。",
      auditLogHref: null,
      conversationHref: null,
      uiActions: [],
      message: "Codex auth required",
    });
    vi.mocked(mgmtAi.startAssistantProviderReauth).mockResolvedValue({
      ok: false,
      kind: "failure",
      statusCode: 403,
      message: "Codex session expired; re-authentication required",
    });

    render(
      <MemoryRouter initialEntries={["/management/operations"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const textarea = screen.getByPlaceholderText(/跟 Management AI 說話/i);
    fireEvent.change(textarea, { target: { value: "Trigger degraded provider" } });
    fireEvent.submit(textarea.closest("form")!);

    const reauthBtn = await screen.findByRole("button", { name: /重新登入/i });
    fireEvent.click(reauthBtn);

    // ProviderReauthNotice displays error
    await waitFor(() => {
      expect(screen.getByText(/Reauth 失敗：Codex session expired; re-authentication required/i)).toBeInTheDocument();
    });

    // On 403, Control Dialog automatically re-opens for reauth
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Control mode")).toBeInTheDocument();

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reauth 失敗",
        description: "Codex session expired; re-authentication required",
        variant: "destructive",
      }),
    );
  });

  it("opens Control dialog from toolbar, activates control mode, and can deactivate", async () => {
    const toastSpy = vi.spyOn(toastModule, "toast");
    vi.mocked(mgmtAi.fetchAssistantModeStatus)
      .mockResolvedValueOnce({
        ok: true,
        kind: "ok",
        status: { kernelEnabled: true, controlMode: { active: false, state: "inactive" } },
      })
      .mockResolvedValueOnce({
        ok: true,
        kind: "ok",
        status: { kernelEnabled: true, controlMode: { active: true, state: "active", mode: "kernel_debug" } },
      });

    render(
      <MemoryRouter initialEntries={["/management/operations"]}>
        <AgentPanelBody />
      </MemoryRouter>,
    );

    const controlBtn = await screen.findByRole("button", { name: /Control/i });
    fireEvent.click(controlBtn);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Control mode")).toBeInTheDocument();

    // Try activate without passphrase
    const activateBtn = within(dialog).getByRole("button", { name: "Activate" });
    fireEvent.click(activateBtn);
    expect(await screen.findByText("需要 passphrase")).toBeInTheDocument();

    // Enter passphrase and activate
    const passphraseInput = dialog.querySelector("#mgmt-ai-control-passphrase")!;
    fireEvent.change(passphraseInput, { target: { value: "secret123" } });
    fireEvent.click(activateBtn);

    await waitFor(() => {
      expect(mgmtAi.activateAssistantControlMode).toHaveBeenCalledWith(
        expect.objectContaining({
          passphrase: "secret123",
          mode: "kernel_debug",
        }),
      );
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Control mode active",
      }),
    );

    // Open dialog again and deactivate
    fireEvent.click(controlBtn);
    const dialogAgain = await screen.findByRole("dialog");
    const deactivateBtn = within(dialogAgain).getByRole("button", { name: "Deactivate" });
    fireEvent.click(deactivateBtn);

    await waitFor(() => {
      expect(mgmtAi.deactivateAssistantControlMode).toHaveBeenCalled();
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Control mode inactive",
      }),
    );
  });
});
