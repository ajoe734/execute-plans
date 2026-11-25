import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import {
  adaptManagementCitedEvidence,
  adaptManagementEvidenceDetail,
  adaptManagementEvidenceOverview,
  type ManagementEvidenceDetail,
  type ManagementEvidenceOverview,
} from "@/lib/bff-v1/management";
import { safeDateTime } from "@/lib/utils";
import { EvidenceExplorerPage, EvidencePacketDetailPage, evidenceInboundTarget } from "./_core";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
  citedLiveOnly: vi.fn(),
  overviewLiveOnly: vi.fn(),
  detailLiveOnly: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

// FE-EVIDENCE-CITED-20261125: the evidence operation client was removed; the
// page reads only through mgmt.evidence (cited list, ingested list, item detail).
vi.mock("@/lib/bff-v1", () => ({
  mgmt: {
    evidence: {
      citedLiveOnly: mocks.citedLiveOnly,
      overviewLiveOnly: mocks.overviewLiveOnly,
      detailLiveOnly: mocks.detailLiveOnly,
    },
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

// Real row shapes from GET /bff/management/evidence?scope=cited
// (BFF-EVIDENCE-CITED-LIST-20261125, merged ajoe734/pantheon 381f1ea88):
// hosted reference ids observed 2026-11-25 (artifact-persona-paper-*,
// facts:strategy_pool:<persona>@<v>, evidence:search_excerpt:ko-evi-* resolved
// to evi-1217cd1c8ccc7274) and the per-source status block.
const ART_B = "artifact-persona-paper-a81b4fd15944698341aa";
const PERSONA = "persona-ee7112a829d38b9135ac";
const MEETING = "mtg-6edaff7d0ff76275";

function citedSources(overrides: Record<string, Record<string, unknown>> = {}) {
  const base = (status: string, extra: Record<string, unknown> = {}) => ({
    status,
    reason: null,
    read_count: 1,
    truncated: false,
    failed_count: 0,
    citation_count: 1,
    withheld_count: 0,
    calls: 1,
    response_bytes: 1200,
    ...extra,
  });
  return {
    meeting_proposals: base("ok", { citation_count: 0 }),
    meeting_positions: base("ok", { read_count: 1, calls: 2 }),
    governance_approvals: base("ok"),
    evolution_proposals: base("ok"),
    research_demands: base("ok", { citation_count: 0 }),
    research_tickets: base("ok", { citation_count: 0 }),
    persona_cycles: base("ok", { withheld_count: 1 }),
    ...overrides,
  };
}

function citedPayload(opts: { sources?: Record<string, Record<string, unknown>>; status?: string } = {}) {
  const sources = citedSources(opts.sources);
  const notOk = Object.entries(sources).filter(([, v]) => v.status !== "ok").map(([k]) => k);
  const status = opts.status ?? (notOk.length ? "degraded" : "ok");
  const meetingPosition = {
    entity_type: "meeting_position",
    entity_ref: MEETING,
    label: "Pool evolution review for Paper Momentum Persona (2026-W48)",
    parts: { meeting_id: MEETING, meeting_name: "Pool evolution review for Paper Momentum Persona (2026-W48)", round: 1, position: "A", persona_id: PERSONA },
    route_href: `/management/meetings/${MEETING}`,
    time: "2026-11-25T10:00:00Z",
    source: "meeting_positions",
  };
  return {
    data: {
      id: "management-evidence-cited",
      scope: "cited",
      items: [
        {
          id: ART_B,
          ref_id: ART_B,
          ref_kind: "registry_artifact",
          source_owner: "registry",
          label: "TW momentum 20d breakout",
          name_missing: false,
          label_parts: { strategy_id: ART_B },
          source_class: "registry_record",
          resolved_link: { route_href: `/management/strategies/${ART_B}`, evidence_ref_id: null },
          route_href: `/management/strategies/${ART_B}`,
          cited_as: [`facts:registry_entry:${ART_B}`, ART_B],
          cited_by: [
            meetingPosition,
            {
              entity_type: "approval",
              entity_ref: "apr-20261125-0007",
              label: null,
              parts: { decision_type: "strategy_promotion", target_id: ART_B },
              route_href: "/management/approvals",
              time: "2026-11-25T09:30:00Z",
              source: "governance_approvals",
            },
          ],
          citation_count: 2,
          last_cited_at: "2026-11-25T10:00:00Z",
          redacted: false,
        },
        {
          id: `facts:strategy_pool:${PERSONA}@4`,
          ref_id: `facts:strategy_pool:${PERSONA}@4`,
          ref_kind: "strategy_pool",
          source_owner: "persona",
          label: "Paper Momentum Persona",
          name_missing: false,
          label_parts: { persona_id: PERSONA, pool_version: "4" },
          source_class: "owner_fact",
          resolved_link: { route_href: `/management/personas/${PERSONA}`, evidence_ref_id: null },
          route_href: `/management/personas/${PERSONA}`,
          cited_as: [`facts:strategy_pool:${PERSONA}@4`],
          cited_by: [meetingPosition],
          citation_count: 1,
          last_cited_at: "2026-11-25T10:00:00Z",
          redacted: false,
        },
        {
          id: "evidence:search_excerpt:ko-evi-1217cd1c8ccc7274-94a73ebc0814",
          ref_id: "evidence:search_excerpt:ko-evi-1217cd1c8ccc7274-94a73ebc0814",
          ref_kind: "knowledge_object",
          source_owner: "search",
          label: "TW official tw_price_daily TWSE 0050 2026-11-24",
          name_missing: false,
          label_parts: {},
          source_class: "official_reference",
          resolved_link: { route_href: "/management/evidence/evi-1217cd1c8ccc7274", evidence_ref_id: "evi-1217cd1c8ccc7274" },
          route_href: "/management/evidence/evi-1217cd1c8ccc7274",
          cited_as: ["evidence:search_excerpt:ko-evi-1217cd1c8ccc7274-94a73ebc0814"],
          cited_by: [meetingPosition],
          citation_count: 1,
          last_cited_at: "2026-11-25T10:00:00Z",
          redacted: false,
        },
        {
          id: "lessons:memory_committee_shared:mem-shared-0002",
          ref_id: "lessons:memory_committee_shared:mem-shared-0002",
          ref_kind: "memory",
          source_owner: "memory",
          label: "lessons:memory_committee_shared:mem-shared-0002",
          name_missing: true,
          label_parts: {},
          source_class: "memory",
          resolved_link: null,
          route_href: null,
          cited_as: ["lessons:memory_committee_shared:mem-shared-0002"],
          cited_by: [
            {
              entity_type: "persona_cycle_decision",
              entity_ref: "ooda-pkt-0001",
              label: null,
              parts: { persona_id: PERSONA, persona_name: "Paper Momentum Persona", kind: "meeting_action", decision_index: 0 },
              route_href: `/management/personas/${PERSONA}`,
              time: "2026-11-25T12:00:00Z",
              source: "persona_cycles",
            },
          ],
          citation_count: 1,
          last_cited_at: "2026-11-25T12:00:00Z",
          redacted: false,
        },
      ],
      summary: {
        scope: "cited",
        complete: status === "ok",
        incomplete: status !== "ok",
        reference_total: 4,
        returned: 4,
        references_truncated: false,
        max_references: 500,
        redacted_count: 0,
        excluded: { meeting_topic: 1, private_or_trader: 0, memory_scope_unproven: 1, unparsed: 0 },
        sources_ok: 7 - notOk.length,
        sources_not_ok: notOk,
      },
      sources,
    },
    page_info: { next_page_token: null, total: 4, page_size: 20 },
    meta: {
      snapshot_at: "2026-11-25T12:30:00Z",
      surfaces: {
        management_evidence: { status, source: "bff_composed_owner_reads", snapshot_at: "2026-11-25T12:30:00Z" },
        cited_evidence: { status, source: "bff_composed_owner_reads", snapshot_at: "2026-11-25T12:30:00Z" },
        cited_evidence_sources: sources,
      },
      item_reads: { attempted: 1, resolved: 1, failed: 0, truncated: false },
      cost: { owner_calls: 8, response_bytes: 5447, item_reads: 1 },
      redacted_evidence_count: 0,
      policy: "read_only_cited_evidence",
    },
  };
}

function citedModel(opts: Parameters<typeof citedPayload>[0] = {}) {
  const model = adaptManagementCitedEvidence(citedPayload(opts));
  if (!model) throw new Error("cited fixture did not adapt");
  return model;
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
    mocks.citedLiveOnly.mockReset();
    mocks.overviewLiveOnly.mockReset();
    mocks.detailLiveOnly.mockReset();
  });

  it("renders evidence operations rows instead of the legacy hash table", () => {
    mocks.useV5Live.mockReturnValue({ data: evidenceOverview(), loading: false, refresh: vi.fn() });

    // FE-EVIDENCE-CITED-20261125: the ingested list moved behind scope=ingested.
    renderEvidence("/management/evidence?scope=ingested");

    expect(screen.getByRole("heading", { name: "Evidence Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Source / packet" })).toBeInTheDocument();
    // Actionability and Operation columns are removed: the BFF public item
    // (service.py _management_evidence_public_item) carries neither field and
    // the operation commands have no backend.
    expect(screen.queryByRole("columnheader", { name: "Actionability" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Operation" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Hash" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TW momentum candidate" })).toHaveAttribute(
      "href",
      "/management/evidence?ref_id=evref-rart-20260615-002",
    );
    // Recorded codes show in plain words with the code as tooltip (reviewer point 3).
    expect(screen.getByText("Recorded by the producer")).toHaveAttribute("title", "producer_record");
    expect(screen.queryByText("producer record")).not.toBeInTheDocument();
    expect(screen.queryByText("unresolved source")).not.toBeInTheDocument();
    expect(screen.queryByText("needs evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("reviewer: ops-reviewer")).not.toBeInTheDocument();
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
    expect(screen.getByText("Source not available")).toBeInTheDocument();
    expect(screen.queryByText("Source unavailable")).not.toBeInTheDocument();
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

  it.each([
    ["ingested", "/management/evidence?scope=ingested"],
    ["cited", "/management/evidence"],
  ])("renders the %s Evidence Explorer table as a native viewport that keeps at least 320 px with page scroll", (scope, route) => {
    mocks.useV5Live.mockReturnValue({
      data: scope === "cited" ? citedModel() : evidenceOverview(),
      loading: false,
      refresh: vi.fn(),
    });

    renderEvidence(route);

    const section = screen.getByTestId("evidence-route-ready");
    expect(section).toHaveAttribute("data-evidence-scope", scope);
    // FE-EVIDENCE-CITED-20261125: at 1274x627 the old min-h-0 chain crushed the
    // viewport to 23 px; the page now scrolls and the table keeps 320 px.
    expect(section).toHaveClass("overflow-y-auto", "overflow-x-hidden");
    expect(section).not.toHaveClass("overflow-hidden");
    const tableScroll = screen.getByTestId("evidence-explorer-table-scroll");
    expect(tableScroll).toHaveAttribute("data-management-table-scroll-mode", "native");
    expect(tableScroll).toHaveClass("flex-1");
    expect(tableScroll).toHaveClass("min-h-[320px]");
    expect(tableScroll.parentElement).toHaveClass("min-h-[400px]");
    expect(tableScroll.querySelector("[data-management-table-scrollbar='pinned']")).toBeNull();
    const native = tableScroll.querySelector("[data-management-table-scrollbar='native']");
    expect(native).toBeTruthy();
    expect(native).not.toHaveClass("max-h-[calc(100vh-240px)]");
    expect(native).toHaveClass("h-full");
    expect(native).toHaveClass("min-h-[320px]");
    expect(native).toHaveClass("overflow-auto");
    expect(native).toHaveClass("pb-4");
  });

  it("renders detail from the BFF evidence detail model", () => {
    mocks.useV5Live.mockReturnValue({ data: evidenceDetail(), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence?ref_id=evref-rart-20260615-002");

    expect(screen.getByRole("heading", { name: "TW momentum candidate" })).toBeInTheDocument();
    expect(screen.getByText("evref-rart-20260615-002")).toBeInTheDocument();
    expect(screen.getByText("research orchestrator projection")).toBeInTheDocument();
    expect(screen.getByText("Source not available")).toBeInTheDocument();
    expect(screen.queryByText("Source unavailable")).not.toBeInTheDocument();
    expect(screen.getAllByText("artifact:rart-20260615-002").length).toBeGreaterThan(0);
    // FE-EVIDENCE-CITED-20261125: the operation panel (Mark stale, Create task,
    // ...) had no backend and is removed, as are the actionability/operation
    // status badges in the header that only ever showed the default state.
    expect(screen.queryByRole("heading", { name: "Operation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark stale" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create task" })).not.toBeInTheDocument();
    expect(screen.queryByText("needs evidence")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trace chain" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Relationships" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Disposition tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audit events" })).toBeInTheDocument();
    expect(screen.getByText("EVID-OPS-20260615-abc123")).toBeInTheDocument();
    expect(screen.getByText("audit-001")).toBeInTheDocument();
    expect(screen.getByText("No BFF-linked decisions for this evidence ref.")).toBeInTheDocument();
    expect(screen.queryByText("storage://opaque/not-for-ui")).not.toBeInTheDocument();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
  });

  describe.each([
    ["path form", "/management/evidence/evref-demo-readiness-001"],
    ["ref_id form", "/management/evidence?ref_id=evref-demo-readiness-001"],
  ])("detail not found handling (%s)", (_label, route) => {
    it("renders an explicit not found state on a BFF 404", () => {
      mocks.useV5Live.mockReturnValue({
        data: undefined,
        loading: false,
        error: Object.assign(new Error("HTTP 404"), { code: "RESOURCE_NOT_FOUND" }),
        refresh: vi.fn(),
      });
      renderEvidence(route);
      expect(screen.getByRole("heading", { name: "Evidence not found" })).toBeInTheDocument();
      expect(screen.getByText(/was not found/)).toBeInTheDocument();
      expect(screen.queryByText("Evidence detail unavailable")).not.toBeInTheDocument();
    });

    it("keeps the unavailable state on a 503", () => {
      mocks.useV5Live.mockReturnValue({
        data: undefined,
        loading: false,
        error: Object.assign(new Error("HTTP 503"), { code: "BACKEND_UNAVAILABLE" }),
        refresh: vi.fn(),
      });
      renderEvidence(route);
      expect(screen.getByRole("heading", { name: "Evidence detail unavailable" })).toBeInTheDocument();
      expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
    });

    it("renders a valid record without the not found text", () => {
      mocks.useV5Live.mockReturnValue({ data: evidenceDetail(), loading: false, error: null, refresh: vi.fn() });
      renderEvidence(route);
      expect(screen.getByRole("heading", { name: "TW momentum candidate" })).toBeInTheDocument();
      expect(screen.queryByText("Evidence not found")).not.toBeInTheDocument();
    });
  });

  it("offers no EvidenceRefAction operation from detail because the command has no backend", () => {
    // FE-EVIDENCE-CITED-20261125 replaces "submits EvidenceRefAction operations
    // from detail": the operation panel and src/lib/bff-v1/evidenceOperations.ts
    // are removed (retiredCommands.test.ts no longer lists EvidenceRefAction).
    mocks.useV5Live.mockReturnValue({ data: evidenceDetail(), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence?ref_id=evref-rart-20260615-002");

    expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument();
    for (const name of ["Mark stale", "Request evidence", "Create task", "Assign reviewer", "Resolve"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/receipt:/)).not.toBeInTheDocument();
  });

  it("shows unavailable state and no numeric zero in the metric cards and shows a distinct unavailable message when management_evidence is not ok", () => {
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

    renderEvidence("/management/evidence?scope=ingested");

    // FE-EVIDENCE-CITED-20261125: Traceable, Needs attention, Verified and Open
    // ops cards are removed (never had data / same flag as the removed badge).
    const metricCards = screen.getAllByTestId("evidence-metric-card");
    expect(metricCards).toHaveLength(1);
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

  it("shows zero in the metric cards and the no rows message for a true empty ok response", () => {
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

    renderEvidence("/management/evidence?scope=ingested");

    const metricCards = screen.getAllByTestId("evidence-metric-card");
    expect(metricCards).toHaveLength(1);
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

    renderEvidence("/management/evidence?scope=ingested");

    const metricCards = screen.getAllByTestId("evidence-metric-card");
    expect(metricCards[0]).toHaveTextContent("Total");
    expect(metricCards[0]).toHaveTextContent("614");

    expect(screen.getByText("TW official tw_price_daily TWSE 0050 2026-11-01")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-row-source-type")).toHaveAttribute("title", "official_reference");
    expect(screen.getByTestId("evidence-row-source-type")).toHaveTextContent("Official reference");
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

  it("shows only the Total card (no traceable, needs attention, verified or open operations cards), never shows unknown actionability, and shows localized no-internal-link text instead of Source unavailable for official_reference rows", async () => {
    const items = Array.from({ length: 20 }, (_, idx) => ({
      id: `evitem-tw_price_daily-0050-2026-11-05-${String(idx).padStart(2, "0")}`,
      ref_id: `evitem-tw_price_daily-0050-2026-11-05-${String(idx).padStart(2, "0")}`,
      evidence_item_id: `evitem-tw_price_daily-0050-2026-11-05-${String(idx).padStart(2, "0")}`,
      title: `TW official tw_price_daily TWSE 0050 2026-11-05 #${idx + 1}`,
      citation_label: `TW official tw_price_daily TWSE 0050 2026-11-05 #${idx + 1}`,
      source_type: "official_reference",
      source_ref: "tw-official://tw_price_daily/TWSE/0050/2026-11-05/3ec7b3e4e9083086",
      captured_at: "2026-11-05T14:30:00+08:00",
      available_time: "2026-11-05T14:30:00+08:00",
      event_time: "2026-11-05T00:00:00+08:00",
      item_type: "tw_price_daily",
      link_type: "tw_price_daily",
      metadata: { source_class: "official_reference" },
      credibility: { tier: "producer_record", verified: true },
      resolved_link: {
        availability: "unavailable",
        route_href: null,
        display_label: "Source unavailable",
        open_in_new_tab: false,
      },
      actionability: {
        state: "unknown",
        severity: "info",
        reasons: [],
        can_trace: false,
        can_open_source: false,
        can_open_linked_object: false,
      },
      operation: {
        status: "none",
        task_refs: [],
        command_refs: [],
        audit_refs: [],
        events: [],
      },
    }));

    const hostedPayload = adaptManagementEvidenceOverview({
      data: {
        id: "management-evidence",
        items,
        summary: {
          total_evidence: 518,
          returned_evidence: 20,
          visible_evidence: 518,
          redacted_evidence: 0,
          verified_evidence: 518,
          by_source_type: { official_reference: 518 },
          by_link_type: { tw_price_daily: 518 },
          by_credibility_tier: { producer_record: 518 },
        },
        facets: {
          source_types: { official_reference: 518 },
          link_types: { tw_price_daily: 518 },
          credibility_tiers: { producer_record: 518 },
        },
      },
      page_info: {
        next_page_token: "20",
        total: 518,
        page_size: 20,
      },
      meta: {
        snapshot_at: "2026-11-05T06:30:00Z",
        surfaces: {
          management_evidence: { status: "ok", source: "service_store" },
          evidence_refs: { status: "ok", source: "service_store" },
        },
        redacted_evidence_count: 0,
      },
    });

    mocks.useV5Live.mockReturnValue({ data: hostedPayload, loading: false, refresh: vi.fn() });

    await i18n.changeLanguage("zh-TW");
    const { unmount: unmountZh } = renderEvidence("/management/evidence?scope=ingested");

    // FE-EVIDENCE-CITED-20261125: the cards that never had data are removed
    // instead of reading 無資料; the Verified card counted the removed badge flag.
    const zhCards = screen.getAllByTestId("evidence-metric-card");
    expect(zhCards).toHaveLength(1);
    expect(zhCards[0]).toHaveTextContent("總數518");
    expect(screen.queryByText("可追蹤")).not.toBeInTheDocument();
    expect(screen.queryByText("需處置")).not.toBeInTheDocument();
    expect(screen.queryByText("已驗證")).not.toBeInTheDocument();
    expect(screen.queryByText("開放處置")).not.toBeInTheDocument();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
    expect(screen.getAllByText("無內部連結")).toHaveLength(20);
    expect(screen.queryByText("Source unavailable")).not.toBeInTheDocument();
    unmountZh();

    await i18n.changeLanguage("en-US");
    const { unmount: unmountEn } = renderEvidence("/management/evidence?scope=ingested");

    const enCards = screen.getAllByTestId("evidence-metric-card");
    expect(enCards).toHaveLength(1);
    expect(enCards[0]).toHaveTextContent("Total518");
    expect(screen.queryByText("Traceable")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(screen.queryByText("Open ops")).not.toBeInTheDocument();
    expect(screen.getAllByText("No internal link")).toHaveLength(20);
    expect(screen.queryByText("Source unavailable")).not.toBeInTheDocument();
    unmountEn();
  });
});


describe("Evidence page: cited list (FE-EVIDENCE-CITED-20261125)", () => {
  beforeEach(async () => {
    mocks.useV5Live.mockReset();
    mocks.citedLiveOnly.mockReset();
    mocks.overviewLiveOnly.mockReset();
    mocks.detailLiveOnly.mockReset();
    await i18n.changeLanguage("en-US");
  });

  it("requests scope=cited by default and lists each reference with label, kind, source class and who cites it with links", () => {
    mocks.useV5Live.mockReturnValue({ data: citedModel(), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence");

    const loader = mocks.useV5Live.mock.calls[0][0] as (signal: AbortSignal) => unknown;
    const signal = new AbortController().signal;
    loader(signal);
    expect(mocks.citedLiveOnly).toHaveBeenCalledWith({ pageToken: undefined, pageSize: 20, signal });
    expect(mocks.overviewLiveOnly).not.toHaveBeenCalled();

    expect(screen.getByTestId("evidence-subtitle")).toHaveTextContent(
      "Evidence that meetings, approvals, evolution proposals, research and persona decisions actually cite",
    );
    expect(screen.getByTestId("evidence-scope-cited")).toHaveAttribute("data-state", "on");
    const rows = screen.getAllByTestId("evidence-route-row");
    expect(rows).toHaveLength(4);

    expect(screen.getByRole("link", { name: "TW momentum 20d breakout" })).toHaveAttribute("href", `/management/strategies/${ART_B}`);
    expect(rows[0]).toHaveTextContent("Strategy (registry)");
    expect(rows[0]).toHaveTextContent("Registry record");
    const meetingLinks = screen.getAllByRole("link", { name: "Pool evolution review for Paper Momentum Persona (2026-W48)" });
    expect(meetingLinks[0]).toHaveAttribute("href", `/management/meetings/${MEETING}`);
    // Reviewer point 4: an untitled approval is named by its type, the target is secondary text.
    const approvalLink = screen.getByRole("link", { name: "Strategy promotion approval" });
    expect(approvalLink).toHaveAttribute("href", "/management/approvals");
    expect(approvalLink.closest("li")).toHaveTextContent(ART_B);
    expect(screen.queryByRole("link", { name: ART_B })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: `Approval for ${ART_B}` })).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Paper Momentum Persona" })).toHaveAttribute("href", `/management/personas/${PERSONA}`);
    expect(rows[1]).toHaveTextContent("Persona strategy pool");
    expect(rows[1]).toHaveTextContent("Owner fact");

    expect(screen.getByRole("link", { name: "TW official tw_price_daily TWSE 0050 2026-11-24" })).toHaveAttribute(
      "href",
      "/management/evidence/evi-1217cd1c8ccc7274",
    );
    expect(rows[2]).toHaveTextContent("Search excerpt");
    expect(rows[2]).toHaveTextContent("Official reference");

    expect(rows[3]).toHaveTextContent("lessons:memory_committee_shared:mem-shared-0002");
    expect(rows[3]).toHaveTextContent("No name is recorded for this reference.");
    expect(rows[3].querySelector("td:first-child a")).toBeNull();
    expect(screen.getByRole("link", { name: "Paper Momentum Persona decision #1" })).toHaveAttribute(
      "href",
      `/management/personas/${PERSONA}`,
    );

    const cards = screen.getAllByTestId("evidence-metric-card");
    expect(cards[0]).toHaveTextContent("Cited references4");
    expect(cards[1]).toHaveTextContent("Sources read7 of 7");
    expect(screen.queryByTestId("evidence-cited-sources-incomplete")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/management-evidence|\bunknown\b/);
  });

  it("names a source that could not be read and marks the total incomplete", () => {
    mocks.useV5Live.mockReturnValue({
      data: citedModel({
        sources: {
          governance_approvals: { status: "denied", reason: "owner_denied", read_count: null, citation_count: 0, calls: 1 },
          meeting_positions: { status: "partial", reason: null, read_count: 3, failed_count: 1, citation_count: 2, calls: 4 },
        },
      }),
      loading: false,
      refresh: vi.fn(),
    });

    renderEvidence("/management/evidence");

    const notice = screen.getByTestId("evidence-cited-sources-incomplete");
    expect(notice).toHaveTextContent("Some sources could not be read, so this list may be missing references.");
    expect(screen.getByTestId("evidence-cited-source-governance_approvals")).toHaveTextContent("Approvals: you do not have access");
    expect(screen.getByTestId("evidence-cited-source-meeting_positions")).toHaveTextContent("Meeting positions: only partly read");
    const cards = screen.getAllByTestId("evidence-metric-card");
    expect(cards[0]).toHaveTextContent("At least 4 (incomplete)");
    expect(cards[1]).toHaveTextContent("5 of 7");
    expect(screen.getByTestId("evidence-pagination")).toHaveTextContent("At least 4 (incomplete)");
  });

  it("shows unavailable instead of zero when every source fails", () => {
    const payload = citedPayload({
      status: "unavailable",
      sources: Object.fromEntries(
        ["meeting_proposals", "meeting_positions", "governance_approvals", "evolution_proposals", "research_demands", "research_tickets", "persona_cycles"].map(
          (key) => [key, { status: "failed", reason: "read_timeout", read_count: null, citation_count: 0 }],
        ),
      ),
    });
    payload.data.items = [];
    (payload.page_info as { total: number | null }).total = null;
    mocks.useV5Live.mockReturnValue({ data: adaptManagementCitedEvidence(payload), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence");

    expect(screen.getByTestId("evidence-route-unavailable")).toHaveTextContent("Cited evidence could not be loaded");
    const cards = screen.getAllByTestId("evidence-metric-card");
    expect(cards[0]).toHaveTextContent("Unavailable");
    expect(cards[0].textContent).not.toMatch(/\b0\b/);
    expect(screen.queryByTestId("evidence-route-empty")).not.toBeInTheDocument();
  });

  it("stays usable when the server predates scope=cited and answers the ingested envelope", () => {
    const legacy = adaptManagementCitedEvidence({
      data: { id: "management-evidence", items: [{ ref_id: "evitem-1", title: "x" }], summary: { total_evidence: 1 } },
      page_info: { total: 1, next_page_token: null, page_size: 20 },
      meta: { surfaces: { management_evidence: { status: "ok" } } },
    });
    expect(legacy?.status).toBe("unsupported");
    expect(legacy?.items).toEqual([]);
    mocks.useV5Live.mockReturnValue({ data: legacy, loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence");

    expect(screen.getByTestId("evidence-cited-unsupported")).toHaveTextContent("This server does not list cited evidence yet.");
    expect(screen.getByRole("link", { name: "Open ingested items" })).toHaveAttribute("href", "/management/evidence?scope=ingested");
    expect(screen.queryByTestId("evidence-route-row")).not.toBeInTheDocument();
  });

  it("switches to the ingested list with scope=ingested and back", async () => {
    mocks.useV5Live.mockImplementation((loader: (signal: AbortSignal) => unknown) => {
      loader(new AbortController().signal);
      return { data: mocks.citedLiveOnly.mock.calls.length > mocks.overviewLiveOnly.mock.calls.length ? citedModel() : evidenceOverview(), loading: false, refresh: vi.fn() };
    });

    renderEvidence("/management/evidence");
    expect(screen.getByTestId("evidence-route-ready")).toHaveAttribute("data-evidence-scope", "cited");

    fireEvent.click(screen.getByTestId("evidence-scope-ingested"));
    await waitFor(() => expect(screen.getByTestId("evidence-route-ready")).toHaveAttribute("data-evidence-scope", "ingested"));
    expect(mocks.overviewLiveOnly).toHaveBeenCalledWith(expect.objectContaining({ scope: "ingested" }));
    expect(screen.getByTestId("evidence-subtitle")).toHaveTextContent("Every item the data sources ingested");

    fireEvent.click(screen.getByTestId("evidence-scope-cited"));
    await waitFor(() => expect(screen.getByTestId("evidence-route-ready")).toHaveAttribute("data-evidence-scope", "cited"));
  });

  it("keeps locale parity for every cited-list key in zh-TW", async () => {
    await i18n.changeLanguage("zh-TW");
    mocks.useV5Live.mockReturnValue({
      data: citedModel({ sources: { governance_approvals: { status: "denied", reason: "owner_denied", citation_count: 0 } } }),
      loading: false,
      refresh: vi.fn(),
    });

    renderEvidence("/management/evidence");

    expect(screen.getByTestId("evidence-scope-cited")).toHaveTextContent("被決策引用的");
    expect(screen.getByTestId("evidence-cited-source-governance_approvals")).toHaveTextContent("審批：你沒有存取權限".replace("：", ": "));
    expect(screen.getAllByTestId("evidence-metric-card")[0]).toHaveTextContent("至少 4 筆（不完整）");
    expect(screen.getByRole("link", { name: "Paper Momentum Persona 第 1 個決策" })).toBeInTheDocument();
    await i18n.changeLanguage("en-US");
  });
});

describe("Evidence page: detail and inbound links (FE-EVIDENCE-CITED-20261125)", () => {
  beforeEach(async () => {
    mocks.useV5Live.mockReset();
    await i18n.changeLanguage("en-US");
  });

  // Flat item answer of GET /bff/management/evidence/{ref_id}
  // (service.py get_evidence_item -> _management_evidence_public_item).
  const ingestedItem = {
    data: {
      id: "evi-1217cd1c8ccc7274",
      ref_id: "evi-1217cd1c8ccc7274",
      title: "TW official tw_price_daily TWSE 0050 2026-11-24",
      display_label: "TW official tw_price_daily TWSE 0050 2026-11-24",
      source_type: "official_reference",
      source_ref: "https://www.twse.com.tw/exchangeReport/STOCK_DAY?date=20261124&stockNo=0050",
      captured_at: "2026-11-24T14:30:00+08:00",
      link_type: "tw_price_daily",
      source_class: "official_reference",
      source_document: {
        title: "TW official tw_price_daily TWSE 0050 2026-11-24",
        source_type: "official_reference",
        source_ref: "https://www.twse.com.tw/exchangeReport/STOCK_DAY?date=20261124&stockNo=0050",
        captured_at: "2026-11-24T14:30:00+08:00",
        excerpt: "0050 close 192.35, volume 18,204 lots",
      },
      credibility: { tier: "producer_record", verified: true },
      linked_object_summary: {},
      linked_decisions: [],
      resolved_link: { availability: "unavailable", route_href: null, display_label: "Source unavailable" },
      route_href: "/knowledge/evidence/evi-1217cd1c8ccc7274",
      management_href: "/management/evidence?ref_id=evi-1217cd1c8ccc7274",
      redacted: false,
    },
    meta: { snapshot_at: "2026-11-25T12:30:00Z", surfaces: { evidence_ref_detail: { status: "ok", source: "service_store" } } },
  };

  it.each([
    ["cited item (row link)", "/management/evidence/evi-1217cd1c8ccc7274"],
    ["ingested item (management_href)", "/management/evidence?ref_id=evi-1217cd1c8ccc7274"],
  ])("shows title, source, captured time, excerpt and external link for a %s", (_label, route) => {
    const detail = adaptManagementEvidenceDetail(ingestedItem, "evi-1217cd1c8ccc7274");
    mocks.useV5Live.mockReturnValue({ data: detail, loading: false, error: null, refresh: vi.fn() });

    renderEvidence(route);

    expect(screen.getByRole("heading", { name: "TW official tw_price_daily TWSE 0050 2026-11-24" })).toBeInTheDocument();
    expect(screen.getAllByText("Official reference").length).toBeGreaterThan(0);
    // Reviewer point 3: recorded codes read as words, the code stays as tooltip.
    expect(screen.getByText("Taiwan daily prices")).toHaveAttribute("title", "tw_price_daily");
    expect(screen.getAllByText("Recorded by the producer")[0]).toHaveAttribute("title", "producer_record");
    // official_reference without an internal link reads "external source" / "No internal link".
    expect(screen.getByText("No internal link")).toBeInTheDocument();
    for (const raw of ["official reference", "producer record", "tw price daily", "Source unavailable", "unavailable"]) {
      expect(screen.queryByText(raw)).not.toBeInTheDocument();
    }
    expect(screen.getByText(safeDateTime("2026-11-24T14:30:00+08:00"))).toBeInTheDocument();
    expect(screen.getByTestId("evidence-detail-excerpt")).toHaveTextContent("0050 close 192.35, volume 18,204 lots");
    const external = screen.getByRole("link", { name: "Open original source" });
    expect(external).toHaveAttribute("href", "https://www.twse.com.tw/exchangeReport/STOCK_DAY?date=20261124&stockNo=0050");
    expect(external).toHaveAttribute("target", "_blank");
    expect(document.body.textContent).not.toMatch(/management-evidence|\bunknown\b/);
  });

  it("never reads the list envelope id management-evidence as an item", () => {
    const envelope = {
      data: { id: "management-evidence", items: [ingestedItem.data], summary: { total_evidence: 1 } },
      meta: { surfaces: { management_evidence: { status: "ok" } } },
    };
    expect(adaptManagementEvidenceDetail(envelope, "evi-1217cd1c8ccc7274")?.refId).toBe("evi-1217cd1c8ccc7274");
    expect(adaptManagementEvidenceDetail(envelope, "evi-other")).toBeNull();
    expect(adaptManagementEvidenceDetail(envelope)).toBeNull();
  });

  it("renders the BFF unavailable detail payload as unavailable, not as content", () => {
    const unavailable = adaptManagementEvidenceDetail(
      {
        data: { id: "evi-1217cd1c8ccc7274", ref_id: "evi-1217cd1c8ccc7274", title: null, source_class: null, source_document: null, credibility: null, resolved_link: null, linked_decisions: [], redacted: null },
        meta: { surfaces: { evidence_ref_detail: { status: "unavailable", reason: "read_timeout", message: "Evidence item read surface is unavailable." } } },
      },
      "evi-1217cd1c8ccc7274",
    );
    expect(unavailable?.unavailable).toBe(true);
    mocks.useV5Live.mockReturnValue({ data: unavailable, loading: false, error: null, refresh: vi.fn() });

    renderEvidence("/management/evidence/evi-1217cd1c8ccc7274");

    expect(screen.getByTestId("evidence-detail-unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Evidence detail unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Reason: read timeout")).toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bunknown\b/);
  });

  it("opens the right item for query links from rankings and league", () => {
    expect(evidenceInboundTarget(`facts:registry_entry:${ART_B}`)).toEqual({ kind: "route", href: `/management/artifacts/${ART_B}` });
    expect(evidenceInboundTarget(ART_B)).toEqual({ kind: "route", href: `/management/artifacts/${ART_B}` });
    expect(evidenceInboundTarget(`facts:member_virtual_book:${ART_B}`)).toEqual({ kind: "route", href: `/management/artifacts/${ART_B}` });
    expect(evidenceInboundTarget(`facts:strategy_pool:${PERSONA}@4`)).toEqual({ kind: "route", href: `/management/personas/${PERSONA}` });
    expect(evidenceInboundTarget("evidence:search_excerpt:evi-1217cd1c8ccc7274")).toEqual({ kind: "item", refId: "evi-1217cd1c8ccc7274" });
    expect(evidenceInboundTarget("evitem-tw_price_daily-0050-2026-11-01-abc123")).toEqual({ kind: "item", refId: "evitem-tw_price_daily-0050-2026-11-01-abc123" });
  });

  it("redirects a ?query= registry reference to the artifact page and looks an item id up as detail", () => {
    mocks.useV5Live.mockReturnValue({ data: undefined, loading: false, error: null, refresh: vi.fn() });
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/management/evidence?query=${encodeURIComponent(`facts:registry_entry:${ART_B}`)}`]}>
          <Routes>
            <Route path="/management/evidence" element={<EvidenceExplorerPage />} />
            <Route path="/management/artifacts/:id" element={<div data-testid="artifact-page">artifact</div>} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByTestId("artifact-page")).toBeInTheDocument();
  });

  it("does not claim to filter by trade journey when journey_id is passed", () => {
    mocks.useV5Live.mockReturnValue({ data: citedModel(), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence?journey_id=tj-20261125-0001");

    expect(screen.getByTestId("evidence-journey-notice")).toHaveTextContent(
      "Evidence library items are not linked to trade journeys, so this list is not filtered by journey tj-20261125-0001.",
    );
    expect(screen.getByRole("link", { name: "tj-20261125-0001 back to trade journey" })).toHaveAttribute(
      "href",
      "/management/trade-journeys/tj-20261125-0001",
    );
    expect(screen.queryByText(/Viewing evidence linked from trade journey/)).not.toBeInTheDocument();
  });
});
