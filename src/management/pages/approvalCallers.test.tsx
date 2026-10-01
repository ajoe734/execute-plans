import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BffError } from "@/lib/bff-v1/errors";
import { __resetOperationListCacheForTests, ApprovalsPage } from "./Operations";
import { GovernanceReview } from "./GovernanceReview";
import { GovernanceQueuePage } from "./phase2/GovernanceQueue";

const m = vi.hoisted(() => ({
  decide: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/bff-v1/writes", async (importOriginal) => {
  const actual = await importOriginal<{ bffWrites: object }>();
  return { ...actual, bffWrites: { ...actual.bffWrites, decideApproval: m.decide } };
});
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/platform/hooks", () => ({
  useT: () => (key: string, p?: Record<string, unknown>) => (p?.defaultValue as string | undefined) ?? key,
}));
vi.mock("@/management/components/governance/PolicyValidatorPanel", () => ({ PolicyValidatorPanel: () => null }));
vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    lists: { approvals: () => m.list().then((items: unknown[]) => ({ items })) },
    bffV1: { approvals: { get: m.get, list: m.list }, audit: { list: () => Promise.resolve([]) } },
  };
});

const MEMO = "Reviewed the diff and the validator output in full.";
const row = (id: string, version: number, state = "pending") => ({
  id, kind: "Strategy", subject: `subj-${id}`, requester: "u1", riskLevel: "medium",
  createdAt: "2026-10-01T00:00:00Z", state, version,
});
const conflict = () => new BffError(409, {
  error: { code: "CONFLICT", message: "stale", i18nKey: "x", retryable: false, userActionable: true, correlationId: "c" },
} as never);
const unavailable = () => new BffError(503, {
  error: { code: "UNAVAILABLE", message: "owner down", i18nKey: "x", retryable: true, userActionable: false, correlationId: "c" },
} as never);

const confirm = (name: string) => {
  fireEvent.change(screen.getByPlaceholderText("confirm.memoPlaceholder"), { target: { value: MEMO } });
  const boxes = screen.getAllByRole("textbox");
  if (boxes.length > 1) fireEvent.change(boxes[boxes.length - 1], { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "actions.confirm" }));
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetOperationListCacheForTests();
  m.decide.mockResolvedValue({ ok: true, data: { approvalId: "a1", decision: "approve" }, correlationId: "c", idempotencyKey: "k" });
});
afterEach(cleanup);

describe("Operations ApprovalsPage", () => {
  const open = async () => {
    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText("subj-a1"));
  };

  it("sends the exact memo and displayed owner version, then reads back without claiming final state", async () => {
    m.list.mockResolvedValue([row("a1", 7)]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith("a1", "approve", MEMO, { expectedVersion: 7 }));
    await waitFor(() => expect(m.toast.success).toHaveBeenCalled());
    expect(m.list).toHaveBeenCalledTimes(2);
  });

  it("passes the reject memo and version", async () => {
    m.list.mockResolvedValue([row("a1", 3)]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.reject" }));
    confirm("REJECT");
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith("a1", "reject", MEMO, { expectedVersion: 3 }));
  });

  it("warns instead of reporting success when the owner readback fails", async () => {
    m.list.mockResolvedValueOnce([row("a1", 7)]).mockRejectedValue(new Error("readback down"));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.warning).toHaveBeenCalled());
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it("refreshes on 409 without re-voting", async () => {
    m.decide.mockRejectedValue(conflict());
    m.list.mockResolvedValueOnce([row("a1", 7)]).mockResolvedValue([row("a1", 8)]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.decide).toHaveBeenCalledTimes(1);
    expect(m.list).toHaveBeenCalledTimes(2);
  });

  it("does not claim a refreshed state on 409 when the refresh fails", async () => {
    m.decide.mockRejectedValue(conflict());
    m.list.mockResolvedValueOnce([row("a1", 7)]).mockRejectedValue(new Error("down"));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledWith(expect.stringContaining("could not be refreshed")));
  });

  it("keeps the memo and version for a same-attempt retry after an owner error", async () => {
    m.decide.mockRejectedValueOnce(unavailable());
    m.list.mockResolvedValue([row("a1", 7)]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "actions.approve" }));
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledWith("owner down"));
    expect(screen.getByPlaceholderText("confirm.memoPlaceholder")).toHaveValue(MEMO);
    fireEvent.click(screen.getByRole("button", { name: "actions.confirm" }));
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(2));
    expect(m.decide.mock.calls[1]).toEqual(m.decide.mock.calls[0]);
  });
});

