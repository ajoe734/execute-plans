import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateAssistantControlMode,
  fetchAssistantModeStatus,
  fetchAssistantOrchestratorStatus,
  generateAssistantDevDocs,
} from "@/lib/bff-v1/managementAi";

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

describe("Management AI control mode", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("adapts kernel and control-mode status from BFF mode endpoint", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        product_default_mode: "user",
        kernel_enabled: true,
        control_mode: {
          state: "active",
          active: true,
          mode: "kernel_repair",
          activation_id: "act_123",
          expires_at: "2026-06-08T05:00:00Z",
          idle_expires_at: "2026-06-08T04:20:00Z",
          command_classes: ["code_search", "file_slice"],
        },
      },
    }));
    globalThis.fetch = fetchMock;

    const result = await fetchAssistantModeStatus();

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/mode");
    expect(result.status.kernelEnabled).toBe(true);
    expect(result.status.controlMode?.active).toBe(true);
    expect(result.status.controlMode?.mode).toBe("kernel_repair");
    expect(result.status.controlMode?.commandClasses).toEqual(["code_search", "file_slice"]);
  });

  it("posts passphrase only to the control-mode activation endpoint", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        state: "active",
        active: true,
        mode: "kernel_debug",
        activationId: "act_456",
      },
    }, 202));
    globalThis.fetch = fetchMock;

    const result = await activateAssistantControlMode({
      passphrase: "control phrase ok",
      mode: "kernel_debug",
      reason: "debug from test",
      ttlSeconds: 900,
      idleTtlSeconds: 120,
      managementSessionId: "mgmt-nl-test",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/control-mode/activate");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      passphrase: "control phrase ok",
      mode: "kernel_debug",
      reason: "debug from test",
      ttlSeconds: 900,
      idleTtlSeconds: 120,
      managementSessionId: "mgmt-nl-test",
    });
    expect(result.controlMode.active).toBe(true);
  });

  it("surfaces control-mode precondition failures", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
      detail: {
        error: {
          message: "Mode policy violation: Kernel sessions are disabled.",
        },
      },
    }, 403));

    const result = await activateAssistantControlMode({
      passphrase: "control phrase ok",
      mode: "kernel_repair",
      reason: "repair from test",
    });

    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") throw new Error("expected failure");
    expect(result.statusCode).toBe(403);
    expect(result.message).toContain("Kernel sessions are disabled");
  });
});

describe("Management AI SA/SD dev bridge", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("posts archive and queue intent to the assistant dev-docs endpoint", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        packetId: "devdocs_mgmt_123",
        conversationId: "mgmt-nl-123",
        archiveLocations: {
          requirementCapture: "docs/dev/devdocs_mgmt_123/requirement_capture.md",
          systemAnalysis: "docs/dev/devdocs_mgmt_123/system_analysis.md",
          systemDesign: "docs/dev/devdocs_mgmt_123/system_design.md",
          taskBriefs: ["docs/dev/devdocs_mgmt_123/tasks/task_1.md"],
        },
        executionTasks: [{ taskId: "task_1" }],
      },
      meta: {
        archived: true,
        taskPacketQueued: true,
        taskPacketQueueReceipt: {
          queued: true,
          path: "/repo/.orchestrator/assistant-dev-packets/pending/bridge_devdocs_mgmt_123.json",
          taskCount: 1,
        },
        taskPacket: { packetId: "bridge_devdocs_mgmt_123" },
      },
    }, 201));
    globalThis.fetch = fetchMock;

    const result = await generateAssistantDevDocs({
      conversationId: "mgmt-nl-123",
      featureSummary: "Let Management AI create SA/SD and queue worker tasks",
      affectedModules: ["execute-plans:management-ai", "pantheon:bff-assistant"],
      proposedOwner: "Codex",
      proposedReviewer: "Supervisor",
      archive: true,
      emitTaskPacket: true,
      queueTaskPacket: true,
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/dev-docs/generate");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toMatchObject({
      conversationId: "mgmt-nl-123",
      featureSummary: "Let Management AI create SA/SD and queue worker tasks",
      affectedModules: ["execute-plans:management-ai", "pantheon:bff-assistant"],
      proposedOwner: "Codex",
      proposedReviewer: "Supervisor",
      archive: true,
      emitTaskPacket: true,
      queueTaskPacket: true,
    });
    expect(result.packetId).toBe("devdocs_mgmt_123");
    expect(result.archiveLocations?.systemDesign).toContain("system_design.md");
    expect(result.taskPacketQueued).toBe(true);
    expect(result.taskPacketQueuePath).toContain("bridge_devdocs_mgmt_123.json");
    expect(result.taskCount).toBe(1);
    expect(result.taskPacket?.packetId).toBe("bridge_devdocs_mgmt_123");
  });

  it("surfaces BFF control-mode precondition failures", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
      detail: {
        error: {
          message: "Control mode is required before generating SA/SD artifacts.",
        },
      },
    }, 403));

    const result = await generateAssistantDevDocs({
      conversationId: "mgmt-nl-123",
      featureSummary: "Generate worker-ready SA/SD",
    });

    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") throw new Error("expected failure");
    expect(result.statusCode).toBe(403);
    expect(result.message).toContain("Control mode is required");
  });
});
