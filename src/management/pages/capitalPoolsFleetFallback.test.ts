import { beforeEach, describe, expect, it, vi } from "vitest";
import { lists, mgmt } from "@/lib/bff-v1";
import type { ListEnvelope } from "@/lib/bff-v1";
import type { CapitalPool } from "@/lib/bff/types";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { capitalPoolBindingDetail, capitalPoolMatchesFocus, capitalPoolsWithFleetFallback } from "./capitalPoolsFleetFallback";

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

  it("keeps paper rows with only a generic capital_pool_id isolated by paper ledger", async () => {
    vi.mocked(lists.capitalPools).mockResolvedValue(emptyEnvelope());
    vi.mocked(mgmt.personaFleet.get).mockResolvedValue([
      {
        personaId: "persona-a",
        personaName: "Crypto A",
        owner: "pantheon-dev-browser",
        capitalMode: "paper",
        capitalPoolId: "pool-crypto-paper",
        paperLedgerId: "paper-ledger-persona-a",
        health: "healthy",
        updatedAt: "2026-06-03T08:27:44Z",
      },
      {
        personaId: "persona-b",
        personaName: "Crypto B",
        owner: "pantheon-dev-browser",
        capital_mode: "paper",
        capital_pool_id: "pool-crypto-paper",
        paper_ledger_id: "paper-ledger-persona-b",
        health: "healthy",
        updated_at: "2026-06-04T08:27:44Z",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    const env = await capitalPoolsWithFleetFallback();

    expect(env.items.map((item) => item.id)).toEqual([
      "paper-ledger-persona-a",
      "paper-ledger-persona-b",
    ]);
    expect(env.items).toHaveLength(2);
    expect(env.items).not.toContainEqual(expect.objectContaining({ id: "pool-crypto-paper" }));
    expect(env.items[0]).toMatchObject({
      personaCount: 1,
      personaNames: "Crypto A",
      bindingSummary: "Crypto A",
      capitalScope: "paper",
    });
    expect(env.items[1]).toMatchObject({
      personaCount: 1,
      personaNames: "Crypto B",
      bindingSummary: "Crypto B",
      capitalScope: "paper",
    });
    expect(capitalPoolBindingDetail(env.items[0])).not.toContain("paper pool pool-crypto-paper");
    expect(capitalPoolBindingDetail(env.items[1])).not.toContain("paper pool pool-crypto-paper");
  });

  it("keeps paper ledgers primary when multiple personas declare the same paper pool", async () => {
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
        personaName: "Crypto A",
        capitalMode: "paper",
        paperLedgerId: "paper-ledger-persona-a",
        paperCapitalPoolId: "pool-crypto-paper",
        runtimeId: "runtime-paper-a",
      },
      {
        personaId: "persona-b",
        personaName: "Crypto B",
        capitalMode: "paper",
        paperLedgerId: "paper-ledger-persona-b",
        paperCapitalPoolId: "pool-crypto-paper",
        runtimeId: "runtime-paper-b",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    const env = await capitalPoolsWithFleetFallback();

    expect(env.items.map((item) => item.id)).toEqual([
      "paper-ledger-persona-a",
      "paper-ledger-persona-b",
      "pool-crypto-paper",
    ]);
    expect(env.items[0]).toMatchObject({
      id: "paper-ledger-persona-a",
      personaCount: 1,
      personaNames: "Crypto A",
      bindingSummary: "Crypto A",
      capitalScope: "paper",
      fleetDerived: true,
    });
    expect(env.items[1]).toMatchObject({
      id: "paper-ledger-persona-b",
      personaCount: 1,
      personaNames: "Crypto B",
      bindingSummary: "Crypto B",
      capitalScope: "paper",
      fleetDerived: true,
    });
    expect(env.items[2]).toMatchObject({
      id: "pool-crypto-paper",
      name: "Canonical Crypto Pool",
      personaCount: 0,
      personaNames: "",
      bindingSummary: "Unbound",
      capitalScope: "paper",
    });
    expect(capitalPoolBindingDetail(env.items[0])).toContain("ledger paper-ledger-persona-a");
    expect(capitalPoolBindingDetail(env.items[0])).not.toContain("paper pool pool-crypto-paper");
    expect(capitalPoolBindingDetail(env.items[1])).toContain("ledger paper-ledger-persona-b");
    expect(capitalPoolBindingDetail(env.items[1])).not.toContain("paper pool pool-crypto-paper");
  });

  it("binds legacy paper capital pool rows by generated pool name", async () => {
    vi.mocked(lists.capitalPools).mockResolvedValue(emptyEnvelope([
      {
        id: "legacy-cron-scope-row",
        name: "Cron Scope Smoke 2 paper capital pool",
        owner: "capital-service",
        updatedAt: "2026-07-04T12:52:18Z",
        state: "approved",
        risk: "low",
        currency: "USD",
        allocated: Number.NaN,
        utilized: Number.NaN,
        riskBudget: Number.NaN,
      },
    ]));
    vi.mocked(mgmt.personaFleet.get).mockResolvedValue([
      {
        personaId: "persona-20260704-5d946ca4",
        personaName: "Cron Scope Smoke 2",
        capitalMode: "paper",
        paperLedgerId: "paper-ledger-persona-20260704-5d946ca4",
        legacyPaperCapitalPoolId: "paper-pool-persona-20260704-5d946ca4",
        runtimeId: "runtime-persona-20260704-5d946ca4-paper",
        state: "paper_running",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    const env = await capitalPoolsWithFleetFallback();

    expect(env.items).toHaveLength(1);
    expect(env.items[0]).toMatchObject({
      id: "legacy-cron-scope-row",
      name: "Cron Scope Smoke 2 paper capital pool",
      personaCount: 1,
      personaNames: "Cron Scope Smoke 2",
      bindingSummary: "Cron Scope Smoke 2",
      capitalScope: "paper",
    });
    expect(capitalPoolBindingDetail(env.items[0])).toContain("ledger paper-ledger-persona-20260704-5d946ca4");
    expect(capitalPoolBindingDetail(env.items[0])).not.toContain("paper pool paper-pool-persona-20260704-5d946ca4");
  });

  it("adds paper ledger rows when paper personas do not declare a capital pool", async () => {
    vi.mocked(lists.capitalPools).mockResolvedValue(emptyEnvelope());
    vi.mocked(mgmt.personaFleet.get).mockResolvedValue([
      {
        personaId: "persona-paper-a",
        personaName: "Paper A",
        owner: "pantheon-dev-browser",
        paperLedgerId: "paper-ledger-persona-paper-a",
        updatedAt: "2026-06-05T08:27:44Z",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    const env = await capitalPoolsWithFleetFallback();

    expect(env.items[0]).toMatchObject({
      id: "paper-ledger-persona-paper-a",
      name: "paper-ledger-persona-paper-a · 1 persona",
      owner: "pantheon-dev-browser",
      personaCount: 1,
      personaNames: "Paper A",
      fleetDerived: true,
    });
  });

  it("falls back to an explicit paper pool only when no paper ledger exists", async () => {
    vi.mocked(lists.capitalPools).mockResolvedValue(emptyEnvelope());
    vi.mocked(mgmt.personaFleet.get).mockResolvedValue([
      {
        personaId: "persona-shared-paper",
        personaName: "Shared Paper",
        owner: "pantheon-dev-browser",
        capitalMode: "paper",
        paperCapitalPoolId: "pool-explicit-shared-paper",
        updatedAt: "2026-06-05T08:27:44Z",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    const env = await capitalPoolsWithFleetFallback();

    expect(env.items).toHaveLength(1);
    expect(env.items[0]).toMatchObject({
      id: "pool-explicit-shared-paper",
      name: "Shared Paper paper capital pool",
      personaCount: 1,
      personaNames: "Shared Paper",
      bindingSummary: "Shared Paper",
      capitalScope: "paper",
      fleetDerived: true,
    });
    expect(capitalPoolBindingDetail(env.items[0])).toContain("paper pool pool-explicit-shared-paper");
  });
});

describe("capitalPoolMatchesFocus", () => {
  beforeEach(() => {
    vi.mocked(lists.capitalPools).mockReset();
    vi.mocked(mgmt.personaFleet.get).mockReset();
  });

  it("resolves deep links for ledger-derived paper pools", async () => {
    vi.mocked(lists.capitalPools).mockResolvedValue(emptyEnvelope());
    vi.mocked(mgmt.personaFleet.get).mockResolvedValue([
      {
        personaId: "persona-20260528-5937dea1",
        personaName: "TW-Index-Arbitrage",
        capitalMode: "paper",
        paperCapitalPoolId: "pool-tw-equity-paper",
        paperLedgerId: "paper-ledger-persona-20260528-5937dea1",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    const env = await capitalPoolsWithFleetFallback();
    const pool = env.items.find((item) => item.id === "paper-ledger-persona-20260528-5937dea1");
    expect(pool?.personaCount).toBe(1);
    if (!pool) throw new Error("expected enriched pool");

    expect(capitalPoolMatchesFocus(pool, "paper-ledger-persona-20260528-5937dea1")).toBe(true);
    expect(capitalPoolMatchesFocus(pool, "persona-20260528-5937dea1")).toBe(true);
    // Case/whitespace-insensitive, mirroring the pool lookup key normalization.
    expect(capitalPoolMatchesFocus(pool, "  PAPER-LEDGER-PERSONA-20260528-5937DEA1 ")).toBe(true);
    expect(capitalPoolMatchesFocus(pool, "pool-tw-equity-paper")).toBe(false);
    expect(capitalPoolMatchesFocus(pool, "pool-some-other")).toBe(false);
    expect(capitalPoolMatchesFocus(pool, "")).toBe(false);
  });
});
