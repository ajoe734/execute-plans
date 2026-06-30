import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { v5List, type SentinelFinding } from "@/lib/v5";
import { SentinelPage } from "./Sentinel";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderSentinel(initialEntry = "/management/sentinel?finding=inc-87c655c3e3c9") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/sentinel" element={<SentinelPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function twMomentumFinding(): SentinelFinding {
  return {
    id: "inc-87c655c3e3c9",
    status: "open",
    severity: "watch",
    confidence: 0.62,
    title: "TW momentum candidate - paper drawdown breach",
    summary: "TW momentum candidate - paper drawdown breach",
    source: "incident",
    detectedAt: "2026-06-30T16:26:56.000Z",
    updatedAt: "2026-06-30T16:26:56.000Z",
    blastRadius: {
      personas: ["persona-tw-equity"],
      strategies: ["tw-momentum"],
    },
    evidence: [
      { kind: "incident", id: "inc-87c655c3e3c9" },
      { kind: "metric", id: "paper-drawdown", snapshot: { label: "drawdown", value: "-8.4%", ts: "2026-06-30T16:26:56.000Z" } },
    ],
    recommendedActionIds: ["request_human_approval", "reduce_allocation"],
  };
}

describe("SentinelPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
    mocks.useV5Live.mockReturnValue({
      data: v5List([twMomentumFinding()]),
      loading: false,
      refresh: vi.fn(),
    });
  });

  it("opens a finding as an investigation workspace instead of a shallow action drawer", async () => {
    renderSentinel();

    expect(await screen.findByText("Investigation summary")).toBeInTheDocument();
    expect(screen.getByText("Severity rationale")).toBeInTheDocument();
    expect(screen.getByText("Evidence packet")).toBeInTheDocument();
    expect(screen.getByText("Recommended next steps")).toBeInTheDocument();
    expect(screen.getByText("Governance handling")).toBeInTheDocument();
    expect(screen.getByText("incident:inc-87c655c3e3c9")).toBeInTheDocument();
    expect(screen.getByText("metric:paper-drawdown")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /persona:persona-tw-equity/i })).toHaveAttribute(
      "href",
      "/management/persona-fleet?persona=persona-tw-equity",
    );
    expect(screen.getByText("Request human approval")).toBeInTheDocument();
    expect(screen.getByText("Reduce allocation")).toBeInTheDocument();
    expect(screen.getByText("This drawer is read-only. Acknowledge, dismiss, capital changes, and runtime changes must go through a persisted governance workflow with audit evidence.")).toBeInTheDocument();
  });

  it("does not expose local-only Sentinel mutations as user actions", async () => {
    renderSentinel();

    expect(await screen.findByText("Governance handling")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
  });
});
