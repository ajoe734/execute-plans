import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AgentPanelBody } from "./AgentPanelBody";
import { bffWrites } from "@/lib/bff/runAction";

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
        }),
      );
    });

    // Readback description should be rendered as feedback
    await waitFor(() => {
      expect(screen.getByText(/au_persona_retire_999/i)).toBeInTheDocument();
    });
  });
});
