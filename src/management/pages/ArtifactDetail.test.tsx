import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { ArtifactDetail } from "./ArtifactDetail";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderArtifactDetail(path: string) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/management/artifacts/:id" element={<ArtifactDetail />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </I18nextProvider>,
  );
}

describe("ArtifactDetail load states", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    vi.stubEnv("VITE_BFF_MODE", "live");
    vi.stubEnv("VITE_BFF_FALLBACK", "strict");
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    liveStatus._reset();
  });

  it("renders the not-found state instead of hanging on Loading when GET /bff/artifacts/undefined returns 404", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/artifacts/")) {
        return jsonResponse({ detail: "Research artifact not found" }, 404);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    renderArtifactDetail("/management/artifacts/undefined");

    expect(await screen.findByText("Artifact Not Found")).toBeInTheDocument();
    expect(
      screen.getByText("Artifact detail for ID undefined is not available in the live contract."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.queryByText("載入中…")).not.toBeInTheDocument();
  });

  it("renders the error state instead of not-found or Loading when GET /bff/artifacts/:id returns 500", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/artifacts/")) {
        return jsonResponse({ detail: "Artifact registry unavailable" }, 500);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    renderArtifactDetail("/management/artifacts/art-500");

    expect(await screen.findByText("Could Not Load Artifact")).toBeInTheDocument();
    expect(
      screen.getByText(/Failed to load Artifact detail for ID art-500: HTTP 500/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Artifact Not Found")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("renders a registry execution_bundle detail with real kind, version, state, risk, hash, and owner fields without fabricating 0 MB or format, and disables unsupported actions", async () => {
    const registryDetailPayload = {
      data: {
        id: "reg-bundle-001",
        registry_id: "reg-bundle-001",
        artifact_id: "art-exec-bundle-001",
        strategy_id: "strat-persona-bundle-001",
        artifact_type: "execution_bundle",
        version: "1.0.1",
        checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001",
        artifact_state: "approved",
        producer_run_id: "run-reg-001",
        approver: "gov-approver-alpha",
        approved_at: "2026-11-04T12:01:00Z",
        approval_decision_id: "dec-reg-001",
        created_at: "2026-11-04T11:01:00Z",
        updated_at: "2026-11-04T12:01:00Z",
        owner_tenant: "tenant_alpha",
        lineage: {
          source_run_ids: ["run-reg-001"],
          source_strategy_spec_id: "strat-persona-bundle-001",
        },
        storage_ref: {
          backend: "gcs",
          path: "gs://pantheon-artifacts/bundles/art-exec-bundle-001",
        },
        evaluation_summary: {
          sharpe: 1.81,
          max_drawdown: 0.08,
          risk_level: "low",
        },
        metadata: {
          bundle_format: "pantheon-exec-v1",
        },
        name: "strat-persona-bundle-001",
        kind: "execution_bundle",
        state: "approved",
        risk: "low",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001",
        owner: "gov-approver-alpha",
        updatedAt: "2026-11-04T12:01:00Z",
        source_kind: "registry",
      },
      meta: {
        snapshot_at: "2026-11-04T18:00:00Z",
        surfaces: {
          artifact_detail: { status: "ok", source: "registry" },
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/artifacts/reg-bundle-001")) {
        return jsonResponse(registryDetailPayload, 200);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    renderArtifactDetail("/management/artifacts/reg-bundle-001");

    expect((await screen.findAllByText("strat-persona-bundle-001")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("registry").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("execution_bundle").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1.0.1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/approved/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/low/i).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("gs://pantheon-artifacts/bundles/art-exec-bundle-001"),
    ).toBeInTheDocument();

    // Never fabricates 0 MB or derives Format from kind
    expect(screen.queryByText("0 MB")).not.toBeInTheDocument();
    expect(screen.queryByText("PDF")).not.toBeInTheDocument();
    expect(screen.queryByText("ONNX")).not.toBeInTheDocument();
    expect(screen.queryByText("Parquet")).not.toBeInTheDocument();
    expect(screen.queryByText("OCI")).not.toBeInTheDocument();
    expect(screen.getAllByText("No data").length).toBeGreaterThanOrEqual(2);

    // Unsupported Download and Retire actions are disabled
    const downloadBtn = screen.getByRole("button", { name: /download/i });
    const retireBtn = screen.getByRole("button", { name: /retire/i });
    expect(downloadBtn).toBeDisabled();
    expect(retireBtn).toBeDisabled();
  });

  it("renders a research_run_output detail showing no data for version, state, risk, size, and format, and does not offer unsupported compare or rollback actions", async () => {
    const researchDetailPayload = {
      data: {
        id: "res-run-output-001",
        artifact_id: "res-run-output-001",
        title: "Qlib Alpha158 Factor Evaluation Output",
        artifact_type: "factor_eval_report",
        status: "",
        checksum: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        author: "research-worker-qlib",
        created_by: "research-worker-qlib",
        created_at: "2026-11-04T17:00:00Z",
        updated_at: "2026-11-04T17:00:00Z",
        saved_output: {
          run_id: "run-qlib-eval-001",
          task_id: "task-qlib-eval-001",
          receipt_id: "rcpt-qlib-eval-001",
          checksum: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
          storage_ref: "gs://pantheon-research/runs/run-qlib-eval-001/output.json",
          provenance: { engine: "qlib", dataset: "Alpha158" },
          run_status: "succeeded",
          completed_at: "2026-11-04T17:00:00Z",
          artifact_family: "factor_eval_report",
          stage_type: "factor_eval",
          tenant_id: "tenant_alpha",
        },
        research_linkage: {
          run_id: "run-qlib-eval-001",
          task_id: "task-qlib-eval-001",
          stage_id: "factor_eval",
        },
        allowedActions: {
          canCompare: false,
        },
        compare_unavailable_reason: "Run output artifacts do not have versioned compare lineage.",
        lineage: {
          lineage_id: null,
          version_count: 0,
          versions: [],
        },
        name: "Qlib Alpha158 Factor Evaluation Output",
        kind: "factor_eval_report",
        version: null,
        state: null,
        risk: null,
        hash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        owner: "research-worker-qlib",
        updatedAt: "2026-11-04T17:00:00Z",
        source_kind: "research_run_output",
      },
      meta: {
        snapshot_at: "2026-11-04T18:00:00Z",
        surfaces: {
          artifact_detail: { status: "ok", source: "research" },
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/bff/artifacts/res-run-output-001")) {
        return jsonResponse(researchDetailPayload, 200);
      }
      return jsonResponse({ data: [], items: [] }, 200);
    });

    renderArtifactDetail("/management/artifacts/res-run-output-001");

    expect(
      await screen.findByText("Qlib Alpha158 Factor Evaluation Output"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("research_run_output").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("factor_eval_report").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(
        "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("run-qlib-eval-001")).toBeInTheDocument();
    expect(screen.getByText("task-qlib-eval-001")).toBeInTheDocument();
    expect(screen.getByText("rcpt-qlib-eval-001")).toBeInTheDocument();

    // Version, State, Risk, Size, Format all show No data; never vnull, 0 MB, or derived format
    expect(screen.queryByText(/vnull/i)).not.toBeInTheDocument();
    expect(screen.queryByText("0 MB")).not.toBeInTheDocument();
    expect(screen.queryByText("PDF")).not.toBeInTheDocument();
    expect(screen.getAllByText("No data").length).toBeGreaterThanOrEqual(5);

    const downloadBtn = screen.getByRole("button", { name: /download/i });
    const retireBtn = screen.getByRole("button", { name: /retire/i });
    expect(downloadBtn).toBeDisabled();
    expect(retireBtn).toBeDisabled();

    // Diff and Rollback tabs handle version: null cleanly and display owner unavailability reason
    fireEvent.mouseDown(screen.getByRole("tab", { name: /diff/i }));
    fireEvent.click(screen.getByRole("tab", { name: /diff/i }));
    expect(
      await screen.findByText("Run output artifacts do not have versioned compare lineage."),
    ).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /rollback/i }));
    fireEvent.click(screen.getByRole("tab", { name: /rollback/i }));
    expect(await screen.findByTestId("artifact-rollback-unavailable")).toHaveTextContent(
      "Run output artifacts do not have versioned compare lineage.",
    );
  });
});
