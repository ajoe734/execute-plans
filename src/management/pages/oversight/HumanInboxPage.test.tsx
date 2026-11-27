import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { setMockResolver } from "@/lib/bff-v1/client";
import { adaptHumanInboxList, adaptPerformanceAttributionResult } from "@/lib/bff-v1/management";
import {
  HumanInboxPage,
  PerformanceAttributionTestPersonaBanner,
  extractAttributionHiddenTestCounts,
} from "./_core";
import { HumanGateDetailPage } from "./HumanGateDetail";
import type { HumanInboxItem, HumanInboxList } from "@/lib/v5/management/humanInbox";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderInbox(initialEntry = "/management/human-inbox") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/human-inbox" element={<HumanInboxPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function readinessBlockerItem(personaId = "persona-tw-equity", title = "Taiwan Equity Persona"): HumanInboxItem {
  return {
    id: `readiness_blocker:persona:${personaId}`,
    kind: "readiness_blocker",
    title: `Persona needs review: ${title}`,
    summary: `${title} evidence review`,
    requiredRole: "risk-owner",
    consequenceIfApproved: "",
    consequenceIfRejected: "",
    consequenceIfIgnored: "",
    canDecide: false,
    canProceed: false,
    blockingReasons: ["pending research tasks"],
    evidenceRefs: [
      "support/evidence/MGMT-QLIB-006/management_linkage_packet.json",
      "support/evidence/MGMT-QLIB-001/dataset_manifest.json",
    ],
    detailHref: `/management/human-inbox/${encodeURIComponent(`readiness_blocker:persona:${personaId}`)}`,
    links: {
      manageHref: `/management/persona-fleet?persona=${encodeURIComponent(personaId)}`,
      recommendedActionHref: `/management/human-inbox/${encodeURIComponent(`readiness_blocker:persona:${personaId}`)}`,
    },
  };
}

function promotionReviewItem(reviewId = "review-persona-paper-1", title = "Paper Persona"): HumanInboxItem {
  return {
    id: `promotion_review:${reviewId}`,
    kind: "promotion_review",
    title: `Paper to Canary promotion review: ${title}`,
    summary: "promotion_to_canary is awaiting human decision.",
    requiredRole: "approver",
    consequenceIfApproved: "",
    consequenceIfRejected: "",
    consequenceIfIgnored: "",
    canDecide: true,
    canProceed: false,
    detailHref: `/management/human-inbox/${encodeURIComponent(`promotion_review:${reviewId}`)}`,
    links: {
      manageHref: `/management/persona-fleet?persona=persona-paper-1`,
      recommendedActionHref: `/management/human-inbox/${encodeURIComponent(`promotion_review:${reviewId}`)}`,
    },
  };
}

