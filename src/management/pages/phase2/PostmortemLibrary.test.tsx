import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import i18n from "@/i18n";
import * as transport from "@/lib/bff-v1/client";
import { PostmortemLibraryPage } from "./PostmortemLibrary";

const REAL_POSTMORTEM_23_KEYS = [
  "action_items",
  "artifact_id",
  "artifact_version",
  "author_ids",
  "binding_id",
  "capital_pool_id",
  "contributing_factors",
  "created_at",
  "deployment_plan_id",
  "deployment_stage",
  "incident_cluster_id",
  "incident_evidence_summary",
  "incident_id",
  "lineage_ref",
  "persona_capital_binding_id",
  "postmortem_id",
  "root_cause",
  "runtime_id",
  "status",
  "telemetry_event_ids",
  "timeline",
  "title",
  "trace_id",
] as const;

function buildRealPostmortemRecord(
  idx: number,
  overrides: Partial<Record<(typeof REAL_POSTMORTEM_23_KEYS)[number], unknown>> = {},
) {
  const postmortemId = (overrides.postmortem_id as string) || `pm-20261104-${String(idx).padStart(4, "0")}`;
  const incidentId = (overrides.incident_id as string) || `inc-20261104-${String(idx).padStart(4, "0")}`;
  const createdAt = (overrides.created_at as string) || "2026-11-04T01:15:00Z";
  const record = {
    postmortem_id: postmortemId,
    incident_id: incidentId,
    title:
      (overrides.title as string)
      || `Postmortem draft: BFF downstream degradation: surface-${idx % 17} timeout (${postmortemId})`,
    status: (overrides.status as string) || "draft",
    created_at: createdAt,
    binding_id: (overrides.binding_id as string) || `bind-paper-${String(idx % 25).padStart(3, "0")}`,
    deployment_stage: (overrides.deployment_stage as string) || "paper",
    deployment_plan_id: (overrides.deployment_plan_id as string) || `plan-202611-${String(idx % 40).padStart(3, "0")}`,
    capital_pool_id: (overrides.capital_pool_id as string) || `pool-alpha-${String(idx % 5).padStart(2, "0")}`,
    persona_capital_binding_id:
      (overrides.persona_capital_binding_id as string) || `pcb-alpha-${String(idx % 25).padStart(3, "0")}`,
    artifact_id: (overrides.artifact_id as string) || `art-strat-${String(idx % 30).padStart(3, "0")}`,
    artifact_version: (overrides.artifact_version as string) || `v1.${idx % 10}.0`,
    runtime_id: (overrides.runtime_id as string) || `rt-paper-${String(idx % 25).padStart(3, "0")}`,
    trace_id: (overrides.trace_id as string) || `trace-inc-${String(idx).padStart(4, "0")}-9f8e7d6c5b4a`,
    telemetry_event_ids:
      (overrides.telemetry_event_ids as string[]) || [`tel-${String(idx).padStart(4, "0")}-a`, `tel-${String(idx).padStart(4, "0")}-b`],
    incident_evidence_summary:
      (overrides.incident_evidence_summary as string)
      || `Observed downstream degradation on surface-${idx % 17} with p99 latency > 5000ms`,
    lineage_ref: (overrides.lineage_ref as string) || `art-strat-${String(idx % 30).padStart(3, "0")}@v1.${idx % 10}.0`,
    incident_cluster_id:
      overrides.incident_cluster_id !== undefined ? overrides.incident_cluster_id : `cluster-deg-${String(idx % 12).padStart(2, "0")}`,
    root_cause:
      (overrides.root_cause as string)
      || `Draft generated from resolved incident ${incidentId}; root cause pending analysis.`,
    contributing_factors: (overrides.contributing_factors as string[]) || [
      "incident_severity=high",
      `incident_cluster_id=cluster-deg-${String(idx % 12).padStart(2, "0")}`,
    ],
    timeline: (overrides.timeline as Array<Record<string, unknown>>) || [
      { ts: createdAt, description: `Incident ${incidentId} opened`, actor: "incident-service" },
      { ts: createdAt, description: "Postmortem draft generated from resolved incident evidence", actor: "postmortem-service" },
    ],
    action_items: (overrides.action_items as string[]) || [
      "Complete root cause analysis",
      "Validate remediation against linked telemetry and reconciliation evidence",
    ],
    author_ids: (overrides.author_ids as string[]) || ["postmortem-draft-worker"],
  };

  expect(Object.keys(record).sort()).toEqual([...REAL_POSTMORTEM_23_KEYS].sort());
  return record;
}

