import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import type {
  ManagementEvidenceDetail,
  ManagementEvidenceOverview,
} from "@/lib/bff-v1/management";
import { EvidenceExplorerPage, EvidencePacketDetailPage } from "./_core";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
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
    },
    facets: {
      sourceTypes: { unknown: 1 },
      source_types: { unknown: 1 },
      linkTypes: { provenance: 1 },
      link_types: { provenance: 1 },
      credibilityTiers: { producer_record: 1 },
      credibility_tiers: { producer_record: 1 },
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
    linkedDecisions: [],
    linked_decisions: [],
    sourceNoteContext: null,
    source_note_context: null,
    sourceMemoryContext: null,
    source_memory_context: null,
    createdAt: "2026-06-15T13:06:00Z",
    created_at: "2026-06-15T13:06:00Z",
    redacted: false,
    meta: {
      snapshotAt: "2026-06-30T12:23:04Z",
      snapshot_at: "2026-06-30T12:23:04Z",
      surfaces: {
        evidence_ref_detail: { status: "ok" },
        resolved_link: { status: "ok" },
        linked_decisions: { status: "ok" },
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
  });

  it("renders evidence provenance instead of the legacy hash table", () => {
    mocks.useV5Live.mockReturnValue({ data: evidenceOverview(), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence");

    expect(screen.getByRole("heading", { name: "Evidence Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Source / packet" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Hash" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TW momentum candidate" })).toHaveAttribute(
      "href",
      "/management/evidence?ref_id=evref-rart-20260615-002",
    );
    expect(screen.getByText("producer record")).toBeInTheDocument();
    expect(screen.getByText("Source unavailable")).toBeInTheDocument();
    expect(screen.getByText("artifact:rart-20260615-002")).toBeInTheDocument();
  });

  it("renders detail from the BFF evidence detail model", () => {
    mocks.useV5Live.mockReturnValue({ data: evidenceDetail(), loading: false, refresh: vi.fn() });

    renderEvidence("/management/evidence?ref_id=evref-rart-20260615-002");

    expect(screen.getByRole("heading", { name: "TW momentum candidate" })).toBeInTheDocument();
    expect(screen.getByText("evref-rart-20260615-002")).toBeInTheDocument();
    expect(screen.getByText("research orchestrator projection")).toBeInTheDocument();
    expect(screen.getByText("Source unavailable")).toBeInTheDocument();
    expect(screen.getByText("artifact:rart-20260615-002")).toBeInTheDocument();
    expect(screen.getByText("No BFF-linked decisions for this evidence ref.")).toBeInTheDocument();
    expect(screen.queryByText("storage://opaque/not-for-ui")).not.toBeInTheDocument();
  });
});
