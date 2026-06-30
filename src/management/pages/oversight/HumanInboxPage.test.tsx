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

function renderInbox() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/management/human-inbox"]}>
        <Routes>
          <Route path="/management/human-inbox" element={<HumanInboxPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function readinessBlockerItem(): HumanInboxItem {
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
    blockingReasons: ["pending research tasks"],
    evidenceRefs: [
      "support/evidence/MGMT-QLIB-006/management_linkage_packet.json",
      "support/evidence/MGMT-QLIB-001/dataset_manifest.json",
    ],
    detailHref: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-tw-equity",
    links: {
      manageHref: "/management/persona-fleet?persona=persona-tw-equity",
      recommendedActionHref: "/management/human-inbox/readiness_blocker%3Apersona%3Apersona-tw-equity",
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
});
