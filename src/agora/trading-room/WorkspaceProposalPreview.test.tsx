import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TradingRoomWorkspaceProposal } from "@/lib/bff-v1/agora/tradingRoomTypes";
import { WorkspaceProposalPreview } from "./WorkspaceProposalPreview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options?.count !== undefined) return `${key}:${options.count}`;
      if (options?.title !== undefined) return `${key}:${options.title}`;
      if (options?.time !== undefined) return `${key}:${options.time}`;
      if (options?.complete !== undefined) {
        return `complete:${options.complete}, partial:${options.partial}, unavailable:${options.unavailable}`;
      }
      return key;
    },
  }),
}));

function sampleProposal(overrides: Partial<TradingRoomWorkspaceProposal> = {}): TradingRoomWorkspaceProposal {
  return {
    id: "prop-001",
    strategyId: "strat-001",
    strategyVersion: "v1.0",
    generatedAt: "2026-07-14T02:00:00Z",
    status: "preview",
    rationale: "Optimized multi-view layout for momentum breakout.",
    dataAvailability: {
      status: "complete",
      sources: [
        { dataSource: "agora.strategy.summary", status: "complete" },
        { dataSource: "agora.trading.events", status: "complete" },
      ],
    },
    personalizationApplied: {
      status: "applied",
      items: [{ key: "preferred_chart", value: "candlestick" }],
    },
    warnings: ["High turnover regime detected"],
    views: [
      {
        id: "view-overview",
        title: "Strategy Overview",
        purpose: "Real-time overview of strategy signals and status",
        order: 1,
        layoutTemplate: "grid",
        widgetCount: 1,
        dataAvailability: "complete",
        rationale: "Key telemetry at a glance",
        warnings: [],
        widgets: [
          {
            id: "widget-1",
            widgetType: "strategy_status_summary",
            title: "Strategy Status",
            purpose: "Overall health",
            whyIncluded: "Primary health monitor",
            dataSource: "agora.strategy.summary",
            dataAvailability: "complete",
            query: { filters: { strategy_id: "strat-001" }, limit: 20 },
            chartSpec: {
              spec_version: "1.0",
              kind: "metric",
              encodings: {
                y: { field: "status", type: "nominal" },
                label: { field: "strategy_id", type: "nominal" },
              },
            },
            interactions: [{ kind: "open_strategy" }],
            placement: { x: 0, y: 0, width: 4, height: 3, minWidth: 2, minHeight: 2 },
            minSize: { width: 2, height: 2 },
            maxSize: { width: 12, height: 8 },
            sensitivity: "user_private",
            visible: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("WorkspaceProposalPreview", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders typed proposal summary, rationale, availability and view cards", () => {
    const proposal = sampleProposal();
    render(
      <WorkspaceProposalPreview
        proposal={proposal}
        onAccept={vi.fn()}
      />
    );

    expect(screen.getByTestId("workspace-proposal-preview")).toBeTruthy();
    expect(screen.getByText("v1.0 - 操盤室提案")).toBeTruthy();
    expect(screen.getByText("Optimized multi-view layout for momentum breakout.")).toBeTruthy();
    expect(screen.getByTestId("workspace-proposal-view-view-overview")).toBeTruthy();
    expect(screen.getByText("Strategy Overview")).toBeTruthy();
    expect(screen.getByTestId("workspace-proposal-data-availability")).toBeTruthy();
    expect(screen.getByTestId("workspace-proposal-personalization")).toBeTruthy();
  });

  it("wires action buttons to provided callbacks", () => {
    const onAccept = vi.fn();
    const onAdjustLayout = vi.fn();
    const onBackToWorkshop = vi.fn();
    const onPreviewView = vi.fn();
    const onRegenerate = vi.fn();

    const proposal = sampleProposal();
    render(
      <WorkspaceProposalPreview
        proposal={proposal}
        onAccept={onAccept}
        onAdjustLayout={onAdjustLayout}
        onBackToWorkshop={onBackToWorkshop}
        onPreviewView={onPreviewView}
        onRegenerate={onRegenerate}
      />
    );

    fireEvent.click(screen.getByTestId("workspace-proposal-accept"));
    expect(onAccept).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("workspace-proposal-adjust-layout"));
    expect(onAdjustLayout).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("workspace-proposal-back"));
    expect(onBackToWorkshop).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("workspace-proposal-regenerate"));
    expect(onRegenerate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("workspace-proposal-preview-view-view-overview"));
    expect(onPreviewView).toHaveBeenCalledWith(proposal.views[0]);
  });

  it("surfaces validation issues and degraded source warnings honestly", () => {
    const degradedProposal = sampleProposal({
      dataAvailability: {
        status: "partial",
        sources: [
          { dataSource: "agora.strategy.summary", status: "complete" },
          { dataSource: "agora.trading.events", status: "unavailable" },
        ],
      },
      views: [
        {
          id: "view-invalid",
          title: "Degraded View",
          purpose: "Testing invalid widget",
          order: 1,
          layoutTemplate: "grid",
          widgetCount: 1,
          dataAvailability: "partial",
          widgets: [
            {
              id: "widget-invalid",
              widgetType: "unregistered_widget_type",
              title: "Invalid Widget",
              purpose: "bad type",
              whyIncluded: "test",
              dataSource: "agora.unknown.source",
              dataAvailability: "unavailable",
              query: { filters: {} },
              chartSpec: {
                spec_version: "1.0",
                kind: "metric",
                encodings: {},
              },
              interactions: [],
              placement: { x: 0, y: 0, width: 4, height: 3, minWidth: 2, minHeight: 2 },
              minSize: { width: 2, height: 2 },
              maxSize: { width: 12, height: 8 },
              sensitivity: "public_market",
              visible: true,
            },
          ],
        },
      ],
    });

    render(
      <WorkspaceProposalPreview
        proposal={degradedProposal}
        onAccept={vi.fn()}
      />
    );

    expect(screen.getByTestId("workspace-proposal-view-view-invalid-validation")).toBeTruthy();
    expect(screen.getByText("agora.tradingRoom.proposal.validationIssues:1")).toBeTruthy();
  });

  it("renders error alert and disables accept button when busy", () => {
    const proposal = sampleProposal();
    render(
      <WorkspaceProposalPreview
        busy
        error="Failed to accept workspace proposal"
        proposal={proposal}
        onAccept={vi.fn()}
      />
    );

    expect(screen.getByTestId("workspace-proposal-error").textContent).toContain("Failed to accept workspace proposal");
    expect((screen.getByTestId("workspace-proposal-accept") as HTMLButtonElement).disabled).toBe(true);
  });
});
