import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgoraOperationalReadiness } from "@/lib/bff-v1/agora/operationalReadiness";

const mocks = vi.hoisted(() => ({
  getAgoraOperationalReadiness: vi.fn(),
}));

vi.mock("@/lib/bff-v1/agora/operationalReadiness", () => ({
  getAgoraOperationalReadiness: mocks.getAgoraOperationalReadiness,
}));

vi.mock("./oversight/dataSources/DataSourceControlCenter", () => ({
  DataSourceControlCenter: () => <div data-testid="data-source-control-center" />,
}));

import { DataSourcesPage } from "./DataSourcesPage";

function readiness(): AgoraOperationalReadiness {
  return {
    status: "ok",
    snapshot_at: "2026-08-27T06:02:00Z",
    capability: "agora.operational_readiness.v1",
    source: {
      snapshot_id: "snapshot-twse-001",
      source_instance_id: "source-twse-daily",
      source_timestamp: "2026-08-27T06:00:00Z",
      age_seconds: 120,
      sla_seconds: 86400,
      freshness: "fresh",
      desired_state: "enabled",
      observed_state: "healthy",
      last_failure: null,
    },
    signal_producer: {
      status: "ok",
      producer_id: "paper-signal-producer",
      active_binding: "binding-paper-twse",
      consumed_snapshot_id: "snapshot-twse-001",
      last_success_at: "2026-08-27T06:01:00Z",
      enqueued: 3,
      reason: "healthy",
    },
    surfaces: {
      signals: { status: "ok", count: 3, reason: "healthy", freshness: "fresh", cursor: "signal-3" },
      decision_events: { status: "ok", count: 1, reason: "healthy", freshness: "fresh", cursor: "event-1" },
      candidates: { status: "ok", count: 3, reason: "healthy", freshness: "fresh", cursor: "candidate-3" },
    },
    deployment: null,
  };
}

describe("DataSourcesPage", () => {
  beforeEach(() => {
    mocks.getAgoraOperationalReadiness.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the source that feeds the active snapshot with producer lineage and a read-only boundary", async () => {
    mocks.getAgoraOperationalReadiness.mockResolvedValue(readiness());
    render(<DataSourcesPage />);

    expect(await screen.findByTestId("data-sources-operational-readiness")).toHaveAttribute("data-readiness-status", "ok");
    expect(screen.getByTestId("data-source-readiness-snapshot")).toHaveTextContent("snapshot-twse-001");
    expect(screen.getByTestId("data-source-readiness-instance")).toHaveTextContent("source-twse-daily");
    expect(screen.getByTestId("data-source-readiness-freshness")).toHaveTextContent("fresh");
    expect(screen.getByTestId("data-source-readiness-producer")).toHaveTextContent("paper-signal-producer");
    expect(screen.getByTestId("data-source-readiness-surface-decision_events")).toHaveTextContent("1 items");
    expect(screen.getByText("No data-source, capital, or order mutation is exposed here.")).toBeInTheDocument();
  });

  it("does not invent source truth when the read-only projection cannot be fetched", async () => {
    mocks.getAgoraOperationalReadiness.mockRejectedValue(new Error("projection offline"));
    render(<DataSourcesPage />);

    expect(await screen.findByTestId("data-sources-operational-readiness-unavailable")).toHaveTextContent(
      "No source state is inferred from this failure.",
    );
  });
});
