import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PersonaStrategyPoolPanel } from "./PersonaStrategyPoolPanel";
import type { PersonaManagementEnvelope } from "@/lib/bff-v1/personas";

const CS = "sha256:" + "a".repeat(64);
const CS2 = "sha256:" + "b".repeat(64);
const ok = (source: string) => ({ status: "ok", source, reason: null });
const member = (ref: string, cs: string, stage: string, w: number, extra = {}) => ({
  artifact_ref: ref, checksum: cs, stage, risk_weight: w, baseline_ref: "approved-gate-baseline",
  joined_at: "2026-10-01T00:00:00Z", ...extra,
});
const v1 = { tenant_id: "t", persona_id: "p", pool_version: 1, digest: "d1", change_reason: "bootstrap",
  members: [member("artifact-momentum", CS, "active", 0.5), member("artifact-old", CS2, "active", 0.5)] };
const v2 = { tenant_id: "t", persona_id: "p", pool_version: 2, digest: "d2", change_reason: "reduce_risk",
  members: [member("artifact-momentum", CS, "active", 0.4),
    member("artifact-old", CS2, "removed", 0, { removed_at: "2026-11-01T00:00:00Z", removal_reason: "evolution_competition" })] };

const envelope = (over: Record<string, unknown> = {}, surfaces: Record<string, unknown> = {}): PersonaManagementEnvelope => ({
  data: {
    persona: { id: "p", lifecycle_state: "paper_running" },
    strategyPool: {
      current: v2, versions: [v1, v2],
      memberVirtualBooks: [
        { artifact_ref: "artifact-momentum", checksum: CS, stage: "active", risk_weight: 0.4,
          baseline_ref: "approved-gate-baseline", status: "ok", reason: null,
          book: { net_of_costs: { total_return: 0.0312, sharpe_ratio: 1.25, max_drawdown: 0.04, observation_count: 21, basis: "net" },
            baseline_comparison: { status: "compared", sharpe_delta: 0.2, drawdown_delta: -0.01 } } },
        { artifact_ref: "artifact-old", checksum: CS2, stage: "removed", risk_weight: 0,
          baseline_ref: "approved-gate-baseline", status: "unavailable", reason: "member_book_missing_incomplete_or_mismatched", book: null },
      ],
      health: { pool_version: 2, window_trading_days: 20,
        gross_utilisation: { status: "known", value: 0.4, reason: null },
        drawdown_utilisation: { status: "known", value: 0.2, reason: null },
        effective_bets: { status: "unknown", value: null, reason: "virtual_book_window_missing" },
        idle_day_share: { status: "known", value: 0, reason: null } },
      cycles: [{ packet_id: "cycle-current", status: "observing", updated_at: "2026-11-13T08:00:00Z",
        phase: "terminal", failure_reason: null, decisions: [{ kind: "no_action", status: "staged" }] }],
      openDemands: [{ demand_id: "dem-1", persona_id: "p", mandate: "Taiwan equities", short_measure: "health_inputs_unknown", status: "open" }],
      ...over,
    },
  },
  meta: { surfaces: {
    strategy_pool: ok("persona_owner"), strategy_pool_versions: ok("persona_owner"),
    member_virtual_books: { status: "unavailable", reason: "member_books_incomplete" },
    pool_health: ok("persona_cycle_owner"), autonomy_cycles: ok("persona_cycle_owner"), open_demands: ok("research_owner"),
    ...surfaces } as never },
});

