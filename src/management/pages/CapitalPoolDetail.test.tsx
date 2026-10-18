import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { CapitalPool, Strategy } from "@/lib/bff-v1";
import type { ListEnvelope } from "@/lib/bff-v1";
import { normalizeCapitalPool } from "@/lib/bff-v1/capitalPools";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";
import { CapitalPoolDetail } from "./CapitalPoolDetail";

const mocks = vi.hoisted(() => ({
  capitalGet: vi.fn(),
  capitalList: vi.fn(),
  strategiesList: vi.fn(),
  rebalancesList: vi.fn(),
  approvalsList: vi.fn(),
  auditList: vi.fn(),
  personaFleetGet: vi.fn(),
  runActionSafe: vi.fn(),
}));

vi.mock("@/lib/bff-v1", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bff-v1")>();
  return {
    ...actual,
    bffV1: {
      ...actual.bffV1,
      capitalPools: { ...actual.bffV1.capitalPools, get: mocks.capitalGet },
      strategies: { ...actual.bffV1.strategies, list: mocks.strategiesList },
      rebalances: { ...actual.bffV1.rebalances, list: mocks.rebalancesList },
      approvals: { ...actual.bffV1.approvals, list: mocks.approvalsList },
      audit: { ...actual.bffV1.audit, list: mocks.auditList },
    },
    lists: {
      ...actual.lists,
      capitalPools: mocks.capitalList,
    },
    mgmt: {
      ...actual.mgmt,
      personaFleet: { ...actual.mgmt.personaFleet, get: mocks.personaFleetGet },
    },
    runActionSafe: mocks.runActionSafe,
  };
});

void i18n.changeLanguage("en-US");

const emptyEnvelope = (items: CapitalPool[] = []): ListEnvelope<CapitalPool> => ({
  items,
  cursor: {},
  pageSize: items.length,
  estimatedTotal: items.length,
  totalCountExact: true,
});

function renderDetail(id: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/management/capital/${encodeURIComponent(id)}`]}>
        <Routes>
          <Route path="/management/capital/:id" element={<CapitalPoolDetail />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("CapitalPoolDetail", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    mocks.capitalGet.mockReset();
    mocks.capitalList.mockReset();
    mocks.strategiesList.mockReset();
    mocks.rebalancesList.mockReset();
    mocks.approvalsList.mockReset();
    mocks.auditList.mockReset();
    mocks.personaFleetGet.mockReset();
    mocks.runActionSafe.mockReset();

    mocks.capitalList.mockResolvedValue(emptyEnvelope());
    mocks.strategiesList.mockResolvedValue([]);
    mocks.rebalancesList.mockResolvedValue([]);
    mocks.approvalsList.mockResolvedValue([]);
    mocks.auditList.mockResolvedValue([]);
    mocks.personaFleetGet.mockResolvedValue([]);
  });

  it("renders a ledger-derived paper pool detail when the BFF has no pool detail row", async () => {
    const ledgerId = "paper-ledger-persona-20260528-04688755";
    mocks.capitalGet.mockResolvedValue(undefined);
    mocks.personaFleetGet.mockResolvedValue([
      {
        personaId: "persona-20260528-04688755",
        personaName: "Crypto-Alt-Hunter",
        owner: "pantheon-dev-browser",
        capitalMode: "paper",
        paperCapitalPoolId: "pool-crypto-paper",
        paperLedgerId: ledgerId,
        runtimeId: "rt-paper-alt-hunter",
        health: "healthy",
        updatedAt: "2026-06-05T08:27:44Z",
      },
    ] as unknown as ManagementPersonaFleetRow[]);
    mocks.strategiesList.mockResolvedValue([
      {
        id: "strategy-crypto-alt",
        name: "Crypto Alt Strategy",
        owner: "pantheon-dev-browser",
        updatedAt: "2026-06-05T08:27:44Z",
        state: "approved",
        risk: "low",
        alpha: "crypto-alt",
        capitalPoolId: "pool-other",
        personaIds: ["persona-20260528-04688755"],
        pnl30d: 0,
        sharpe: 0,
        drawdown: 0,
      },
    ] satisfies Strategy[]);

    renderDetail(ledgerId);

    await screen.findByText(`${ledgerId} · 1 persona`);
    expect(screen.queryByText("Capital pool not found")).not.toBeInTheDocument();
    expect(screen.getAllByText(ledgerId).length).toBeGreaterThan(0);
    expect(mocks.capitalGet).toHaveBeenCalledWith(ledgerId);
    expect(mocks.capitalList).toHaveBeenCalledTimes(1);
    expect(mocks.strategiesList).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.personaFleetGet).toHaveBeenCalledTimes(2));
  });

  it("renders the sanitized Capital owner shape without synthetic zero, low risk, breach OK, or deployed state", async () => {
    const poolId = "c9f8b55d-e65b-4a76-be1a-77a9efaa60ef";
    mocks.capitalGet.mockResolvedValue(
      normalizeCapitalPool({
        id: poolId,
        name: "Default TWD Capital Pool",
        status: "active",
        currency: "TWD",
        budget: null,
        risk_policy_ref: null,
        bindings: [
          {
            role: "paper_owner",
            budget: null,
            status: "active",
            allowed_deployment_scope: "paper",
          },
        ],
      }),
    );
    mocks.personaFleetGet.mockResolvedValue([
      {
        personaId: "persona-20260711-f54c2879",
        personaName: "TW Paper Persona",
        capitalMode: "paper",
        paperCapitalPoolId: poolId,
        runtimeId: "openclaw-gateway-dev",
        status: "retired",
      },
    ] as unknown as ManagementPersonaFleetRow[]);

    renderDetail(poolId);

    await screen.findByText("Default TWD Capital Pool");
    expect(screen.getByText(`TWD · ${poolId}`)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.getByText("1 (paper_owner · paper · active)")).toBeInTheDocument();

    expect(screen.queryByText("Deployed")).not.toBeInTheDocument();
    expect(screen.queryByText("Low")).not.toBeInTheDocument();
    expect(screen.queryByText("TWD 0")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
  });

  it("preserves explicit numeric zero facts without inventing Low risk, Deployed state, or breach OK", async () => {
    const poolId = "pool-explicit-zero";
    mocks.capitalGet.mockResolvedValue(
      normalizeCapitalPool({
        id: poolId,
        name: "Explicit Zero Pool",
        status: "active",
        currency: "TWD",
        budget: 0,
        utilized: 0,
        risk_budget: 0,
      }),
    );

    renderDetail(poolId);

    await screen.findByText("Explicit Zero Pool");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.getAllByText("TWD 0")).toHaveLength(2);
    expect(screen.getAllByText("0.00%")).toHaveLength(2);

    expect(screen.queryByText("Deployed")).not.toBeInTheDocument();
    expect(screen.queryByText("Low")).not.toBeInTheDocument();
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
  });

  it("renders unavailable badges and placeholders when status and currency are missing or unknown", async () => {
    const poolId = "pool-unknown-status";
    mocks.capitalGet.mockResolvedValue(
      normalizeCapitalPool({
        pool_id: poolId,
        name: "Unverified Pool",
        status: "unknown_status",
      }),
    );

    renderDetail(poolId);

    await screen.findByText("Unverified Pool");
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.queryByText("Deployed")).not.toBeInTheDocument();
    expect(screen.queryByText("USD")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
  });
});
