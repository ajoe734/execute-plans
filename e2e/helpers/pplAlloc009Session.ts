type JsonRecord = Record<string, unknown>;

export type PplAlloc009SessionBinding = {
  currentHeartbeatAt: string;
  currentPaperSessionId: string;
  detected: boolean;
  provisioningPaperSessionId: string;
  runtimeBindingId: string;
  runtimeId: string;
};

type PplAlloc009SessionInput = {
  currentMonitoringSession: JsonRecord;
  currentPaperSessionId: string;
  provisioningPaperSessionId: string;
  rankingSessionId: string;
  runtimeBindingId: string;
  runtimeId: string;
};

function requiredString(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`Missing ${label}`);
  return text;
}

export function bindPplAlloc009SessionRotation(
  input: PplAlloc009SessionInput,
): PplAlloc009SessionBinding {
  const currentPaperSessionId = requiredString(
    input.currentPaperSessionId,
    "current paper monitoring session id",
  );
  const provisioningPaperSessionId = requiredString(
    input.provisioningPaperSessionId,
    "provisioning paper monitoring session id",
  );
  const rankingSessionId = requiredString(
    input.rankingSessionId,
    "ranking paper monitoring session id",
  );
  const runtimeBindingId = requiredString(input.runtimeBindingId, "runtime binding id");
  const runtimeId = requiredString(input.runtimeId, "runtime id");
  const monitoring = input.currentMonitoringSession;

  if (requiredString(monitoring.session_id, "runtime-state session id") !== currentPaperSessionId) {
    throw new Error("Runtime-state session does not match the current eligibility session");
  }
  if (rankingSessionId !== currentPaperSessionId) {
    throw new Error("Ranking session does not match the current eligibility session");
  }
  if (requiredString(monitoring.runtime_id, "runtime-state runtime id") !== runtimeId) {
    throw new Error("Runtime-state session does not match the expected runtime");
  }
  if (
    requiredString(monitoring.runtime_binding_id, "runtime-state binding id")
    !== runtimeBindingId
  ) {
    throw new Error("Runtime-state session does not match the expected RuntimeBinding");
  }
  if (String(monitoring.status ?? "").trim().toLowerCase() !== "running") {
    throw new Error("Current paper monitoring session is not running");
  }
  if (monitoring.active !== true) {
    throw new Error("Current paper monitoring session is not active");
  }
  if (monitoring.ended_at !== null && monitoring.ended_at !== undefined && monitoring.ended_at !== "") {
    throw new Error("Current paper monitoring session is already ended");
  }
  const heartbeatStatus = String(monitoring.heartbeat_status ?? "").trim().toLowerCase();
  if (heartbeatStatus && heartbeatStatus !== "active") {
    throw new Error("Current paper monitoring session heartbeat is not active");
  }
  const currentHeartbeatAt = requiredString(
    monitoring.last_heartbeat_at,
    "current paper monitoring heartbeat",
  );

  return {
    currentHeartbeatAt,
    currentPaperSessionId,
    detected: currentPaperSessionId !== provisioningPaperSessionId,
    provisioningPaperSessionId,
    runtimeBindingId,
    runtimeId,
  };
}
