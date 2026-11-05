import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { EvolutionJournalPage } from "./_core";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { __resetV5LiveCacheForTests } from "@/management/pages/v5/useV5Live";
import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/management/pages/v5/useV5Live")>()),
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderJournal(initialEntry = "/management/evolution-journal") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/evolution-journal" element={<EvolutionJournalPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("EvolutionJournalPage Rendering", () => {
  let mockEvolutionEntries: Record<string, unknown>[] = [];
  let mockFleetRows: ManagementPersonaFleetRow[] = [];

  beforeEach(() => {
    mockEvolutionEntries = [];
    mockFleetRows = [];
    mocks.useV5Live.mockReset();
    mocks.useV5Live.mockImplementation((loader) => {
      const code = loader.toString();
      if (code.includes("evolutionJournal")) {
        return { data: mockEvolutionEntries, loading: false };
      }
      if (code.includes("personaFleet")) {
        return { data: mockFleetRows, loading: false };
      }
      return { data: undefined, loading: false };
    });
  });

  it("renders canonical formal seed rows with target version, fixture badge, and approval status", () => {
    mockEvolutionEntries = [
      {
        id: "evo-dec-formal-1",
        title: "Taiwan Equity Evolution Decision",
        summary: "Optimize learning rates.",
        status: "approved",
        entry_type: "evolution_decision",
        action_type: "hyperparameter_tuning",
        risk_level: "low",
        target: { type: "Persona", id: "persona-tw-equity", version: "v1.2.3" },
        occurred_at: "2026-07-13T12:00:00Z",
        origin: "seed",
      },
    ];

    renderJournal();

    // Check title and summary
    expect(screen.getByText("Taiwan Equity Evolution Decision")).toBeInTheDocument();
    expect(screen.getByText("Optimize learning rates.")).toBeInTheDocument();

    // Check fixture badge
    expect(screen.getByText("Fixture")).toBeInTheDocument();

    // Check action, risk, target (with version)
    expect(screen.getByText("hyperparameter_tuning")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("Persona:persona-tw-equity (v1.2.3)")).toBeInTheDocument();

    // Check approval status
    expect(screen.getByText("Approval status")).toBeInTheDocument();
    expect(screen.getAllByText("approved").length).toBeGreaterThan(0);
  });

  it("normalizes entry_type vs entryType aliases correctly for approval status", () => {
    mockEvolutionEntries = [
      {
        id: "evo-dec-legacy",
        title: "Legacy CamelCase Entry",
        status: "proposed",
        entryType: "mutation_review",
        action_type: "policy_update",
        risk_level: "medium",
        target: { type: "Persona", id: "persona-crypto" },
        occurred_at: "2026-07-13T12:00:00Z",
      },
    ];

    renderJournal();

    expect(screen.getByText("Legacy CamelCase Entry")).toBeInTheDocument();
    expect(screen.getByText("Approval status")).toBeInTheDocument();
    expect(screen.getAllByText("proposed").length).toBeGreaterThan(0);
  });

  it("renders persona-fleet-summary fallback card when no formal entries match and suppresses fixture/approval fields", () => {
    mockEvolutionEntries = [];
    mockFleetRows = [
      {
        personaId: "persona-tw-equity",
        personaName: "Taiwan Equity Persona",
        state: "active",
        currentWork: "Executing trade block A",
        lastMutation: "2026-07-10",
        lastMutationAt: "2026-07-10T08:00:00Z",
      } as unknown as ManagementPersonaFleetRow,
    ];

    renderJournal("/management/evolution-journal?persona=persona-tw-equity");

    // Falls back to fallback card
    expect(screen.getByText("Persona Fleet status summary · Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.getByText("Executing trade block A · state: active")).toBeInTheDocument();

    // Target is rendered without version
    expect(screen.getByText("Persona:persona-tw-equity")).toBeInTheDocument();

    // Fixture badge should NOT be rendered
    expect(screen.queryByText("Fixture")).not.toBeInTheDocument();

    // Approval status should NOT be rendered
    expect(screen.queryByText("Approval status")).not.toBeInTheDocument();
  });

  it("applies negative checks to hide NaN, null, and undefined values defensively", () => {
    mockEvolutionEntries = [
      {
        id: "evo-dec-nan-fields",
        title: "NaN Fields Entry",
        status: "NaN",
        entry_type: "evolution_decision",
        action_type: "undefined",
        risk_level: "null",
        target: { type: "Persona", id: "NaN", version: "undefined" },
        occurred_at: "NaN",
        origin: "live",
      },
    ];

    renderJournal();

    // Headline is valid, status is NaN so it is hidden
    expect(screen.getByText("NaN Fields Entry")).toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();

    // Action and Risk should be hidden since they are undefined/null
    expect(screen.queryByText("Action")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk")).not.toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();

    // Target has NaN type/id so it is hidden completely
    expect(screen.queryByText("Target")).not.toBeInTheDocument();

    // Landed (date) is NaN so it is hidden
    expect(screen.queryByText("Landed")).not.toBeInTheDocument();

    // Fixture badge should NOT be rendered since origin is live
    expect(screen.queryByText("Fixture")).not.toBeInTheDocument();

    // Approval status should NOT be rendered since status is NaN (and thus hidden)
    expect(screen.queryByText("Approval status")).not.toBeInTheDocument();
  });

  it("uses Number.isFinite for before and after metrics to defensively suppress NaN values", () => {
    mockEvolutionEntries = [
      {
        id: "evo-dec-metric-nan",
        title: "NaN Metrics Entry",
        status: "executed",
        entry_type: "evolution_decision",
        action_type: "retrain",
        risk_level: "low",
        target: { type: "Persona", id: "persona-tw-equity" },
        occurred_at: "2026-07-13T12:00:00Z",
        before: NaN,
        after: 12.34,
      },
    ];

    renderJournal();

    expect(screen.getByText("NaN Metrics Entry")).toBeInTheDocument();
    // Since before is NaN, hasMetrics is false, so it should not render before or after
    expect(screen.queryByText("before")).not.toBeInTheDocument();
    expect(screen.queryByText("after")).not.toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });

  it("requests the server-filtered journal and re-keys deps when focus changes or clears", () => {
    const calls: { deps: unknown[]; cacheKey?: string }[] = [];
    mocks.useV5Live.mockImplementation((loader, deps, opts) => {
      if (loader.toString().includes("evolutionJournal")) {
        calls.push({ deps, cacheKey: opts?.cacheKey });
        return { data: deps.includes("evo-a") ? [{ id: "evo-a", title: "Target A" }] : [], loading: false };
      }
      return { data: [], loading: false };
    });
    const view = renderJournal("/management/evolution-journal?decision=evo-a");
    expect(screen.getByText("Target A")).toBeInTheDocument();
    expect(calls.at(-1)).toEqual({
      deps: ["history", "", "", "evo-a", ""],
      cacheKey: "oversight.evolutionJournal.list",
    });
    view.unmount();
    renderJournal("/management/evolution-journal?persona=p1&mutation_review=evo-b");
    expect(calls.at(-1)?.deps).toEqual(["history", "p1", "evo-b", "", ""]);
    view.unmount();
    renderJournal();
    expect(calls.at(-1)?.deps).toEqual(["history", "", "", "", ""]);
  });

  it("refetches the scoped query on a mounted focus change and clearing, without reusing cached prior data", async () => {
    __resetV5LiveCacheForTests();
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const actual = await vi.importActual<typeof import("@/management/pages/v5/useV5Live")>("@/management/pages/v5/useV5Live");
    mocks.useV5Live.mockImplementation(actual.useV5Live);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      let body: unknown = { data: [] };
      if (url.includes("evolution-journal")) {
        body = url.includes("decision=evo-a")
          ? {
              data: {
                id: "management_evolution_journal",
                items: [{ id: "evo-a", title: "Target A" }],
                summary: { total_items: 1, returned_items: 1 },
              },
              page_info: { next_page_token: null, total: 1, page_size: 20 },
            }
          : {
              data: {
                id: "management_evolution_journal",
                items: [{ id: "first", title: "First Page Row" }],
                summary: { total_items: 124, returned_items: 20 },
              },
              page_info: { next_page_token: "20", total: 124, page_size: 20 },
            };
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const journalUrls = () => fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("evolution-journal"));
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/evolution-journal"]}>
          <Link to="/management/evolution-journal?decision=evo-a">focus</Link>
          <Link to="/management/evolution-journal">clear</Link>
          <Routes>
            <Route path="/management/evolution-journal" element={<EvolutionJournalPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(await screen.findByText("First Page Row")).toBeInTheDocument();
    fireEvent.click(screen.getByText("focus"));
    expect(await screen.findByText("Target A")).toBeInTheDocument();
    expect(screen.queryByText("First Page Row")).not.toBeInTheDocument();
    expect(journalUrls().at(-1)).toContain("decision=evo-a");
    fireEvent.click(screen.getByText("clear"));
    // Cached unfiltered data may render immediately; focused data must not linger.
    await waitFor(() => expect(screen.queryByText("Target A")).not.toBeInTheDocument());
    expect(screen.getByText("First Page Row")).toBeInTheDocument();
    expect(journalUrls()[0]).toMatch(/evolution-journal\?view=history$/);
    liveStatus._reset();
  });

  it("requests view=history by default, renders filtered summary and pagination, and switches to view=auto_proposals and back keeping view in URL across both locales", async () => {
    const realHistoryDecision = {
      id: "evolution_decision:evo-thresh-proposed-001",
      entry_type: "evolution_decision",
      source_id: "evo-thresh-proposed-001",
      title: "Evolution decision · retrain",
      summary: "Candidate artifact artifact-persona-paper-1bad2eca6831457cd885",
      status: "proposed",
      action_type: "retrain",
      risk_level: "medium",
      evidence_class: "threshold_signal",
      target: {
        type: "candidate_artifact",
        id: "artifact-persona-paper-1bad2eca6831457cd885",
      },
      occurred_at: "2026-11-04T01:15:00Z",
      created_at: "2026-11-04T01:15:00Z",
      record: {
        decision_id: "evo-thresh-proposed-001",
        target_type: "candidate_artifact",
        target_id: "artifact-persona-paper-1bad2eca6831457cd885",
        risk_level: "medium",
        action_type: "retrain",
        decision_state: "proposed",
        status: "proposed",
        evidence_class: "threshold_signal",
        threshold_snapshots: [
          {
            breached: true,
            comparator: "gt",
            metric_name: "rolling_drawdown_pct",
            observed_value: 0.18,
            threshold_value: 0.12,
            policy_source: "EVOLUTION_REVIEW_AND_THRESHOLDS.md section 7.1",
            signal_type: "execution_drift",
            window: "7d",
          },
        ],
      },
    };
    const realHistoryPage2Rollback = {
      id: "rollback:rb-hist-001",
      entry_type: "rollback",
      source_id: "rb-hist-001",
      title: "Rollback · rb-hist-001",
      summary: "Runtime rt-alpha rollback completed",
      status: "completed",
      action_type: "rollback",
      target: { type: "runtime", id: "rt-alpha" },
      occurred_at: "2026-11-04T01:29:00Z",
      created_at: "2026-11-04T01:29:00Z",
    };
    const realIncidentFollowupProposal = {
      id: "evolution_decision:evo-sweep-agent-000b205c0ef9-0000",
      entry_type: "evolution_decision",
      source_id: "evo-sweep-agent-000b205c0ef9-0000",
      title: "Automatic proposal · incident follow-up",
      summary: "Follow up on agent-000b205c0ef9-0000",
      status: "proposed",
      action_type: "flag_for_review",
      risk_level: "low",
      evidence_class: "incident_followup",
      target: {
        type: "candidate_artifact",
        id: "infra-component-agent-finding-000b205c0ef9",
      },
      occurred_at: "2026-11-04T01:00:00Z",
      created_at: "2026-11-04T01:00:00Z",
      record: {
        decision_id: "evo-sweep-agent-000b205c0ef9-0000",
        target_type: "candidate_artifact",
        target_id: "infra-component-agent-finding-000b205c0ef9",
        risk_level: "low",
        linked_incident_id: "agent-000b205c0ef9-0000",
        action_type: "flag_for_review",
        decision_state: "proposed",
        status: "proposed",
        evidence_class: "incident_followup",
        threshold_snapshots: [
          {
            breached: true,
            comparator: "gte",
            metric_name: "incident_followup_required",
            observed_value: 1,
            threshold_value: 1,
            policy_source: "EVOLUTION_REVIEW_AND_THRESHOLDS.md section 7.5",
            signal_type: "manual_review",
            window: "active-incident",
          },
        ],
      },
    };
    const realIncidentSeverityProposal = {
      id: "evolution_decision:evo-sweep-inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      entry_type: "evolution_decision",
      source_id: "evo-sweep-inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      title: "Automatic proposal · severity1 incident freeze",
      summary: "Severity 1 incident threshold reached",
      status: "proposed",
      action_type: "freeze",
      risk_level: "medium",
      evidence_class: "incident_severity",
      target: {
        type: "candidate_artifact",
        id: "artifact-persona-paper-1bad2eca6831457cd885",
      },
      occurred_at: "2026-11-04T01:05:00Z",
      created_at: "2026-11-04T01:05:00Z",
      record: {
        decision_id: "evo-sweep-inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
        target_type: "candidate_artifact",
        target_id: "artifact-persona-paper-1bad2eca6831457cd885",
        risk_level: "medium",
        action_type: "freeze",
        decision_state: "proposed",
        status: "proposed",
        evidence_class: "incident_severity",
        threshold_snapshots: [
          {
            breached: true,
            comparator: "gte",
            metric_name: "severity1_incident_count",
            observed_value: 1,
            threshold_value: 1,
            policy_source: "EVOLUTION_REVIEW_AND_THRESHOLDS.md section 7.5",
            signal_type: "governance_incident",
            window: "active-incident",
          },
        ],
      },
    };

    __resetV5LiveCacheForTests();
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    const actual = await vi.importActual<typeof import("@/management/pages/v5/useV5Live")>("@/management/pages/v5/useV5Live");
    mocks.useV5Live.mockImplementation(actual.useV5Live);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes("evolution-journal")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes("view=auto_proposals")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "management_evolution_journal",
              items: [realIncidentFollowupProposal, realIncidentSeverityProposal],
              summary: {
                total_items: 6,
                returned_items: 2,
                decision_count: 2,
                mutation_review_count: 2,
                postmortem_count: 2,
                rollback_count: 0,
                freeze_order_count: 0,
              },
              auto_proposal_counts: {
                incident_followup: 320,
                incident_severity: 325,
                postmortem_draft: 2027,
                total: 2672,
              },
            },
            page_info: { next_page_token: null, page_size: 20, total: 6 },
            meta: { snapshot_at: "2026-11-04T02:00:00Z", surfaces: { evolution_decisions: { status: "ok" } } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("page_token=1")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "management_evolution_journal",
              items: [realHistoryPage2Rollback],
              summary: {
                total_items: 2,
                returned_items: 1,
                decision_count: 1,
                mutation_review_count: 0,
                postmortem_count: 0,
                rollback_count: 1,
                freeze_order_count: 0,
              },
              auto_proposal_counts: {
                incident_followup: 320,
                incident_severity: 325,
                postmortem_draft: 2027,
                total: 2672,
              },
            },
            page_info: { next_page_token: null, page_size: 1, total: 2 },
            meta: { snapshot_at: "2026-11-04T02:00:00Z", surfaces: { evolution_decisions: { status: "ok" } } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            id: "management_evolution_journal",
            items: [realHistoryDecision],
            summary: {
              total_items: 2,
              returned_items: 1,
              decision_count: 1,
              mutation_review_count: 0,
              postmortem_count: 0,
              rollback_count: 1,
              freeze_order_count: 0,
            },
            auto_proposal_counts: {
              incident_followup: 320,
              incident_severity: 325,
              postmortem_draft: 2027,
              total: 2672,
            },
          },
          page_info: { next_page_token: "1", page_size: 1, total: 2 },
          meta: { snapshot_at: "2026-11-04T02:00:00Z", surfaces: { evolution_decisions: { status: "ok" } } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const LocationProbe = () => {
      const location = useLocation();
      return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
    };

    await i18n.changeLanguage("en-US");
    const enView = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/evolution-journal"]}>
          <LocationProbe />
          <Routes>
            <Route path="/management/evolution-journal" element={<EvolutionJournalPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    // 1. Default request is view=history and renders filtered summary + auto_proposal_counts + evidence_class
    expect(await screen.findByText("Evolution decision · retrain")).toBeInTheDocument();
    expect(String(fetchSpy.mock.calls[0][0])).toBe("/bff/management/evolution-journal?view=history");
    expect(screen.getByTestId("evolution-auto-proposals-summary")).toHaveTextContent(
      "Automatic proposals: 2672 (Incident follow-up: 320, Incident severity: 325, Postmortem drafts: 2027)",
    );
    expect(screen.getByTestId("evolution-journal-summary")).toHaveTextContent("Filtered items: 2 (returned 1)");
    expect(screen.getByTestId("evolution-evidence-class-threshold_signal")).toHaveTextContent(
      "Threshold signal (threshold_signal)",
    );

    // 2. Pagination reflects the filtered history set
    expect(screen.getByTestId("evolution-journal-pager")).toHaveTextContent("Showing 1–1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Rollback · rb-hist-001")).toBeInTheDocument();
    expect(screen.getByTestId("evolution-journal-pager")).toHaveTextContent("Showing 2–2 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Evolution decision · retrain")).toBeInTheDocument();

    // 3. Control switches to view=auto_proposals and back, keeping chosen view in URL
    fireEvent.click(screen.getByTestId("evolution-view-toggle"));
    expect(await screen.findByText("Automatic proposal · incident follow-up")).toBeInTheDocument();
    expect(screen.getByText("Automatic proposal · severity1 incident freeze")).toBeInTheDocument();
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/management/evolution-journal?view=auto_proposals",
    );
    expect(screen.getByTestId("evolution-evidence-class-incident_followup")).toHaveTextContent(
      "Incident follow-up (incident_followup)",
    );
    expect(screen.getByTestId("evolution-evidence-class-incident_severity")).toHaveTextContent(
      "Incident severity (incident_severity)",
    );

    fireEvent.click(screen.getByTestId("evolution-view-toggle"));
    expect(await screen.findByText("Evolution decision · retrain")).toBeInTheDocument();
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/management/evolution-journal?view=history",
    );
    enView.unmount();

    // 4. Reloading directly at ?view=auto_proposals in zh-TW renders Chinese labels and keeps view
    await i18n.changeLanguage("zh-TW");
    const zhView = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/evolution-journal?view=auto_proposals"]}>
          <LocationProbe />
          <Routes>
            <Route path="/management/evolution-journal" element={<EvolutionJournalPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(await screen.findByText("Automatic proposal · incident follow-up")).toBeInTheDocument();
    expect(screen.getByTestId("evolution-auto-proposals-summary")).toHaveTextContent(
      "自動提案：共 2672 筆（事件後續追蹤：320 筆、重大事件門檻：325 筆、事後檢討草稿：2027 筆）",
    );
    expect(screen.getByTestId("evolution-evidence-class-incident_followup")).toHaveTextContent(
      "事件後續追蹤 (incident_followup)",
    );
    expect(screen.getByTestId("evolution-evidence-class-incident_severity")).toHaveTextContent(
      "重大事件門檻 (incident_severity)",
    );
    expect(screen.getByTestId("evolution-view-toggle")).toHaveTextContent("返回真實演化歷史");
    zhView.unmount();

    await i18n.changeLanguage("en-US");
    liveStatus._reset();
  });

  it("shows empty history message stating no evolution has been executed yet and how many automatic proposals are waiting in both locales", async () => {
    const emptyHistoryEnvelope = {
      data: {
        id: "management_evolution_journal",
        items: [],
        summary: {
          total_items: 0,
          returned_items: 0,
          decision_count: 0,
          mutation_review_count: 0,
          postmortem_count: 0,
          rollback_count: 0,
          freeze_order_count: 0,
        },
        auto_proposal_counts: {
          incident_followup: 322,
          incident_severity: 325,
          postmortem_draft: 2027,
          total: 2674,
        },
      },
      page_info: { next_page_token: null, page_size: 20, total: 0 },
      meta: { snapshot_at: "2026-11-04T02:00:00Z", surfaces: { evolution_decisions: { status: "ok" } } },
    };

    mocks.useV5Live.mockImplementation((loader) => {
      if (loader.toString().includes("evolutionJournal")) {
        return { data: emptyHistoryEnvelope, loading: false, error: null };
      }
      return { data: [], loading: false, error: null };
    });

    await i18n.changeLanguage("en-US");
    const enView = renderJournal("/management/evolution-journal");
    expect(screen.getByTestId("evolution-history-empty")).toHaveTextContent(
      "No evolution has been executed yet",
    );
    expect(screen.getByTestId("evolution-history-empty")).toHaveTextContent(
      "2674 automatic proposal(s) are waiting (Incident follow-up: 322, Incident severity: 325, Postmortem drafts: 2027).",
    );
    enView.unmount();

    await i18n.changeLanguage("zh-TW");
    const zhView = renderJournal("/management/evolution-journal");
    expect(screen.getByTestId("evolution-history-empty")).toHaveTextContent(
      "目前尚無已執行的真實演化歷史",
    );
    expect(screen.getByTestId("evolution-history-empty")).toHaveTextContent(
      "共有 2674 筆自動提案等待處理（事件後續追蹤：322 筆、重大事件門檻：325 筆、事後檢討草稿：2027 筆）。",
    );
    zhView.unmount();

    await i18n.changeLanguage("en-US");
  });

  it("opens deep links carrying decision, mutation_review, or persona under any view (history, auto_proposals, all)", () => {
    const decisionEntry = {
      id: "evolution_decision:evo-sweep-agent-000b205c0ef9-0000",
      entry_type: "evolution_decision",
      source_id: "evo-sweep-agent-000b205c0ef9-0000",
      title: "Deep-linked decision evo-sweep-agent-000b205c0ef9-0000",
      status: "proposed",
      action_type: "flag_for_review",
      risk_level: "low",
      evidence_class: "incident_followup",
      target: {
        type: "candidate_artifact",
        id: "infra-component-agent-finding-000b205c0ef9",
      },
      record: {
        decision_id: "evo-sweep-agent-000b205c0ef9-0000",
        linked_incident_id: "agent-000b205c0ef9-0000",
        evidence_class: "incident_followup",
      },
    };
    const mutationReviewEntry = {
      id: "mutation_review:evo-sweep-agent-000b205c0ef9-0000",
      entry_type: "mutation_review",
      source_id: "evo-sweep-agent-000b205c0ef9-0000",
      title: "Deep-linked mutation review evo-sweep-agent-000b205c0ef9-0000",
      status: "proposed",
      action_type: "flag_for_review",
      risk_level: "low",
      evidence_class: "incident_followup",
      target: {
        type: "candidate_artifact",
        id: "infra-component-agent-finding-000b205c0ef9",
      },
      mutation_review: {
        decision_id: "evo-sweep-agent-000b205c0ef9-0000",
        evidence_class: "incident_followup",
      },
    };
    const personaEntry = {
      id: "evolution_decision:evo-sweep-inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      entry_type: "evolution_decision",
      source_id: "evo-sweep-inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      title: "Deep-linked persona evolution record",
      status: "proposed",
      action_type: "freeze",
      risk_level: "medium",
      evidence_class: "incident_severity",
      target: {
        type: "candidate_artifact",
        id: "artifact-persona-paper-1bad2eca6831457cd885",
      },
      record: {
        decision_id: "evo-sweep-inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
        target_id: "artifact-persona-paper-1bad2eca6831457cd885",
        evidence_class: "incident_severity",
      },
    };

    mocks.useV5Live.mockImplementation((loader, deps: unknown[]) => {
      if (loader.toString().includes("evolutionJournal")) {
        const [, persona, mr, dec] = deps;
        if (dec === "evo-sweep-agent-000b205c0ef9-0000") {
          return { data: [decisionEntry], loading: false };
        }
        if (mr === "evo-sweep-agent-000b205c0ef9-0000") {
          return { data: [mutationReviewEntry], loading: false };
        }
        if (persona === "persona-paper-1bad2eca6831457cd885") {
          return { data: [personaEntry], loading: false };
        }
        return { data: [], loading: false };
      }
      return { data: [], loading: false };
    });

    for (const viewParam of ["history", "auto_proposals", "all"]) {
      const decRender = renderJournal(
        `/management/evolution-journal?view=${viewParam}&decision=evo-sweep-agent-000b205c0ef9-0000`,
      );
      expect(
        screen.getByText("Deep-linked decision evo-sweep-agent-000b205c0ef9-0000"),
      ).toBeInTheDocument();
      decRender.unmount();

      const mrRender = renderJournal(
        `/management/evolution-journal?view=${viewParam}&mutation_review=evo-sweep-agent-000b205c0ef9-0000`,
      );
      expect(
        screen.getByText("Deep-linked mutation review evo-sweep-agent-000b205c0ef9-0000"),
      ).toBeInTheDocument();
      mrRender.unmount();

      const personaRender = renderJournal(
        `/management/evolution-journal?view=${viewParam}&persona=persona-paper-1bad2eca6831457cd885`,
      );
      expect(screen.getByText("Deep-linked persona evolution record")).toBeInTheDocument();
      personaRender.unmount();
    }
  });

  it("shows degraded error state on a failed or surface-degraded read and never shows the empty history text", () => {
    // 1. Transport / query error
    mocks.useV5Live.mockImplementation((loader) => {
      if (loader.toString().includes("evolutionJournal")) {
        return { data: undefined, loading: false, error: new Error("BFF 503 Unavailable") };
      }
      return { data: [], loading: false, error: null };
    });

    const errView = renderJournal("/management/evolution-journal");
    expect(screen.getByTestId("evolution-journal-degraded")).toBeInTheDocument();
    expect(screen.getByText("Evolution journal read degraded")).toBeInTheDocument();
    expect(screen.queryByTestId("evolution-history-empty")).not.toBeInTheDocument();
    expect(screen.queryByText(/No evolution has been executed yet/i)).not.toBeInTheDocument();
    errView.unmount();

    // 2. Degraded BFF surface in meta.surfaces with empty items
    mocks.useV5Live.mockImplementation((loader) => {
      if (loader.toString().includes("evolutionJournal")) {
        return {
          data: {
            data: {
              id: "management_evolution_journal",
              items: [],
              summary: { total_items: 0, returned_items: 0 },
              auto_proposal_counts: {
                incident_followup: 0,
                incident_severity: 0,
                postmortem_draft: 0,
                total: 0,
              },
            },
            page_info: { next_page_token: null, page_size: 20, total: 0 },
            meta: {
              snapshot_at: "2026-11-04T02:00:00Z",
              surfaces: {
                postmortems: { status: "unavailable", source: "owner_timeout" },
              },
            },
          },
          loading: false,
          error: null,
        };
      }
      return { data: [], loading: false, error: null };
    });

    const surfaceView = renderJournal("/management/evolution-journal");
    expect(screen.getByTestId("evolution-journal-degraded")).toBeInTheDocument();
    expect(screen.getByText(/postmortems: unavailable/i)).toBeInTheDocument();
    expect(screen.queryByTestId("evolution-history-empty")).not.toBeInTheDocument();
    expect(screen.queryByText(/No evolution has been executed yet/i)).not.toBeInTheDocument();
    surfaceView.unmount();
  });
});
