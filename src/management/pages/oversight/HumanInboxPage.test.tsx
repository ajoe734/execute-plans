import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { HumanInboxPage } from "./_core";
import type {
  HumanInboxItem,
  HumanInboxListState,
  HumanInboxSurfaceStatus,
} from "@/lib/v5/management/humanInbox";

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

function inboxState(
  items: HumanInboxItem[],
  status: HumanInboxSurfaceStatus = "ok",
  partial = false,
): HumanInboxListState {
  return {
    items,
    surface: { status, source: "bff_composed" },
    snapshotAt: "2026-07-13T00:00:00Z",
    partial,
  };
}

describe("HumanInboxPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("links evidence-bearing readiness blockers to the detail evidence section", () => {
    mocks.useV5Live.mockReturnValue({
      data: inboxState([readinessBlockerItem()]),
      loading: false,
      error: undefined,
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
      data: inboxState([
        readinessBlockerItem("persona-crypto", "Crypto Persona"),
        readinessBlockerItem("persona-tw-equity", "Taiwan Equity Persona"),
      ]),
      loading: false,
      error: undefined,
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
      data: inboxState([
        readinessBlockerItem("persona-crypto", "Crypto Persona"),
        readinessBlockerItem("persona-tw-equity", "Taiwan Equity Persona"),
      ]),
      loading: false,
      error: undefined,
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
      error: undefined,
      refresh: vi.fn(),
    });

    renderInbox("/management/human-inbox?persona=persona-tw-equity");

    expect(screen.getByText("Loading inbox items for persona-tw-equity…")).toBeInTheDocument();
    expect(screen.queryByText("No inbox item found for persona-tw-equity.")).not.toBeInTheDocument();
    expect(screen.queryByText("Approve mutation v3 for alpha-trader")).not.toBeInTheDocument();
  });

  it("shows unavailable with retry instead of a false empty inbox", () => {
    const refresh = vi.fn();
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error("request timed out"),
      refresh,
    });

    renderInbox();

    expect(screen.getByText("Human Inbox status unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No Human Inbox items currently require review.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Approve mutation v3 for alpha-trader")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta drift critical on momentum sleeve")).not.toBeInTheDocument();
  });

  it("shows an authoritative empty state only for a healthy complete response", () => {
    mocks.useV5Live.mockReturnValue({
      data: inboxState([]),
      loading: false,
      error: undefined,
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText("No Human Inbox items currently require review.")).toBeInTheDocument();
    expect(screen.queryByText("Human Inbox is incomplete")).not.toBeInTheDocument();
  });

  it("does not call a degraded empty response authoritative", () => {
    mocks.useV5Live.mockReturnValue({
      data: inboxState([], "degraded", true),
      loading: false,
      error: undefined,
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText("Human Inbox is incomplete")).toBeInTheDocument();
    expect(screen.queryByText("No Human Inbox items currently require review.")).not.toBeInTheDocument();
  });

  it("keeps confirmed rows visible when a refresh fails", () => {
    mocks.useV5Live.mockReturnValue({
      data: inboxState([
        readinessBlockerItem("persona-crypto", "Crypto Persona"),
        readinessBlockerItem("persona-tw-equity", "Taiwan Equity Persona"),
      ]),
      loading: false,
      error: new Error("refresh timed out"),
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText("Human Inbox is incomplete")).toBeInTheDocument();
    expect(screen.getByText("Persona needs review: Crypto Persona")).toBeInTheDocument();
    expect(screen.getByText("Persona needs review: Taiwan Equity Persona")).toBeInTheDocument();
    expect(screen.queryByText("No Human Inbox items currently require review.")).not.toBeInTheDocument();
  });
});
