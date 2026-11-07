import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StrategyDetail } from "./StrategyDetail";
import { bffV1, managementConsoleReads, type Artifact, type Strategy } from "@/lib/bff-v1";

const ID_298E = "298e138c136c9840b0e4";
const ID_59B2 = "59b2143dcecf205acbf1";
const STRATEGY_ID = `strategy-persona-${ID_298E}`;

const artifactRow = (id: string): Artifact =>
  ({ id, name: id, kind: "paper", version: "1", state: "approved", risk: "low", hash: "h", owner: "operator", updatedAt: "2026-11-06T00:00:00Z", source_kind: "persona" }) as unknown as Artifact;

const ART_298E = `artifact-persona-paper-${ID_298E}`;
const ART_298E_BASE = `artifact-persona-paper-baseline-${ID_298E}`;
const ART_59B2 = `artifact-persona-paper-${ID_59B2}`;

const lineageOk = {
  nodes: [
    { id: ART_298E_BASE, label: ART_298E_BASE, type: "Artifact", state: "draft" },
    { id: ART_298E, label: ART_298E, type: "Artifact", state: "approved" },
    { id: `persona-${ID_298E}`, label: "p", type: "Persona" },
  ],
  edges: [],
  meta: { status: "ok", source: "service_client", surfaces: {} },
  page_info: { total: 3, page_size: 3, has_more: false },
  has_more: false,
};

const click = (el: HTMLElement) => {
  fireEvent.pointerDown(el); fireEvent.mouseDown(el); fireEvent.pointerUp(el); fireEvent.mouseUp(el); fireEvent.click(el);
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/management/strategies/${STRATEGY_ID}`]}>
      <Routes><Route path="/management/strategies/:id" element={<StrategyDetail />} /></Routes>
    </MemoryRouter>,
  );

const strategy = (alpha: string): Strategy =>
  ({
    id: STRATEGY_ID, name: "青禾 2330 台股 Paper 學習 R2", alpha, state: "draft", risk: "medium", owner: "operator",
    capitalPoolId: "", personaIds: [], pnl30d: 0, sharpe: 0, drawdown: 0, updatedAt: "2026-11-06T00:00:00Z",
  }) as Strategy;

describe("StrategyDetail spec & artifacts truth (FE-STRATEGY-DETAIL-TRUTH-20261106)", () => {
  beforeEach(() => {
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue(strategy(""));
    vi.spyOn(bffV1.jobs, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.audit, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.approvals, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.alerts, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.incidents, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.research, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.evolution, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.watchers, "forSubject").mockResolvedValue([]);
    vi.spyOn(bffV1.decisionJournal, "forSubject").mockResolvedValue([]);
    vi.spyOn(managementConsoleReads, "lineage").mockResolvedValue(lineageOk);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("artifact tab lists only this strategy's lineage artifacts, never another strategy's", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([
      artifactRow(ART_59B2), artifactRow(ART_298E), artifactRow(ART_298E_BASE),
    ]);
    renderPage();
    click(await screen.findByRole("tab", { name: /^(Artifacts|Artifact)/i }));
    expect((await screen.findAllByText(ART_298E)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ART_298E_BASE).length).toBeGreaterThan(0);
    expect(screen.queryByText(ART_59B2)).not.toBeInTheDocument();
  });

  it("a failed artifact read shows unavailable and no rows", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockRejectedValue(new Error("boom"));
    renderPage();
    click(await screen.findByRole("tab", { name: /^(Artifacts|Artifact)/i }));
    expect(await screen.findByText(/Artifacts unavailable|Artifact 資料暫時無法取得/)).toBeInTheDocument();
    expect(screen.queryByText(ART_59B2)).not.toBeInTheDocument();
  });

  it("a failed lineage read shows unavailable and never falls back to other strategy rows", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([artifactRow(ART_59B2)]);
    vi.spyOn(managementConsoleReads, "lineage").mockRejectedValue(new Error("down"));
    renderPage();
    click(await screen.findByRole("tab", { name: /^(Artifacts|Artifact)/i }));
    expect(await screen.findByText(/Artifacts unavailable|Artifact 資料暫時無法取得/)).toBeInTheDocument();
    expect(screen.queryByText(ART_59B2)).not.toBeInTheDocument();
  });

  it("spec tab shows no hardcoded crypto spec and no 'Alpha no data' sentence when alpha is absent", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
    const { container } = renderPage();
    click(await screen.findByRole("tab", { name: /^(Spec|規格)/i }));
    await screen.findByText(/策略規格|Strategy specification/);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Top-50 perp|VWAP \/ 5min|BTC-PERP/);
    expect(text).not.toMatch(/Alpha (No data|無資料)/i);
    expect(text).not.toMatch(/Alpha 無資料 驅動|Alpha No data drives/i);
  });

  it("renders real spec values (TW / 2330.TWSE / benchmark) from data.spec for the persona strategy", async () => {
    vi.spyOn(bffV1.artifacts, "list").mockResolvedValue([]);
    vi.spyOn(bffV1.strategies, "get").mockResolvedValue({
      ...strategy("alpha-x"),
      spec: {
        spec_version: "1.0.0",
        market_scope: null,
        execution_profile: { execution_mode_hint: "paper" },
        evaluation_plan: { benchmark: "0050.TWSE" },
        metadata: { market: "TW", traits: { instruments: ["2330.TWSE"] } },
      },
    } as Strategy);
    const { container } = renderPage();
    click(await screen.findByRole("tab", { name: /^(Spec|規格)/i }));
    await screen.findByText(/策略規格|Strategy specification/);
    const text = container.textContent ?? "";
    expect(text).toContain("TW · 2330.TWSE");
    expect(text).toContain("paper");
    expect(text).toContain("0050.TWSE");
    expect(text).not.toMatch(/Top-50 perp|VWAP \/ 5min|BTC-PERP/);
  });
});
