import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { HumanGateDetailPage } from "./HumanGateDetail";
import type { HumanInboxDetail } from "@/lib/v5/management/humanInbox";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
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

describe("HumanGateDetailPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
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

  it("renders readiness blockers as non-decidable blockers with evidence and a management link", () => {
    mocks.useV5Live.mockReturnValue({
      data: readinessBlockerDetail(),
      loading: false,
      refresh: vi.fn(),
    });

    renderDetail();

    expect(screen.getByRole("heading", { name: "Persona needs review: Taiwan Equity Persona" })).toBeInTheDocument();
    expect(screen.getByText("Required role: risk-owner · Decision type: single")).toBeInTheDocument();
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
});
