import { beforeEach, describe, expect, it, vi } from "vitest";
import { lists, mgmt } from "@/lib/bff-v1";
import type { ListEnvelope } from "@/lib/bff-v1";
import type { CapitalPool } from "@/lib/bff/types";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { capitalPoolsWithFleetFallback } from "./capitalPoolsFleetFallback";

vi.mock("@/lib/bff-v1", () => ({
  lists: {
    capitalPools: vi.fn(),
  },
  mgmt: {
    personaFleet: {
      get: vi.fn(),
    },
  },
}));

const emptyEnvelope = (items: CapitalPool[] = []): ListEnvelope<CapitalPool> => ({
  items,
  cursor: {},
  pageSize: items.length,
  estimatedTotal: items.length,
  totalCountExact: true,
});

describe("capitalPoolsWithFleetFallback", () => {
  beforeEach(() => {
    vi.mocked(lists.capitalPools).mockReset();
    vi.mocked(mgmt.personaFleet.get).mockReset();
  });

  it("adds fleet-declared capital pools that are missing from the capital pool list", async () => {
    vi.mocked(lists.capitalPools).mockResolvedValue(emptyEnvelope());
    vi.mocked(mgmt.personaFleet.get).mockResolvedValue([
      {
        personaId: "persona-a",
        personaName: "Crypto A",
        owner: "pantheon-dev-browser",
        capitalPoolId: "pool-crypto-paper",
        health: "healthy",
        updatedAt: "2026-06-03T08:27:44Z",
      },
      {
        personaId: "persona-b",
        personaName: "Crypto B",
        owner: "pantheon-dev-browser",
        capital_pool_id: "pool-crypto-paper",
        health: "healthy",
        updated_at: "2026-06-04T08:27:44Z",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    const env = await capitalPoolsWithFleetFallback();
    const pool = env.items.find((item) => item.id === "pool-crypto-paper");

    expect(pool).toMatchObject({
      id: "pool-crypto-paper",
      name: "pool-crypto-paper · 2 personas",
      owner: "pantheon-dev-browser",
      state: "approved",
      risk: "low",
      currency: "USDT",
      personaCount: 2,
      personaNames: "Crypto A, Crypto B",
      fleetDerived: true,
      updatedAt: "2026-06-04T08:27:44Z",
    });
    expect(Number.isNaN(pool?.allocated)).toBe(true);
    expect(Number.isNaN(pool?.utilized)).toBe(true);
    expect(Number.isNaN(pool?.riskBudget)).toBe(true);
  });

  it("does not duplicate a pool that already exists in the capital pool list", async () => {
    vi.mocked(lists.capitalPools).mockResolvedValue(emptyEnvelope([
      {
        id: "pool-crypto-paper",
        name: "Canonical Crypto Pool",
        owner: "capital-service",
        updatedAt: "2026-06-01T00:00:00Z",
        state: "approved",
        risk: "low",
        currency: "USDT",
        allocated: 1,
        utilized: 0,
        riskBudget: 0.1,
      },
    ]));
    vi.mocked(mgmt.personaFleet.get).mockResolvedValue([
      {
        personaId: "persona-a",
        capitalPoolId: "pool-crypto-paper",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    const env = await capitalPoolsWithFleetFallback();

    expect(env.items).toHaveLength(1);
    expect(env.items[0].name).toBe("Canonical Crypto Pool");
  });
});
