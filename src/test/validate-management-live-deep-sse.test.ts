import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type SsePhase = {
  duplicateIds: string[];
  error: string;
  heartbeats: number;
  lastEventId: string;
  messages: number;
  opened: boolean;
  phase: string;
  status: number;
};

type ClassifySseLongReconnect = (input: {
  durationMs?: number;
  first: SsePhase;
  second: SsePhase;
}) => {
  duplicateIds: string[];
  note: string;
  status: "fail" | "pass" | "warn";
};

const liveDeepModule = await import(
  pathToFileURL(
    resolve(process.cwd(), "scripts/validate-management-live-deep.mjs"),
  ).href
);
const classifySseLongReconnect =
  liveDeepModule.classifySseLongReconnect as ClassifySseLongReconnect;

function phase(overrides: Partial<SsePhase> = {}): SsePhase {
  return {
    duplicateIds: [],
    error: "",
    heartbeats: 0,
    lastEventId: "",
    messages: 0,
    opened: true,
    phase: "initial",
    status: 200,
    ...overrides,
  };
}

describe("management live deep SSE reconnect classification", () => {
  it("warns when reconnect cannot prove replay because no event id was observed", () => {
    const result = classifySseLongReconnect({
      durationMs: 65_000,
      first: phase({ lastEventId: "" }),
      second: phase({ opened: false, phase: "reconnect", status: 0 }),
    });

    expect(result.status).toBe("warn");
    expect(result.note).toContain("without an event id to replay");
    expect(result.duplicateIds).toEqual([]);
  });

  it("fails when reconnect with a Last-Event-ID does not open", () => {
    const result = classifySseLongReconnect({
      first: phase({ lastEventId: "event-1", messages: 1 }),
      second: phase({ opened: false, phase: "reconnect", status: 0 }),
    });

    expect(result.status).toBe("fail");
    expect(result.note).toContain("Last-Event-ID");
  });

  it("fails when duplicate event ids are observed", () => {
    const result = classifySseLongReconnect({
      first: phase({ duplicateIds: ["event-1"], lastEventId: "event-1" }),
      second: phase({ phase: "reconnect" }),
    });

    expect(result.status).toBe("fail");
    expect(result.duplicateIds).toEqual(["event-1"]);
  });
});