describe("GovernanceReview", () => {
  const open = async () => {
    render(
      <MemoryRouter initialEntries={["/g/a1"]}>
        <Routes><Route path="/g/:id" element={<GovernanceReview />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "governance.decision.approve" }));
  };

  it("submits the displayed version and shows the owner's still-pending state after a first vote", async () => {
    m.get.mockResolvedValueOnce(row("a1", 5)).mockResolvedValue(row("a1", 6));
    await open();
    confirm("APPROVE");
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith("a1", "approve", MEMO, { expectedVersion: 5 }));
    await waitFor(() => expect(m.toast.success).toHaveBeenCalled());
    expect(m.toast.success.mock.calls[0][0]).toContain("Vote submitted");
    expect(m.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/already decided/i)).toBeNull();
  });

  it("keeps the memo open for retry after an owner failure and does not reload", async () => {
    m.get.mockResolvedValue(row("a1", 5));
    m.decide.mockRejectedValueOnce(unavailable());
    await open();
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledWith("owner down"));
    expect(screen.getByPlaceholderText("confirm.memoPlaceholder")).toHaveValue(MEMO);
    expect(m.get).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "actions.confirm" }));
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(2));
    expect(m.decide.mock.calls[1]).toEqual(m.decide.mock.calls[0]);
  });

  it("warns when readback fails after an accepted vote", async () => {
    m.get.mockResolvedValueOnce(row("a1", 5)).mockRejectedValue(new Error("down"));
    await open();
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.warning).toHaveBeenCalled());
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it("refreshes on 409 and does not re-vote", async () => {
    m.get.mockResolvedValueOnce(row("a1", 5)).mockResolvedValue(row("a1", 6));
    m.decide.mockRejectedValue(conflict());
    await open();
    confirm("APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.decide).toHaveBeenCalledTimes(1);
    expect(m.get).toHaveBeenCalledTimes(2);
  });
});

describe("GovernanceQueuePage batch", () => {
  const select = async () => {
    render(<MemoryRouter><GovernanceQueuePage /></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText("select a1"));
    fireEvent.click(screen.getByLabelText("select a2"));
    fireEvent.click(screen.getByRole("button", { name: "Batch approve" }));
  };

  it("votes each item with its own displayed version and reloads", async () => {
    m.list.mockResolvedValue([row("a1", 2), row("a2", 9)]);
    await select();
    confirm("BATCH.APPROVE");
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(2));
    expect(m.decide).toHaveBeenCalledWith("a1", "approve", MEMO, { expectedVersion: 2 });
    expect(m.decide).toHaveBeenCalledWith("a2", "approve", MEMO, { expectedVersion: 9 });
    await waitFor(() => expect(m.list).toHaveBeenCalledTimes(2));
  });

  it("does not re-vote a 409 item and retries an ambiguous failure with its original version and memo", async () => {
    m.list.mockResolvedValueOnce([row("a1", 2), row("a2", 9)]).mockResolvedValue([row("a1", 3), row("a2", 10)]);
    m.decide.mockRejectedValueOnce(conflict()).mockRejectedValueOnce(unavailable());
    await select();
    confirm("BATCH.APPROVE");
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledTimes(2));
    expect(screen.getByPlaceholderText("confirm.memoPlaceholder")).toHaveValue(MEMO);
    fireEvent.click(screen.getByRole("button", { name: "actions.confirm" }));
    await waitFor(() => expect(m.decide).toHaveBeenCalledTimes(3));
    expect(m.decide.mock.calls[2]).toEqual(["a2", "approve", MEMO, { expectedVersion: 9 }]);
  });

  it("warns when the post-batch readback fails", async () => {
    m.list.mockResolvedValueOnce([row("a1", 2), row("a2", 9)]).mockRejectedValue(new Error("down"));
    await select();
    confirm("BATCH.APPROVE");
    await waitFor(() => expect(m.toast.warning).toHaveBeenCalled());
  });
});
