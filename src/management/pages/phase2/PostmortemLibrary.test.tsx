import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("FE-MGMT-CATALOG-LEGIBILITY: a draft shows its created time labelled Created (never as closed) and badges do not wrap", async () => {
    const row = buildRealPostmortemRecord(1, {
      postmortem_id: "pm-infra-bff-1c619cdd05621fa6fabe2316",
      status: "draft",
      created_at: "2026-11-05T17:25:40Z",
    });
    vi.spyOn(transport, "bffFetch").mockResolvedValue({
      data: [{ ...row, published_at: null }],
      page_info: { total: 1, page_size: 50, next_page_token: null },
      meta: { total: 1, surfaces: { postmortems: { status: "ok", source: "service_client" } } },
    } as never);

    renderLibrary();

    const idCell = await screen.findByText("pm-infra-bff-1c619cdd05621fa6fabe2316");
    const tr = idCell.closest("tr")!;
    const time = tr.querySelector("[data-time-kind]")!;
    expect(time.getAttribute("data-time-kind")).toBe("created");
    expect(time.textContent).toContain("Created");
    expect(screen.queryByText("Resolved")).not.toBeInTheDocument();
    const badge = within(tr).getByText("Draft");
    expect(badge.className).toContain("whitespace-nowrap");
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

    expect(await screen.findByText("Downstream service degradation")).toBeInTheDocument();
    expect(screen.getByTestId("postmortem-secondary-context")).toHaveTextContent("page-1-row");
    expect(screen.queryByText(/^Postmortem draft:/i)).not.toBeInTheDocument();
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
    expect(await screen.findByText("page-2-row")).toBeInTheDocument();
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
    expect(await screen.findByText("page-2-row")).toBeInTheDocument();
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

    expect(await screen.findByText("Downstream service degradation")).toBeInTheDocument();
    expect(screen.getByTestId("postmortem-secondary-context")).toHaveTextContent("surface-1");
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
    expect(screen.queryByText(/No canonical postmortems recorded|No postmortems recorded/i)).not.toBeInTheDocument();
  });

  it("AC4: shows a draft with pending root cause in plain words without machine sentence, links to incident, keeps key=value text in a collapsed technical section, translates labels, and states drafts have no review flow yet", async () => {
    const trainingSessionDraft = buildRealPostmortemRecord(1, {
      postmortem_id: "pm-inc-training-session-001",
      incident_id: "inc-training-session-001",
      title: "Postmortem draft: BFF downstream degradation: training-session",
      status: "draft",
      deployment_stage: "paper",
      incident_evidence_summary: "non_trading_infrastructure_incident=true downstream degradation on training-session",
      root_cause: "Draft generated from resolved incident inc-training-session-001; root cause pending analysis.",
      contributing_factors: [
        "incident_severity=high",
        "incident_cluster_id=cluster-deg-01",
        "incident_evidence_summary=non_trading_infrastructure_incident=true downstream degradation on training-session",
      ],
      action_items: [
        "Complete root cause analysis",
        "Validate remediation against linked telemetry and reconciliation evidence",
      ],
      author_ids: ["postmortem-draft-worker"],
    });

    const fetchSpy = vi.spyOn(transport, "bffFetch")
      .mockResolvedValueOnce({
        data: [trainingSessionDraft],
        page_info: { total: 103, page_size: 50, next_page_token: "50" },
        meta: {
          total: 103,
          hidden_infrastructure_count: 5355,
          surfaces: { postmortems: { status: "ok", source: "service_client" } },
        },
      })
      .mockResolvedValueOnce({
        data: trainingSessionDraft,
        meta: { staleness: null },
      });

    renderLibrary();

    // Plain localized title without "Postmortem draft:" prefix and with raw service id in secondary text
    const titleCell = await screen.findByText("Downstream service degradation: Training session");
    expect(titleCell).toBeInTheDocument();
    expect(screen.queryByText(/^Postmortem draft:/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);

    // Secondary IDs and link to incident
    expect(screen.getByTestId("postmortem-secondary-id")).toHaveTextContent("pm-inc-training-session-001");
    expect(screen.getByTestId("postmortem-secondary-context")).toHaveTextContent("training-session");
    expect(screen.getByTestId("postmortem-secondary-incident-id")).toHaveTextContent("inc-training-session-001");
    const incidentLink = screen.getByTestId("postmortem-incident-link");
    expect(incidentLink).toHaveAttribute("href", "/management/incidents/inc-training-session-001");

    // Page says drafts have no review flow yet
    expect(screen.getByTestId("postmortem-no-review-flow-notice")).toHaveTextContent(
      "Postmortem drafts are read-only; no review or publish flow is connected yet.",
    );

    fireEvent.click(titleCell);

    // Detail replaces machine root cause sentence with plain words
    expect(await screen.findByTestId("postmortem-detail-root-cause")).toHaveTextContent(
      "Root cause has not been analysed yet.",
    );
    expect(
      screen.queryByText("Draft generated from resolved incident inc-training-session-001; root cause pending analysis."),
    ).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenNthCalledWith(2, {
      method: "GET",
      path: "/api/v1/postmortems/pm-inc-training-session-001",
    });

    // Translated contributing factors, actions, author, deployment stage
    expect(screen.getByText("• Incident severity: High")).toBeInTheDocument();
    expect(screen.getByText("• Incident category: Unclassified cluster")).toBeInTheDocument();
    expect(screen.getByTestId("postmortem-factor-secondary")).toHaveTextContent("cluster-deg-01");
    expect(screen.getByText("• Complete root cause analysis")).toBeInTheDocument();
    expect(
      screen.getByText("• Validate remediation against linked telemetry and reconciliation evidence"),
    ).toBeInTheDocument();
    expect(screen.getByText("Automatic draft generator")).toBeInTheDocument();
    expect(screen.getByText("Paper")).toBeInTheDocument();
    expect(screen.getByTestId("postmortem-detail-draft-notice")).toHaveTextContent(
      "Postmortem drafts are read-only; no review or publish flow is connected yet.",
    );

    // Raw key=value text is kept inside the collapsed <details> technical section
    const techDetails = screen.getByTestId("postmortem-technical-details") as HTMLDetailsElement;
    expect(techDetails.tagName.toLowerCase()).toBe("details");
    expect(techDetails.open).toBe(false);
    expect(within(techDetails).getByText("incident_severity=high")).toBeInTheDocument();
    expect(within(techDetails).getByText("incident_cluster_id=cluster-deg-01")).toBeInTheDocument();

    // Switch to zh-TW and verify full Chinese translations in row & detail sheet
    await act(async () => {
      await i18n.changeLanguage("zh-TW");
    });
    expect(screen.getAllByText("下游服務連線異常：訓練工作階段服務").length).toBeGreaterThan(0);
    expect(screen.getByTestId("postmortem-detail-root-cause")).toHaveTextContent("尚未分析根因。");
    expect(screen.getByText("• 事件嚴重度：高")).toBeInTheDocument();
    expect(screen.getByText("• 事件分類：未分類事件群組")).toBeInTheDocument();
    expect(screen.getByTestId("postmortem-factor-secondary")).toHaveTextContent("cluster-deg-01");
    expect(screen.getByText("• 完成根因分析")).toBeInTheDocument();
    expect(screen.getByText("• 對照關聯遙測與對帳證據驗證改善措施")).toBeInTheDocument();
    expect(screen.getByText("系統自動草稿")).toBeInTheDocument();
    expect(screen.getByText("模擬")).toBeInTheDocument();
    expect(screen.getByTestId("postmortem-no-review-flow-notice")).toHaveTextContent(
      "事後檢討草稿目前僅供檢視，尚未開放審核與發佈流程。",
    );
  });

  it("FE-KNOWLEDGE-POSTMORTEM-TRUTH-20261125 AC3: renders recorded drift kinds (runtime_state, drawdown, fill_price, duplicate_execution, and enum-helper kinds) plain in zh-TW and en-US with binding id as secondary text, keeps raw text as secondary for unknown kinds, and translates contributing-factor drift:runtime_state", async () => {
    const runtimeStateDraft = buildRealPostmortemRecord(1, {
      postmortem_id: "pm-drift-runtime-001",
      incident_id: "inc-drift-runtime-001",
      binding_id: "rb-3823397e125e4579ba5f4174067087ed",
      title: "Postmortem draft: Drift threshold breach: drift:runtime_state for rb-3823397e125e4579ba5f4174067087ed",
      incident_cluster_id: "drift:runtime_state",
      contributing_factors: [
        "incident_severity=high",
        "incident_cluster_id=drift:runtime_state",
      ],
    });
    const drawdownDraft = buildRealPostmortemRecord(2, {
      postmortem_id: "pm-drift-drawdown-002",
      incident_id: "inc-drift-drawdown-002",
      binding_id: "rb-drawdown-002",
      title: "Postmortem draft: Drift threshold breach: drift:drawdown for rb-drawdown-002",
      incident_cluster_id: "drift:drawdown",
    });
    const fillPriceDraft = buildRealPostmortemRecord(3, {
      postmortem_id: "pm-drift-fillprice-003",
      incident_id: "inc-drift-fillprice-003",
      binding_id: "rb-fillprice-003",
      title: "Postmortem draft: Drift threshold breach: drift:fill_price for rb-fillprice-003",
      incident_cluster_id: "drift:fill_price",
    });
    const duplicateExecDraft = buildRealPostmortemRecord(4, {
      postmortem_id: "pm-drift-dup-004",
      incident_id: "inc-drift-dup-004",
      binding_id: "rb-dup-004",
      title: "Postmortem draft: Drift threshold breach: drift:duplicate_execution for rb-dup-004",
      incident_cluster_id: "drift:duplicate_execution",
    });
    const enumHelperKindDraft = buildRealPostmortemRecord(5, {
      postmortem_id: "pm-drift-enum-005",
      incident_id: "inc-drift-enum-005",
      binding_id: "rb-enum-005",
      title: "Postmortem draft: Drift threshold breach: drift:stale_telemetry for rb-enum-005",
      incident_cluster_id: "drift:stale_telemetry",
    });
    const unknownKindDraft = buildRealPostmortemRecord(6, {
      postmortem_id: "pm-drift-unknown-006",
      incident_id: "inc-drift-unknown-006",
      binding_id: "rb-unknown-006",
      title: "Postmortem draft: Drift threshold breach: drift:unmapped_custom_probe for rb-unknown-006",
      incident_cluster_id: "drift:unmapped_custom_probe",
      contributing_factors: [
        "incident_severity=medium",
        "incident_cluster_id=drift:unmapped_custom_probe",
      ],
    });

    vi.spyOn(transport, "bffFetch").mockImplementation(async (req) => {
      if (req.path === "/api/v1/postmortems/pm-drift-runtime-001") {
        return { data: runtimeStateDraft, meta: { staleness: null } } as never;
      }
      if (req.path === "/api/v1/postmortems/pm-drift-unknown-006") {
        return { data: unknownKindDraft, meta: { staleness: null } } as never;
      }
      return {
        data: [
          runtimeStateDraft,
          drawdownDraft,
          fillPriceDraft,
          duplicateExecDraft,
          enumHelperKindDraft,
          unknownKindDraft,
        ],
        page_info: { total: 6, page_size: 50, next_page_token: null },
        meta: {
          total: 6,
          hidden_infrastructure_count: 5355,
          surfaces: { postmortems: { status: "ok", source: "service_client" } },
        },
      } as never;
    });

    renderLibrary();

    // en-US plain titles for recorded kinds and generic title for unknown kind
    expect(await screen.findByText("Drift threshold breach: Runtime state")).toBeInTheDocument();
    expect(screen.getByText("Drift threshold breach: Drawdown")).toBeInTheDocument();
    expect(screen.getByText("Drift threshold breach: Fill price")).toBeInTheDocument();
    expect(screen.getByText("Drift threshold breach: Duplicate execution")).toBeInTheDocument();
    expect(screen.getByText("Drift threshold breach: Telemetry data is stale")).toBeInTheDocument();
    expect(screen.getByText("Drift threshold breach")).toBeInTheDocument();

    // Binding IDs in secondary text; unknown kind keeps raw text in secondary
    const secondaryContexts = screen.getAllByTestId("postmortem-secondary-context").map((el) => el.textContent);
    expect(secondaryContexts).toEqual([
      "rb-3823397e125e4579ba5f4174067087ed",
      "rb-drawdown-002",
      "rb-fillprice-003",
      "rb-dup-004",
      "rb-enum-005",
      "drift:unmapped_custom_probe · rb-unknown-006",
    ]);

    // Open runtime_state detail and check contributing factor line in en-US
    fireEvent.click(screen.getByText("Drift threshold breach: Runtime state"));
    expect(
      await screen.findByText("• Incident category: Paper vs live drift (Runtime state)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("postmortem-detail-secondary-context")).toHaveTextContent(
      "rb-3823397e125e4579ba5f4174067087ed",
    );

    // Switch to zh-TW and verify plain Chinese titles and contributing factor
    await act(async () => {
      await i18n.changeLanguage("zh-TW");
    });
    expect(screen.getAllByText("偏離門檻超限：執行環境狀態").length).toBeGreaterThan(0);
    expect(screen.getByText("偏離門檻超限：回撤")).toBeInTheDocument();
    expect(screen.getByText("偏離門檻超限：成交價格")).toBeInTheDocument();
    expect(screen.getByText("偏離門檻超限：重複執行")).toBeInTheDocument();
    expect(screen.getByText("偏離門檻超限：遙測資料已過時")).toBeInTheDocument();
    expect(screen.getByText("偏離門檻超限")).toBeInTheDocument();
    expect(
      screen.getByText("• 事件分類：模擬與實盤偏離（執行環境狀態）"),
    ).toBeInTheDocument();

    // Open unknown kind detail and verify plain primary + raw secondary in zh-TW
    fireEvent.click(screen.getByText("偏離門檻超限"));
    expect(await screen.findByText("• 事件分類：模擬與實盤偏離")).toBeInTheDocument();
    expect(screen.getByTestId("postmortem-factor-secondary")).toHaveTextContent(
      "drift:unmapped_custom_probe",
    );
  });

  it("FE-KNOWLEDGE-POSTMORTEM-TRUTH-20261125 AC2 & AC4: shows strategy incidents by default, toggles system incidents with BFF hidden_infrastructure_count, shows no number when count is absent/null, and localizes loading/empty/error in zh-TW and en-US", async () => {
    const driftDraft = buildRealPostmortemRecord(1, {
      postmortem_id: "pm-drift-001",
      incident_id: "inc-drift-001",
      title: "Postmortem draft: Drift threshold breached on 0050.TW",
      incident_cluster_id: "drift:rolling_drawdown_multiple",
      incident_evidence_summary: "Drift threshold breached",
    });
    const infraDraft = buildRealPostmortemRecord(2, {
      postmortem_id: "pm-infra-001",
      incident_id: "inc-infra-001",
      title: "Postmortem draft: downstream degradation",
      incident_cluster_id: "infrastructure:tenant-dev:control-plane-bff:downstream_degradation",
      incident_evidence_summary: "non_trading_infrastructure_incident=true downstream degradation",
    });

    const fetchSpy = vi.spyOn(transport, "bffFetch").mockImplementation(async (req) => {
      if (req.query?.include_infrastructure === "true") {
        return {
          data: [driftDraft, infraDraft],
          page_info: { total: 5458, page_size: 50, next_page_token: "50" },
          meta: {
            total: 5458,
            hidden_infrastructure_count: 0,
            surfaces: { postmortems: { status: "ok", source: "service_client" } },
          },
        };
      }
      return {
        data: [driftDraft],
        page_info: { total: 103, page_size: 50, next_page_token: "50" },
        meta: {
          total: 103,
          hidden_infrastructure_count: 5355,
          surfaces: { postmortems: { status: "ok", source: "service_client" } },
        },
      };
    });

    const first = renderLibrary();

    expect(await screen.findByText("Drift threshold breach: 0050.TW")).toBeInTheDocument();
    expect(screen.queryByText("Downstream service degradation")).not.toBeInTheDocument();

    const toggle = screen.getByTestId("postmortem-infra-toggle");
    expect(toggle).toHaveTextContent("Show system incidents (5355)");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    // Toggle system incidents on
    fireEvent.click(toggle);
    expect(await screen.findByText("Downstream service degradation")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenLastCalledWith({
      method: "GET",
      path: "/api/v1/postmortems",
      query: { page_size: 50, include_infrastructure: "true" },
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveTextContent("Hide system incidents");
    first.unmount();

    // When hidden_infrastructure_count is absent or null, toggle shows NO number
    fetchSpy.mockResolvedValueOnce({
      data: [],
      page_info: { total: 0, page_size: 50, next_page_token: null },
      meta: {
        total: 0,
        hidden_infrastructure_count: null,
        surfaces: { postmortems: { status: "ok", source: "service_client" } },
      },
    });
    const second = renderLibrary();
    expect(await screen.findByText("No postmortems recorded.")).toBeInTheDocument();
    const toggleNoCount = screen.getByTestId("postmortem-infra-toggle");
    expect(toggleNoCount).toHaveTextContent("Show system incidents");
    expect(toggleNoCount.textContent).not.toMatch(/\d/);

    // Switch to zh-TW and verify empty and no-number toggle
    await act(async () => {
      await i18n.changeLanguage("zh-TW");
    });
    expect(screen.getByText("尚無事後檢討紀錄。")).toBeInTheDocument();
    expect(toggleNoCount).toHaveTextContent("顯示系統異常草稿");
    expect(toggleNoCount.textContent).not.toMatch(/\d/);
    second.unmount();

    // Verify error text parity in zh-TW and en-US
    fetchSpy.mockRejectedValueOnce(new Error("502 Bad Gateway"));
    renderLibrary();
    expect(await screen.findByTestId("postmortem-list-error")).toHaveTextContent("無法載入事後檢討列表。");
    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
    expect(screen.getByTestId("postmortem-list-error")).toHaveTextContent("Could not load postmortems.");
  });

  it("issues the list read on first render under a production build (real transport, only fetch stubbed)", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITE_BFF_MODE", "live");
    const fetchStub = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [],
          page_info: { total: 0, page_size: 50, next_page_token: null },
          meta: { total: 0, surfaces: { postmortems: { status: "ok", source: "service_client" } } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchStub);
    try {
      renderLibrary();
      await waitFor(() => {
        const urls = fetchStub.mock.calls.map((call) => String((call as unknown[])[0]));
        expect(urls.some((url) => url.includes("/api/v1/postmortems"))).toBe(true);
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
