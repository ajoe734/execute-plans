import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import en from "@/i18n/locales/en-US";
import { PolicyValidatorPanel } from "../governance/PolicyValidatorPanel";
import { ConstraintChecker } from "./ConstraintChecker";
import { MandatePanel } from "./MandatePanel";
import { RiskBudgetPanel } from "./RiskBudgetPanel";
import { StrategyPaperLiveTab } from "./StrategyPaperLiveTab";
import { adaptTradingPulseOverview, mgmt } from "@/lib/bff-v1/management";
import type { CapitalPool, Rebalance } from "@/lib/bff-v1";

vi.mock("@/platform/hooks", () => ({ useT: () => (key: string) =>
  key.split(".").reduce((value: any, part) => value?.[part], en) ?? key,
}));

const rebalance = (weights?: number[]) => ({
  id: "proposal", targetPoolId: "pool", proposedDelta: 0.2,
  lines: weights?.map((weight, index) => ({ strategyId: `s-${index}`, strategyName: `s-${index}`, currentWeight: 0, proposedWeight: weight, delta: weight })),
}) as Rebalance;
const pool = { id: "pool", currency: "USD", allocated: 1200, riskBudget: 0.08, riskPolicyRef: "policy-exact" } as CapitalPool;

function model(overrides: Record<string, unknown> = {}) {
  return adaptTradingPulseOverview({ data: {
    baseline_comparisons: [{
      strategy_id: "strategy-a", runtime_id: "runtime-b", runtime_binding_id: "binding-c", deployment_stage: "paper", status: "watch",
      paper_live_drift: { available: true, status: "watch", href: "/readback" },
      paper_baseline: { captured_at: "2026-10-05T10:00:00Z", metrics: { return_percent: 1.25 } },
      observed_state: { observed_at: "2026-10-05T11:00:00Z", metrics: { return_percent: -2.5 } },
      drift_groups: [{ group_id: "returns", label: "Returns", metrics: [{
        metric_id: "return_percent", baseline_value: 1.25, observed_value: -2.5, delta: -3.75, unit: "%", status: "watch",
      }] }],
      threshold_evaluation: { overall_status: "watch", summary: "Owner says watch, not a browser breach." },
      ...overrides,
    }],
  }, meta: { surfaces: { management_trading_pulse: { status: "ok", source: "service" } } } })!;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

describe("owner facts, using real panels and the real BFF normalizer", () => {
  it("does not synthesize policy verdicts from the approval id", () => {
    const { rerender } = render(<PolicyValidatorPanel approvalId="approval-one" />);
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<PolicyValidatorPanel approvalId="approval-two" />);
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.queryByText(/92%|3 routes|Passed|Validators running/)).not.toBeInTheDocument();
  });

  it("shows 20 percent for two ten-percent weights without claiming policy success", () => {
    render(<ConstraintChecker rebalance={rebalance([0.1, 0.1])} />);
    expect(screen.getByText("20.0%")).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
    expect(screen.getByText(/not policy validation/)).toBeInTheDocument();
    expect(screen.queryByText(/≤35%|≥−8%|<20%/)).not.toBeInTheDocument();
  });

  it("does not turn absent or invalid weights into zero or 100 percent", () => {
    const { rerender } = render(<ConstraintChecker rebalance={rebalance()} />);
    expect(screen.getAllByText("—")).toHaveLength(3);
    rerender(<ConstraintChecker rebalance={rebalance([Number.NaN])} />);
    expect(screen.getAllByText("—")).toHaveLength(3);
    rerender(<ConstraintChecker rebalance={rebalance([0])} />);
    expect(screen.getAllByText("0.0%")).toHaveLength(2);
  });

  it("shows actual pool identity and values without inventing mandate rules or risk splits", () => {
    const { rerender } = render(<><MandatePanel pool={pool} /><RiskBudgetPanel pool={pool} /></>);
    expect(screen.getByText("policy-exact")).toBeInTheDocument();
    expect(screen.getByText("8.00%")).toBeInTheDocument();
    expect(screen.queryByText("4.40%")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByText(/35%|Quarterly review cycle/)).not.toBeInTheDocument();
    rerender(<RiskBudgetPanel pool={{ ...pool, riskBudget: 0.03 }} />);
    expect(screen.getByText("3.00%")).toBeInTheDocument();
  });

  it("renders distinct strategy/runtime/binding identities and nonzero owner metrics", async () => {
    vi.spyOn(mgmt.tradingPulse, "getLiveOnly").mockResolvedValue(model());
    render(<StrategyPaperLiveTab strategyId="strategy-a" />);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("1.25")).toBeInTheDocument();
    expect(within(table).getByText("-2.5")).toBeInTheDocument();
    expect(within(table).getByText("-3.75")).toBeInTheDocument();
    expect(screen.getByText("runtime-b · binding-c")).toBeInTheDocument();
    expect(screen.getByText("Owner says watch, not a browser breach.")).toBeInTheDocument();
    expect(screen.queryByText(/150 bps|Point 1|No band breach/)).not.toBeInTheDocument();
  });

  it("rejects runtime id equality as a substitute for strategy identity", async () => {
    vi.spyOn(mgmt.tradingPulse, "getLiveOnly").mockResolvedValue(model({ strategy_id: null, runtime_id: "strategy-a" }));
    render(<StrategyPaperLiveTab strategyId="strategy-a" />);
    expect(await screen.findByText(/No owner comparison/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("preserves zero, missing values and absent owner threshold independently", async () => {
    vi.spyOn(mgmt.tradingPulse, "getLiveOnly").mockResolvedValue(model({
      paper_baseline: { metrics: { return_percent: 0 } }, observed_state: { metrics: { return_percent: null } },
      drift_groups: [], threshold_evaluation: null,
    }));
    render(<StrategyPaperLiveTab strategyId="strategy-a" />);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("0")).toBeInTheDocument();
    expect(within(table).getAllByText("—")).toHaveLength(2);
    expect(within(table).getByText("Not verified")).toBeInTheDocument();
  });

  it("normalizes camel-case snapshots without converting null or malformed metrics to zero", () => {
    const result = model({ paper_baseline: undefined, observed_state: undefined, drift_groups: undefined,
      paperBaseline: { metrics: { return_percent: 0, missing: null, invalid: "1.2", nonfinite: Infinity } },
      observedState: { metrics: { return_percent: 1.2 } },
      driftGroups: [],
    });
    expect(result.baselineComparisons[0].paperBaseline?.metrics).toEqual({ return_percent: 0, missing: null, invalid: null, nonfinite: null });
    expect(result.baselineComparisons[0].observedState?.metrics.return_percent).toBe(1.2);
  });

  it("uses an explicit strategy/runtime/binding relation for legacy comparisons", async () => {
    const result = model({ strategy_id: undefined });
    result.runtimeRows = [{ runtimeId: "runtime-b", runtimeBindingId: "binding-c", strategyId: "strategy-a", deploymentStage: "paper", metrics: {} }];
    vi.spyOn(mgmt.tradingPulse, "getLiveOnly").mockResolvedValue(result);
    render(<StrategyPaperLiveTab strategyId="strategy-a" />);
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("does not join a legacy comparison to a different binding of the runtime", async () => {
    const result = model({ strategy_id: undefined });
    result.runtimeRows = [{ runtimeId: "runtime-b", runtimeBindingId: "other-binding", strategyId: "strategy-a", deploymentStage: "paper", metrics: {} }];
    vi.spyOn(mgmt.tradingPulse, "getLiveOnly").mockResolvedValue(result);
    render(<StrategyPaperLiveTab strategyId="strategy-a" />);
    expect(await screen.findByText(/No owner comparison/)).toBeInTheDocument();
  });

  it("discards old results when switching strategy and reports unavailable requests", async () => {
    const read = vi.spyOn(mgmt.tradingPulse, "getLiveOnly").mockResolvedValueOnce(model()).mockRejectedValueOnce(new Error("unavailable"));
    const { rerender } = render(<StrategyPaperLiveTab strategyId="strategy-a" />);
    await screen.findByRole("table");
    rerender(<StrategyPaperLiveTab strategyId="strategy-new" />);
    expect(await screen.findByText(/No owner comparison/)).toBeInTheDocument();
    expect(screen.queryByText("runtime-b · binding-c")).not.toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
