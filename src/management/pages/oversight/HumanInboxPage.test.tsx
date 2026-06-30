import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { HumanInboxPage } from "./_core";
import type { HumanInboxItem } from "@/lib/v5/management/humanInbox";

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

  it("does not fall back to the legacy mock inbox when live data is unavailable", () => {
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: false,
      refresh: vi.fn(),
    });

    renderInbox();

    expect(screen.getByText("No live inbox items are available.")).toBeInTheDocument();
    expect(screen.queryByText("Approve mutation v3 for alpha-trader")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta drift critical on momentum sleeve")).not.toBeInTheDocument();
  });
});
