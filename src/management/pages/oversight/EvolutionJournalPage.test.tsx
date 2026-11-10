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

  it("keeps long target and journal identifiers fully rendered with wrap-safe metadata cells", () => {
    const longId = "hosted-all12-h12-claude-20261027-4923-execution-artifact";
    const longEntryId = `evolution_decision:evo-sweep-inc-drift-${"87d6930c62ee".repeat(3)}`;
    mockEvolutionEntries = [
      {
        id: longEntryId,
        title: "Freeze decision",
        status: "approved",
        entry_type: "evolution_decision",
        action_type: "freeze",
        risk_level: "medium",
        target: { type: "candidate_artifact", id: longId, version: "1.0.0" },
        occurred_at: "2026-11-03T01:58:28Z",
      },
    ];

    renderJournal();

    // Full text is preserved (no truncation); real layout geometry is measured in a browser
    // (see docs/deployment/evidence/FE-EVO-JOURNAL-MOBILE-WRAP-20261108/evidence.json).
    const targetDd = screen.getByText(`candidate_artifact:${longId} (1.0.0)`);
    expect(targetDd.tagName).toBe("DD");
    expect(targetDd.className).toContain("[overflow-wrap:anywhere]");
    expect(targetDd.parentElement?.className).toContain("min-w-0");
    expect(screen.getByText(longEntryId).className).toContain("[overflow-wrap:anywhere]");
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
    expect(screen.getByTestId("evolution-view-toggle")).toHaveTextContent("返回演化歷史");
    expect(screen.getByTestId("evolution-view-toggle")).not.toHaveTextContent("真實");
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
      "目前尚無已執行的演化歷史",
    );
    expect(screen.getByTestId("evolution-history-empty")).not.toHaveTextContent("真實");
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
    expect(screen.queryByTestId("evolution-auto-proposals-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("evolution-journal-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("evolution-partial-read-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("evolution-history-empty")).not.toBeInTheDocument();
    expect(screen.queryByText(/No evolution has been executed yet/i)).not.toBeInTheDocument();
    surfaceView.unmount();
  });

  it("keeps verified six rows, 2530 auto-proposal counters, active view badge, and toggle visible on ancillary partial reads while marking unavailable freeze_orders/rollbacks as unknown instead of 0", async () => {
    const partialReadHistoryEnvelope = {
      data: {
        id: "management_evolution_journal",
        items: [
          {
            id: "mutation_review:evo-sweep-inc-drift-87d6930c62ee",
            entry_type: "mutation_review",
            source_id: "evo-sweep-inc-drift-87d6930c62ee",
            title: "Mutation review: evo-sweep-inc-drift-87d6930c62ee",
            summary:
              "Daily evolution sweep derived a governed freeze proposal from incident inc-drift-87d6930c62ee. The proposal is review-gated and has no runtime, broker, or capital-binding side effects.",
            status: "approved",
            risk_level: "medium",
            action_type: "freeze",
            target: {
              type: "candidate_artifact",
              id: "hosted-all12-h12-claude-20261027-4923-execution-artifact",
              version: "1.0.0",
            },
            occurred_at: "2026-11-03T01:58:28Z",
            evidence_class: "incident_severity",
            origin: "unknown",
          },
          {
            id: "evolution_decision:evo-sweep-inc-drift-87d6930c62ee",
            entry_type: "evolution_decision",
            source_id: "evo-sweep-inc-drift-87d6930c62ee",
            title: "Freeze decision",
            summary:
              "Daily evolution sweep derived a governed freeze proposal from incident inc-drift-87d6930c62ee. The proposal is review-gated and has no runtime, broker, or capital-binding side effects.",
            status: "approved",
            risk_level: "medium",
            action_type: "freeze",
            target: {
              type: "candidate_artifact",
              id: "hosted-all12-h12-claude-20261027-4923-execution-artifact",
              version: "1.0.0",
            },
            occurred_at: "2026-11-03T01:58:28Z",
            evidence_class: "incident_severity",
            origin: "unknown",
          },
          {
            id: "mutation_review:evo-h12-01a11-20261023-9aeb-duplicate-execution-usera",
            entry_type: "mutation_review",
            source_id: "evo-h12-01a11-20261023-9aeb-duplicate-execution-usera",
            title: "Mutation review: evo-h12-01a11-20261023-9aeb-duplicate-execution-usera",
            summary:
              "Create a governed freeze proposal from postmortem pm-inc-drift-994a6db8a4bb for incident inc-drift-994a6db8a4bb. The proposal is review-gated and does not mutate runtime, broker, or capital-binding state.",
            status: "executed",
            risk_level: "medium",
            action_type: "freeze",
            target: {
              type: "candidate_artifact",
              id: "hosted-all12-h12-01a11-20261023-9aeb-execution-artifact",
              version: "1.0.0",
            },
            occurred_at: "2026-10-26T16:11:17Z",
            evidence_class: "incident_severity",
            origin: "unknown",
          },
          {
            id: "evolution_decision:evo-h12-01a11-20261023-9aeb-duplicate-execution-usera",
            entry_type: "evolution_decision",
            source_id: "evo-h12-01a11-20261023-9aeb-duplicate-execution-usera",
            title: "Freeze decision",
            summary:
              "Create a governed freeze proposal from postmortem pm-inc-drift-994a6db8a4bb for incident inc-drift-994a6db8a4bb. The proposal is review-gated and does not mutate runtime, broker, or capital-binding state.",
            status: "executed",
            risk_level: "medium",
            action_type: "freeze",
            target: {
              type: "candidate_artifact",
              id: "hosted-all12-h12-01a11-20261023-9aeb-execution-artifact",
              version: "1.0.0",
            },
            occurred_at: "2026-10-26T16:11:17Z",
            evidence_class: "incident_severity",
            origin: "unknown",
          },
          {
            id: "mutation_review:evo-h12-01a11-20261023-9aeb-duplicate-execution",
            entry_type: "mutation_review",
            source_id: "evo-h12-01a11-20261023-9aeb-duplicate-execution",
            title: "Mutation review: evo-h12-01a11-20261023-9aeb-duplicate-execution",
            summary:
              "Create a governed freeze proposal from incident inc-drift-994a6db8a4bb. The proposal is review-gated and does not mutate runtime, broker, or capital-binding state.",
            status: "canceled",
            risk_level: "medium",
            action_type: "freeze",
            target: {
              type: "candidate_artifact",
              id: "hosted-all12-h12-01a11-20261023-9aeb-execution-artifact",
              version: "1.0.0",
            },
            occurred_at: "2026-10-26T11:42:21Z",
            evidence_class: "incident_severity",
            origin: "unknown",
          },
          {
            id: "evolution_decision:evo-h12-01a11-20261023-9aeb-duplicate-execution",
            entry_type: "evolution_decision",
            source_id: "evo-h12-01a11-20261023-9aeb-duplicate-execution",
            title: "Freeze decision",
            summary:
              "Create a governed freeze proposal from incident inc-drift-994a6db8a4bb. The proposal is review-gated and does not mutate runtime, broker, or capital-binding state.",
            status: "canceled",
            risk_level: "medium",
            action_type: "freeze",
            target: {
              type: "candidate_artifact",
              id: "hosted-all12-h12-01a11-20261023-9aeb-execution-artifact",
              version: "1.0.0",
            },
            occurred_at: "2026-10-26T11:42:21Z",
            evidence_class: "incident_severity",
            origin: "unknown",
          },
        ],
        summary: {
          total_items: 6,
          returned_items: 6,
          decision_count: 3,
          mutation_review_count: 3,
          postmortem_count: 0,
          rollback_count: 0,
          freeze_order_count: 0,
          pending_review_count: 0,
          active_freeze_count: 0,
          completed_rollback_count: 0,
          latest_at: "2026-11-03T01:58:28Z",
          by_type: { mutation_review: 3, evolution_decision: 3 },
          by_status: { approved: 2, executed: 2, canceled: 2 },
          by_risk_level: { medium: 6 },
        },
        auto_proposal_counts: {
          incident_followup: 433,
          incident_severity: 9,
          postmortem_draft: 2088,
          total: 2530,
        },
      },
      page_info: {
        next_page_token: null,
        total: 6,
        page_size: 20,
      },
      meta: {
        snapshot_at: "2026-11-06T00:06:51Z",
        surfaces: {
          evolution_decisions: { status: "ok", source: "service" },
          postmortems: { status: "ok", source: "service_client" },
          freeze_orders: {
            status: "unavailable",
            source: "missing",
            staleness: { served_from: "unverifiable", last_known_at: "2026-11-06T00:06:51Z" },
          },
          rollbacks: {
            status: "unavailable",
            source: "missing",
            staleness: { served_from: "unverifiable", last_known_at: "2026-11-06T00:06:51Z" },
          },
          approval_decisions: { status: "ok", source: "service" },
          personas: { status: "ok", source: "store" },
          persona_bindings: { status: "ok", source: "service" },
          runtime_bindings: { status: "ok", source: "service" },
          incidents: { status: "ok", source: "service_client" },
          mutation_review: { status: "ok", source: "bff_composed", snapshot_at: "2026-11-06T00:06:51Z" },
          management_evolution_journal: {
            status: "degraded",
            source: "bff_composed",
            message: "Evolution journal partially degraded",
            snapshot_at: "2026-11-06T00:06:51Z",
          },
        },
        composition_sources: [
          "evolution_decisions",
          "postmortems",
          "mutation_review",
          "rollbacks",
          "freeze_orders",
        ],
      },
    };

    mocks.useV5Live.mockImplementation((loader) => {
      if (loader.toString().includes("evolutionJournal")) {
        return { data: partialReadHistoryEnvelope, loading: false, error: null };
      }
      return { data: [], loading: false, error: null };
    });

    const LocationProbe = () => {
      const location = useLocation();
      return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
    };

    await i18n.changeLanguage("zh-TW");
    const zhView = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/evolution-journal"]}>
          <LocationProbe />
          <Routes>
            <Route path="/management/evolution-journal" element={<EvolutionJournalPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    // 1. Degraded alert remains visible with partial-read explanation and degraded surface list
    expect(screen.getByTestId("evolution-journal-degraded")).toHaveTextContent("演化日誌讀取降級");
    expect(screen.getByTestId("evolution-journal-degraded")).toHaveTextContent(
      "部分演化日誌輔助資料面暫時無法讀取",
    );
    expect(screen.getByTestId("evolution-journal-degraded")).toHaveTextContent(
      "freeze_orders: unavailable · rollbacks: unavailable · management_evolution_journal: degraded",
    );

    // 2. All 2530 healthy-source auto-proposal counters and toggle remain visible
    expect(screen.getByTestId("evolution-auto-proposals-summary")).toHaveTextContent(
      "自動提案：共 2530 筆（事件後續追蹤：433 筆、重大事件門檻：9 筆、事後檢討草稿：2088 筆）",
    );
    expect(screen.getByTestId("auto-proposal-total")).toHaveTextContent("2530");
    expect(screen.getByTestId("auto-proposal-incident-followup")).toHaveTextContent("433");
    expect(screen.getByTestId("auto-proposal-incident-severity")).toHaveTextContent("9");
    expect(screen.getByTestId("auto-proposal-postmortem-draft")).toHaveTextContent("2088");

    // 3. Active view badge, partial-read badge, and honest per-source summary counts are visible
    expect(screen.getByTestId("evolution-active-view-badge")).toHaveTextContent("演化歷史");
    expect(screen.getByTestId("evolution-active-view-badge")).not.toHaveTextContent("真實");
    expect(screen.getByTestId("evolution-partial-read-badge")).toHaveTextContent("部分讀取（已驗證來源）");
    expect(screen.getByTestId("evolution-journal-summary")).toHaveTextContent(
      "已驗證來源篩選結果：共 6 筆（本頁 6 筆，未含未知來源）",
    );
    expect(screen.getByTestId("evolution-summary-decisions")).toHaveTextContent("演化決策: 3");
    expect(screen.getByTestId("evolution-summary-mutation-reviews")).toHaveTextContent("突變審核: 3");
    expect(screen.getByTestId("evolution-summary-postmortems")).toHaveTextContent("事後檢討: 0");
    expect(screen.getByTestId("evolution-summary-rollbacks")).toHaveTextContent("回滾: 未知 (unavailable)");
    expect(screen.getByTestId("evolution-summary-freeze-orders")).toHaveTextContent("凍結令: 未知 (unavailable)");
    expect(screen.getByTestId("evolution-journal-summary")).not.toHaveTextContent("回滾: 0");
    expect(screen.getByTestId("evolution-journal-summary")).not.toHaveTextContent("凍結令: 0");

    // 4. All 6 existing rows and pager remain visible
    expect(screen.getByText("mutation_review:evo-sweep-inc-drift-87d6930c62ee")).toBeInTheDocument();
    expect(screen.getByText("evolution_decision:evo-sweep-inc-drift-87d6930c62ee")).toBeInTheDocument();
    expect(
      screen.getByText("mutation_review:evo-h12-01a11-20261023-9aeb-duplicate-execution-usera"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("evolution_decision:evo-h12-01a11-20261023-9aeb-duplicate-execution-usera"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("mutation_review:evo-h12-01a11-20261023-9aeb-duplicate-execution"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("evolution_decision:evo-h12-01a11-20261023-9aeb-duplicate-execution"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("evolution-journal-pager")).toHaveTextContent("顯示第 1–6 筆，共 6 筆");

    // 5. View toggle switches to view=auto_proposals
    fireEvent.click(screen.getByTestId("evolution-view-toggle"));
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/management/evolution-journal?view=auto_proposals",
    );
    zhView.unmount();

    await i18n.changeLanguage("en-US");
    const enView = renderJournal("/management/evolution-journal");
    expect(screen.getByTestId("evolution-active-view-badge")).toHaveTextContent("Evolution history");
    expect(screen.getByTestId("evolution-partial-read-badge")).toHaveTextContent(
      "Partial read (verified sources)",
    );
    expect(screen.getByTestId("evolution-journal-summary")).toHaveTextContent(
      "Verified-source items: 6 (returned 6, excluding unknown sources)",
    );
    expect(screen.getByTestId("evolution-summary-decisions")).toHaveTextContent("Decisions: 3");
    expect(screen.getByTestId("evolution-summary-mutation-reviews")).toHaveTextContent("Mutation reviews: 3");
    expect(screen.getByTestId("evolution-summary-postmortems")).toHaveTextContent("Postmortems: 0");
    expect(screen.getByTestId("evolution-summary-rollbacks")).toHaveTextContent(
      "Rollbacks: unknown (unavailable)",
    );
    expect(screen.getByTestId("evolution-summary-freeze-orders")).toHaveTextContent(
      "Freeze orders: unknown (unavailable)",
    );
    expect(screen.getByTestId("evolution-journal-summary")).not.toHaveTextContent("Rollbacks: 0");
    expect(screen.getByTestId("evolution-journal-summary")).not.toHaveTextContent("Freeze orders: 0");
    enView.unmount();
  });

  it("renders 3 deduplicated decision rows with nested mutation_review for view=history and 2571 for view=auto_proposals with updated zh-TW labels", async () => {
    const makeHostedDecisionRow = (
      decisionId: string,
      status: string,
      createdById: string,
      planId: string,
      occurredAt: string,
    ) => ({
      id: `evolution_decision:${decisionId}`,
      entry_type: "evolution_decision",
      source_id: decisionId,
      title: `Freeze decision · ${decisionId}`,
      summary: `Governed freeze proposal for ${planId}`,
      status,
      risk_level: "medium",
      action_type: "freeze",
      target: {
        type: "candidate_artifact",
        id: `${planId}-execution-artifact`,
        version: "1.0.0",
      },
      occurred_at: occurredAt,
      evidence_class: "incident_severity",
      origin: "unknown",
      record: {
        action_type: "freeze",
        approval_decision_id: `apr-${decisionId}`,
        artifact_id: `${planId}-execution-artifact`,
        artifact_ref: `artref-${decisionId}`,
        capital_pool_id: null,
        cooldown_ends_at: null,
        cooldown_started_at: null,
        created_at: occurredAt,
        created_by_id: createdById,
        created_by_role: "operator",
        decision_id: decisionId,
        decision_state: status,
        evidence_class: "incident_severity",
        evidence_refs: [],
        execution_result: null,
        id: decisionId,
        incident_ref: "inc-drift-87d6930c62ee",
        is_active: status === "approved",
        linked_incident_id: "inc-drift-87d6930c62ee",
        linked_postmortem_id: null,
        metadata: { deployment_plan_id: planId },
        notes: "",
        observation_window_ends_at: null,
        observation_window_started_at: null,
        origin: "unknown",
        persona_id: null,
        program_id: null,
        proposed_changes: {},
        provenance: {},
        rationale: "Incident severity threshold reached",
        required_approvals: 1,
        review_chain: [],
        risk_assessment: {},
        risk_level: "medium",
        rollback_followthrough: null,
        score: null,
        status,
        superseded_by: null,
        supersedes_decision_id: null,
        target_id: `${planId}-execution-artifact`,
        target_stage: "paper",
        target_type: "candidate_artifact",
        target_version: "1.0.0",
        tenant_id: "default",
        threshold_snapshots: [],
        updated_at: occurredAt,
      },
      mutation_review: {
        action_type: "freeze",
        allowedActions: [],
        approval_decision: null,
        approval_decision_id: `apr-${decisionId}`,
        created_at: occurredAt,
        decision_id: decisionId,
        decision_state: status,
        evidence_class: "incident_severity",
        evidence_refs: [],
        linked_incident_id: "inc-drift-87d6930c62ee",
        linked_postmortem_id: null,
        meta: {},
        metadata: { deployment_plan_id: planId },
        origin: "unknown",
        proposed_changes: {},
        provenance: {},
        required_approvals: 1,
        review_chain: [],
        risk_assessment: {},
        risk_level: "medium",
        rollback_followthrough: null,
        target_id: `${planId}-execution-artifact`,
        target_type: "candidate_artifact",
        target_version: "1.0.0",
      },
    });

    const threeHistoryRows = [
      makeHostedDecisionRow(
        "evo-sweep-inc-drift-87d6930c62ee",
        "approved",
        "evolution-daily-sweep",
        "hosted-all12-h12-claude-20261027-4923",
        "2026-11-03T01:58:28Z",
      ),
      makeHostedDecisionRow(
        "evo-h12-01a11-20261023-9aeb-duplicate-execution-usera",
        "executed",
        "operator-a",
        "hosted-all12-h12-01a11-20261023-9aeb",
        "2026-10-26T16:11:17Z",
      ),
      makeHostedDecisionRow(
        "evo-h12-01a11-20261023-9aeb-duplicate-execution",
        "canceled",
        "operator-a",
        "hosted-all12-h12-01a11-20261023-9aeb",
        "2026-10-26T11:42:21Z",
      ),
    ];

    mocks.useV5Live.mockImplementation((loader, deps: unknown[]) => {
      if (loader.toString().includes("evolutionJournal")) {
        const [view] = deps;
        if (view === "auto_proposals") {
          return {
            data: {
              data: {
                id: "management_evolution_journal",
                items: [threeHistoryRows[0]],
                summary: {
                  total_items: 2571,
                  returned_items: 1,
                  decision_count: 443,
                  mutation_review_count: 443,
                  postmortem_count: 2128,
                  rollback_count: 0,
                  freeze_order_count: 0,
                },
                auto_proposal_counts: {
                  incident_followup: 434,
                  incident_severity: 9,
                  postmortem_draft: 2128,
                  total: 2571,
                },
              },
              page_info: { next_page_token: "1", page_size: 5, total: 2571 },
              meta: {
                snapshot_at: "2026-11-07T07:40:00Z",
                surfaces: { evolution_decisions: { status: "ok", source: "service" } },
              },
            },
            loading: false,
            error: null,
          };
        }
        return {
          data: {
            data: {
              id: "management_evolution_journal",
              items: threeHistoryRows,
              summary: {
                total_items: 3,
                returned_items: 3,
                decision_count: 3,
                mutation_review_count: 3,
                postmortem_count: 0,
                rollback_count: 0,
                freeze_order_count: 0,
                by_status: { approved: 1, executed: 1, canceled: 1 },
              },
              auto_proposal_counts: {
                incident_followup: 434,
                incident_severity: 9,
                postmortem_draft: 2128,
                total: 2571,
              },
            },
            page_info: { next_page_token: null, page_size: 20, total: 3 },
            meta: {
              snapshot_at: "2026-11-07T07:40:00Z",
              surfaces: { evolution_decisions: { status: "ok", source: "service" } },
            },
          },
          loading: false,
          error: null,
        };
      }
      return { data: [], loading: false, error: null };
    });

    await i18n.changeLanguage("zh-TW");
    const zhView = renderJournal("/management/evolution-journal");
    expect(screen.getByTestId("evolution-active-view-badge")).toHaveTextContent("演化歷史");
    expect(screen.getByTestId("evolution-active-view-badge")).not.toHaveTextContent("真實");
    expect(screen.getByTestId("evolution-journal-summary")).toHaveTextContent(
      "篩選結果：共 3 筆（本頁 3 筆）",
    );
    expect(screen.getByTestId("evolution-journal-pager")).toHaveTextContent("顯示第 1–3 筆，共 3 筆");
    expect(screen.getByTestId("evolution-auto-proposals-summary")).toHaveTextContent(
      "自動提案：共 2571 筆（事件後續追蹤：434 筆、重大事件門檻：9 筆、事後檢討草稿：2128 筆）",
    );
    fireEvent.click(screen.getByTestId("evolution-view-toggle"));
    expect(screen.getByTestId("evolution-view-toggle")).toHaveTextContent("返回演化歷史");
    expect(screen.getByTestId("evolution-journal-summary")).toHaveTextContent(
      "篩選結果：共 2571 筆（本頁 1 筆）",
    );
    zhView.unmount();
    await i18n.changeLanguage("en-US");
  });
});
