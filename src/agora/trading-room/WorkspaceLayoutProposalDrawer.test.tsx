import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TradingRoomViewSpec,
  TradingRoomWidgetSpec,
} from "@/lib/bff-v1/agora/tradingRoomTypes";
import type { WorkspaceLayoutProposal } from "./workspaceLayoutProposal";

import { WorkspaceLayoutProposalDrawer } from "./WorkspaceLayoutProposalDrawer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: Record<string, unknown>) => {
      const fallback = String(options?.defaultValue ?? _key);
      return fallback.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) => String(options?.[name] ?? ""));
    },
  }),
}));

function widget(id: string, title: string, x: number, width: number): TradingRoomWidgetSpec {
  return {
    id,
    widgetType: id.includes("risk") ? "risk_monitor" : "market_summary",
    title,
    purpose: `Show ${title}.`,
    whyIncluded: `${title} supports the current decision.`,
    dataSource: "agora.test",
    query: { filters: {} },
    chartSpec: { spec_version: "1.0", kind: "metric", encodings: {} },
    interactions: [],
    placement: { x, y: 0, width, height: 2, minWidth: 2, minHeight: 1 },
    minSize: { width: 2, height: 1 },
    maxSize: { width: 12, height: 8 },
    sensitivity: "user_private",
  };
}

function views(): TradingRoomViewSpec[] {
  return [
    {
      id: "overview",
      title: "Overview",
      purpose: "Monitor the desk.",
      order: 0,
      layoutTemplate: "two-up",
      widgetCount: 2,
      widgets: [
        widget("overview-summary", "Market summary", 0, 6),
        widget("overview-risk", "Risk exposure", 6, 6),
      ],
    },
    {
      id: "evidence",
      title: "Evidence",
      purpose: "Review supporting evidence.",
      order: 1,
      layoutTemplate: "two-up",
      widgetCount: 2,
      widgets: [
        widget("evidence-summary", "Evidence summary", 0, 6),
        widget("evidence-risk", "Drawdown risk", 6, 6),
      ],
    },
  ];
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("WorkspaceLayoutProposalDrawer", () => {
  it("shows every before/after view and applies exactly once only after an explicit click", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    let finishApply: (() => void) | undefined;
    let appliedProposal: WorkspaceLayoutProposal | undefined;
    const onApply = vi.fn((nextProposal: WorkspaceLayoutProposal) => {
      appliedProposal = nextProposal;
      return new Promise<void>((resolve) => {
        finishApply = resolve;
      });
    });

    render(
      <WorkspaceLayoutProposalDrawer
        currentVersion={7}
        initialInstruction="Put risk and exposure widgets first in every view"
        onApply={onApply}
        onClose={vi.fn()}
        onReject={vi.fn()}
        open
        views={views()}
      />,
    );

    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("workspace-layout-proposal-generate"));

    expect(screen.getByTestId("workspace-layout-proposal-preview")).toBeInTheDocument();
    for (const viewId of ["overview", "evidence"]) {
      expect(screen.getByTestId(`workspace-layout-proposal-view-${viewId}`)).toBeInTheDocument();
      expect(screen.getByTestId(`workspace-layout-proposal-view-${viewId}-before`)).toBeInTheDocument();
      expect(screen.getByTestId(`workspace-layout-proposal-view-${viewId}-after`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("workspace-layout-proposal-version")).toHaveTextContent("v7 → v8");
    expect(onApply).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    const apply = screen.getByTestId("workspace-layout-proposal-apply");
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    fireEvent.click(apply);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(appliedProposal?.validation.valid).toBe(true);
    expect(appliedProposal?.operations.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      finishApply?.();
      await Promise.resolve();
    });
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("disables Apply when duplicate widget ids make the proposal invalid", () => {
    const duplicateViews = views();
    duplicateViews[1].widgets[0].id = duplicateViews[0].widgets[0].id;
    const onApply = vi.fn();

    render(
      <WorkspaceLayoutProposalDrawer
        currentVersion={2}
        initialInstruction="Stack every view in a single column"
        onApply={onApply}
        onClose={vi.fn()}
        onReject={vi.fn()}
        open
        views={duplicateViews}
      />,
    );

    fireEvent.click(screen.getByTestId("workspace-layout-proposal-generate"));

    expect(screen.getByTestId("workspace-layout-proposal-validation")).toHaveTextContent("Validation failed");
    expect(screen.getByTestId("workspace-layout-proposal-validation")).toHaveTextContent("must be unique");
    expect(screen.getByTestId("workspace-layout-proposal-apply")).toBeDisabled();
    fireEvent.click(screen.getByTestId("workspace-layout-proposal-apply"));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("rejects without applying and closes only after the rejection callback", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const onReject = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkspaceLayoutProposalDrawer
        currentVersion={4}
        initialInstruction="Put risk and exposure widgets first in every view"
        onApply={onApply}
        onClose={onClose}
        onReject={onReject}
        open
        views={views()}
      />,
    );

    fireEvent.click(screen.getByTestId("workspace-layout-proposal-generate"));
    fireEvent.click(screen.getByTestId("workspace-layout-proposal-reject"));

    await waitFor(() => expect(onReject).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onApply).not.toHaveBeenCalled();
  });
});
