import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type { CapitalPool, Strategy } from "@/lib/bff/types";
import type { ListEnvelope } from "@/lib/bff-v1";
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
    bff: {
      ...actual.bff,
      capitalPools: { ...actual.bff.capitalPools, get: mocks.capitalGet },
      strategies: { ...actual.bff.strategies, list: mocks.strategiesList },
      rebalances: { ...actual.bff.rebalances, list: mocks.rebalancesList },
      approvals: { ...actual.bff.approvals, list: mocks.approvalsList },
      audit: { ...actual.bff.audit, list: mocks.auditList },
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
  beforeEach(() => {
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
});
