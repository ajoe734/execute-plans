import { afterEach, describe, expect, it, vi } from "vitest";
import { bffFetch } from "@/lib/bff-v1/client";
import { submitAgoraAsk, type SubmitAgoraAskRequest } from "./ask";

vi.mock("@/lib/bff-v1/client", () => ({
  bffFetch: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

describe("submitAgoraAsk", () => {
  it("posts the allowlisted request shape with caller-supplied idempotency", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      status: "accepted",
      data: {
        session: { sessionId: "ask-session-001" },
        message: { id: "ask-message-001" },
        provider: { status: "completed", answer: "Structured answer" },
      },
      meta: {
        snapshot_at: "2026-07-13T15:00:00Z",
        command: { commandId: "cmd-ask-001", command: "AgoraMessageAction" },
      },
    });

    const request = {
      prompt: "  Explain the current strategy risk.  ",
      route: "  /agora/trading-room  ",
      contextRefs: [
        { type: "strategy", id: "strategy-001", versionId: "v4" },
      ],
      sessionId: "ask-session-001",
      messageId: "ask-message-001",
      actions: [{ type: "place_order" }],
    } as SubmitAgoraAskRequest & { actions: Array<{ type: string }> };

    const result = await submitAgoraAsk(request, { idempotencyKey: "idem-ask-001" });

    expect(bffFetch).toHaveBeenCalledWith({
      method: "POST",
      path: "/bff/agora/ask",
      body: {
        prompt: "Explain the current strategy risk.",
        route: "/agora/trading-room",
        contextRefs: [{ type: "strategy", id: "strategy-001", versionId: "v4" }],
        sessionId: "ask-session-001",
        messageId: "ask-message-001",
      },
      idempotencyKey: "idem-ask-001",
    });
    expect(result).toEqual({
      sessionId: "ask-session-001",
      messageId: "ask-message-001",
      providerStatus: "completed",
      answer: "Structured answer",
      commandId: "cmd-ask-001",
      snapshotAt: "2026-07-13T15:00:00Z",
    });
  });

  it("normalizes compatibility aliases and ignores arbitrary response actions", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: {
        session_id: "ask-session-compat",
        message_id: "ask-message-compat",
        provider_status: "degraded",
        answer: "Bounded fallback",
        command_id: "cmd-compat",
        actions: [{ type: "execute", target: "broker" }],
      },
      actions: [{ type: "execute", target: "runtime" }],
      meta: { snapshotAt: "2026-07-13T15:01:00Z" },
    });

    const result = await submitAgoraAsk({ prompt: "Why?", route: "/agora" });

    expect(result).toEqual({
      sessionId: "ask-session-compat",
      messageId: "ask-message-compat",
      providerStatus: "degraded",
      answer: "Bounded fallback",
      commandId: "cmd-compat",
      snapshotAt: "2026-07-13T15:01:00Z",
    });
    expect(result).not.toHaveProperty("actions");
  });

  it("fails closed when required receipt identities are absent", async () => {
    vi.mocked(bffFetch).mockResolvedValue({
      data: { provider: { status: "completed", answer: "Uncorrelated answer" } },
    });

    await expect(submitAgoraAsk({ prompt: "Why?", route: "/agora" }))
      .rejects.toThrow("invalid Agora ask receipt");
  });

  it("does not send an empty prompt or route", async () => {
    await expect(submitAgoraAsk({ prompt: " ", route: "/agora" }))
      .rejects.toThrow("prompt must not be empty");
    await expect(submitAgoraAsk({ prompt: "Explain", route: " " }))
      .rejects.toThrow("route must not be empty");
    expect(bffFetch).not.toHaveBeenCalled();
  });
});
