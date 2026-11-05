import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { adaptHumanInboxDetail } from "@/lib/bff-v1/management";
import { HumanGateDetailPage } from "./HumanGateDetail";
import type { HumanInboxDetail } from "@/lib/v5/management/humanInbox";
import { mgmt } from "@/lib/bff-v1";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

void i18n.changeLanguage("en-US");

function renderDetail(id = "readiness_blocker:persona:persona-tw-equity") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[`/management/human-inbox/${encodeURIComponent(id)}`]}>
        <Routes>
          <Route path="/management/human-inbox/:id" element={<HumanGateDetailPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function readinessBlockerDetail(): HumanInboxDetail {
  return {
    id: "readiness_blocker:persona:persona-tw-equity",
    kind: "readiness_blocker",
    title: "Persona needs review: Taiwan Equity Persona",
    summary: "TW corporate-action and session-boundary evidence review",
    requiredRole: "risk-owner",
    consequenceIfApproved: "",
    consequenceIfRejected: "",
    consequenceIfIgnored: "",
    canDecide: false,
    canProceed: false,
    blockingReasons: [
      "TW corporate-action and session-boundary evidence review",
      "governance recommendation: hold_for_risk_owner_review",
    ],
    detailHref: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-tw-equity",
    links: {
      manageHref: "/management/persona-fleet?persona=persona-tw-equity",
      recommendedActionHref: "/management/persona-fleet?persona=persona-tw-equity",
    },
    decisionType: "single",
    signatures: [],
    evidenceRefs: [
      "support/evidence/MGMT-QLIB-006/management_linkage_packet.json",
      "support/evidence/MGMT-QLIB-001/dataset_manifest.json",
    ],
    decisionHistory: [],
    auditRefs: [],
  };
}

function promotionReviewDetail(): HumanInboxDetail {
  return {
    id: "promotion_review:review-persona-paper-1",
    kind: "promotion_review",
    title: "Paper to Canary promotion review: Paper Persona",
    summary: "promotion_to_canary is awaiting human decision.",
    requiredRole: "approver",
    consequenceIfApproved: "",
    consequenceIfRejected: "",
    consequenceIfIgnored: "",
    canDecide: true,
    canProceed: false,
    status: "pending",
    sourceId: "review-persona-paper-1",
    personaId: "persona-paper-1",
    reviewId: "review-persona-paper-1",
    reviewType: "promotion_to_canary",
    decisionHref: "/bff/management/promotion-reviews/review-persona-paper-1/decisions",
    allowedActions: {
      canDecide: true,
      canApprove: true,
      canReject: true,
      canRequestEvidence: true,
    },
    blockingReasons: [],
    detailHref: "/management/human-inbox/promotion_review%3Areview-persona-paper-1",
    links: {
      manageHref: "/management/persona-fleet?persona=persona-paper-1",
      recommendedActionHref: "/management/human-inbox/promotion_review%3Areview-persona-paper-1",
    },
    decisionType: "single",
    signatures: [],
    evidenceRefs: ["evidence:persona-paper-1:paper-score"],
    decisionHistory: [],
    auditRefs: [],
  };
}

describe("HumanGateDetailPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
    toastMocks.success.mockReset();
    toastMocks.warning.mockReset();
    toastMocks.error.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render the deterministic seed approval form while live detail is loading", () => {
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: true,
      refresh: vi.fn(),
    });

    renderDetail();

    expect(screen.getByRole("heading", { name: "Loading inbox item…" })).toBeInTheDocument();
    expect(screen.queryByText("Consequences")).not.toBeInTheDocument();
    expect(screen.queryByText("Signatures")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByText("ev:proposal-v3")).not.toBeInTheDocument();
  });

  it("shows unavailable instead of synthetic detail when live detail is absent", () => {
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: false,
      refresh: vi.fn(),
    });

    renderDetail("abc-1");

    expect(screen.getByRole("heading", { name: "Inbox item unavailable" })).toBeInTheDocument();
    expect(screen.queryByText("approval detail unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("Live detail payload unavailable.")).not.toBeInTheDocument();
  });

  it("renders readiness blockers as non-decidable blockers with evidence and a management link", () => {
    mocks.useV5Live.mockReturnValue({
      data: readinessBlockerDetail(),
      loading: false,
      refresh: vi.fn(),
    });

    renderDetail();

    expect(screen.getByRole("heading", { name: "Persona needs review: Taiwan Equity Persona" })).toBeInTheDocument();
    expect(screen.getByText("Required role: risk-owner · Decision type: single")).toBeInTheDocument();
    expect(screen.getByText("readiness_blocker:persona:persona-tw-equity")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "persona-tw-equity" })).toHaveAttribute(
      "href",
      "/management/personas/persona-tw-equity",
    );
    expect(screen.getAllByText("TW corporate-action and session-boundary evidence review").length).toBeGreaterThan(0);
    expect(screen.getByText("support/evidence/MGMT-QLIB-006/management_linkage_packet.json")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "support/evidence/MGMT-QLIB-006/management_linkage_packet.json" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open action page" })).toHaveAttribute(
      "href",
      "/management/persona-fleet?persona=persona-tw-equity",
    );
    expect(screen.queryByText("Consequences")).not.toBeInTheDocument();
    expect(screen.queryByText("Signatures")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request more evidence" })).not.toBeInTheDocument();
  });

  it("renders promotion review decision controls and submits an approval", async () => {
    const refresh = vi.fn();
    const decidePromotionReview = vi.spyOn(mgmt.humanInbox, "decidePromotionReview").mockResolvedValue({
      ok: true,
      persisted: true,
      reviewId: "review-persona-paper-1",
      status: "approved",
      idempotencyKey: "idk-test",
      replayed: false,
    });
    mocks.useV5Live.mockReturnValue({
      data: promotionReviewDetail(),
      loading: false,
      refresh,
    });

    renderDetail("promotion_review:review-persona-paper-1");

    expect(screen.getByRole("heading", { name: "Paper to Canary promotion review: Paper Persona" })).toBeInTheDocument();
    expect(screen.getByText("Promotion decision")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rationale"), {
      target: { value: "Paper evidence passed risk and cost gates." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Approve Canary/ }));

    await waitFor(() => {
      expect(decidePromotionReview).toHaveBeenCalledWith(
        "review-persona-paper-1",
        {
          decision: "approve",
          rationale: "Paper evidence passed risk and cost gates.",
          evidenceRefs: ["evidence:persona-paper-1:paper-score"],
        },
      );
    });
    expect(refresh).toHaveBeenCalled();
    expect(toastMocks.success).toHaveBeenCalledWith("Decision recorded: approved");
  });

  it("shows write-disabled feedback when promotion decision is local-only", async () => {
    const refresh = vi.fn();
    vi.spyOn(mgmt.humanInbox, "decidePromotionReview").mockResolvedValue({
      ok: true,
      persisted: false,
      reviewId: "review-persona-paper-1",
      status: "write_disabled",
      idempotencyKey: "idk-disabled",
    });
    mocks.useV5Live.mockReturnValue({
      data: promotionReviewDetail(),
      loading: false,
      refresh,
    });

    renderDetail("promotion_review:review-persona-paper-1");

    fireEvent.click(screen.getByRole("button", { name: /Approve Canary/ }));

    await waitFor(() => {
      expect(toastMocks.warning).toHaveBeenCalledWith("Real writes are disabled. Decision was not sent to the BFF.");
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("renders the decision-history apply-receipt trail with reviewer and timestamp", () => {
    const detail: HumanInboxDetail = {
      ...promotionReviewDetail(),
      signatures: [{ role: "approver", signedBy: "ops-lead@pantheon", signedAt: "2026-07-11T15:00:00Z" }],
      decisionHistory: [
        { decidedAt: "2026-07-11T15:00:00Z", decidedBy: "ops-lead@pantheon", decision: "approve", note: "Paper evidence passed risk and cost gates." },
      ],
    };
    mocks.useV5Live.mockReturnValue({ data: detail, loading: false, refresh: vi.fn() });

    renderDetail("promotion_review:review-persona-paper-1");

    expect(screen.getByText("Decision history")).toBeInTheDocument();
    expect(screen.getByText("by ops-lead@pantheon · 2026-07-11T15:00:00Z")).toBeInTheDocument();
    expect(screen.getByText("Paper evidence passed risk and cost gates.")).toBeInTheDocument();
    expect(screen.getByText("signed 2026-07-11T15:00:00Z")).toBeInTheDocument();
  });

  it("shows error feedback when promotion decision route rejects", async () => {
    const refresh = vi.fn();
    vi.spyOn(mgmt.humanInbox, "decidePromotionReview").mockRejectedValue(new Error("HTTP 500"));
    mocks.useV5Live.mockReturnValue({
      data: promotionReviewDetail(),
      loading: false,
      refresh,
    });

    renderDetail("promotion_review:review-persona-paper-1");

    fireEvent.click(screen.getByRole("button", { name: /Approve Canary/ }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Decision failed: HTTP 500");
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renders incident detail with canDecide false, no approve or reject controls even when allowedActions has canReview and canRemediate, and manage link to /management/incidents/:id", () => {
    const incidentDetail = adaptHumanInboxDetail({
      data: {
        item: {
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
      },
    })!;

    expect(incidentDetail.kind).toBe("incident");
    expect(incidentDetail.canDecide).toBe(false);

    mocks.useV5Live.mockReturnValue({
      data: incidentDetail,
      loading: false,
      refresh: vi.fn(),
    });

    const { unmount } = renderDetail(
      "incident:inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
    );

    expect(
      screen.getByRole("heading", {
        name: "Deployment compensation entered safe mode for deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Promotion decision")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|reject/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open action page" })).toHaveAttribute(
      "href",
      "/management/incidents/inc-deployment-comp-deployment-saga-plan-persona-paper-1bad2eca6831457cd885",
    );
    unmount();

    const approvalDetail = adaptHumanInboxDetail({
      data: {
        item: {
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
      },
    })!;

    expect(approvalDetail.kind).toBe("approval");
    expect(approvalDetail.canDecide).toBe(true);

    mocks.useV5Live.mockReturnValue({
      data: approvalDetail,
      loading: false,
      refresh: vi.fn(),
    });

    renderDetail("approval:dec-capital-pool-activation-001");
    expect(screen.getByRole("heading", { name: "capital_pool_activation approval" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open action page" })).toHaveAttribute(
      "href",
      "/management/approvals?approval=dec-capital-pool-activation-001",
    );
  });

  it("renders a pending incident row from the real BFF projector with canProceed true, no cannot proceed card, dashes instead of nan for missing persona and summary, and no empty role or decision type in the header", async () => {
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

    const incidentDetail = adaptHumanInboxDetail({
      data: {
        item: realPendingIncidentRow,
      },
    })!;

    expect(incidentDetail.kind).toBe("incident");
    expect(incidentDetail.canProceed).toBe(true);
    expect(incidentDetail.canDecide).toBe(false);
    expect(incidentDetail.personaId).toBeUndefined();
    expect(incidentDetail.summary).toBeUndefined();

    mocks.useV5Live.mockReturnValue({
      data: incidentDetail,
      loading: false,
      refresh: vi.fn(),
    });

    await i18n.changeLanguage("en-US");
    const { unmount } = renderDetail(realPendingIncidentRow.id);

    expect(
      screen.getByRole("heading", {
        name: realPendingIncidentRow.title,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cannot proceed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Required role:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Decision type:/i)).not.toBeInTheDocument();
    expect(screen.queryByText("single")).not.toBeInTheDocument();
    expect(screen.queryByText("nan")).not.toBeInTheDocument();

    const personaDt = screen.getByText("Persona");
    const summaryDt = screen.getByText("Summary");
    expect(personaDt.parentElement?.querySelector("dd")).toHaveTextContent("—");
    expect(summaryDt.parentElement?.querySelector("dd")).toHaveTextContent("—");

    expect(screen.queryByRole("button", { name: /approve|reject/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open action page" })).toHaveAttribute(
      "href",
      realPendingIncidentRow.route,
    );
    unmount();

    await i18n.changeLanguage("zh-TW");
    const { unmount: unmountZh } = renderDetail(realPendingIncidentRow.id);

    expect(screen.queryByText("無法繼續")).not.toBeInTheDocument();
    expect(screen.queryByText(/需要角色/)).not.toBeInTheDocument();
    expect(screen.queryByText(/決策類型/)).not.toBeInTheDocument();
    expect(screen.queryByText("single")).not.toBeInTheDocument();
    expect(screen.queryByText("nan")).not.toBeInTheDocument();
    expect(screen.getByText("Persona").parentElement?.querySelector("dd")).toHaveTextContent("—");
    expect(screen.getByText("Summary").parentElement?.querySelector("dd")).toHaveTextContent("—");
    unmountZh();

    await i18n.changeLanguage("en-US");
    const explicitCannotProceedIncident = adaptHumanInboxDetail({
      data: {
        item: {
          ...realPendingIncidentRow,
          can_proceed: false,
          blocking_reasons: ["Safe mode lock held by operator"],
        },
      },
    })!;

    expect(explicitCannotProceedIncident.canProceed).toBe(false);
    mocks.useV5Live.mockReturnValue({
      data: explicitCannotProceedIncident,
      loading: false,
      refresh: vi.fn(),
    });

    renderDetail(realPendingIncidentRow.id);
    expect(screen.getByRole("heading", { name: "Cannot proceed" })).toBeInTheDocument();
    expect(screen.getByText("Safe mode lock held by operator")).toBeInTheDocument();
  });
});
