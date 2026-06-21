import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateAssistantControlMode,
  askManagementAi,
  streamManagementAi,
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

function streamResponse(frames: string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  }), {
    status,
    headers: { "Content-Type": "text/event-stream" },
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
          effectiveTools: ["assistant.command", "assistant.sa_sd.generate"],
          effective_skills: [
            {
              id: "assistant.sa_sd.generate",
              title: "Generate SA/SD",
              surface: "assistant_command",
              handler_ref: "bff.route:POST /bff/assistant/dev-docs/generate",
              result_surface: "assistant_dev_docs_packet",
              confirm_policy: "control_mode",
              mode_gate: { allowed_modes: ["kernel_debug", "kernel_repair"] },
              input_schema: { type: "object" },
            },
          ],
        },
        snapshotAt: "2026-06-09T12:55:19Z",
        project: "pantheon",
        sprint: "2026-06-03-pantheon-assistant-existing-architecture",
        sourceRefs: [
          { source_type: "task_status", path: "ai-status.json", available: true, status: "ok", last_modified_at: "2026-06-09T12:48:23Z" },
        ],
        supervisor: {
          lifecycle: "running",
          mode_status: "active",
          focus_mode: "execution",
          last_heartbeat_at: "2026-06-09T12:54:04Z",
          mode_occupancy: { execution: { running: 2, pending: 0, queued: 1 } },
        },
        providerReadiness: {
          available: true,
          provider_name: "codex",
          ready: true,
          status: "ready",
          mount_mode: "rw",
          capabilities: { read: true, repair_write: true },
          repair_workspace: { root: "/srv/pantheon-assistant/worktrees", ready: true, writable: true, worktree_count: 1 },
        },
        assistantDevBridge: {
          status: "idle",
          inbox: { path: "/workspace/status-root/.orchestrator/assistant-dev-packets", exists: true, pending_count: 0, processed_count: 1, failed_count: 0, receipt_count: 1 },
          recent_receipts: [{ packet_id: "bridge_smoke", status: "processed", error_count: 0 }],
        },
        tasks: [
          { id: "MPOS-P1-RISK-001", title: "Create first class RiskPolicy evaluator contract", owner: "Codex", status: "in_progress", last_update: "2026-06-09T12:34:33Z" },
        ],
        coordination: { file_count: 669, feature_count: 47, feature_ids: ["PKT-011-health-status-board"] },
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
    expect(result.status.openclawToolPolicy?.effectiveTools).toEqual(["assistant.command", "assistant.sa_sd.generate"]);
    expect(result.status.openclawToolPolicy?.effectiveSkills?.[0]).toMatchObject({
      id: "assistant.sa_sd.generate",
      title: "Generate SA/SD",
      surface: "assistant_command",
      handlerRef: "bff.route:POST /bff/assistant/dev-docs/generate",
      resultSurface: "assistant_dev_docs_packet",
      confirmPolicy: "control_mode",
    });
    expect(result.status.openclawToolPolicy?.effectiveSkills?.[0].modeGate).toMatchObject({ allowed_modes: ["kernel_debug", "kernel_repair"] });
    expect(result.status.snapshotAt).toBe("2026-06-09T12:55:19Z");
    expect(result.status.sourceRefs?.[0].sourceType).toBe("task_status");
    expect(result.status.supervisor?.lifecycle).toBe("running");
    expect(result.status.supervisor?.modeOccupancy?.execution.running).toBe(2);
    expect(result.status.providerReadiness?.providerName).toBe("codex");
    expect(result.status.providerReadiness?.capabilities?.repairWrite).toBe(true);
    expect(result.status.providerReadiness?.repairWorkspace?.worktreeCount).toBe(1);
    expect(result.status.assistantDevBridge?.inbox?.processedCount).toBe(1);
    expect(result.status.assistantDevBridge?.recentReceipts?.[0].packetId).toBe("bridge_smoke");
    expect(result.status.tasks?.[0].id).toBe("MPOS-P1-RISK-001");
    expect(result.status.coordination?.featureIds).toEqual(["PKT-011-health-status-board"]);
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
      proposedReviewer: "Claude",
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
      proposedReviewer: "Claude",
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
          merge_target: "dev",
          mergeTarget: "dev",
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
      mergeTarget: "dev",
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
      mergeTarget: "dev",
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
          merge_target: "dev",
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


describe("Management AI stream", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  });

  it("adapts done provider status and stops on DONE", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"meta","sessionId":"mgmt-chat-1","traceId":"trace-1","messageId":"mnl-1"}\n\n',
      'data: {"type":"delta","text":"Control mode is inactive"}\n\n',
      'data: {"type":"done","text":"Control mode is inactive","providerStatus":{"provider":"pantheon_bff","runtime":"management_nl_control_command_interceptor","status":"completed","used":true,"fallback":null},"auditLog":{"href":"/audit/1"},"conversation":{"href":"/conversation/1"}}\n\n',
      'data: [DONE]\n\n',
    ]));
    globalThis.fetch = fetchMock;

    const previews: string[] = [];
    const result = await streamManagementAi(
      { question: "/control status" },
      { onDelta: (_chunk, full) => previews.push(full) },
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(result.message);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bff.example.test/bff/management/nl/ask/stream");
    expect(result.answer).toBe("Control mode is inactive");
    expect(result.providerStatus.provider).toBe("pantheon_bff");
    expect(result.providerStatus.runtime).toBe("management_nl_control_command_interceptor");
    expect(result.auditLogHref).toBe("/audit/1");
    expect(result.conversationHref).toBe("/conversation/1");
    expect(previews.at(-1)).toBe("Control mode is inactive");
  });

  it("surfaces stream errors as provider degradation", async () => {
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
    globalThis.fetch = vi.fn().mockResolvedValue(streamResponse([
      'data: {"type":"meta","sessionId":"mgmt-chat-err","traceId":"trace-err"}\n\n',
      'data: {"type":"error","error_code":"OPENCLAW_RESPONSES_FAILED","message":"provider failed"}\n\n',
      'data: [DONE]\n\n',
    ]));

    const result = await streamManagementAi({ question: "?" });

    expect(result.kind).toBe("provider_degraded");
    if (result.kind !== "provider_degraded") throw new Error("expected provider_degraded");
    expect(result.sessionId).toBe("mgmt-chat-err");
    expect(result.providerStatus?.status).toBe("degraded");
    expect(result.providerStatus?.reasonCode).toBe("OPENCLAW_RESPONSES_FAILED");
    expect(result.message).toBe("provider failed");
  });
});
