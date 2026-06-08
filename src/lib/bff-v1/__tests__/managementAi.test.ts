import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAssistantOrchestratorStatus } from "@/lib/bff-v1/managementAi";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Management AI orchestrator status", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("adapts OpenClaw assistant.command usability from BFF status", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        status: "ready",
        provider_status: {
          provider: "codex_cli",
          runtime: "openclaw_gateway_cli_mount",
          status: "completed",
          used: true,
          fallback: null,
          run_id: "mnl-trace-test",
        },
        openclawToolPolicy: {
          status: "ready",
          effectiveStatus: "degraded",
          upstreamStatus: "degraded",
          assistantCommandAllowed: true,
          assistantCommandEffective: true,
          assistantCommandUsable: true,
          assistantCommandStatus: "usable",
          effectiveTools: ["assistant.command"],
        },
      },
    }));
    globalThis.fetch = fetchMock;

    const result = await fetchAssistantOrchestratorStatus();

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/orchestrator/status");
    expect(result.status.providerStatus?.runId).toBe("mnl-trace-test");
    expect(result.status.openclawToolPolicy?.assistantCommandUsable).toBe(true);
    expect(result.status.openclawToolPolicy?.assistantCommandStatus).toBe("usable");
    expect(result.status.openclawToolPolicy?.effectiveTools).toEqual(["assistant.command"]);
  });

  it("returns a visible failure when the BFF status endpoint is missing", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ detail: "Not Found" }, 404));

    const result = await fetchAssistantOrchestratorStatus();

    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") throw new Error("expected failure");
    expect(result.statusCode).toBe(404);
    expect(result.message).toContain("BFF 404");
  });
});
