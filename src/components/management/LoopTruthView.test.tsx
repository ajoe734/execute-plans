import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { LoopTruthView } from "./LoopTruthView";
import type { LoopHealthEntryDTO } from "@/lib/bff-v1/loopTruthTypes";

const canonicalLoopIds = [
  "source_ingestion",
  "strategy_distillation",
  "alpha_replication",
  "persona_teaching",
  "agora_interaction_evidence",
  "human_imitation_shadow_evaluation",
  "consultation",
  "promotion_deployment",
  "capital_pool_execution",
  "telemetry_reconciliation",
  "evolution",
  "bff_health_monitoring",
] as const;

const sampleLoops: LoopHealthEntryDTO[] = [
  {
    id: "source_ingestion",
    loop_id: "source_ingestion",
    classification: "canonical",
    name: "Source Ingestion",
    read_model: "loop_health",
    runtime_maturity: {
      state: "reconciled",
      source: "controller_store",
      truth_level: "reconciled_live_proof",
      current_record_accepted: true,
      reason: "derived from the current accepted controller-runtime record",
    },
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
      current_record_accepted: true,
    },
    live_status: {
      is_live: false,
      is_reconciled: true,
      has_live_evidence: true,
      operator_truth: {
        truth_level: "reconciled_live_proof",
        source: "controller_store",
        rank: 3,
        status: "present",
        label: "Reconciled live truth",
        accepted_as_live: true,
        is_live_truth: true,
        degraded: false,
      },
    },
    evidence_packet: {
      id: "loop-health-source_ingestion",
      packet_id: "loop-health-source_ingestion",
      loop_id: "source_ingestion",
      source: "controller_store",
      registry_ref: "docs/deployment/loop-catalog.registry.json",
      highest_truth_level: "reconciled_live_proof",
      accepted_live_liveness: true,
      can_claim_reconciled: true,
      can_claim_proven_live: false,
      operator_truth: {
        truth_level: "reconciled_live_proof",
        source: "controller_store",
        rank: 3,
        status: "present",
        label: "Reconciled live truth",
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
          label: "Seed / fixture",
          accepted_as_live: false,
          operator_note: "Seed or fixture data is not live proof.",
        },
        {
          truth_level: "reconciled_live_proof",
          rank: 3,
          status: "present",
          source: "controller_store",
          label: "Reconciled live truth",
          accepted_as_live: true,
          operator_note: "Accepted as live liveness proof.",
        },
      ],
    },
  },
  {
    id: "strategy_distillation",
    loop_id: "strategy_distillation",
    classification: "canonical",
    name: "Strategy Distillation",
    read_model: "loop_health",
    runtime_maturity: {
      state: "unobserved",
      source: "missing",
      truth_level: "registry_metadata",
      current_record_accepted: false,
      reason: "record lacks accepted current controller-runtime provenance",
    },
    controller: {
      status: "not_implemented",
    },
    controller_health: {
      status: "unobserved",
      source: "registry_metadata",
      evidence_basis: "missing",
      runtime_record_qualified: false,
      current_record_accepted: false,
    },
    live_status: {
      is_live: false,
      is_reconciled: false,
      has_live_evidence: false,
      operator_truth: {
        truth_level: "registry_metadata",
        source: "static_json_registry",
        rank: 1,
        status: "present",
        label: "Registry metadata",
        accepted_as_live: false,
        is_live_truth: false,
        degraded: true,
        degraded_reason: "Registry metadata identifies the loop but does not prove runtime liveness.",
      },
    },
    evidence_packet: {
      id: "loop-health-strategy_distillation",
      packet_id: "loop-health-strategy_distillation",
      loop_id: "strategy_distillation",
      source: "bff_local_registry",
      registry_ref: "docs/deployment/loop-catalog.registry.json",
      highest_truth_level: "registry_metadata",
      accepted_live_liveness: false,
      can_claim_reconciled: false,
      can_claim_proven_live: false,
      operator_truth: {
        truth_level: "registry_metadata",
        source: "static_json_registry",
        rank: 1,
        status: "present",
        label: "Registry metadata",
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
          label: "Registry metadata",
          accepted_as_live: false,
          operator_note: "Registry metadata identifies the loop but does not prove runtime liveness.",
        },
      ],
    },
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
    expect(screen.getByText("reconciled")).toBeInTheDocument();
    expect(screen.getByText("unobserved")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show truth details for Source Ingestion" }));
    expect(screen.getByText("Truth Provenance Ladder")).toBeInTheDocument();
    expect(screen.getByText("Reconciled live truth")).toBeInTheDocument();
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
    const twelveCanonical: LoopHealthEntryDTO[] = canonicalLoopIds.map((loopId) => ({
      id: loopId,
      loop_id: loopId,
      classification: "canonical",
      name: loopId.replaceAll("_", " "),
      read_model: "loop_health",
      runtime_maturity: {
        state: "unobserved",
        source: "missing",
        truth_level: "registry_metadata",
        current_record_accepted: false,
        reason: "no accepted current controller-runtime record",
      },
      controller_health: {
        status: "unobserved",
        source: "registry_metadata",
      },
      live_status: {
        is_live: false,
        is_reconciled: false,
        has_live_evidence: false,
        operator_truth: {
          truth_level: "registry_metadata",
          source: "static_json_registry",
          rank: 1,
          status: "present",
          label: "Registry metadata",
          accepted_as_live: false,
          is_live_truth: false,
          degraded: true,
        },
      },
      evidence_packet: {
        id: `loop-health-${loopId}`,
        packet_id: `loop-health-${loopId}`,
        loop_id: loopId,
        source: "bff_local_registry",
        registry_ref: "docs/deployment/loop-catalog.registry.json",
        highest_truth_level: "registry_metadata",
        accepted_live_liveness: false,
        can_claim_reconciled: false,
        can_claim_proven_live: false,
        operator_truth: {
          truth_level: "registry_metadata",
          source: "static_json_registry",
          rank: 1,
          status: "present",
          label: "Registry metadata",
          accepted_as_live: false,
          is_live_truth: false,
          degraded: true,
        },
        truth_sources: [],
      },
    }));

    const oneComposite: LoopHealthEntryDTO = {
      id: "per_persona_ooda",
      loop_id: "per_persona_ooda",
      classification: "composite_overlay",
      name: "Per-persona OODA",
      read_model: "loop_health",
      runtime_maturity: {
        state: "unobserved",
        source: "missing",
        truth_level: "registry_metadata",
        current_record_accepted: false,
        reason: "composite overlay loops do not accept direct controller runtime records",
      },
      controller_health: {
        status: "unobserved",
        source: "registry_metadata",
      },
      live_status: {
        is_live: false,
        is_reconciled: false,
        has_live_evidence: false,
        operator_truth: {
          truth_level: "registry_metadata",
          source: "static_json_registry",
          rank: 1,
          status: "present",
          label: "Registry metadata",
          accepted_as_live: false,
          is_live_truth: false,
          degraded: true,
        },
      },
      evidence_packet: {
        id: "loop-health-per_persona_ooda",
        packet_id: "loop-health-per_persona_ooda",
        loop_id: "per_persona_ooda",
        source: "bff_local_registry",
        registry_ref: "docs/deployment/loop-catalog.registry.json",
        highest_truth_level: "registry_metadata",
        accepted_live_liveness: false,
        can_claim_reconciled: false,
        can_claim_proven_live: false,
        operator_truth: {
          truth_level: "registry_metadata",
          source: "static_json_registry",
          rank: 1,
          status: "present",
          label: "Registry metadata",
          accepted_as_live: false,
          is_live_truth: false,
          degraded: true,
        },
        truth_sources: [],
      },
    };

    render(<LoopTruthView loops={[...twelveCanonical, oneComposite]} />);

    expect(screen.getByText("Canonical Loops")).toBeInTheDocument();
    // Direct assertions for counts
    const countDivs = screen.getAllByText((content, element) => element?.tagName.toLowerCase() === 'div' && element?.textContent === '12');
    expect(countDivs.length).toBe(2); // Canonical Loops count (12) and Non-Live/Degraded count (12)
    expect(screen.getByText("1 composite overlay excluded")).toBeInTheDocument();
    expect(screen.getByText((content, element) => element?.tagName.toLowerCase() === 'button' && element?.textContent?.includes('All') === true)).toHaveTextContent("All (12)");
    expect(screen.getByText((content, element) => element?.tagName.toLowerCase() === 'button' && element?.textContent?.includes('Live Proven') === true)).toHaveTextContent("Live Proven (0)");
    expect(screen.getByText((content, element) => element?.tagName.toLowerCase() === 'button' && element?.textContent?.includes('Non-Live') === true)).toHaveTextContent("Non-Live / Degraded (12)");

    for (const loopId of canonicalLoopIds) {
      expect(screen.getByText(loopId, { selector: "code" })).toBeInTheDocument();
    }
    expect(screen.queryByText("per_persona_ooda", { selector: "code" })).not.toBeInTheDocument();
    expect(screen.queryByText("Per-persona OODA")).not.toBeInTheDocument();
  });
});
