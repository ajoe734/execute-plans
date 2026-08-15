import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { LoopTruthView } from "./LoopTruthView";
import type { LoopHealthEntryDTO } from "@/lib/bff-v1/loopTruthTypes";

const sampleLoops: LoopHealthEntryDTO[] = [
  {
    id: "source_ingestion",
    loop_id: "source_ingestion",
    classification: "canonical",
    name: "Source Ingestion",
    current_maturity: "reconciled",
    target_maturity: "proven-live",
    read_model: "loop_health",
    controller: {
      status: "implemented",
      controller_name: "SourceIngestionController",
      desired_state_query: "source_ingestion_desired",
      actual_state_query: "source_ingestion_actual",
      restart_behavior: "restart_and_catchup",
      liveness_metric: "source_ingestion_heartbeat",
    },
    controller_health: {
      status: "healthy",
      source: "controller_store",
      evidence_basis: "controller_runtime",
      runtime_record_qualified: true,
    },
    operator_truth_source: {
      truth_level: "reconciled_live_proof",
      source: "controller_store",
      rank: 3,
      status: "present",
      label: "Reconciled Live Proof",
      accepted_as_live: true,
      is_live_truth: true,
      degraded: false,
    },
    truth_sources: [
      {
        truth_level: "seed_fixture",
        rank: 0,
        status: "present",
        source: "seed_fixture",
        label: "Seed / Fixture",
        accepted_as_live: false,
        operator_note: "Seed or fixture data is not live proof.",
      },
      {
        truth_level: "reconciled_live_proof",
        rank: 3,
        status: "present",
        source: "controller_store",
        label: "Reconciled Live Proof",
        accepted_as_live: true,
        operator_note: "Accepted as live liveness proof.",
      },
    ],
  },
  {
    id: "strategy_distillation",
    loop_id: "strategy_distillation",
    classification: "canonical",
    name: "Strategy Distillation",
    current_maturity: "api-only",
    target_maturity: "reconciled",
    read_model: "loop_health",
    controller: {
      status: "not_implemented",
    },
    controller_health: {
      status: "unobserved",
      source: "registry_metadata",
      evidence_basis: "missing",
      runtime_record_qualified: false,
    },
    operator_truth_source: {
      truth_level: "registry_metadata",
      source: "static_json_registry",
      rank: 1,
      status: "present",
      label: "Registry Metadata",
      accepted_as_live: false,
      is_live_truth: false,
      degraded: true,
      degraded_reason: "Registry metadata identifies the loop but does not prove runtime liveness.",
    },
    truth_sources: [
      {
        truth_level: "registry_metadata",
        rank: 1,
        status: "present",
        source: "static_json_registry",
        label: "Registry Metadata",
        accepted_as_live: false,
        operator_note: "Registry metadata identifies the loop but does not prove runtime liveness.",
      },
    ],
  },
];

describe("LoopTruthView Component", () => {
  it("renders canonical count and loop items correctly", () => {
    render(<LoopTruthView loops={sampleLoops} />);

    expect(screen.getByText("Canonical Loops")).toBeInTheDocument();
    expect(screen.getByText("Source Ingestion")).toBeInTheDocument();
    expect(screen.getByText("Strategy Distillation")).toBeInTheDocument();
  });

  it("visually distinguishes live proven loops from degraded loops", () => {
    render(<LoopTruthView loops={sampleLoops} />);

    expect(screen.getByText("Live Proven")).toBeInTheDocument();
    expect(screen.getByText("Degraded / Static")).toBeInTheDocument();
    expect(
      screen.getByText("Registry metadata identifies the loop but does not prove runtime liveness.")
    ).toBeInTheDocument();
  });

  it("renders explicit error banner and retry button when BFF fails without seed fallback", () => {
    const onRefresh = vi.fn();
    render(
      <LoopTruthView
        loops={[]}
        error={new Error("BFF 500 Connection Failed")}
        onRefresh={onRefresh}
      />
    );

    expect(
      screen.getByText("Failed to load Twelve Loop health truth from BFF")
    ).toBeInTheDocument();
    expect(screen.getByText("BFF 500 Connection Failed")).toBeInTheDocument();
    expect(screen.getByText("BFF Fetch Error")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: "Retry" });
    expect(retryBtn).toBeInTheDocument();
    retryBtn.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders exactly 12 canonical rows separately from composite overlays", () => {
    const twelveCanonical: LoopHealthEntryDTO[] = Array.from({ length: 12 }, (_, i) => ({
      id: `canonical_loop_${i + 1}`,
      loop_id: `canonical_loop_${i + 1}`,
      classification: "canonical",
      name: `Canonical Loop ${i + 1}`,
      current_maturity: "api-only",
      target_maturity: "proven-live",
      read_model: "loop_health",
      controller_health: {
        status: "unobserved",
        source: "registry_metadata",
      },
    }));

    const oneComposite: LoopHealthEntryDTO = {
      id: "composite_overlay_1",
      loop_id: "composite_overlay_1",
      classification: "composite_overlay",
      name: "Composite Overlay 1",
      current_maturity: "api-only",
      target_maturity: "proven-live",
      read_model: "loop_health",
      controller_health: {
        status: "unobserved",
        source: "registry_metadata",
      },
    };

    render(<LoopTruthView loops={[...twelveCanonical, oneComposite]} />);

    expect(screen.getByText("Canonical Loops")).toBeInTheDocument();
    // Direct assertions for counts
    const countDivs = screen.getAllByText((content, element) => element?.tagName.toLowerCase() === 'div' && element?.textContent === '12');
    expect(countDivs.length).toBe(2); // Canonical Loops count (12) and Non-Live/Degraded count (12)
    expect(screen.getByText("1 composite overlay")).toBeInTheDocument();
    expect(screen.getByText((content, element) => element?.tagName.toLowerCase() === 'button' && element?.textContent?.includes('All') === true)).toHaveTextContent("All (13)");
    expect(screen.getByText((content, element) => element?.tagName.toLowerCase() === 'button' && element?.textContent?.includes('Live Proven') === true)).toHaveTextContent("Live Proven (0)");
    expect(screen.getByText((content, element) => element?.tagName.toLowerCase() === 'button' && element?.textContent?.includes('Non-Live') === true)).toHaveTextContent("Non-Live / Degraded (12)");

    expect(screen.getByText("Canonical Loop 1")).toBeInTheDocument();
    expect(screen.getByText("Canonical Loop 12")).toBeInTheDocument();
    expect(screen.getByText("Composite Overlay 1")).toBeInTheDocument();
  });
});
