import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
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
});