describe("HumanInboxPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
    setMockResolver(undefined);
  });

  afterEach(() => {
    setMockResolver(undefined);
  });

  it("links evidence-bearing readiness blockers to the detail evidence section", () => {
    mocks.useV5Live.mockReturnValue({
      data: [readinessBlockerItem()],
      loading: false,
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText("Persona needs review: Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.queryByText("Evidence missing")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View 2 evidence refs" })).toHaveAttribute(
      "href",
      "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-tw-equity#evidence",
    );
    expect(screen.getByRole("link", { name: "Open action page" })).toHaveAttribute(
      "href",
      "/management/persona-fleet?persona=persona-tw-equity",
    );
  });

  it("honors the persona query by showing only matching inbox items", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        readinessBlockerItem("persona-crypto", "Crypto Persona"),
        readinessBlockerItem("persona-tw-equity", "Taiwan Equity Persona"),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderInbox("/management/human-inbox?persona=persona-tw-equity");

    expect(
      screen.getByText("Focused persona: persona-tw-equity · 1 matching inbox item(s)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Persona needs review: Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.queryByText("Persona needs review: Crypto Persona")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show all inbox items" })).toHaveAttribute(
      "href",
      "/management/human-inbox",
    );
    expect(screen.getByRole("link", { name: "Back to Persona Detail" })).toHaveAttribute(
      "href",
      "/management/personas/persona-tw-equity",
    );
  });

  it("preserves Portfolio Book target context without hiding the live queue", () => {
    mocks.useV5Live.mockReturnValue({
      data: [
        readinessBlockerItem("persona-crypto", "Crypto Persona"),
        readinessBlockerItem("persona-tw-equity", "Taiwan Equity Persona"),
      ],
      loading: false,
      refresh: vi.fn(),
    });

    renderInbox(
      "/management/human-inbox?persona_id=persona-tw-equity&runtime_id=runtime-tw-paper&target_type=portfolio_holding&target_id=runtime-tw-paper%3Aartifact-tw-v1",
    );

    expect(screen.getByText(/Target context:/)).toHaveTextContent(
      "portfolio_holding: runtime-tw-paper:artifact-tw-v1",
    );
    expect(screen.getByText(/Target context:/)).toHaveTextContent("persona: persona-tw-equity");
    expect(screen.getByText(/Target context:/)).toHaveTextContent("runtime: runtime-tw-paper");
    expect(screen.getByText(/Target context:/)).toHaveTextContent("showing live queue");
    expect(screen.getByText("Persona needs review: Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.getByText("Persona needs review: Crypto Persona")).toBeInTheDocument();
    expect(screen.queryByText("No inbox item found for persona-tw-equity.")).not.toBeInTheDocument();
  });

  it("does not report a focused persona as missing before live inbox data loads", () => {
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: true,
      refresh: vi.fn(),
    });

    renderInbox("/management/human-inbox?persona=persona-tw-equity");

    expect(screen.getByText("Loading inbox items for persona-tw-equity…")).toBeInTheDocument();
    expect(screen.queryByText("No inbox item found for persona-tw-equity.")).not.toBeInTheDocument();
    expect(screen.queryByText("Approve mutation v3 for alpha-trader")).not.toBeInTheDocument();
  });

  it("shows transport unavailable warning when live data retrieval fails with an error", () => {
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error("Network timeout"),
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText("Transport Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No Human Inbox items currently require review.")).not.toBeInTheDocument();
  });

  it("shows degraded banner and degraded empty body when live data is degraded and empty", () => {
    const degradedData: HumanInboxList = [];
    degradedData.meta = {
      surfaces: {
        governance_review_queue: { status: "degraded", reason: "timeout" },
      },
    };
    mocks.useV5Live.mockReturnValue({
      data: degradedData,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText(/Live queue status is degraded/)).toBeInTheDocument();
    expect(screen.getByText("No confirmed items loaded. Note: This does not mean the inbox is empty, as some sources timed out.")).toBeInTheDocument();
    expect(screen.queryByText("No Human Inbox items currently require review.")).not.toBeInTheDocument();
  });

  it("renders promotion reviews and links them to the detail page for decision click-through", () => {
    mocks.useV5Live.mockReturnValue({
      data: [promotionReviewItem()],
      loading: false,
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText("Paper to Canary promotion review: Paper Persona")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open detail" })).toHaveAttribute(
      "href",
      "/management/human-inbox/promotion_review%3Areview-persona-paper-1?returnUrl=%2Fmanagement%2Fhuman-inbox",
    );
  });

  it("shows degradedEmptyBody and degraded banner when an adapted BFF payload has unavailable surface and zero rows, and shows emptyBody with no banner when all surfaces are ok", () => {
    const unavailableEmpty = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [],
        summary: { total: 0 },
        facets: {},
      },
      page_info: {
        next_page_token: null,
        total: 0,
        page_size: 50,
      },
      meta: {
        snapshot_at: "2026-11-04T12:00:00Z",
        surfaces: {
          human_inbox: { status: "ok", snapshot_at: "2026-11-04T12:00:00Z" },
          governance_review_queue: {
            status: "unavailable",
            reason: "read_timeout",
            source: "timeout_fallback",
            message: "Governance review queue timed out",
            snapshot_at: "2026-11-04T12:00:00Z",
          },
        },
      },
    })!;

    mocks.useV5Live.mockReturnValue({
      data: unavailableEmpty,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { unmount } = renderInbox();
    expect(screen.getByText(/Live queue status is degraded/)).toBeInTheDocument();
    expect(
      screen.getByText("No confirmed items loaded. Note: This does not mean the inbox is empty, as some sources timed out."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No Human Inbox items currently require review.")).not.toBeInTheDocument();
    unmount();

    const okEmpty = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [],
        summary: { total: 0 },
        facets: {},
      },
      page_info: {
        next_page_token: null,
        total: 0,
        page_size: 50,
      },
      meta: {
        snapshot_at: "2026-11-04T12:00:00Z",
        surfaces: {
          human_inbox: { status: "ok", snapshot_at: "2026-11-04T12:00:00Z" },
          governance_review_queue: { status: "ok", snapshot_at: "2026-11-04T12:00:00Z" },
        },
      },
    })!;

    mocks.useV5Live.mockReturnValue({
      data: okEmpty,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderInbox();
    expect(screen.getByText("No Human Inbox items currently require review.")).toBeInTheDocument();
    expect(screen.queryByText(/Live queue status is degraded/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("No confirmed items loaded. Note: This does not mean the inbox is empty, as some sources timed out."),
    ).not.toBeInTheDocument();
  });

  it("shows rows and degraded banner when surface is degraded with real incident and approval rows, ranking incident above approval with no approve/reject controls and linking to /management/incidents/:id", () => {
    const adapted = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [
          {
            actor_id: "user-risk-lead-1",
            actor_role: "risk_owner",
            authority_status: "authorized",
            authorization_scope: "capital_pool",
            candidate_digest: "sha256:cand-1bad2eca6831457cd885",
            capital_pool_id: "pool-canary-tw-equity",
            conditions: [],
            controller_record_ref: "ctrl:rec-1bad2eca6831457cd885",
            created_at: "2026-11-04T11:45:00Z",
            decided_at: null,
            decision: "approve",
            decision_id: "dec-capital-pool-activation-001",
            decision_state: "proposed",
            event_id: "evt-dec-001",
            evidence_refs: ["evidence:pool-canary-tw-equity:readiness"],
            expires_at: "2026-11-05T11:45:00Z",
            metadata: { stage: "canary" },
            owner_user_id: "user-ops-1",
            persona_id: "persona-tw-equity-canary",
            proof_digest: "sha256:proof-001",
            proposal_content_digest: "sha256:prop-001",
            proposal_id: "prop-capital-pool-001",
            proposal_revision: 1,
            rationale: "Canary capital pool activation requires risk owner sign-off.",
            recorded_at: "2026-11-04T11:45:00Z",
            revoked_at: null,
            risk_level: "high",
            session_id: "sess-001",
            superseded_by: null,
            target_id: "pool-canary-tw-equity",
            target_type: "capital_pool_activation",
            target_version: "v1",
            tenant_id: "tenant-default",
            validation_result_digest: "sha256:val-001",
            version: 1,
          },
          {
            artifact_id: "art-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            artifact_version: "1.0.0",
            binding_id: "bind-persona-paper-1bad2eca6831457cd885",
            capital_pool_id: "pool-paper-default",
            created_at: "2026-11-04T11:58:00Z",
            deployment_plan_id: "deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            deployment_stage: "paper",
            evidence_summary: "Compensation saga entered safe mode after broker validation timeout.",
            incident_cluster_id: "cluster-deployment-comp-1bad2eca6831457cd885",
            incident_id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            id: "incident:inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            inbox_id: "incident:inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            inboxType: "incident",
            source_type: "incident",
            source_id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            lineage_ref: "lineage:deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            persona_capital_binding_id: "pcb-persona-paper-1bad2eca6831457cd885",
            reconciliation_ids: ["rec-1bad2eca6831457cd885"],
            resolved_at: null,
            runtime_id: "runtime-persona-paper-1bad2eca6831457cd885",
            severity: "critical",
            status: "open",
            telemetry_event_ids: ["tel-1bad2eca6831457cd885"],
            title: "Deployment compensation entered safe mode for deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            trace_id: "trace-1bad2eca6831457cd885",
            route: "/management/incidents/inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            allowedActions: {
              canReview: true,
              canRemediate: true,
            },
          },
        ],
      },
      page_info: {
        next_page_token: null,
        total: 2,
        page_size: 50,
      },
      meta: {
        snapshot_at: "2026-11-04T12:00:00Z",
        surfaces: {
          human_inbox: {
            status: "degraded",
            reason: "read_timeout",
            source: "timeout_fallback",
            message: "Partial timeout",
            snapshot_at: "2026-11-04T12:00:00Z",
          },
        },
      },
    })!;

    mocks.useV5Live.mockReturnValue({
      data: adapted,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText(/Live queue status is degraded/)).toBeInTheDocument();
    expect(screen.getByText("incident")).toBeInTheDocument();
    expect(screen.getByText("approval")).toBeInTheDocument();

    const incidentTitle = screen.getByText(
      "Deployment compensation entered safe mode for deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
    );
    const approvalTitle = screen.getByText("capital_pool_activation approval");
    expect(
      incidentTitle.compareDocumentPosition(approvalTitle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.queryByRole("button", { name: /approve|reject/i })).not.toBeInTheDocument();

    const actionLinks = screen.getAllByRole("link", { name: "Open action page" });
    expect(actionLinks[0]).toHaveAttribute(
      "href",
      "/management/incidents/inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
    );
    expect(screen.queryByTestId("inbox-partial-count")).not.toBeInTheDocument();
  });

  it("states shown and total counts in en-US and zh-TW when page_info.total exceeds rows returned, and hides it when equal", async () => {
    const partialList = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [
          {
            artifact_id: "art-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            artifact_version: "1.0.0",
            binding_id: "bind-persona-paper-1bad2eca6831457cd885",
            capital_pool_id: "pool-paper-default",
            created_at: "2026-11-04T11:58:00Z",
            deployment_plan_id: "deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            deployment_stage: "paper",
            evidence_summary: "Compensation saga entered safe mode.",
            incident_cluster_id: "cluster-deployment-comp-1bad2eca6831457cd885",
            incident_id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            id: "inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            lineage_ref: "lineage:deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            persona_capital_binding_id: "pcb-persona-paper-1bad2eca6831457cd885",
            reconciliation_ids: ["rec-1bad2eca6831457cd885"],
            resolved_at: null,
            runtime_id: "runtime-persona-paper-1bad2eca6831457cd885",
            severity: "critical",
            status: "open",
            telemetry_event_ids: ["tel-1bad2eca6831457cd885"],
            title: "Deployment compensation entered safe mode for deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
            trace_id: "trace-1bad2eca6831457cd885",
          },
        ],
      },
      page_info: {
        next_page_token: "cursor-2",
        total: 5,
        page_size: 1,
      },
      meta: {
        snapshot_at: "2026-11-04T12:00:00Z",
        surfaces: {
          human_inbox: { status: "ok", snapshot_at: "2026-11-04T12:00:00Z" },
        },
      },
    })!;

    mocks.useV5Live.mockReturnValue({
      data: partialList,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    await i18n.changeLanguage("en-US");
    const { unmount } = renderInbox();
    expect(screen.getByText("Showing 1 of 5 items")).toBeInTheDocument();
    unmount();

    await i18n.changeLanguage("zh-TW");
    const { unmount: unmountZh } = renderInbox();
    expect(screen.getByText("顯示 1 / 共 5 筆項目")).toBeInTheDocument();
    unmountZh();

    await i18n.changeLanguage("en-US");
    const equalList = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [partialList[0]],
      },
      page_info: {
        next_page_token: null,
        total: 1,
        page_size: 50,
      },
      meta: {
        snapshot_at: "2026-11-04T12:00:00Z",
        surfaces: {
          human_inbox: { status: "ok", snapshot_at: "2026-11-04T12:00:00Z" },
        },
      },
    })!;

    mocks.useV5Live.mockReturnValue({
      data: equalList,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderInbox();
    expect(screen.queryByText(/Showing .* of .* items/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("inbox-partial-count")).not.toBeInTheDocument();
  });

  it("shows no cannot proceed badge for a pending incident row from the real BFF projector while showing the badge for an explicit can_proceed false incident and a pending non-incident row", async () => {
    const realPendingIncidentRow = {
      id: "incident:inc-deployment-comp-deployment-saga-plan-persona-paper-abb0434d691076cbc08c",
      inboxType: "incident",
      source_type: "incident",
      status: "open",
      action_state: "pending",
      priority: "critical",
      created_at: "2026-10-29T13:14:36Z",
      route: "/management/incidents/inc-deployment-comp-deployment-saga-plan-persona-paper-abb0434d691076cbc08c",
      allowedActions: {
        canReview: true,
        canRemediate: true,
      },
      title: "Deployment compensation entered safe mode for deployment-saga-plan-persona-paper-abb0434d691076cbc08c",
    };

    const pendingIncidentOnly = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [realPendingIncidentRow],
      },
    })!;

    expect(pendingIncidentOnly).toHaveLength(1);
    expect(pendingIncidentOnly[0].canProceed).toBe(true);
    expect(pendingIncidentOnly[0].canDecide).toBe(false);

    mocks.useV5Live.mockReturnValue({
      data: pendingIncidentOnly,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    await i18n.changeLanguage("en-US");
    const { unmount } = renderInbox();

    expect(screen.getByText(realPendingIncidentRow.title)).toBeInTheDocument();
    expect(screen.queryByText("cannot proceed")).not.toBeInTheDocument();
    expect(screen.queryByText(/required role:/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|reject/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open action page" })).toHaveAttribute(
      "href",
      realPendingIncidentRow.route,
    );
    unmount();

    await i18n.changeLanguage("zh-TW");
    const { unmount: unmountZh } = renderInbox();
    expect(screen.getByText(realPendingIncidentRow.title)).toBeInTheDocument();
    expect(screen.queryByText("無法繼續")).not.toBeInTheDocument();
    expect(screen.queryByText(/需要角色/)).not.toBeInTheDocument();
    unmountZh();

    await i18n.changeLanguage("en-US");
    const mixedList = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [
          realPendingIncidentRow,
          {
            ...realPendingIncidentRow,
            id: "incident:inc-explicit-cannot-proceed",
            title: "Explicitly blocked incident",
            can_proceed: false,
          },
          {
            id: "approval:dec-pending-gate",
            inboxType: "approval",
            source_type: "approval",
            status: "open",
            action_state: "pending",
            title: "Pending approval gate",
            route: "/management/approvals?approval=dec-pending-gate",
          },
        ],
      },
    })!;

    expect(mixedList[0].canProceed).toBe(true);
    expect(mixedList[1].canProceed).toBe(false);
    expect(mixedList[2].canProceed).toBe(false);

    mocks.useV5Live.mockReturnValue({
      data: mixedList,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderInbox();
    expect(screen.getAllByText("cannot proceed")).toHaveLength(2);
  });

  it("renders meetings ending in REVIEW, due meetings refused for too few participants, and proposals waiting for an operator with meeting links (AC4)", async () => {
    await i18n.changeLanguage("en-US");
    const meetingInboxList = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [
          {
            id: "meeting_review:mtg-review-01",
            item_id: "mtg-review-01",
            inbox_id: "meeting_review:mtg-review-01",
            kind: "meeting_review",
            inboxType: "meeting",
            inbox_type: "meeting",
            source_type: "meeting",
            source_id: "mtg-review-01",
            meeting_id: "mtg-review-01",
            meeting_type: "MT-1",
            persona_id: "persona-alpha",
            outcome: "REVIEW",
            title: "Meeting mtg-review-01 (MT-1) ended in REVIEW",
            summary: "Deliberative meeting mtg-review-01 requires operator review (synthesis outcome: REVIEW).",
            status: "open",
            action_state: "pending",
            reason: "meeting_outcome_review",
            blocking_reasons: ["meeting_outcome_review"],
            required_role: "operator",
            can_decide: true,
            can_proceed: false,
            href: "/management/meetings/mtg-review-01",
            route: "/management/meetings/mtg-review-01",
            detail_href: "/management/meetings/mtg-review-01",
            links: {
              manageHref: "/management/meetings/mtg-review-01",
              primaryObjectHref: "/management/meetings/mtg-review-01",
              meeting: "/management/meetings/mtg-review-01",
            },
          },
          {
            id: "meeting_refusal:refusal-persona-alpha-MT-3-0",
            item_id: "refusal-persona-alpha-MT-3-0",
            inbox_id: "meeting_refusal:refusal-persona-alpha-MT-3-0",
            kind: "meeting_refusal",
            inboxType: "meeting",
            inbox_type: "meeting",
            source_type: "meeting",
            source_id: "refusal-persona-alpha-MT-3-0",
            meeting_type: "MT-3",
            persona_id: "persona-alpha",
            reason: "insufficient_participants",
            title: "Due meeting MT-3 refused: insufficient_participants",
            summary: "Scheduled or requested meeting MT-3 for persona-alpha was refused because too few participants were eligible.",
            status: "open",
            action_state: "blocked",
            blocking_reasons: ["insufficient_participants"],
            required_role: "operator",
            can_decide: true,
            can_proceed: false,
            href: "/management/meetings?tab=budget",
            route: "/management/meetings?tab=budget",
            detail_href: "/management/meetings?tab=budget",
            links: {
              manageHref: "/management/meetings?tab=budget",
              primaryObjectHref: "/management/meetings?tab=budget",
              meeting: "/management/meetings?tab=budget",
            },
          },
          {
            id: "meeting_proposal:prop-wait-01",
            item_id: "prop-wait-01",
            inbox_id: "meeting_proposal:prop-wait-01",
            kind: "meeting_proposal",
            inboxType: "meeting",
            inbox_type: "meeting",
            source_type: "meeting",
            source_id: "prop-wait-01",
            proposal_id: "prop-wait-01",
            proposal_kind: "governance_approval",
            meeting_id: "mtg-normal-02",
            persona_id: "persona-alpha",
            title: "Meeting proposal prop-wait-01 (governance_approval) waiting for operator",
            summary: "Proposal prop-wait-01 from meeting mtg-normal-02 requires operator review.",
            status: "pending",
            action_state: "pending",
            reason: "proposal_waiting_for_operator",
            blocking_reasons: ["proposal_waiting_for_operator"],
            required_role: "operator",
            can_decide: true,
            can_proceed: false,
            href: "/management/meetings/mtg-normal-02",
            route: "/management/meetings/mtg-normal-02",
            detail_href: "/management/meetings/mtg-normal-02",
            links: {
              manageHref: "/management/meetings/mtg-normal-02",
              primaryObjectHref: "/management/meetings/mtg-normal-02",
              meeting: "/management/meetings/mtg-normal-02",
            },
          },
        ],
      },
      meta: {
        snapshot_at: "2026-11-16T10:00:00Z",
        surfaces: {
          human_inbox: { status: "ok", snapshot_at: "2026-11-16T10:00:00Z" },
          meetings: { status: "ok", snapshot_at: "2026-11-16T10:00:00Z" },
        },
      },
    })!;

    expect(meetingInboxList.map((i) => i.kind)).toEqual([
      "meeting_review",
      "meeting_refusal",
      "meeting_proposal",
    ]);

    mocks.useV5Live.mockReturnValue({
      data: meetingInboxList,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText("meeting_review")).toBeInTheDocument();
    expect(screen.getByText("meeting_refusal")).toBeInTheDocument();
    expect(screen.getByText("meeting_proposal")).toBeInTheDocument();
    expect(screen.getByText("Meeting mtg-review-01 (MT-1) ended in REVIEW")).toBeInTheDocument();
    expect(screen.getByText("Due meeting MT-3 refused: insufficient_participants")).toBeInTheDocument();
    expect(
      screen.getByText("Meeting proposal prop-wait-01 (governance_approval) waiting for operator"),
    ).toBeInTheDocument();

    const actionLinks = screen.getAllByRole("link", { name: "Open action page" });
    const hrefs = actionLinks.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/management/meetings/mtg-review-01");
    expect(hrefs).toContain("/management/meetings?tab=budget");
    expect(hrefs).toContain("/management/meetings/mtg-normal-02");
  });

  it("clamps the human inbox card body to three lines by default and toggles expansion on click", () => {
    const longDriftSummary =
      "[older entries dropped] DriftReport drift-76586033-ad6a-4f09-ae0d-9a2e756617a5-drawdown; cluster=drift:drawdown; reconciliation_ids=drift-76586033; worst_metric=drawdown; threshold_metric=rolling_drawdown_multiple; observed=9.609309450237793; comparator=gt; threshold_value=1.25; threshold_window=paper-daily-sweep; policy_source=EVOLUTION_REVIEW_AND_THRESHOLDS.md section 7.1";
    const items = [
      {
        id: "incident:inc-drift-5f668ec4c8d9",
        kind: "incident" as const,
        title: "Drift threshold breach: drift:drawdown",
        summary: longDriftSummary,
        requiredRole: "risk_owner",
        consequenceIfApproved: "",
        consequenceIfRejected: "",
        consequenceIfIgnored: "",
        canDecide: false,
        canProceed: true,
        detailHref: "/management/human-inbox/incident%3Ainc-drift-5f668ec4c8d9",
      },
    ] as unknown as HumanInboxList;

    mocks.useV5Live.mockReturnValue({
      data: items,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderInbox();

    const body = screen.getByTestId("inbox-summary-incident:inc-drift-5f668ec4c8d9");
    const toggle = screen.getByTestId("inbox-summary-toggle-incident:inc-drift-5f668ec4c8d9");

    expect(body).toHaveClass("line-clamp-3");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Show more");

    fireEvent.click(toggle);
    expect(body).not.toHaveClass("line-clamp-3");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("Show less");

    fireEvent.click(toggle);
    expect(body).toHaveClass("line-clamp-3");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders BFF persona and strategy display names, localized incident summary from summary_key and summary_params, and never uses evidence_summary as the card body (AC1/AC2/AC4)", async () => {
    const rawPayload = {
      data: {
        id: "human_inbox",
        items: [
          {
            id: "incident:inc-drift-2330",
            inboxType: "incident",
            source_type: "incident",
            source_id: "inc-drift-2330",
            status: "open",
            title: "inc-drift-2330",
            title_display: "青禾｜2330 台股 Paper 學習 R2 · Drift threshold breach",
            persona_id: "persona-be19a1fac471247f2b2a",
            persona_display_name: "青禾｜2330 台股 Paper 學習 R2",
            persona_name_missing: false,
            strategy_id: "strategy-persona-2330",
            strategy_display_name: "青禾 2330 動能策略",
            strategy_name_missing: false,
            binding_id: "bind-2330-paper",
            evidence_summary: "alerts=alert-drift-001,alert-drift-002",
            summary_key: "incident.summary.drift_threshold_breach",
            summary_params: {
              metric: "rolling_drawdown_multiple",
              observed: 9.6093,
              threshold: 1.25,
              comparator: "gt",
              occurrence_count: 4,
              first_seen_at: "2026-11-19T08:00:00Z",
              last_seen_at: "2026-11-20T09:30:00Z",
            },
            route: "/management/incidents/inc-drift-2330",
          },
          {
            id: "incident:inc-orphan-99",
            inboxType: "incident",
            source_type: "incident",
            source_id: "inc-orphan-99",
            status: "open",
            title: "inc-orphan-99",
            persona_id: "persona-orphan-99",
            persona_display_name: null,
            persona_name_missing: true,
            strategy_id: "strategy-orphan-99",
            strategy_display_name: null,
            strategy_name_missing: true,
            evidence_summary: "alerts=alert-orphan-99",
            route: "/management/incidents/inc-orphan-99",
          },
          {
            id: "incident:inc-owner-prose-evidence",
            inboxType: "incident",
            source_type: "incident",
            source_id: "inc-owner-prose-evidence",
            status: "open",
            title: "Deployment compensation entered safe mode",
            evidence_summary: "Compensation saga entered safe mode after broker validation timeout.",
            route: "/management/incidents/inc-owner-prose-evidence",
          },
          {
            id: "incident:inc-plain-summary",
            inboxType: "incident",
            source_type: "incident",
            source_id: "inc-plain-summary",
            status: "open",
            title: "Deployment incident on paper",
            summary: "Deployment incident (stage: paper) across 2 occurrences.",
            evidence_summary: "alerts=alert-deploy-01,alert-deploy-02",
            route: "/management/incidents/inc-plain-summary",
          },
        ],
      },
    };

    const adapted = adaptHumanInboxList(rawPayload)!;
    expect(adapted).toHaveLength(4);
    expect(adapted[0].summary ?? "").not.toContain("alerts=alert-drift-001");
    expect(adapted[1].summary ?? "").toBe("");
    expect(adapted[2].summary).toBe(
      "Compensation saga entered safe mode after broker validation timeout.",
    );
    expect(adapted[2].evidenceSummary).toBe(
      "Compensation saga entered safe mode after broker validation timeout.",
    );
    expect(adapted[3].summary).toBe(
      "Deployment incident (stage: paper) across 2 occurrences.",
    );

    mocks.useV5Live.mockReturnValue({
      data: adapted,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    await i18n.changeLanguage("en-US");
    const { unmount } = renderInbox();

    expect(
      screen.getByTestId("inbox-title-incident:inc-drift-2330"),
    ).toHaveTextContent("青禾｜2330 台股 Paper 學習 R2 · Drift threshold breach");
    expect(
      screen.getByTestId("inbox-secondary-id-incident:inc-drift-2330"),
    ).toHaveTextContent("inc-drift-2330");
    expect(
      screen.getByTestId("inbox-persona-incident:inc-drift-2330"),
    ).toHaveTextContent("青禾｜2330 台股 Paper 學習 R2");
    expect(
      screen.getByTestId("inbox-persona-incident:inc-drift-2330"),
    ).toHaveTextContent("(persona-be19a1fac471247f2b2a)");
    expect(
      screen.getByTestId("inbox-strategy-incident:inc-drift-2330"),
    ).toHaveTextContent("青禾 2330 動能策略");
    expect(
      screen.getByTestId("inbox-strategy-incident:inc-drift-2330"),
    ).toHaveTextContent("(strategy-persona-2330)");

    const summaryEl = screen.getByTestId("inbox-summary-incident:inc-drift-2330");
    expect(summaryEl.textContent).toContain("rolling_drawdown_multiple");
    expect(summaryEl.textContent).toContain("9.6093");
    expect(summaryEl.textContent).toContain("1.25");
    expect(summaryEl.textContent).toContain("+8.3593");
    expect(summaryEl.textContent).toContain("4 times since 2026-11-19T08:00:00Z");
    expect(summaryEl.textContent).not.toContain("alerts=alert-drift-001");

    expect(
      screen.getByTestId("inbox-persona-name-missing-incident:inc-orphan-99"),
    ).toHaveTextContent("Name missing");
    expect(
      screen.getByTestId("inbox-strategy-name-missing-incident:inc-orphan-99"),
    ).toHaveTextContent("Name missing");
    expect(
      screen.queryByTestId("inbox-summary-incident:inc-orphan-99"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/alerts=alert-orphan-99/)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("inbox-summary-incident:inc-owner-prose-evidence"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("inbox-summary-incident:inc-plain-summary"),
    ).toHaveTextContent("Deployment incident (stage: paper) across 2 occurrences.");
    unmount();

    await i18n.changeLanguage("zh-TW");
    const { unmount: unmountZh } = renderInbox();
    const zhSummary = screen.getByTestId("inbox-summary-incident:inc-drift-2330");
    expect(zhSummary.textContent).toContain("模擬與實盤偏離超過門檻");
    expect(zhSummary.textContent).toContain("超出門檻 +8.3593");
    expect(zhSummary.textContent).toContain("累計發生 4 次");
    expect(
      screen.getByTestId("inbox-persona-name-missing-incident:inc-orphan-99"),
    ).toHaveTextContent("名稱未登記");
    unmountZh();
    await i18n.changeLanguage("en-US");
  });

  it("extracts and renders hidden test-persona strategy count and toggle filter for performance attribution (AC3)", async () => {
    await i18n.changeLanguage("en-US");
    const adaptedAttr = adaptPerformanceAttributionResult({
      data: {
        id: "performance_attribution",
        dimension: "strategy",
        window: "30d",
        items: [],
        summary: {
          hidden_test_persona_count: 5,
          hidden_test_strategy_count: 8,
          include_test_personas: false,
        },
      },
      meta: {
        hidden_test_persona_count: 5,
        hidden_test_strategy_count: 8,
      },
    });
    expect(adaptedAttr?.hiddenTestPersonaCount).toBe(5);
    expect(adaptedAttr?.hiddenTestStrategyCount).toBe(8);
    expect(adaptedAttr?.includeTestPersonas).toBe(false);
    expect(extractAttributionHiddenTestCounts(adaptedAttr)).toEqual({
      hiddenPersonaCount: 5,
      hiddenStrategyCount: 8,
      includeTestPersonas: false,
    });

    const onToggle = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <PerformanceAttributionTestPersonaBanner
          attribution={adaptedAttr}
          onToggleIncludeTestPersonas={onToggle}
        />
      </I18nextProvider>,
    );

    expect(screen.getByTestId("attribution-test-personas-count")).toHaveTextContent(
      "8 test-persona strategies (5 test personas) are hidden by default.",
    );
    const toggleBtn = screen.getByTestId("attribution-toggle-test-personas-button");
    expect(toggleBtn).toHaveTextContent("Show test strategies (8)");
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("adapts verbatim BFF _human_input_ticket_items for direct-human submit and Persona provide_input, enforces operator vs viewer can_respond permission, sends canonical PATCH, and reads back canonical GET after the ticket leaves the human_actionable queue (FE-MEETING-ACTION-FOLLOWTHROUGH-20261123)", async () => {
    await i18n.changeLanguage("en-US");

    // Verbatim field-for-field payload emitted by BFF _human_input_ticket_items (b3596a8eb)
    const makeVerbatimDirectHumanRow = (canRespond: boolean) => ({
      id: "meeting_action:tkt-human-001",
      item_id: "tkt-human-001",
      inbox_id: "meeting_action:tkt-human-001",
      ticket_id: "tkt-human-001",
      kind: "meeting_action",
      inbox_type: "meeting",
      inboxType: "meeting",
      source_type: "meeting_action",
      source_id: "tkt-human-001",
      meeting_id: "mtg-w48-001",
      meeting_type: "MT-1",
      persona_id: "persona-alpha",
      owner_kind: "human",
      owner_id: "operator",
      deliverable: "external_action",
      requested_material: "external_action",
      acceptance_criterion: "Attach signed vendor data license terms",
      human_requirement: "Vendor contract terms require operator confirmation.",
      reason: "Vendor contract terms require operator confirmation.",
      review_reason: null,
      status: "open",
      action_state: "pending",
      response_action: "submit",
      resumes_with: "Chair review in next MT-1 meeting",
      required_role: "operator",
      required_actor: "operator",
      can_respond: canRespond,
      can_decide: canRespond,
      can_proceed: false,
      revision: 2,
      due_at: "2026-11-30T00:00:00Z",
      next_review: "MT-1",
      overdue: false,
      evidence_refs: [{ kind: "research_artifact", artifact_id: "artifact-license-draft" }],
      blocking_reasons: ["Vendor contract terms require operator confirmation."],
      title: "Confirm external data license scope",
      summary:
        "Meeting mtg-w48-001 (MT-1) assigned direct human work: Confirm external data license scope (deliverable: external_action).",
      href: "/management/meetings/mtg-w48-001?action=tkt-human-001",
      route: "/management/meetings/mtg-w48-001?action=tkt-human-001",
      detail_href: "/management/human-inbox/meeting_action%3Atkt-human-001",
      links: {
        manageHref: "/management/meetings/mtg-w48-001?action=tkt-human-001",
        primaryObjectHref: "/management/meetings/mtg-w48-001?action=tkt-human-001",
        meeting: "/management/meetings/mtg-w48-001",
        ticket: "/api/v1/research/tickets/tkt-human-001",
      },
    });

    const verbatimPersonaWaitRow = {
      id: "meeting_action:tkt-persona-002",
      item_id: "tkt-persona-002",
      inbox_id: "meeting_action:tkt-persona-002",
      ticket_id: "tkt-persona-002",
      kind: "meeting_action",
      inbox_type: "meeting",
      inboxType: "meeting",
      source_type: "meeting_action",
      source_id: "tkt-persona-002",
      meeting_id: "mtg-w48-001",
      meeting_type: "MT-1",
      persona_id: "persona-alpha",
      owner_kind: "persona",
      owner_id: "persona-alpha",
      deliverable: "experiment_spec",
      requested_material: "Clarify benchmark exclusion list for 2330 chip factor",
      acceptance_criterion: "60d out-of-sample IC > 0.03",
      human_requirement: "Persona execution requires human input on benchmark universe",
      reason: "Awaiting operator input on benchmark exclusion list",
      review_reason: "Returned in prior meeting for universe clarification",
      status: "waiting_for_input",
      action_state: "blocked",
      response_action: "provide_input",
      resumes_with: "Persona execution on persona-alpha",
      required_role: "operator",
      required_actor: "operator",
      can_respond: true,
      can_decide: true,
      can_proceed: false,
      revision: 4,
      due_at: null,
      next_review: "MT-1",
      overdue: false,
      evidence_refs: [],
      blocking_reasons: ["Awaiting operator input on benchmark exclusion list"],
      title: "Backtest 2330 chip factor with exclusion filter",
      summary:
        "Persona action tkt-persona-002 from meeting mtg-w48-001 is waiting for human input.",
      href: "/management/meetings/mtg-w48-001?action=tkt-persona-002",
      route: "/management/meetings/mtg-w48-001?action=tkt-persona-002",
      detail_href: "/management/human-inbox/meeting_action%3Atkt-persona-002",
      links: {
        manageHref: "/management/meetings/mtg-w48-001?action=tkt-persona-002",
        primaryObjectHref: "/management/meetings/mtg-w48-001?action=tkt-persona-002",
        meeting: "/management/meetings/mtg-w48-001",
        ticket: "/api/v1/research/tickets/tkt-persona-002",
      },
    };

    // 1. Viewer permission (can_respond: false): form is hidden and read-only explanation is shown
    const viewerList = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [makeVerbatimDirectHumanRow(false)],
      },
    })!;
    expect(viewerList[0].meetingAction?.canRespond).toBe(false);
    expect(viewerList[0].meetingAction?.responseAction).toBe("submit");
    expect(viewerList[0].meetingAction?.humanRequirement).toBe(
      "Vendor contract terms require operator confirmation.",
    );
    expect(viewerList[0].meetingAction?.deliverable).toBe("external_action");

    mocks.useV5Live.mockReturnValue({
      data: viewerList,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { unmount: unmountViewer } = renderInbox();
    const viewerCard = screen.getByTestId("inbox-card-meeting_action:tkt-human-001");
    expect(within(viewerCard).getByTestId("inbox-meeting-action-card")).toBeInTheDocument();
    expect(within(viewerCard).getByTestId("inbox-meeting-action-view-only")).toBeInTheDocument();
    expect(
      within(viewerCard).queryByTestId("inbox-meeting-action-form"),
    ).not.toBeInTheDocument();
    unmountViewer();

    // 2. Operator permission (can_respond: true): both direct-human and Persona waiting-for-input cards render
    let actionableList = adaptHumanInboxList({
      data: {
        id: "human_inbox",
        items: [makeVerbatimDirectHumanRow(true), verbatimPersonaWaitRow],
      },
    })!;
    expect(actionableList).toHaveLength(2);
    expect(actionableList[0].meetingAction?.nextTransition).toBe("submit");
    expect(actionableList[0].meetingAction?.resumesLabel).toBe("Chair review in next MT-1 meeting");
    expect(actionableList[1].meetingAction?.nextTransition).toBe("provide_input");
    expect(actionableList[1].meetingAction?.humanRequirement).toBe(
      "Persona execution requires human input on benchmark universe",
    );
    expect(actionableList[1].meetingAction?.requestedMaterial).toBe(
      "Clarify benchmark exclusion list for 2330 chip factor",
    );

    let capturedPatchHeaders: Record<string, string> = {};
    let capturedPatchBody: unknown = null;
    let ticketGetCalls = 0;

    setMockResolver((method, path) => {
      if (method === "PATCH" && path === "/api/v1/research/tickets/tkt-human-001") {
        return (req) => {
          capturedPatchHeaders = req.headers;
          capturedPatchBody = req.body;
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "research",
              data: {
                ticket_id: "tkt-human-001",
                title: "Confirm external data license scope",
                status: "submitted",
                revision: 3,
                evidence_refs: [{ kind: "research_artifact", artifact_id: "artifact-license-draft" }],
                evidence_notes: [
                  {
                    note_id: "note-human-1",
                    title: "Signed vendor addendum",
                    body: "Confirmed redistribution and paper-trading clauses with vendor legal.",
                    source_refs: [],
                  },
                ],
                meeting_action: {
                  meeting_id: "mtg-w48-001",
                  meeting_type: "MT-1",
                  owner_kind: "human",
                  owner_id: "operator",
                  deliverable: "external_action",
                  acceptance_criterion: "Attach signed vendor data license terms",
                },
              },
            },
          };
        };
      }
      if (method === "GET" && path === "/api/v1/research/tickets/tkt-human-001") {
        return () => {
          ticketGetCalls += 1;
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "research",
              data: {
                ticket_id: "tkt-human-001",
                title: "Confirm external data license scope",
                status: "submitted",
                revision: 3,
                evidence_refs: [{ kind: "research_artifact", artifact_id: "artifact-license-draft" }],
                evidence_notes: [
                  {
                    note_id: "note-human-1",
                    title: "Signed vendor addendum",
                    body: "Confirmed redistribution and paper-trading clauses with vendor legal.",
                    source_refs: [],
                  },
                ],
                meeting_action: {
                  meeting_id: "mtg-w48-001",
                  meeting_type: "MT-1",
                  owner_kind: "human",
                  owner_id: "operator",
                  deliverable: "external_action",
                  acceptance_criterion: "Attach signed vendor data license terms",
                },
              },
            },
          };
        };
      }
      return undefined;
    });

    const refreshSpy = vi.fn(() => {
      // Simulate the submitted ticket leaving the human_actionable=true list on refresh
      actionableList = adaptHumanInboxList({
        data: {
          id: "human_inbox",
          items: [verbatimPersonaWaitRow],
        },
      })!;
    });

    mocks.useV5Live.mockImplementation(() => ({
      data: actionableList,
      loading: false,
      error: null,
      refresh: refreshSpy,
    }));

    const { rerender, unmount: unmountOp } = renderInbox();

    // Direct-human reason and separate deliverable are both visible
    const humanCard = screen.getByTestId("inbox-card-meeting_action:tkt-human-001");
    expect(humanCard).toHaveTextContent("Vendor contract terms require operator confirmation.");
    expect(humanCard).toHaveTextContent("external_action");
    expect(humanCard).toHaveTextContent("Attach signed vendor data license terms");
    expect(humanCard).toHaveTextContent("Chair review in next MT-1 meeting");

    // Persona waiting-for-input card shows separate human_requirement, reason, and requested_material
    const personaCard = screen.getByTestId("inbox-card-meeting_action:tkt-persona-002");
    expect(personaCard).toHaveTextContent("Awaiting operator input on benchmark exclusion list");
    expect(personaCard).toHaveTextContent(
      "Persona execution requires human input on benchmark universe",
    );
    expect(personaCard).toHaveTextContent(
      "Clarify benchmark exclusion list for 2330 chip factor",
    );

    // Submit response on tkt-human-001
    fireEvent.change(document.getElementById("meeting-action-title-tkt-human-001")!, {
      target: { value: "Signed vendor addendum" },
    });
    fireEvent.change(document.getElementById("meeting-action-body-tkt-human-001")!, {
      target: {
        value: "Confirmed redistribution and paper-trading clauses with vendor legal.",
      },
    });
    fireEvent.click(within(humanCard).getByTestId("inbox-meeting-action-submit"));

    const continuedHumanCard = await screen.findByTestId("inbox-continued-ticket-tkt-human-001");

    expect(capturedPatchHeaders["Idempotency-Key"]).toBeTruthy();
    expect(capturedPatchBody).toEqual({
      action: "submit",
      expected_revision: 2,
      evidence_note: {
        title: "Signed vendor addendum",
        body: "Confirmed redistribution and paper-trading clauses with vendor legal.",
      },
    });
    expect(ticketGetCalls).toBeGreaterThanOrEqual(1);
    expect(refreshSpy).toHaveBeenCalled();

    // After refresh removed tkt-human-001 from the human_actionable list,
    // the continued ticket card and its canonical GET evidence_notes body remain visible on the same ticket_id!
    expect(continuedHumanCard).toHaveTextContent("Submitted, not yet accepted");
    const continuation = within(continuedHumanCard).getByTestId("inbox-meeting-action-continuation");
    expect(continuation).toHaveTextContent("tkt-human-001");
    expect(continuation).toHaveTextContent("Signed vendor addendum");
    expect(continuation).toHaveTextContent(
      "Confirmed redistribution and paper-trading clauses with vendor legal.",
    );
    unmountOp();

    // 3. Direct reload of /management/human-inbox/meeting_action%3Atkt-human-001 after it left the actionable list
    // falls back to canonical GET /api/v1/research/tickets/tkt-human-001 and displays the resolved ticket & evidence_notes
    mocks.useV5Live.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/management/human-inbox/meeting_action%3Atkt-human-001"]}>
          <Routes>
            <Route path="/management/human-inbox/:id" element={<HumanGateDetailPage />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    const detailContinuation = await screen.findByTestId("inbox-meeting-action-continuation");
    expect(detailContinuation).toHaveTextContent("tkt-human-001");
    expect(detailContinuation).toHaveTextContent(
      "Confirmed redistribution and paper-trading clauses with vendor legal.",
    );
  });
});
