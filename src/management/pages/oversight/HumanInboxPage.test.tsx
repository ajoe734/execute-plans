import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { adaptHumanInboxList } from "@/lib/bff-v1/management";
import { HumanInboxPage } from "./_core";
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
});
