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
        personaName: "Crypto Paper Persona",
        capitalMode: "paper",
        paperLedgerId: "paper-ledger-persona-a",
        paperCapitalPoolId: "pool-crypto-paper",
        runtimeId: "runtime-paper-a",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    const env = await capitalPoolsWithFleetFallback();

    expect(env.items).toHaveLength(1);
    expect(env.items[0]).toMatchObject({
      id: "pool-crypto-paper",
      name: "Canonical Crypto Pool",
      personaCount: 1,
      personaNames: "Crypto Paper Persona",
      bindingSummary: "Crypto Paper Persona",
      capitalScope: "paper",
    });
    expect(capitalPoolBindingDetail(env.items[0])).toContain("ledger paper-ledger-persona-a");
    expect(capitalPoolBindingDetail(env.items[0])).toContain("paper pool pool-crypto-paper");
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
    expect(capitalPoolBindingDetail(env.items[0])).toContain("paper pool paper-pool-persona-20260704-5d946ca4");
    expect(capitalPoolBindingDetail(env.items[0])).toContain("ledger paper-ledger-persona-20260704-5d946ca4");
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
});

describe("capitalPoolMatchesFocus", () => {
  beforeEach(() => {
    vi.mocked(lists.capitalPools).mockReset();
    vi.mocked(mgmt.personaFleet.get).mockReset();
  });

  it("resolves a deep link by pool id, a bound persona's ledger id, or persona id", async () => {
    // A persona bound to a shared pool. The persona fleet links to
    // /management/capital?pool=<per-persona ledger id> (personaFleetCapitalHref falls back to
    // paper_ledger_id when no capital pool id is declared on the row), so the focus matcher must
    // resolve that ledger id to this pool rather than showing the "no matching row" banner.
    vi.mocked(lists.capitalPools).mockResolvedValue(emptyEnvelope([
      {
        id: "pool-tw-equity-paper",
        name: "TW Equity paper pool",
        owner: "pantheon-dev-browser",
        updatedAt: "2026-06-05T08:00:00Z",
        state: "approved",
        risk: "low",
        currency: "TWD",
        allocated: Number.NaN,
        utilized: Number.NaN,
        riskBudget: Number.NaN,
      },
    ]));
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
    const pool = env.items.find((item) => item.id === "pool-tw-equity-paper");
    expect(pool?.personaCount).toBe(1);
    if (!pool) throw new Error("expected enriched pool");

    expect(capitalPoolMatchesFocus(pool, "pool-tw-equity-paper")).toBe(true);
    expect(capitalPoolMatchesFocus(pool, "paper-ledger-persona-20260528-5937dea1")).toBe(true);
    expect(capitalPoolMatchesFocus(pool, "persona-20260528-5937dea1")).toBe(true);
    // Case/whitespace-insensitive, mirroring the pool lookup key normalization.
    expect(capitalPoolMatchesFocus(pool, "  PAPER-LEDGER-PERSONA-20260528-5937DEA1 ")).toBe(true);
    expect(capitalPoolMatchesFocus(pool, "pool-some-other")).toBe(false);
    expect(capitalPoolMatchesFocus(pool, "")).toBe(false);
  });
});
