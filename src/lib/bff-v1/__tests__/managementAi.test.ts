import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateAssistantControlMode,
  askManagementAi,
  fetchAssistantModeStatus,
  fetchAssistantOrchestratorStatus,
  fetchAssistantProviderReauthStatus,
  generateAssistantDevDocs,
  prepareAssistantRepairWorktree,
  startAssistantProviderReauth,
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


describe("Management AI provider reauth", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("starts Codex provider reauth through the assistant BFF route", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        provider: "codex",
        status: "pending",
        reauth_session_id: "reauth_123",
        verification_uri: "https://github.com/login/device",
        user_code: "ABCD-EFGH",
        expires_at: "2026-06-09T05:30:00Z",
        interval_seconds: 5,
        credential_exchange: {
          bff_handles_credentials: false,
          frontend_handles_credentials: false,
          method: "device_flow",
        },
      },
    }, 202));
    globalThis.fetch = fetchMock;

    const result = await startAssistantProviderReauth({
      provider: "codex",
      reason: "CODEX_AUTH_UNAVAILABLE",
      traceId: "mnl-trace-test",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/provider/reauth");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toMatchObject({
      provider: "codex",
      reason: "CODEX_AUTH_UNAVAILABLE",
      traceId: "mnl-trace-test",
    });
    expect(result.reauth.reauthSessionId).toBe("reauth_123");
    expect(result.reauth.verificationUri).toBe("https://github.com/login/device");
    expect(result.reauth.userCode).toBe("ABCD-EFGH");
    expect(result.reauth.credentialExchange?.bffHandlesCredentials).toBe(false);
    expect(result.reauth.credentialExchange?.frontendHandlesCredentials).toBe(false);
  });

  it("reads provider reauth status with provider query", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        provider: "codex",
        status: "authorized",
        reauthSessionId: "reauth_123",
        verificationUriComplete: "https://github.com/login/device?user_code=ABCD-EFGH",
        userCode: "ABCD-EFGH",
      },
    }));
    globalThis.fetch = fetchMock;

    const result = await fetchAssistantProviderReauthStatus("reauth_123", "codex");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/provider/reauth/reauth_123?provider=codex");
    expect(result.reauth.status).toBe("authorized");
    expect(result.reauth.verificationUriComplete).toContain("user_code=ABCD-EFGH");
  });

  it("surfaces provider reauth control-mode precondition failures", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({
      detail: {
        error: {
          message: "Assistant dev workflow requires active control mode",
        },
      },
    }, 409));

    const result = await startAssistantProviderReauth({ provider: "codex" });

    expect(result.kind).toBe("failure");
    if (result.kind !== "failure") throw new Error("expected failure");
    expect(result.statusCode).toBe(409);
    expect(result.message).toContain("active control mode");
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

describe("Management AI OpenClaw repair worktrees", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("prepares a repair worktree through the assistant BFF route", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        created: true,
        repair: {
          task_id: "MGMT-AI-REPAIR-FE",
          taskId: "MGMT-AI-REPAIR-FE",
          task_worktree: "/srv/pantheon-assistant/worktrees/execute-plans/mgmt-ai-repair-fe",
          taskWorktree: "/srv/pantheon-assistant/worktrees/execute-plans/mgmt-ai-repair-fe",
          declared_scope: ["src/management/components/agent", "src/lib/bff-v1"],
          declaredScope: ["src/management/components/agent", "src/lib/bff-v1"],
          expected_branch: "task/MGMT-AI-REPAIR-FE",
          expectedBranch: "task/MGMT-AI-REPAIR-FE",
          remote: "origin",
          merge_target: "main",
          mergeTarget: "main",
          require_clean: true,
          requireClean: true,
          repo_key: "execute-plans",
          repoKey: "execute-plans",
        },
        workflow: { clean: true },
      },
      meta: { openclawAdapterStatus: "ok" },
    }, 201));
    globalThis.fetch = fetchMock;

    const result = await prepareAssistantRepairWorktree({
      taskId: "MGMT-AI-REPAIR-FE",
      repoKey: "execute-plans",
      declaredScope: ["src/management/components/agent", "src/lib/bff-v1"],
      expectedBranch: "task/MGMT-AI-REPAIR-FE",
      mergeTarget: "main",
      reason: "repair frontend Management AI",
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/assistant/repair-worktrees/prepare");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      taskId: "MGMT-AI-REPAIR-FE",
      repoKey: "execute-plans",
      declaredScope: ["src/management/components/agent", "src/lib/bff-v1"],
      expectedBranch: "task/MGMT-AI-REPAIR-FE",
      mergeTarget: "main",
    });
    expect(result.repair.repo_key).toBe("execute-plans");
    expect(result.repair.task_worktree).toContain("/execute-plans/");
    expect(result.workflow?.clean).toBe(true);
  });

  it("sends prepared openclaw repair metadata with Management AI ask", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        answer: "ok",
        sessionId: "mgmt-nl-123",
        traceId: "trace-123",
        providerStatus: {
          provider: "codex_cli",
          runtime: "openclaw_gateway_cli_mount",
          status: "completed",
          used: true,
          fallback: null,
        },
      },
    }, 202));
    globalThis.fetch = fetchMock;

    const result = await askManagementAi({
      question: "修 Management AI 前端",
      openclaw: {
        repair: {
          task_id: "MGMT-AI-REPAIR-FE",
          task_worktree: "/srv/pantheon-assistant/worktrees/execute-plans/mgmt-ai-repair-fe",
          declared_scope: ["src/management/components/agent"],
          expected_branch: "task/MGMT-AI-REPAIR-FE",
          remote: "origin",
          merge_target: "main",
          require_clean: true,
          repo_key: "execute-plans",
        },
      },
    });

    expect(result.kind).toBe("ok");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/management/nl/ask");
    expect(JSON.parse(String(init.body))).toMatchObject({
      question: "修 Management AI 前端",
      openclaw: {
        repair: {
          task_id: "MGMT-AI-REPAIR-FE",
          task_worktree: "/srv/pantheon-assistant/worktrees/execute-plans/mgmt-ai-repair-fe",
          declared_scope: ["src/management/components/agent"],
          expected_branch: "task/MGMT-AI-REPAIR-FE",
          repo_key: "execute-plans",
        },
      },
    });
  });
});
