import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
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
    expect(screen.getByText("persona-tw-equity")).toBeInTheDocument();
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
});
