import { beforeEach, describe, expect, it, vi } from "vitest";

import { lists, mgmt } from "@/lib/bff-v1";
import { runtimesWithFleetFallback } from "./runtimeFleetFallback";

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    lists: {
      ...actual.lists,
      runtimes: vi.fn(),
    },
    mgmt: {
      ...actual.mgmt,
      personaFleet: {
        ...actual.mgmt.personaFleet,
        get: vi.fn(),
      },
    },
  };
});

describe("runtimesWithFleetFallback", () => {
  beforeEach(() => {
    vi.mocked(lists.runtimes).mockReset();
    vi.mocked(mgmt.personaFleet.get).mockReset();
  });

  it("adds a fleet-declared runtime row when the runtime registry has no matching row", async () => {
    vi.mocked(lists.runtimes).mockResolvedValue({
      items: [],
      cursor: {},
      pageSize: 0,
      totalCountExact: true,
    });
    vi.mocked(mgmt.personaFleet.get).mockResolvedValue([
      {
        personaId: "persona-20260528-04688755",
        personaName: "Crypto-Alt-Hunter",
        owner: "pantheon-dev-browser",
        ooda: "Act",
        autonomy: "supervised",
        perfDelta: 0.182,
        humanNeeded: true,
        lastMutation: "2026-06-03",
        runtimeId: "runtime-crypto-paper",
        runtimeBindingId: "runtime-crypto-paper",
        deploymentStage: "paper",
        runtimeBinding: {
          id: "runtime-crypto-paper",
          runtimeId: "runtime-crypto-paper",
          state: "active",
          deploymentStage: "paper",
          health: "healthy",
        },
        runtimeHealth: { status: "healthy" },
      },
    ]);

    const result = await runtimesWithFleetFallback();

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "runtime-crypto-paper",
      name: "runtime-crypto-paper",
      runtimeId: "runtime-crypto-paper",
      runtimeBindingId: "runtime-crypto-paper",
      personaId: "persona-20260528-04688755",
      env: "paper",
      runtimeKind: "paper",
      status: "active",
      fleetDerived: true,
      personaName: "Crypto-Alt-Hunter",
    });
    expect(Number.isNaN(result.items[0].cpu)).toBe(true);
    expect(Number.isNaN(result.items[0].memory)).toBe(true);
    expect(Number.isNaN(result.items[0].latencyP95Ms)).toBe(true);
    expect(Number.isNaN(result.items[0].uptimePct)).toBe(true);
  });

  it("does not duplicate a runtime that already exists in the runtime registry", async () => {
    vi.mocked(lists.runtimes).mockResolvedValue({
      items: [
        {
          id: "runtime-crypto-paper",
          name: "runtime-crypto-paper",
          kind: "executor",
          env: "paper",
          status: "active",
          cpu: 0.1,
          memory: 0.2,
          latencyP95Ms: 20,
          uptimePct: 99,
          region: "ap-northeast-1",
          updatedAt: "2026-06-03",
          runtimeId: "runtime-crypto-paper",
          runtimeBindingId: "runtime-crypto-paper",
          personaId: "persona-20260528-04688755",
        },
      ],
      cursor: {},
      pageSize: 1,
      totalCountExact: true,
    });
    vi.mocked(mgmt.personaFleet.get).mockResolvedValue([
      {
        personaId: "persona-20260528-04688755",
        owner: "pantheon-dev-browser",
        ooda: "Act",
        autonomy: "supervised",
        perfDelta: 0.182,
        humanNeeded: true,
        lastMutation: "2026-06-03",
        runtimeId: "runtime-crypto-paper",
        runtimeBindingId: "runtime-crypto-paper",
        deploymentStage: "paper",
      },
    ]);

    const result = await runtimesWithFleetFallback();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].fleetDerived).toBeUndefined();
    expect(result.items[0].cpu).toBe(0.1);
  });
});
