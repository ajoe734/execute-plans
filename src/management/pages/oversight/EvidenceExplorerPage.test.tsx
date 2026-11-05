import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  adaptManagementEvidenceOverview,
  type ManagementEvidenceDetail,
  type ManagementEvidenceOverview,
} from "@/lib/bff-v1/management";
import { safeDateTime } from "@/lib/utils";
import { EvidenceExplorerPage, EvidencePacketDetailPage } from "./_core";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
  submitEvidenceOperation: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

vi.mock("@/lib/bff-v1", () => ({
  submitEvidenceOperation: mocks.submitEvidenceOperation,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

void i18n.changeLanguage("en-US");

function evidenceOverview(): ManagementEvidenceOverview {
  return {
    items: [
      {
        id: "evref-rart-20260615-002",
        refId: "evref-rart-20260615-002",
        ref_id: "evref-rart-20260615-002",
        title: "TW momentum candidate",
        displayLabel: "TW momentum candidate",
        display_label: "TW momentum candidate",
        sourceType: "unknown",
        source_type: "unknown",
        capturedAt: "2026-06-15T13:06:00Z",
        captured_at: "2026-06-15T13:06:00Z",
        linkType: "provenance",
        link_type: "provenance",
        credibility: { tier: "producer_record", verified: true },
        linkedObjectSummary: {
          entityType: "artifact",
          entity_type: "artifact",
          entityRef: "rart-20260615-002",
          entity_ref: "rart-20260615-002",
          displayLabel: "TW momentum candidate artifact",
          display_label: "TW momentum candidate artifact",
        },
        linked_object_summary: {
          entityType: "artifact",
          entity_type: "artifact",
          entityRef: "rart-20260615-002",
          entity_ref: "rart-20260615-002",
          displayLabel: "TW momentum candidate artifact",
          display_label: "TW momentum candidate artifact",
        },
        linkedObjectLink: {
          availability: "available",
          routeHref: "/management/artifacts/rart-20260615-002",
          route_href: "/management/artifacts/rart-20260615-002",
          displayLabel: "TW momentum candidate artifact",
          display_label: "TW momentum candidate artifact",
          entityType: "artifact",
          entity_type: "artifact",
          entityRef: "rart-20260615-002",
          entity_ref: "rart-20260615-002",
        },
        linked_object_link: {
          availability: "available",
          routeHref: "/management/artifacts/rart-20260615-002",
          route_href: "/management/artifacts/rart-20260615-002",
          displayLabel: "TW momentum candidate artifact",
          display_label: "TW momentum candidate artifact",
          entityType: "artifact",
          entity_type: "artifact",
          entityRef: "rart-20260615-002",
          entity_ref: "rart-20260615-002",
        },
        resolvedLink: {
          availability: "unavailable",
          routeHref: null,
          route_href: null,
          displayLabel: "Source unavailable",
          display_label: "Source unavailable",
          openInNewTab: false,
          open_in_new_tab: false,
        },
        resolved_link: {
          availability: "unavailable",
          routeHref: null,
          route_href: null,
          displayLabel: "Source unavailable",
          display_label: "Source unavailable",
          openInNewTab: false,
          open_in_new_tab: false,
        },
        managementHref: "/management/evidence?ref_id=evref-rart-20260615-002",
        management_href: "/management/evidence?ref_id=evref-rart-20260615-002",
        actionability: {
          state: "unresolved_source",
          severity: "warning",
          reasons: ["resolved_link_unavailable"],
          canTrace: false,
          can_trace: false,
          canOpenSource: false,
          can_open_source: false,
          canOpenLinkedObject: true,
          can_open_linked_object: true,
        },
        operation: {
          refId: "evref-rart-20260615-002",
          ref_id: "evref-rart-20260615-002",
          status: "needs_evidence",
          owner: null,
          reviewer: "ops-reviewer",
          taskRefs: [],
          task_refs: [],
          lastActionAt: "2026-06-15T14:00:00Z",
          last_action_at: "2026-06-15T14:00:00Z",
          lastReason: "Need source route",
          last_reason: "Need source route",
          commandRefs: ["cmd-001"],
          command_refs: ["cmd-001"],
          auditRefs: ["audit-001"],
          audit_refs: ["audit-001"],
          events: [],
        },
        allowedActions: {
          canOpenSource: false,
          canOpenLinkedObject: true,
          canInspectChain: true,
          canMarkStale: true,
          canRequestEvidence: true,
          canCreateDispositionTask: true,
          canAssignReviewer: true,
          canResolve: true,
        },
        allowed_actions: {
          canOpenSource: false,
          canOpenLinkedObject: true,
          canInspectChain: true,
          canMarkStale: true,
          canRequestEvidence: true,
          canCreateDispositionTask: true,
          canAssignReviewer: true,
          canResolve: true,
        },
        disabledActionReasons: { canOpenSource: "Source link is unavailable or incomplete." },
        disabled_action_reasons: { canOpenSource: "Source link is unavailable or incomplete." },
        redacted: false,
      },
    ],
    data: [],
    summary: {
      totalEvidence: 1,
      total_evidence: 1,
      returnedEvidence: 1,
      returned_evidence: 1,
      visibleEvidence: 1,
      visible_evidence: 1,
      redactedEvidence: 0,
      redacted_evidence: 0,
      verifiedEvidence: 1,
      verified_evidence: 1,
      bySourceType: { unknown: 1 },
      by_source_type: { unknown: 1 },
      byLinkType: { provenance: 1 },
      by_link_type: { provenance: 1 },
      byCredibilityTier: { producer_record: 1 },
      by_credibility_tier: { producer_record: 1 },
      traceableEvidence: 0,
      traceable_evidence: 0,
      unresolvedSourceEvidence: 1,
      unresolved_source_evidence: 1,
      incompleteEvidence: 0,
      incomplete_evidence: 0,
      needsAttentionEvidence: 1,
      needs_attention_evidence: 1,
      openOperationEvidence: 1,
      open_operation_evidence: 1,
      byActionabilityState: { unresolved_source: 1 },
      by_actionability_state: { unresolved_source: 1 },
      byActionabilitySeverity: { warning: 1 },
      by_actionability_severity: { warning: 1 },
      byOperationStatus: { needs_evidence: 1 },
      by_operation_status: { needs_evidence: 1 },
    },
    facets: {
      sourceTypes: { unknown: 1 },
      source_types: { unknown: 1 },
      linkTypes: { provenance: 1 },
      link_types: { provenance: 1 },
      credibilityTiers: { producer_record: 1 },
      credibility_tiers: { producer_record: 1 },
      actionabilityStates: { unresolved_source: 1 },
      actionability_states: { unresolved_source: 1 },
      actionabilitySeverity: { warning: 1 },
      actionability_severity: { warning: 1 },
      operationStatuses: { needs_evidence: 1 },
      operation_statuses: { needs_evidence: 1 },
    },
    pageInfo: {
      nextPageToken: null,
      next_page_token: null,
      hasMore: false,
      has_more: false,
      total: 1,
      pageSize: 20,
      page_size: 20,
    },
    page_info: {
      nextPageToken: null,
      next_page_token: null,
      hasMore: false,
      has_more: false,
      total: 1,
      pageSize: 20,
      page_size: 20,
    },
    pagination: {
      nextPageToken: null,
      next_page_token: null,
      hasMore: false,
      has_more: false,
      total: 1,
      pageSize: 20,
      page_size: 20,
    },
    meta: {
      snapshotAt: "2026-06-30T12:23:04Z",
      snapshot_at: "2026-06-30T12:23:04Z",
      surfaces: {
        management_evidence: { status: "ok", source: "bff_composed" },
        evidence_refs: { status: "ok", source: "service_store" },
      },
      redactedEvidenceCount: 0,
      redacted_evidence_count: 0,
    },
  };
}

function evidenceDetail(): ManagementEvidenceDetail {
  return {
    refId: "evref-rart-20260615-002",
    ref_id: "evref-rart-20260615-002",
    title: "TW momentum candidate",
    sourceDocument: {
      title: "TW momentum candidate",
      sourceType: "unknown",
      source_type: "unknown",
      excerpt: null,
      storagePreview: { available: false, previewType: "unavailable", preview_type: "unavailable" },
      storage_preview: { available: false, previewType: "unavailable", preview_type: "unavailable" },
      capturedAt: "2026-06-15T13:06:00Z",
      captured_at: "2026-06-15T13:06:00Z",
      capturedBy: null,
      captured_by: null,
    },
    source_document: {
      title: "TW momentum candidate",
      sourceType: "unknown",
      source_type: "unknown",
      excerpt: null,
      storagePreview: { available: false, previewType: "unavailable", preview_type: "unavailable" },
      storage_preview: { available: false, previewType: "unavailable", preview_type: "unavailable" },
      capturedAt: "2026-06-15T13:06:00Z",
      captured_at: "2026-06-15T13:06:00Z",
      capturedBy: null,
      captured_by: null,
    },
    linkType: "provenance",
    link_type: "provenance",
    credibility: {
      tier: "producer_record",
      verified: true,
      lastVerifiedAt: "2026-06-15T13:06:00Z",
      last_verified_at: "2026-06-15T13:06:00Z",
      verificationMethod: "research_orchestrator_projection",
      verification_method: "research_orchestrator_projection",
    },
    resolvedLink: {
      availability: "unavailable",
      routeHref: null,
      route_href: null,
      displayLabel: "Source unavailable",
      display_label: "Source unavailable",
      openInNewTab: false,
      open_in_new_tab: false,
    },
    resolved_link: {
      availability: "unavailable",
      routeHref: null,
      route_href: null,
      displayLabel: "Source unavailable",
      display_label: "Source unavailable",
      openInNewTab: false,
      open_in_new_tab: false,
    },
    linkedObjectSummary: {
      entityType: "artifact",
      entity_type: "artifact",
      entityRef: "rart-20260615-002",
      entity_ref: "rart-20260615-002",
      displayLabel: "TW momentum candidate artifact",
      display_label: "TW momentum candidate artifact",
    },
    linked_object_summary: {
      entityType: "artifact",
      entity_type: "artifact",
      entityRef: "rart-20260615-002",
      entity_ref: "rart-20260615-002",
      displayLabel: "TW momentum candidate artifact",
      display_label: "TW momentum candidate artifact",
    },
    linkedObjectLink: {
      availability: "available",
      routeHref: "/management/artifacts/rart-20260615-002",
      route_href: "/management/artifacts/rart-20260615-002",
      displayLabel: "TW momentum candidate artifact",
      display_label: "TW momentum candidate artifact",
      entityType: "artifact",
      entity_type: "artifact",
      entityRef: "rart-20260615-002",
      entity_ref: "rart-20260615-002",
    },
    linked_object_link: {
      availability: "available",
      routeHref: "/management/artifacts/rart-20260615-002",
      route_href: "/management/artifacts/rart-20260615-002",
      displayLabel: "TW momentum candidate artifact",
      display_label: "TW momentum candidate artifact",
      entityType: "artifact",
      entity_type: "artifact",
      entityRef: "rart-20260615-002",
      entity_ref: "rart-20260615-002",
    },
    linkedDecisions: [],
    linked_decisions: [],
    sourceNoteContext: null,
    source_note_context: null,
    sourceMemoryContext: null,
    source_memory_context: null,
    createdAt: "2026-06-15T13:06:00Z",
    created_at: "2026-06-15T13:06:00Z",
    routeHref: "/knowledge/evidence/evref-rart-20260615-002",
    route_href: "/knowledge/evidence/evref-rart-20260615-002",
    managementHref: "/management/evidence?ref_id=evref-rart-20260615-002",
    management_href: "/management/evidence?ref_id=evref-rart-20260615-002",
    actionability: {
      state: "unresolved_source",
      severity: "warning",
      reasons: ["resolved_link_unavailable"],
      canTrace: false,
      can_trace: false,
      canOpenSource: false,
      can_open_source: false,
      canOpenLinkedObject: true,
      can_open_linked_object: true,
    },
    operation: {
      refId: "evref-rart-20260615-002",
      ref_id: "evref-rart-20260615-002",
      status: "needs_evidence",
      owner: null,
      reviewer: "ops-reviewer",
      taskRefs: ["EVID-OPS-20260615-abc123"],
      task_refs: ["EVID-OPS-20260615-abc123"],
      lastActionAt: "2026-06-15T14:00:00Z",
      last_action_at: "2026-06-15T14:00:00Z",
      lastReason: "Need source route",
      last_reason: "Need source route",
      commandRefs: ["cmd-001"],
      command_refs: ["cmd-001"],
      auditRefs: ["audit-001"],
      audit_refs: ["audit-001"],
      events: [],
    },
    relationships: {
      artifacts: [
        {
          entityType: "artifact",
          entity_type: "artifact",
          entityRef: "rart-20260615-002",
          entity_ref: "rart-20260615-002",
          displayLabel: "TW momentum candidate artifact",
          display_label: "TW momentum candidate artifact",
          routeHref: "/management/artifacts/rart-20260615-002",
          route_href: "/management/artifacts/rart-20260615-002",
          linkType: "provenance",
          link_type: "provenance",
          source: "linked_object_summary",
        },
      ],
    },
    chain: {
      nodes: [
        { id: "source:evref-rart-20260615-002", type: "unknown", label: "TW momentum candidate", routeHref: null, route_href: null, availability: "unavailable" },
        { id: "evidence:evref-rart-20260615-002", type: "evidence_ref", label: "TW momentum candidate", routeHref: "/management/evidence?ref_id=evref-rart-20260615-002", route_href: "/management/evidence?ref_id=evref-rart-20260615-002" },
        { id: "artifact:rart-20260615-002", type: "artifact", label: "TW momentum candidate artifact", routeHref: "/management/artifacts/rart-20260615-002", route_href: "/management/artifacts/rart-20260615-002" },
      ],
      edges: [
        { from: "source:evref-rart-20260615-002", to: "evidence:evref-rart-20260615-002", relationship: "captured_as_evidence", degraded: true },
        { from: "evidence:evref-rart-20260615-002", to: "artifact:rart-20260615-002", relationship: "provenance", source: "linked_object_summary" },
      ],
      emptyReason: null,
      empty_reason: null,
      degradedReasons: ["resolved_link_unavailable"],
      degraded_reasons: ["resolved_link_unavailable"],
    },
    tasks: [
      {
        taskRef: "EVID-OPS-20260615-abc123",
        task_ref: "EVID-OPS-20260615-abc123",
        status: "linked",
        materialization: "operation_projection",
        routeHref: null,
        route_href: null,
      },
    ],
    auditEvents: [
      {
        auditRef: "audit-001",
        audit_ref: "audit-001",
        eventId: "evop-001",
        event_id: "evop-001",
        action: "request_more_evidence",
        actorId: "operator",
        actor_id: "operator",
        createdAt: "2026-06-15T14:00:00Z",
        created_at: "2026-06-15T14:00:00Z",
        reason: "Need source route",
        statusAfter: "needs_evidence",
        status_after: "needs_evidence",
        commandId: "cmd-001",
        command_id: "cmd-001",
      },
    ],
    audit_events: [
      {
        auditRef: "audit-001",
        audit_ref: "audit-001",
        eventId: "evop-001",
        event_id: "evop-001",
        action: "request_more_evidence",
        actorId: "operator",
        actor_id: "operator",
        createdAt: "2026-06-15T14:00:00Z",
        created_at: "2026-06-15T14:00:00Z",
        reason: "Need source route",
        statusAfter: "needs_evidence",
        status_after: "needs_evidence",
        commandId: "cmd-001",
        command_id: "cmd-001",
      },
    ],
    allowedActions: {
      canOpenSource: false,
      canOpenLinkedObject: true,
      canInspectChain: true,
      canMarkStale: true,
      canRequestEvidence: true,
      canCreateDispositionTask: false,
      canAssignReviewer: true,
      canResolve: true,
    },
    allowed_actions: {
      canOpenSource: false,
      canOpenLinkedObject: true,
      canInspectChain: true,
      canMarkStale: true,
      canRequestEvidence: true,
      canCreateDispositionTask: false,
      canAssignReviewer: true,
      canResolve: true,
    },
    disabledActionReasons: {
      canOpenSource: "Source link is unavailable or incomplete.",
      canCreateDispositionTask: "A disposition task is already attached.",
    },
    disabled_action_reasons: {
      canOpenSource: "Source link is unavailable or incomplete.",
      canCreateDispositionTask: "A disposition task is already attached.",
    },
    redacted: false,
    meta: {
      snapshotAt: "2026-06-30T12:23:04Z",
      snapshot_at: "2026-06-30T12:23:04Z",
      surfaces: {
        evidence_ref_detail: { status: "ok" },
        resolved_link: { status: "ok" },
        linked_decisions: { status: "ok" },
        relationships: { status: "ok" },
        chain: { status: "degraded" },
        operation_state: { status: "ok" },
        tasks: { status: "ok" },
        audit_events: { status: "ok" },
      },
      redactedEvidenceCount: 0,
      redacted_evidence_count: 0,
    },
  };
}

function renderEvidence(initialEntry: string, element = <EvidenceExplorerPage />) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/management/evidence" element={element} />
          <Route path="/management/evidence/:id" element={<EvidencePacketDetailPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("EvidenceExplorerPage", () => {
  beforeEach(() => {
    mocks.useV5Live.mockReset();
    mocks.submitEvidenceOperation.mockReset();
  });

  it("renders evidence operations rows instead of the legacy hash table", () => {
    mocks.useV5Live.mockReturnValue({ data: evidenceOverview(), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence");

    expect(screen.getByRole("heading", { name: "Evidence Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Source / packet" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actionability" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Operation" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Hash" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TW momentum candidate" })).toHaveAttribute(
      "href",
      "/management/evidence?ref_id=evref-rart-20260615-002",
    );
    expect(screen.getByText("producer record")).toBeInTheDocument();
    expect(screen.getByText("unresolved source")).toBeInTheDocument();
    expect(screen.getByText("resolved link unavailable")).toBeInTheDocument();
    expect(screen.getByText("needs evidence")).toBeInTheDocument();
    expect(screen.getByText("reviewer: ops-reviewer")).toBeInTheDocument();
    expect(screen.getByText("Source unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("artifact:rart-20260615-002").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "TW momentum candidate artifact" })).toHaveAttribute(
      "href",
      "/management/artifacts/rart-20260615-002",
    );
    expect(screen.getByRole("link", { name: "Inspect" })).toHaveAttribute(
      "href",
      "/management/evidence?ref_id=evref-rart-20260615-002",
    );
  });

  it("renders Evidence Explorer as a native table viewport that fills available page height", () => {
    mocks.useV5Live.mockReturnValue({ data: evidenceOverview(), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence");

    const tableScroll = screen.getByTestId("evidence-explorer-table-scroll");
    expect(tableScroll).toHaveAttribute("data-management-table-scroll-mode", "native");
    expect(tableScroll).toHaveClass("flex-1");
    expect(tableScroll).toHaveClass("min-h-0");
    expect(tableScroll.querySelector("[data-management-table-scrollbar='pinned']")).toBeNull();
    const native = tableScroll.querySelector("[data-management-table-scrollbar='native']");
    expect(native).toBeTruthy();
    expect(native).not.toHaveClass("max-h-[calc(100vh-240px)]");
    expect(native).toHaveClass("h-full");
    expect(native).toHaveClass("min-h-0");
    expect(native).toHaveClass("overflow-auto");
    expect(native).toHaveClass("pb-4");
  });

  it("renders detail from the BFF evidence detail model", () => {
    mocks.useV5Live.mockReturnValue({ data: evidenceDetail(), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence?ref_id=evref-rart-20260615-002");

    expect(screen.getByRole("heading", { name: "TW momentum candidate" })).toBeInTheDocument();
    expect(screen.getByText("evref-rart-20260615-002")).toBeInTheDocument();
    expect(screen.getByText("research orchestrator projection")).toBeInTheDocument();
    expect(screen.getByText("Source unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("artifact:rart-20260615-002").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Operation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trace chain" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Relationships" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Disposition tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audit events" })).toBeInTheDocument();
    expect(screen.getAllByText("needs evidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("resolved link unavailable").length).toBeGreaterThan(0);
    expect(screen.getByText("EVID-OPS-20260615-abc123")).toBeInTheDocument();
    expect(screen.getByText("audit-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark stale" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled();
    expect(screen.getByText("No BFF-linked decisions for this evidence ref.")).toBeInTheDocument();
    expect(screen.queryByText("storage://opaque/not-for-ui")).not.toBeInTheDocument();
  });

  it("submits EvidenceRefAction operations from detail", async () => {
    const refresh = vi.fn();
    mocks.useV5Live.mockReturnValue({ data: evidenceDetail(), loading: false, refresh });
    mocks.submitEvidenceOperation.mockResolvedValue({
      response: { data: { command_id: "cmd-mark-stale", status: "accepted" } },
      correlationId: "corr-test",
      idempotencyKey: "idk-test",
    });

    renderEvidence("/management/evidence?ref_id=evref-rart-20260615-002");

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "source expired" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark stale" }));

    await waitFor(() => expect(mocks.submitEvidenceOperation).toHaveBeenCalledWith(expect.objectContaining({
      refId: "evref-rart-20260615-002",
      action: "mark_stale",
      reason: "source expired",
    })));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("receipt: cmd-mark-stale")).toBeInTheDocument();
  });

  it("shows unavailable state and no numeric zero in the five metric cards and shows a distinct unavailable message when management_evidence is not ok", () => {
    const unavailablePayload = adaptManagementEvidenceOverview({
      data: {
        id: "management-evidence",
        items: [],
        summary: {
          total_evidence: null,
          returned_evidence: null,
          visible_evidence: null,
          redacted_evidence: null,
          verified_evidence: null,
          by_source_type: {},
          by_link_type: {},
          by_credibility_tier: {},
          traceable_evidence: null,
          unresolved_source_evidence: null,
          incomplete_evidence: null,
          needs_attention_evidence: null,
          open_operation_evidence: null,
          by_actionability_state: {},
          by_actionability_severity: {},
          by_operation_status: {},
        },
        facets: {
          source_types: {},
          link_types: {},
          credibility_tiers: {},
          actionability_states: {},
          actionability_severity: {},
          operation_statuses: {},
        },
      },
      page_info: {
        next_page_token: null,
        total: null,
        page_size: 20,
      },
      meta: {
        snapshot_at: "2026-11-04T00:00:00Z",
        surfaces: {
          management_evidence: {
            status: "unavailable",
            source: "service_store",
            reason: "source_ingest_evidence_items_unavailable",
          },
          evidence_refs: {
            status: "unavailable",
            source: "service_store",
            reason: "source_ingest_evidence_items_unavailable",
          },
        },
        redacted_evidence_count: null,
      },
    });
    mocks.useV5Live.mockReturnValue({ data: unavailablePayload, loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence");

    const metricCards = screen.getAllByTestId("evidence-metric-card");
    expect(metricCards).toHaveLength(5);
    for (const card of metricCards) {
      expect(card).toHaveTextContent("Unavailable");
      expect(card.textContent).not.toMatch(/\b0\b/);
    }
    expect(screen.getByTestId("evidence-route-unavailable")).toHaveTextContent(
      "Evidence surface is unavailable; evidence records could not be loaded.",
    );
    expect(screen.queryByTestId("evidence-route-empty")).not.toBeInTheDocument();
    expect(screen.queryByText("No evidence refs.")).not.toBeInTheDocument();
  });

  it("shows zero in the five metric cards and the no rows message for a true empty ok response", () => {
    const emptyOkPayload = adaptManagementEvidenceOverview({
      data: {
        id: "management-evidence",
        items: [],
        summary: {
          total_evidence: 0,
          returned_evidence: 0,
          visible_evidence: 0,
          redacted_evidence: 0,
          verified_evidence: 0,
          by_source_type: {},
          by_link_type: {},
          by_credibility_tier: {},
          traceable_evidence: 0,
          unresolved_source_evidence: 0,
          incomplete_evidence: 0,
          needs_attention_evidence: 0,
          open_operation_evidence: 0,
          by_actionability_state: {},
          by_actionability_severity: {},
          by_operation_status: {},
        },
        facets: {
          source_types: {},
          link_types: {},
          credibility_tiers: {},
          actionability_states: {},
          actionability_severity: {},
          operation_statuses: {},
        },
      },
      page_info: {
        next_page_token: null,
        total: 0,
        page_size: 20,
      },
      meta: {
        snapshot_at: "2026-11-04T00:00:00Z",
        surfaces: {
          management_evidence: { status: "ok", source: "service_store" },
          evidence_refs: { status: "ok", source: "service_store" },
        },
        redacted_evidence_count: 0,
      },
    });
    mocks.useV5Live.mockReturnValue({ data: emptyOkPayload, loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence");

    const metricCards = screen.getAllByTestId("evidence-metric-card");
    expect(metricCards).toHaveLength(5);
    for (const card of metricCards) {
      expect(card).toHaveTextContent("0");
    }
    expect(screen.getByTestId("evidence-route-empty")).toHaveTextContent("No evidence refs.");
    expect(screen.queryByTestId("evidence-route-unavailable")).not.toBeInTheDocument();
  });

  it("renders title, source type, captured time, page_info.total, and paginates beyond the first page using the real BFF payload shape", () => {
    const firstPagePayload = adaptManagementEvidenceOverview({
      data: {
        id: "management-evidence",
        items: [
          {
            id: "evitem-tw_price_daily-0050-2026-11-01-abc123",
            ref_id: "evitem-tw_price_daily-0050-2026-11-01-abc123",
            evidence_item_id: "evitem-tw_price_daily-0050-2026-11-01-abc123",
            title: "TW official tw_price_daily TWSE 0050 2026-11-01",
            citation_label: "TW official tw_price_daily TWSE 0050 2026-11-01",
            source_type: "official_reference",
            captured_at: "2026-11-01T14:30:00+08:00",
            available_time: "2026-11-01T14:30:00+08:00",
            event_time: "2026-11-01T00:00:00+08:00",
            item_type: "tw_price_daily",
            link_type: "tw_price_daily",
            metadata: { source_class: "official_reference" },
            credibility: { tier: "producer_record", verified: true },
          },
        ],
        summary: {
          total_evidence: 614,
          returned_evidence: 1,
          visible_evidence: 1,
          redacted_evidence: 0,
          verified_evidence: 1,
          by_source_type: { official_reference: 1 },
          by_link_type: { tw_price_daily: 1 },
          by_credibility_tier: { producer_record: 1 },
          traceable_evidence: 0,
          unresolved_source_evidence: 0,
          incomplete_evidence: 0,
          needs_attention_evidence: 0,
          open_operation_evidence: 0,
          by_actionability_state: {},
          by_actionability_severity: {},
          by_operation_status: {},
        },
        facets: {
          source_types: { official_reference: 1 },
          link_types: { tw_price_daily: 1 },
          credibility_tiers: { producer_record: 1 },
          actionability_states: {},
          actionability_severity: {},
          operation_statuses: {},
        },
      },
      page_info: {
        next_page_token: "20",
        total: 614,
        page_size: 20,
      },
      meta: {
        snapshot_at: "2026-11-04T00:00:00Z",
        surfaces: {
          management_evidence: { status: "ok", source: "service_store" },
          evidence_refs: { status: "ok", source: "service_store" },
        },
        redacted_evidence_count: 0,
      },
    });

    const secondPagePayload = adaptManagementEvidenceOverview({
      data: {
        id: "management-evidence",
        items: [
          {
            id: "evitem-tw_price_daily-2330-2026-11-01-def456",
            ref_id: "evitem-tw_price_daily-2330-2026-11-01-def456",
            evidence_item_id: "evitem-tw_price_daily-2330-2026-11-01-def456",
            title: "TW official tw_price_daily TWSE 2330 2026-11-01",
            citation_label: "TW official tw_price_daily TWSE 2330 2026-11-01",
            source_type: "official_reference",
            captured_at: "2026-11-01T14:35:00+08:00",
            available_time: "2026-11-01T14:35:00+08:00",
            event_time: "2026-11-01T00:00:00+08:00",
            item_type: "tw_price_daily",
            link_type: "tw_price_daily",
            metadata: { source_class: "official_reference" },
            credibility: { tier: "producer_record", verified: true },
          },
        ],
        summary: {
          total_evidence: 614,
          returned_evidence: 1,
          visible_evidence: 1,
          redacted_evidence: 0,
          verified_evidence: 1,
          by_source_type: { official_reference: 1 },
          by_link_type: { tw_price_daily: 1 },
          by_credibility_tier: { producer_record: 1 },
          traceable_evidence: 0,
          unresolved_source_evidence: 0,
          incomplete_evidence: 0,
          needs_attention_evidence: 0,
          open_operation_evidence: 0,
          by_actionability_state: {},
          by_actionability_severity: {},
          by_operation_status: {},
        },
        facets: {
          source_types: { official_reference: 1 },
          link_types: { tw_price_daily: 1 },
          credibility_tiers: { producer_record: 1 },
          actionability_states: {},
          actionability_severity: {},
          operation_statuses: {},
        },
      },
      page_info: {
        next_page_token: "40",
        total: 614,
        page_size: 20,
      },
      meta: {
        snapshot_at: "2026-11-04T00:00:00Z",
        surfaces: {
          management_evidence: { status: "ok", source: "service_store" },
          evidence_refs: { status: "ok", source: "service_store" },
        },
        redacted_evidence_count: 0,
      },
    });

    mocks.useV5Live.mockImplementation((_loader: unknown, deps: unknown[]) => {
      const token = Array.isArray(deps) ? deps[0] : null;
      return {
        data: token === "20" ? secondPagePayload : firstPagePayload,
        loading: false,
        refresh: vi.fn(),
      };
    });

    renderEvidence("/management/evidence");

    const metricCards = screen.getAllByTestId("evidence-metric-card");
    expect(metricCards[0]).toHaveTextContent("Total");
    expect(metricCards[0]).toHaveTextContent("614");

    expect(screen.getByText("TW official tw_price_daily TWSE 0050 2026-11-01")).toBeInTheDocument();
    expect(screen.getByTitle("official_reference")).toHaveTextContent("official reference");
    expect(screen.getByText(safeDateTime("2026-11-01T14:30:00+08:00"))).toBeInTheDocument();

    const nextButton = screen.getByTestId("evidence-pagination-next");
    const prevButton = screen.getByTestId("evidence-pagination-prev");
    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    fireEvent.click(nextButton);

    expect(screen.getByText("TW official tw_price_daily TWSE 2330 2026-11-01")).toBeInTheDocument();
    expect(screen.getByText(safeDateTime("2026-11-01T14:35:00+08:00"))).toBeInTheDocument();
    expect(screen.getAllByTestId("evidence-metric-card")[0]).toHaveTextContent("614");
    expect(screen.getByTestId("evidence-pagination-prev")).toBeEnabled();
  });
});
