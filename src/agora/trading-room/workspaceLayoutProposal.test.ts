import { describe, expect, it } from "vitest";

import type {
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import { buildWorkspaceLayoutProposal } from "./workspaceLayoutProposal";

function widget(
  id: string,
  title: string,
  x: number,
  y: number,
  width: number,
  height = 2,
): TradingRoomWidgetSpec {
  return {
    id,
    widgetType: id.includes("risk") ? "risk_monitor" : id.includes("technical") ? "technical_indicator" : "market_summary",
    title,
    purpose: `Show ${title}.`,
    whyIncluded: `${title} supports the current decision.`,
    dataSource: "agora.test",
    query: { filters: {} },
    chartSpec: { spec_version: "1.0", kind: "metric", encodings: {} },
    interactions: [],
    placement: { x, y, width, height, minWidth: 2, minHeight: 1 },
    minSize: { width: 2, height: 1 },
    maxSize: { width: 12, height: 8 },
    sensitivity: "user_private",
  };
}

function fixtureViews(): TradingRoomViewSpec[] {
  return [
    {
      id: "overview",
      title: "Overview",
      purpose: "Monitor the desk.",
      order: 0,
      layoutTemplate: "three-up",
      widgetCount: 3,
      widgets: [
        widget("overview-summary", "Market summary", 0, 0, 4),
        widget("overview-risk", "Risk exposure", 4, 0, 4),
        widget("overview-technical", "RSI indicator", 8, 0, 4),
      ],
    },
    {
      id: "positions",
      title: "Positions",
      purpose: "Review positions and limits.",
      order: 1,
      layoutTemplate: "two-up",
      widgetCount: 2,
      widgets: [
        widget("positions-summary", "Position summary", 0, 0, 6),
        widget("positions-risk", "Drawdown risk", 6, 0, 6),
      ],
    },
  ];
}

describe("buildWorkspaceLayoutProposal", () => {
  it("keeps the source byte-identical and snapshots every view before and after", () => {
    const views = fixtureViews();
    const original = JSON.stringify(views);

    const proposal = buildWorkspaceLayoutProposal({
      instruction: "Put risk and exposure widgets first in every view",
      proposalId: "proposal-risk-first",
      views,
    });

    expect(proposal.validation.valid).toBe(true);
    expect(JSON.stringify(views)).toBe(original);
    expect(JSON.stringify(proposal.beforeViews)).toBe(original);
    expect(proposal.beforeViews).not.toBe(views);
    expect(proposal.beforeViews.map((view) => view.id)).toEqual(["overview", "positions"]);
    expect(proposal.afterViews.map((view) => view.id)).toEqual(["overview", "positions"]);
    expect(proposal.afterViews).toHaveLength(views.length);
    expect(proposal.changes.length).toBeGreaterThan(0);
    expect(proposal.operations).toHaveLength(proposal.changes.length);
    expect(proposal.changes.every((change) => change.before && change.after && change.operation)).toBe(true);
    expect(proposal.operations.every((operation) => operation.kind === "move_widget")).toBe(true);
  });

  it("builds a full-view single-column proposal with move and resize operations", () => {
    const proposal = buildWorkspaceLayoutProposal({
      instruction: "Stack every view in a single column",
      views: fixtureViews(),
    });

    expect(proposal.validation.valid).toBe(true);
    expect(proposal.afterViews).toHaveLength(2);
    for (const view of proposal.afterViews) {
      const visible = view.widgets.filter((entry) => entry.visible !== false);
      expect(visible.every((entry) => entry.placement.x === 0)).toBe(true);
      expect(visible.every((entry) => entry.placement.width === 12)).toBe(true);
    }
    expect(proposal.operations.some((operation) => operation.kind === "move_widget")).toBe(true);
    expect(proposal.operations.some((operation) => operation.kind === "resize_widget")).toBe(true);
  });

  it("rejects duplicate widget ids across views before producing operations", () => {
    const views = fixtureViews();
    views[1].widgets[0].id = views[0].widgets[0].id;

    const proposal = buildWorkspaceLayoutProposal({
      instruction: "Stack every view in a single column",
      views,
    });

    expect(proposal.validation.valid).toBe(false);
    expect(proposal.validation.errors.some((issue) => issue.code === "DUPLICATE_WIDGET_ID")).toBe(true);
    expect(proposal.changes).toEqual([]);
    expect(proposal.operations).toEqual([]);
  });

  it("fails closed for malformed or out-of-bounds placement data", () => {
    const views = fixtureViews();
    views[0].widgets[0].placement.x = 11;
    views[0].widgets[0].placement.width = 4;
    (views[1].widgets[0] as Partial<TradingRoomWidgetSpec>).minSize = undefined;

    expect(() => buildWorkspaceLayoutProposal({
      instruction: "Stack every view in a single column",
      views,
    })).not.toThrow();

    const proposal = buildWorkspaceLayoutProposal({
      instruction: "Stack every view in a single column",
      views,
    });
    expect(proposal.validation.valid).toBe(false);
    expect(proposal.validation.errors.some((issue) => issue.code === "OUT_OF_BOUNDS")).toBe(true);
    expect(proposal.validation.errors.some((issue) => issue.code === "INVALID_PLACEMENT")).toBe(true);
    expect(proposal.operations).toEqual([]);
  });

  it("fails closed for unsupported, ambiguous, and no-op instructions", () => {
    const unsupported = buildWorkspaceLayoutProposal({
      instruction: "Make the dashboard nicer",
      views: fixtureViews(),
    });
    const ambiguous = buildWorkspaceLayoutProposal({
      instruction: "Put risk first and stack everything in a single column",
      views: fixtureViews(),
    });
    const alreadyRiskFirst = fixtureViews();
    alreadyRiskFirst.forEach((view) => {
      view.widgets.sort((left, right) => Number(!left.id.includes("risk")) - Number(!right.id.includes("risk")));
      let x = 0;
      view.widgets.forEach((entry) => {
        entry.placement.x = x;
        x += entry.placement.width;
      });
    });
    const noOp = buildWorkspaceLayoutProposal({
      instruction: "Put risk and exposure widgets first in every view",
      views: alreadyRiskFirst,
    });

    expect(unsupported.validation.errors[0].code).toBe("UNSUPPORTED_INTENT");
    expect(ambiguous.validation.errors[0].code).toBe("AMBIGUOUS_INTENT");
    expect(noOp.validation.errors[0].code).toBe("NO_CHANGES");
    expect(unsupported.operations).toEqual([]);
    expect(ambiguous.operations).toEqual([]);
    expect(noOp.operations).toEqual([]);
  });
});
