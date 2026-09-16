import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillSandboxStudio } from "./SkillSandboxStudio";
import { bffV1 } from "@/lib/bff-v1";
import type { Skill } from "@/lib/bff-v1";

const mocks = vi.hoisted(() => ({
  mockSkillsList: vi.fn(),
  mockJobCancel: vi.fn(),
  mockDetectMode: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    bffV1: {
      ...actual.bffV1,
      skills: {
        ...actual.bffV1.skills,
        list: mocks.mockSkillsList,
      },
      jobs: {
        ...actual.bffV1.jobs,
        cancel: mocks.mockJobCancel,
      },
      detectMode: mocks.mockDetectMode,
      fetch: mocks.mockFetch,
    },
  };
});

vi.mock("@/lib/bff-v1/liveTransport", () => ({
  isStrictLiveFallback: () => false,
}));

const sampleSkill: Skill = {
  id: "skill-macro-summary",
  name: "Macro Summary",
  version: "1.0.0",
  archetype: "research",
  description: "Macro summary research skill",
  draft: false,
  usedByPersonas: 1,
};

describe("SkillSandboxStudio Cancellation and Timer Fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.mockSkillsList.mockResolvedValue([sampleSkill]);
    mocks.mockJobCancel.mockResolvedValue({ status: "canceled" });
    mocks.mockDetectMode.mockReturnValue("dev");
  });

  it("cancels mock job before completion timer fires and prevents late status overwrite", async () => {
    vi.useFakeTimers();

    render(
      <MemoryRouter>
        <SkillSandboxStudio />
      </MemoryRouter>
    );

    // Wait for skills list to populate
    await act(async () => {
      await Promise.resolve();
    });

    const runBtn = screen.getByTestId("run-job-button");
    expect(runBtn).toBeInTheDocument();

    // Trigger mock run
    await act(async () => {
      fireEvent.click(runBtn);
    });

    const statusBadge = screen.getByTestId("job-status-badge");
    expect(statusBadge).toHaveTextContent("running");

    const cancelBtn = screen.getByTestId("cancel-job-button");
    expect(cancelBtn).toBeInTheDocument();

    // Advance 1000ms into the 4000ms mock run
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Check step 1 log appeared
    expect(screen.getByText(/Initializing sandbox environment/)).toBeInTheDocument();

    // Click Cancel Job
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    // Verify cancellation called
    expect(mocks.mockJobCancel).toHaveBeenCalledTimes(1);
    expect(statusBadge).toHaveTextContent("failed");
    expect(screen.queryByTestId("cancel-job-button")).not.toBeInTheDocument();

    // Verify cancellation log appeared
    expect(screen.getByText(/cancelled by operator/)).toBeInTheDocument();

    // Advance timers well beyond the 4000ms completion timer (advance by 10s)
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    // The status MUST REMAIN failed and not be overwritten to success
    expect(statusBadge).toHaveTextContent("failed");

    // The fake completion card must NOT be rendered
    expect(screen.queryByText("評估執行結果")).not.toBeInTheDocument();
  });

  it("cancels live job, clears poll interval, and fences late poll callbacks from overwriting status", async () => {
    mocks.mockDetectMode.mockReturnValue("live");
    mocks.mockFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path.includes("/sandbox-eval")) {
        return { job_id: "job-live-sandbox-999" };
      }
      if (path.includes("/logs")) {
        return {
          status: "running",
          logs: [{ timestamp: new Date().toISOString(), level: "INFO", message: "Live job executing" }],
        };
      }
      return {};
    });

    vi.useFakeTimers();

    render(
      <MemoryRouter>
        <SkillSandboxStudio />
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
    });

    const runBtn = screen.getByTestId("run-job-button");
    await act(async () => {
      fireEvent.click(runBtn);
    });

    // Wait for sandbox-eval POST to resolve
    await act(async () => {
      await Promise.resolve();
    });

    const statusBadge = screen.getByTestId("job-status-badge");
    expect(statusBadge).toHaveTextContent("running");

    const cancelBtn = screen.getByTestId("cancel-job-button");
    expect(cancelBtn).toBeInTheDocument();

    // Operator cancels the live job
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(mocks.mockJobCancel).toHaveBeenCalledWith("job-live-sandbox-999");
    expect(statusBadge).toHaveTextContent("failed");
    expect(screen.queryByTestId("cancel-job-button")).not.toBeInTheDocument();

    // If backend late response races back with status "success"
    mocks.mockFetch.mockResolvedValueOnce({
      status: "success",
      progress: {
        status: "success",
        output: { summary: "Late fake success payload" },
      },
    });

    // Advance timers
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Status must remain failed, never overwritten by late poll response
    expect(statusBadge).toHaveTextContent("failed");
    expect(screen.queryByText("評估執行結果")).not.toBeInTheDocument();
  });
});