function renderLibrary(initialEntry = "/management/postmortems") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/postmortems" element={<PostmortemLibraryPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("PostmortemLibraryPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("AC1: reads pages through page_size and page_token so every row is reachable and shows page_info.total", async () => {
    const page1Row = buildRealPostmortemRecord(1, {
      postmortem_id: "pm-page-1",
      title: "Postmortem draft: BFF downstream degradation: page-1-row",
    });
    const page2Row = buildRealPostmortemRecord(2, {
      postmortem_id: "pm-page-2",
      title: "Postmortem draft: BFF downstream degradation: page-2-row",
    });
    const page3Row = buildRealPostmortemRecord(3, {
      postmortem_id: "pm-page-3",
      title: "Postmortem analysis: execution slippage alert: page-3-row",
      status: "published",
    });

    const fetchSpy = vi.spyOn(transport, "bffFetch").mockImplementation(async (req) => {
      const token = req.query?.page_token;
      if (!token) {
        return {
          data: [page1Row],
          page_info: { total: 2027, page_size: 50, next_page_token: "50" },
          meta: {
            total: 2027,
            surfaces: { postmortems: { status: "ok", source: "service_client" } },
          },
        };
      }
      if (token === "50") {
        return {
          data: [page2Row],
          page_info: { total: 2027, page_size: 50, next_page_token: "100" },
          meta: {
            total: 2027,
            surfaces: { postmortems: { status: "ok", source: "service_client" } },
          },
        };
      }
      return {
        data: [page3Row],
        page_info: { total: 2027, page_size: 50, next_page_token: null },
        meta: {
          total: 2027,
          surfaces: { postmortems: { status: "ok", source: "service_client" } },
        },
      };
    });

    renderLibrary();

    expect(await screen.findByText("Postmortem draft: BFF downstream degradation: page-1-row")).toBeInTheDocument();
    expect(screen.getByTestId("postmortem-total-count")).toHaveTextContent("2027 postmortems");
    expect(fetchSpy).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/api/v1/postmortems",
      query: { page_size: 50 },
    });

    const prevBtn = screen.getByRole("button", { name: "Previous" });
    const nextBtn = screen.getByRole("button", { name: "Next" });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Advance to page 2
    fireEvent.click(nextBtn);
    expect(await screen.findByText("Postmortem draft: BFF downstream degradation: page-2-row")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenNthCalledWith(2, {
      method: "GET",
      path: "/api/v1/postmortems",
      query: { page_size: 50, page_token: "50" },
    });
    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Advance to page 3 (last page)
    fireEvent.click(nextBtn);
    expect(await screen.findByText("Postmortem analysis: execution slippage alert: page-3-row")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenNthCalledWith(3, {
      method: "GET",
      path: "/api/v1/postmortems",
      query: { page_size: 50, page_token: "100" },
    });
    expect(nextBtn).toBeDisabled();

    // Navigate back to page 2
    fireEvent.click(prevBtn);
    expect(await screen.findByText("Postmortem draft: BFF downstream degradation: page-2-row")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenNthCalledWith(4, {
      method: "GET",
      path: "/api/v1/postmortems",
      query: { page_size: 50, page_token: "50" },
    });
  });

  it("AC2: sends search q and status filter to BFF across all rows and renders localized draft status labels in en-US and zh-TW", async () => {
    const initialRow = buildRealPostmortemRecord(1, {
      postmortem_id: "pm-init-0001",
      title: "Postmortem draft: BFF downstream degradation: surface-1",
      status: "draft",
    });
    const deepRootCauseMatchRow = buildRealPostmortemRecord(1850, {
      postmortem_id: "pm-deep-1850",
      incident_id: "inc-deep-1850",
      title: "Postmortem draft: BFF downstream degradation: surface-14",
      status: "draft",
      root_cause: "Draft generated from resolved incident inc-deep-1850; training-session worker pool exhausted.",
    });

    const fetchSpy = vi.spyOn(transport, "bffFetch").mockImplementation(async (req) => {
      if (req.query?.q === "training-session" && req.query?.status === "draft") {
        return {
          data: [deepRootCauseMatchRow],
          page_info: { total: 1, page_size: 50, next_page_token: null },
          meta: {
            total: 1,
            surfaces: { postmortems: { status: "ok", source: "service_client" } },
          },
        };
      }
      if (req.query?.q === "training-session") {
        return {
          data: [deepRootCauseMatchRow],
          page_info: { total: 1, page_size: 50, next_page_token: null },
          meta: {
            total: 1,
            surfaces: { postmortems: { status: "ok", source: "service_client" } },
          },
        };
      }
      return {
        data: [initialRow],
        page_info: { total: 2027, page_size: 50, next_page_token: "50" },
        meta: {
          total: 2027,
          surfaces: { postmortems: { status: "ok", source: "service_client" } },
        },
      };
    });

    renderLibrary();

    expect(await screen.findByText("Postmortem draft: BFF downstream degradation: surface-1")).toBeInTheDocument();
    // Localized draft badge in en-US
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);

    // Search via BFF `q` parameter (matches row 1850 via root_cause on backend, not loaded on page 1)
    const searchInput = screen.getByPlaceholderText("Search title or incident…");
    fireEvent.change(searchInput, { target: { value: "training-session" } });

    expect(await screen.findByText("pm-deep-1850")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenLastCalledWith({
      method: "GET",
      path: "/api/v1/postmortems",
      query: { page_size: 50, q: "training-session" },
    });
    expect(screen.getByTestId("postmortem-total-count")).toHaveTextContent("1 postmortems");

    // Filter by status = draft sent to BFF as `status`
    const statusSelect = screen.getByLabelText("Filter status");
    fireEvent.change(statusSelect, { target: { value: "draft" } });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenLastCalledWith({
        method: "GET",
        path: "/api/v1/postmortems",
        query: { page_size: 50, q: "training-session", status: "draft" },
      });
    });

    // Switch to zh-TW and verify localized draft status label ("草稿")
    await act(async () => {
      await i18n.changeLanguage("zh-TW");
    });
    expect(await screen.findAllByText("草稿")).not.toHaveLength(0);
    expect(screen.getByTestId("postmortem-total-count")).toHaveTextContent("共 1 筆事後檢討");
  });

  it("AC3: reads meta.surfaces.postmortems and shows the unavailable banner without ever showing the no postmortems message", async () => {
    vi.spyOn(transport, "bffFetch").mockResolvedValueOnce({
      data: [],
      page_info: { total: 0, page_size: 50, next_page_token: null },
      meta: {
        total: 0,
        staleness: null,
        surfaces: {
          postmortems: {
            status: "unavailable",
            source: "unavailable",
          },
        },
      },
    });

    renderLibrary();

    const banner = await screen.findByTestId("postmortem-surface-banner");
    expect(banner).toHaveTextContent("Postmortem surface unavailable · unavailable");
    expect(screen.queryByText(/No canonical postmortems recorded/i)).not.toBeInTheDocument();
  });

  it("AC4: shows a draft with pending root cause as a draft and opens the detail sheet by postmortem_id using the real 23-key record shape", async () => {
    const trainingSessionDraft = buildRealPostmortemRecord(1, {
      postmortem_id: "pm-inc-training-session-001",
      incident_id: "inc-training-session-001",
      title: "Postmortem draft: BFF downstream degradation: training-session",
      status: "draft",
      root_cause: "Draft generated from resolved incident inc-training-session-001; root cause pending analysis.",
      author_ids: ["postmortem-draft-worker"],
    });

    const fetchSpy = vi.spyOn(transport, "bffFetch")
      .mockResolvedValueOnce({
        data: [trainingSessionDraft],
        page_info: { total: 2027, page_size: 50, next_page_token: "50" },
        meta: {
          total: 2027,
          surfaces: { postmortems: { status: "ok", source: "service_client" } },
        },
      })
      .mockResolvedValueOnce({
        data: trainingSessionDraft,
        meta: { staleness: null },
      });

    renderLibrary();

    const titleCell = await screen.findByText("Postmortem draft: BFF downstream degradation: training-session");
    expect(titleCell).toBeInTheDocument();
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);

    fireEvent.click(titleCell);

    expect(
      await screen.findByText("Draft generated from resolved incident inc-training-session-001; root cause pending analysis."),
    ).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenNthCalledWith(2, {
      method: "GET",
      path: "/api/v1/postmortems/pm-inc-training-session-001",
    });
    expect(screen.getByText(/Complete root cause analysis/)).toBeInTheDocument();
  });
});
