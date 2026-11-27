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

import {
  DataSourcesPage,
  ageLabel,
  formatAgeVsSla,
  formatDuration,
  readinessExplanation,
} from "./DataSourcesPage";

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

  it("renders the source that feeds the active snapshot with producer lineage, human-readable SLA, and a read-only boundary", async () => {
    mocks.getAgoraOperationalReadiness.mockResolvedValue(readiness());
    render(<DataSourcesPage />);

    expect(await screen.findByTestId("data-sources-operational-readiness")).toHaveAttribute("data-readiness-status", "ok");
    expect(screen.getByTestId("data-source-readiness-snapshot")).toHaveTextContent("snapshot-twse-001");
    expect(screen.getByTestId("data-source-readiness-instance")).toHaveTextContent("source-twse-daily");
    expect(screen.getByTestId("data-source-readiness-freshness")).toHaveTextContent("fresh");
    expect(screen.getByTestId("data-source-readiness-age")).toHaveTextContent("2m old of 24h SLA");
    expect(screen.queryByText(/86400s/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("data-source-readiness-producer")).toHaveTextContent("paper-signal-producer");
    expect(screen.getByTestId("data-source-readiness-surface-decision_events")).toHaveTextContent("1 items");
    expect(screen.getByText("No data-source, capital, or order mutation is exposed here.")).toBeInTheDocument();
  });

  it("explains session-aware freshness when a market source is fresh with >24h wall-clock age on a non-trading day or holiday", async () => {
    const base = readiness();
    mocks.getAgoraOperationalReadiness.mockResolvedValue({
      ...base,
      snapshot_at: "2026-11-21T14:42:00Z",
      source: {
        ...base.source,
        source_timestamp: "2026-11-20T13:30:00Z",
        age_seconds: 90720,
        sla_seconds: 86400,
        freshness: "fresh",
      },
    });
    render(<DataSourcesPage />);

    expect(await screen.findByTestId("data-source-readiness-freshness")).toHaveTextContent("fresh");
    expect(screen.getByTestId("data-source-readiness-age")).toHaveTextContent(
      "25.2h wall-clock age · session-fresh across non-trading session/holiday (24h trading-day SLA)",
    );
    expect(screen.getByTestId("data-source-readiness-explanation")).toHaveTextContent(
      "The active source snapshot remains session-fresh from the latest market close. Its 25.2h wall-clock age exceeds the nominal 24h trading-day SLA because the market session or holiday calendar is closed.",
    );
    expect(screen.queryByText(/86400s/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/25\.2h old of/i)).not.toBeInTheDocument();
  });

  it("renders genuinely stale >24h sources as exceeding their human-readable SLA without claiming session-fresh carry", async () => {
    const base = readiness();
    mocks.getAgoraOperationalReadiness.mockResolvedValue({
      ...base,
      status: "stale",
      source: {
        ...base.source,
        age_seconds: 108000,
        sla_seconds: 86400,
        freshness: "stale",
        observed_state: "stale",
      },
    });
    render(<DataSourcesPage />);

    expect(await screen.findByTestId("data-sources-operational-readiness")).toHaveAttribute("data-readiness-status", "stale");
    expect(screen.getByTestId("data-source-readiness-freshness")).toHaveTextContent("stale");
    expect(screen.getByTestId("data-source-readiness-age")).toHaveTextContent("30h old of 24h SLA (exceeded)");
    expect(screen.getByTestId("data-source-readiness-explanation")).toHaveTextContent(
      "The active snapshot exceeded its source SLA. Dependent surfaces may be unavailable until a fresh snapshot arrives.",
    );
    expect(screen.queryByText(/session-fresh/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/86400s/i)).not.toBeInTheDocument();
  });

  it("formats age, SLA, and explicit freshness_reason / freshness_status consistently in helper functions", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(120)).toBe("2m");
    expect(formatDuration(1800)).toBe("30m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(86400)).toBe("24h");
    expect(formatDuration(90720)).toBe("25.2h");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();

    expect(formatAgeVsSla(null, 86400)).toBe("age not reported");
    expect(ageLabel(45, 3600, "fresh")).toBe("45s old of 1h SLA");
    expect(
      formatAgeVsSla({
        age_seconds: 90720,
        sla_seconds: 86400,
        freshness_status: "fresh",
        freshness_reason: "taiwan_weekend_holiday_carry",
      }),
    ).toBe(
      "25.2h wall-clock age · session-fresh across non-trading session/holiday (24h trading-day SLA · taiwan weekend holiday carry)",
    );

    const emptyFreshOverWeekend: AgoraOperationalReadiness = {
      ...readiness(),
      status: "empty_fresh",
      source: {
        ...readiness().source,
        age_seconds: 172800,
        sla_seconds: 86400,
        freshness: "empty_fresh",
      },
    };
    expect(readinessExplanation(emptyFreshOverWeekend)).toContain(
      "The source remains session-fresh from the latest market close (48h wall-clock age across a non-trading session or holiday against the 24h trading-day SLA)",
    );
  });

  it("does not invent source truth when the read-only projection cannot be fetched", async () => {
    mocks.getAgoraOperationalReadiness.mockRejectedValue(new Error("projection offline"));
    render(<DataSourcesPage />);

    expect(await screen.findByTestId("data-sources-operational-readiness-unavailable")).toHaveTextContent(
      "No source state is inferred from this failure.",
    );
  });
});
