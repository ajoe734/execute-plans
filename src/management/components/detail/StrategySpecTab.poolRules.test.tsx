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

  it("shows a pool_envelope as combination rule, risk limits and member list with weight and rule", () => {
    renderTab([POOL_ENVELOPE_RULE, POOL_MEMBER_RULE]);
    const env = screen.getByTestId(`strategy-rule-${POOL_ENVELOPE_RULE.registryId}`);
    expect(within(env).getByText("策略池打包版")).toBeInTheDocument();
    expect(within(env).getByTestId("strategy-rule-combination")).toHaveTextContent("clipped_weighted_sum_v1");
    expect(within(env).getByTestId("strategy-rule-risk-limits")).toHaveTextContent("gross_weight_limit=1");
    expect(env.textContent).not.toContain("不支援的規則類型：persona_portfolio_v1");
    const m = within(env).getByTestId(`strategy-rule-member-${POOL_MEMBER_RULE.registryId}`);
    expect(m).toHaveTextContent("權重 1");
    expect(m).toHaveTextContent("2330.TWSE");
    expect(m).toHaveTextContent("買進 1 股");
    const unknown = within(env).getByTestId("strategy-rule-member-text-artifact-unknown-kind");
    expect(unknown).toHaveTextContent("stat_arb_pairs_zscore");
    expect(unknown).toHaveTextContent("window");
  });

  it("labels a pool_member as a pool member, never as the no-order rollback baseline", () => {
    renderTab([POOL_MEMBER_RULE]);
    const row = screen.getByTestId(`strategy-rule-${POOL_MEMBER_RULE.registryId}`);
    expect(within(row).getByText("策略池成員")).toBeInTheDocument();
    expect(row.textContent).not.toContain("不送單回滾基準");
  });
});
