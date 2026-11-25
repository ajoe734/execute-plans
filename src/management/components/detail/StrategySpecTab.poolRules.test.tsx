import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import { bffV1, type Strategy } from "@/lib/bff-v1";
import { StrategySpecTab } from "./StrategySpecTab";
import { POOL_ENVELOPE_RULE, POOL_MEMBER_RULE } from "./__fixtures__/poolRules";

const strategy = (rules: Strategy["rules"]) =>
  ({ id: "strategy-persona-06d4775a9b6a8f63b311", name: "s", alpha: "", state: "draft", rules }) as unknown as Strategy;
const renderTab = (rules: Strategy["rules"]) =>
  render(<MemoryRouter><StrategySpecTab strategy={strategy(rules)} /></MemoryRouter>);

describe("StrategySpecTab pool rules (FE-PERSONA-STRATEGY-VISIBILITY-20261119)", () => {
  beforeEach(async () => {
    vi.spyOn(bffV1.objectVersions, "forSubject").mockResolvedValue([]);
    await i18n.changeLanguage("zh-TW");
  });
  afterEach(cleanup);

  it("shows a pool_envelope as plain sentences in zh-TW and en-US with raw codes in tooltips, shows unknown codes as secondary text, and orders rollback_baseline last in a collapsed line", async () => {
    const { unmount } = renderTab([
      {
        registryId: "artifact-persona-paper-baseline-06d4775a9b6a8f63b311",
        version: "1.0.0",
        role: "rollback_baseline",
        strategyLogic: {
          kind: "close_to_close_momentum",
          positive_action: "HOLD",
          non_positive_action: "HOLD",
          lookback_parameter: "lookback_bars",
          threshold_parameter: "momentum_threshold",
        },
        parameters: {
          market: "TW",
          symbols: ["2330.TWSE"],
          bar_frequency: "1d",
          lookback_bars: 2,
          quantity_type: "SHARES",
          order_quantity: 0,
          momentum_threshold: 0,
        },
      },
      POOL_ENVELOPE_RULE,
      POOL_MEMBER_RULE,
    ]);
    const list = screen.getByTestId("strategy-rules-list");
    const ruleNodes = Array.from(list.children);
    expect(ruleNodes[0]).toHaveAttribute("data-testid", `strategy-rule-${POOL_ENVELOPE_RULE.registryId}`);
    expect(ruleNodes[1]).toHaveAttribute("data-testid", "strategy-rule-artifact-persona-paper-baseline-06d4775a9b6a8f63b311");
    expect(ruleNodes[1].tagName.toLowerCase()).toBe("details");
    expect(ruleNodes[1]).not.toHaveAttribute("open");

    const env = screen.getByTestId(`strategy-rule-${POOL_ENVELOPE_RULE.registryId}`);
    expect(within(env).getByText("策略池打包版")).toBeInTheDocument();
    const combo = within(env).getByTestId("strategy-rule-combination");
    expect(combo).toHaveTextContent("依成員風險權重加權合計訊號，並裁切於風險上限內");
    expect(combo).not.toHaveTextContent("clipped_weighted_sum_v1");
    expect(combo.querySelector('[title="clipped_weighted_sum_v1"]')).not.toBeNull();

    const limits = within(env).getByTestId("strategy-rule-risk-limits");
    expect(limits).toHaveTextContent("多空抵銷後的淨部位上限為 100%（1 倍）");
    expect(limits).toHaveTextContent("所有成員權重絕對值合計上限為 100%（1 倍）");
    expect(limits).not.toHaveTextContent("max_net_strength=1");
    expect(limits).not.toHaveTextContent("gross_weight_limit=1");
    expect(within(limits).getByTestId("strategy-rule-risk-limit-max_net_strength")).toHaveAttribute(
      "title",
      "max_net_strength=1",
    );
    expect(within(limits).getByTestId("strategy-rule-risk-limit-gross_weight_limit")).toHaveAttribute(
      "title",
      "gross_weight_limit=1",
    );
    expect(env.textContent).not.toContain("不支援的規則類型：persona_portfolio_v1");
    const m = within(env).getByTestId(`strategy-rule-member-${POOL_MEMBER_RULE.registryId}`);
    expect(m).toHaveTextContent("權重 1");
    expect(m).toHaveTextContent("2330.TWSE");
    expect(m).toHaveTextContent("買進 1 股");
    const unknown = within(env).getByTestId("strategy-rule-member-text-artifact-unknown-kind");
    expect(unknown).toHaveTextContent("stat_arb_pairs_zscore");
    expect(unknown).toHaveTextContent("window");
    unmount();

    await i18n.changeLanguage("en-US");
    renderTab([
      {
        ...POOL_ENVELOPE_RULE,
        combinationRule: "custom_rank_blend_v2",
        riskLimits: {
          max_net_strength: 1.0,
          gross_weight_limit: 1.0,
          max_sector_weight: 0.4,
        },
      },
    ]);
    const enEnv = screen.getByTestId(`strategy-rule-${POOL_ENVELOPE_RULE.registryId}`);
    expect(within(enEnv).getByTestId("strategy-rule-combination")).toHaveTextContent(
      "Unregistered combination rule",
    );
    expect(within(enEnv).getByTestId("strategy-rule-combination-unknown-code")).toHaveTextContent(
      "custom_rank_blend_v2",
    );
    expect(within(enEnv).getByTestId("strategy-rule-risk-limit-max_net_strength")).toHaveTextContent(
      "Net position after offsetting long and short is capped at 100% (1x)",
    );
    expect(within(enEnv).getByTestId("strategy-rule-risk-limit-gross_weight_limit")).toHaveTextContent(
      "Total absolute member weight is capped at 100% (1x)",
    );
    expect(within(enEnv).getByTestId("strategy-rule-risk-limit-unknown-max_sector_weight")).toHaveTextContent(
      "max_sector_weight=0.4",
    );
  });

  it("labels a pool_member as a pool member, never as the no-order rollback baseline", () => {
    renderTab([POOL_MEMBER_RULE]);
    const row = screen.getByTestId(`strategy-rule-${POOL_MEMBER_RULE.registryId}`);
    expect(within(row).getByText("策略池成員")).toBeInTheDocument();
    expect(row.textContent).not.toContain("不送單回滾基準");
  });
});