describe("PersonaStrategyPoolPanel", () => {
  it("shows members, stage, weight, book vs baseline, health, cycles and demands", () => {
    render(<PersonaStrategyPoolPanel management={envelope()} />);
    const row = screen.getByTestId("pool-member-artifact-momentum");
    expect(within(row).getByText("active")).toBeTruthy();
    expect(within(row).getByText("0.40")).toBeTruthy();
    expect(within(row).getByText("3.1%")).toBeTruthy();
    expect(within(row).getByText(/ΔSharpe 0.20/)).toBeTruthy();
    expect(within(screen.getByTestId("pool-health")).getByText("0.400")).toBeTruthy();
    expect(screen.getByText(/virtual_book_window_missing/)).toBeTruthy();
    expect(screen.getByTestId("pool-cycles").textContent).toContain("cycle-current");
    expect(screen.getByTestId("pool-demands").textContent).toContain("dem-1");
    expect(screen.getByTestId("pool-persona-state").textContent).toBe("運行中");
  });

  it("keeps a removed member visible in history and shows its book as unavailable, not zeros", () => {
    render(<PersonaStrategyPoolPanel management={envelope()} />);
    expect(screen.getByTestId("pool-removed-2-artifact-old").textContent).toContain("evolution_competition");
    const removed = screen.getByTestId("pool-member-book-unavailable-artifact-old");
    expect(removed.textContent).toContain("無法讀取");
    expect(screen.getByTestId("pool-books-unavailable")).toBeTruthy();
  });

  it("renders explicit unavailable sections with owner reasons and no rows", () => {
    const env = envelope(
      { current: null, versions: null, health: null, cycles: null, openDemands: null, memberVirtualBooks: null },
      { strategy_pool: { status: "unavailable", reason: "owner_http_503" },
        pool_health: { status: "unavailable", reason: "latest_cycle_observation_missing" },
        autonomy_cycles: { status: "unavailable", reason: "cycle_owner_store_missing" },
        open_demands: { status: "unavailable", reason: "demands_payload_invalid" },
        strategy_pool_versions: { status: "unavailable", reason: "owner_http_503" } },
    );
    render(<PersonaStrategyPoolPanel management={env} />);
    expect(screen.getByTestId("pool-current-unavailable").textContent).toContain("owner_http_503");
    expect(screen.getByTestId("pool-health-unavailable").textContent).toContain("latest_cycle_observation_missing");
    expect(screen.getByTestId("pool-cycles-unavailable")).toBeTruthy();
    expect(screen.getByTestId("pool-demands-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("pool-member-artifact-momentum")).toBeNull();
    expect(screen.queryByTestId("pool-cycles")).toBeNull();
  });

  it("distinguishes empty lists from unavailable", () => {
    render(<PersonaStrategyPoolPanel management={envelope({ cycles: [], openDemands: [] })} />);
    expect(screen.getByTestId("pool-cycles-empty")).toBeTruthy();
    expect(screen.getByTestId("pool-demands-empty")).toBeTruthy();
  });

  it("is unavailable when the management read failed or lacks strategyPool", () => {
    const { unmount } = render(<PersonaStrategyPoolPanel management={null} managementUnavailable />);
    expect(screen.getByTestId("pool-unavailable-all")).toBeTruthy();
    unmount();
    render(<PersonaStrategyPoolPanel management={{ data: { persona: { id: "p" } } }} />);
    expect(screen.getByTestId("pool-unavailable-all")).toBeTruthy();
  });

  describe("member rules (FE-PERSONA-STRATEGY-VISIBILITY-20261119)", () => {
    const momentumRow = {
      artifact_ref: "artifact-momentum", checksum: CS, status: "ok", reason: null,
      strategy_id: "strategy-persona-06d4775a9b6a8f63b311", version: "1.0.0",
      strategy_logic: { kind: "close_to_close_momentum", positive_action: "BUY", non_positive_action: "SELL",
        lookback_parameter: "lookback_bars", threshold_parameter: "momentum_threshold" },
      parameters: { market: "TW", symbols: ["2330.TWSE"], bar_frequency: "1d", lookback_bars: 2,
        quantity_type: "SHARES", order_quantity: 1, momentum_threshold: 0.0 },
    };
    const unknownRow = {
      artifact_ref: "artifact-old", checksum: CS2, status: "ok", reason: null, strategy_id: "strategy-old",
      strategy_logic: { kind: "stat_arb_pairs_zscore" }, parameters: { window: 30, symbols: ["2330.TWSE", "2317.TWSE"] },
    };
    const renderIt = (env: PersonaManagementEnvelope) =>
      render(<MemoryRouter><PersonaStrategyPoolPanel management={env} /></MemoryRouter>);

    it("shows the momentum rule in plain language, symbols included, and links to the strategy page", () => {
      renderIt(envelope({ memberRules: [momentumRow, unknownRow] },
        { member_rules: { status: "ok", source: "registry_owner", reason: null } }));
      const text = screen.getByTestId("pool-member-rule-artifact-momentum").textContent ?? "";
      expect(text).toContain("2330.TWSE");
      expect(text).toContain("每根日K");
      expect(text).toContain("買進 1 股");
      expect(text).not.toContain("不送單回滾基準");
      expect(screen.getByTestId("pool-member-link-artifact-momentum").getAttribute("href"))
        .toBe("/management/strategies/strategy-persona-06d4775a9b6a8f63b311");
    });

    it("shows kind and every parameter for an unknown kind", () => {
      renderIt(envelope({ memberRules: [momentumRow, unknownRow] }));
      const text = screen.getByTestId("pool-member-rule-artifact-old").textContent ?? "";
      expect(text).toContain("stat_arb_pairs_zscore");
      expect(text).toContain("window");
      expect(text).toContain("30");
      expect(text).toContain("2317.TWSE");
    });

    it("shows 無法讀取 with the BFF reason for an unavailable row and for an absent row", () => {
      renderIt(envelope({ memberRules: [{ artifact_ref: "artifact-momentum", checksum: CS, status: "unavailable",
        reason: "registry_entry_checksum_mismatch" }] },
        { member_rules: { status: "ok", source: "registry_owner", reason: null } }));
      const bad = screen.getByTestId("pool-member-rule-unavailable-artifact-momentum");
      expect(bad.textContent).toContain("無法讀取");
      expect(bad.textContent).toContain("registry_entry_checksum_mismatch");
      expect(screen.getByTestId("pool-member-rule-unavailable-artifact-old").textContent).toContain("無法讀取");
      expect(screen.queryByTestId("pool-member-link-artifact-momentum")).toBeNull();
    });

    it("uses the member_rules surface reason when memberRules is null", () => {
      renderIt(envelope({ memberRules: null },
        { member_rules: { status: "unavailable", source: "registry_owner", reason: "registry_http_503" } }));
      expect(screen.getByTestId("pool-member-rule-unavailable-artifact-momentum").textContent).toContain("registry_http_503");
    });

    it("shows the observed pool version when it differs from the current version", () => {
      renderIt(envelope({}, {
        pool_health: { status: "ok", source: "persona_cycle_owner", observed_pool_version: 1 },
        member_virtual_books: { status: "ok", source: "persona_cycle_owner", observed_pool_version: 2 },
      }));
      expect(screen.getByTestId("observed-pool-version-pool_health").textContent).toContain("v1");
      expect(screen.queryByTestId("observed-pool-version-member_virtual_books")).toBeNull();
    });
  });
});
