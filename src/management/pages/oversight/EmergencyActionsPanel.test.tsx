import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { adaptHumanInboxList } from "@/lib/bff-v1/management";
import { EmergencyActionsPanel } from "./EmergencyActionsPanel";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

void i18n.changeLanguage("en-US");

function renderPanel() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/management/promotion-allocation?tab=emergency-actions"]}>
        <EmergencyActionsPanel />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("EmergencyActionsPanel", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
  });

  it("shows degradedEmptyBody instead of none text when the read fails with an error", () => {
    mocks.useV5Live.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error("Human inbox read timed out"),
      refresh: vi.fn(),
    });

    renderPanel();

    expect(
      screen.getByText("No confirmed items loaded. Note: This does not mean the inbox is empty, as some sources timed out."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No active emergency containment items.")).not.toBeInTheDocument();
  });

  it("shows degradedEmptyBody instead of none text when a BFF surface is degraded or unavailable", () => {
    const degradedList = adaptHumanInboxList({
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
          human_inbox: {
            status: "unavailable",
            reason: "read_timeout",
            source: "timeout_fallback",
            message: "Read timed out",
            snapshot_at: "2026-11-04T12:00:00Z",
          },
          governance_review_queue: {
            status: "ok",
            snapshot_at: "2026-11-04T12:00:00Z",
          },
        },
      },
    })!;

    mocks.useV5Live.mockReturnValue({
      data: degradedList,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderPanel();

    expect(
      screen.getByText("No confirmed items loaded. Note: This does not mean the inbox is empty, as some sources timed out."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No active emergency containment items.")).not.toBeInTheDocument();
  });

  it("keeps the none text when all surfaces are ok and no containment item matches (incidents are not in CONTAINMENT_KINDS)", () => {
    const okWithIncidentOnly = adaptHumanInboxList({
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
        summary: { total: 1 },
        facets: {},
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
          governance_review_queue: { status: "ok", snapshot_at: "2026-11-04T12:00:00Z" },
        },
      },
    })!;

    mocks.useV5Live.mockReturnValue({
      data: okWithIncidentOnly,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderPanel();

    expect(screen.getByText("No active emergency containment items.")).toBeInTheDocument();
    expect(
      screen.queryByText("No confirmed items loaded. Note: This does not mean the inbox is empty, as some sources timed out."),
    ).not.toBeInTheDocument();
  });
});
