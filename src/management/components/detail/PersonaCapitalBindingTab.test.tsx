import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { bffV1, type CapitalPool, type Strategy } from "@/lib/bff-v1";
import { PersonaCapitalBindingTab } from "./PersonaCapitalBindingTab";

describe("PersonaCapitalBindingTab", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows pool-persona-paper-298e138c136c9840b0e4 and strategy-persona-298e138c136c9840b0e4 for persona-be19a1fac471247f2b2a across all pool pages", async () => {
    const pools: CapitalPool[] = Array.from({ length: 25 }, (_, index) => ({
      id:
        index === 24
          ? "pool-persona-paper-298e138c136c9840b0e4"
          : `pool-first-page-${index + 1}`,
      name:
        index === 24
          ? "Paper Pool 298e138c136c9840b0e4"
          : `First Page Pool ${index + 1}`,
      owner: "treasury",
      updatedAt: "2026-10-18T17:20:36.224810Z",
      state: "approved",
      risk: "low",
      currency: "USD",
      allocated: 2_500_000,
      utilized: 500_000,
      riskBudget: 0.05,
    }));

    const strategies: Strategy[] = [
      {
        id: "strategy-persona-298e138c136c9840b0e4",
        name: "青禾｜2330 台股 Paper 學習 R2 Paper Strategy",
        owner: "operator",
        updatedAt: "2026-10-18T17:20:36.224810Z",
        state: "approved",
        risk: "low",
        alpha: "alpha.tw.2330",
        capitalPoolId: "pool-persona-paper-298e138c136c9840b0e4",
        personaIds: ["persona-be19a1fac471247f2b2a"],
        pnl30d: null,
        sharpe: null,
        drawdown: null,
      },
    ];

    const poolsSpy = vi.spyOn(bffV1.capitalPools, "list").mockResolvedValue(pools);
    const stratSpy = vi.spyOn(bffV1.strategies, "listForPersona").mockResolvedValue(strategies);

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PersonaCapitalBindingTab personaId="persona-be19a1fac471247f2b2a" />
        </MemoryRouter>
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(poolsSpy).toHaveBeenCalledTimes(1);
      expect(stratSpy).toHaveBeenCalledWith("persona-be19a1fac471247f2b2a");
    });

    expect(await screen.findByText("pool-persona-paper-298e138c136c9840b0e4")).toBeInTheDocument();
    expect(screen.getByText(/strategy-persona-298e138c136c9840b0e4/)).toBeInTheDocument();
    expect("persona_id" in (strategies[0] as unknown as Record<string, unknown>)).toBe(false);
    expect("persona_ids" in (strategies[0] as unknown as Record<string, unknown>)).toBe(false);
    expect("personaId" in (strategies[0] as unknown as Record<string, unknown>)).toBe(false);
    expect("capital_pool_id" in (strategies[0] as unknown as Record<string, unknown>)).toBe(false);
  });

  it("renders Unavailable instead of No results found when capital pools or persona strategies read fails", async () => {
    vi.spyOn(bffV1.capitalPools, "list").mockRejectedValue(new Error("capital pools unavailable"));
    vi.spyOn(bffV1.strategies, "listForPersona").mockResolvedValue([]);

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PersonaCapitalBindingTab personaId="persona-be19a1fac471247f2b2a" />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/No results found/i)).not.toBeInTheDocument();
  });
});
