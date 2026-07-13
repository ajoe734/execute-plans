import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TradingRoomWorkspaceProposal } from "@/lib/bff-v1/agora/tradingRoomTypes";

import { WorkspaceProposalPreview } from "./WorkspaceProposalPreview";

const widget = {
  id: "widget-full",
  widgetType: "candidate_funnel",
  title: "Full widget",
  purpose: "Show candidate status.",
  whyIncluded: "Required for monitoring.",
  dataSource: "agora.full",
  dataAvailability: "full",
  query: { filters: {} },
  chartSpec: {
    spec_version: "1.0",
    kind: "bar",
    encodings: {},
  },
  interactions: [],
  placement: { x: 0, y: 0, width: 4, height: 3, minWidth: 2, minHeight: 2 },
  minSize: { width: 2, height: 2 },
  maxSize: { width: 12, height: 6 },
  sensitivity: "user_private",
};

function wireProposal(): TradingRoomWorkspaceProposal {
  return {
    strategyId: "strategy-001",
    strategyVersion: "winner-branch-v4",
    proposalId: "proposal-001",
    generatedAt: "2026-07-13T12:00:00Z",
    status: "preview",
    rationale: "Generate the workspace.",
    dataAvailability: {
      status: "full",
      sources: [{ dataSource: "agora.missing", status: "missing" }],
    },
    views: [
      {
        id: "overview",
        title: "Overview",
        purpose: "Monitor the strategy.",
        order: 0,
        layoutTemplate: "overview",
        widgetCount: 2,
        dataAvailability: "partial",
        widgets: [
          widget,
          {
            ...widget,
            id: "widget-missing",
            title: "Missing widget",
            dataSource: "agora.missing",
            dataAvailability: undefined,
          },
        ],
      },
    ],
    warnings: [],
    personalizationApplied: { status: "not_applied", items: [] },
  } as unknown as TradingRoomWorkspaceProposal;
}

describe("WorkspaceProposalPreview data availability", () => {
  afterEach(cleanup);

  it("renders Pantheon full/partial/missing values without crashing StatusPill", () => {
    render(
      <WorkspaceProposalPreview onAccept={vi.fn()} proposal={wireProposal()} />,
    );

    expect(screen.getAllByText("完整")).toHaveLength(2);
    expect(screen.getByText("暫不可用")).toBeTruthy();
    expect(
      screen.getByText("Data availability: 1 full / 0 partial / 1 missing"),
    ).toBeTruthy();
  });
});
