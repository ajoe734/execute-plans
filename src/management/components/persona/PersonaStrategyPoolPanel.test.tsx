import { render, screen, within } from "@testing-library/react";
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
});
