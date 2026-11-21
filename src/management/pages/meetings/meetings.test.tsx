import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@/i18n";
import i18n from "@/i18n";

vi.mock("tsx/esm/api", () => ({
  tsImport: async () => import("@/management/navigation/managementRouteManifest"),
}));

import { setMockResolver, type MockHandler } from "@/lib/bff-v1/client";
import { makeBffError } from "@/lib/bff-v1/errors";
import { bffV1, managementConsoleReads } from "@/lib/bff-v1";
import {
  CANONICAL_CENTERS,
  MANAGEMENT_SIDEBAR_GROUPS,
} from "@/management/navigation/managementRouteManifest";
import {
  BASELINE_ROUTES,
  ENTITY_LIST_ENDPOINTS,
} from "../../../../scripts/lib/management-routes.mjs";
import { MeetingsCenterPage } from "./MeetingsCenterPage";
import { MeetingDetailPage } from "./MeetingDetailPage";
import { ConsultRulesPage } from "../governance/ConsultRulesPage";

void i18n.changeLanguage("en-US");

const access = vi.hoisted(() => ({
  value: {
    loading: false,
    interactionAllowed: true,
    interactionDisabledReason: null as string | null,
    writeAllowed: true,
    writeDisabledReason: null as string | null,
  },
}));

vi.mock("@/agora/useAgoraWriteAccess", () => ({
  useAgoraWriteAccess: () => access.value,
}));

type RouteSpec = { method: string; path: string; handler: MockHandler };
let routes: RouteSpec[] = [];
let calls: Array<{
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}> = [];

const json = (body: unknown, status = 200) => ({ kind: "json" as const, status, body });

function on(method: string, path: string, handler: MockHandler | unknown) {
  routes.push({
    method,
    path,
    handler: typeof handler === "function" ? (handler as MockHandler) : () => json(handler),
  });
}

// Recorded BFF responses mirroring BFF-MEETINGS-VIEWS-R2-20261116 shapes
const recordedListResponse = {
  status: "ok",
  owner: "consultation",
  reason: null,
  empty: false,
  fallback_used: false,
  data: {
    id: "management-meetings",
    status: "ok",
    source: "consultation",
    empty: false,
    items: [
      {
        id: "mtg-001",
        meeting_id: "mtg-001",
        meeting_type: "MT-1",
        topic: "Weekly pool evolution review #1",
        status: "open",
        outcome: "IN_PROGRESS",
        chair_persona_id: "persona-alpha",
        participants: [
          { persona_id: "persona-alpha", role: "chair", origin: "institutional" },
          { persona_id: "persona-risk-officer", role: "risk", origin: "institutional" },
          { persona_id: "advisor-macro-1", role: "participant", origin: "agora_advisor" },
        ],
        participant_count: 3,
        has_agora_participants: true,
        has_private_servant: false,
        round: 2,
        created_at: "2026-11-16T10:00:00Z",
        closed_at: null,
        href: "/management/meetings/mtg-001",
      },
      {
        id: "mtg-002",
        meeting_id: "mtg-002",
        meeting_type: "MT-4",
        topic: "Performance attribution review for trader-alice",
        status: "closed",
        outcome: "REVIEW",
        chair_persona_id: "persona-beta",
        participants: [
          { persona_id: "persona-beta", role: "chair", origin: "institutional" },
          {
            persona_id: "servant-alice",
            role: "participant",
            origin: "private_servant",
            servant: true,
            agora_user_id: "trader-alice",
          },
        ],
        participant_count: 2,
        has_agora_participants: true,
        has_private_servant: true,
        round: 2,
        created_at: "2026-11-16T08:00:00Z",
        closed_at: "2026-11-16T08:10:00Z",
        href: "/management/meetings/mtg-002",
      },
    ],
    summary: {
      total_items: 2,
      returned_items: 2,
      open_count: 1,
      closed_count: 1,
      review_count: 1,
    },
  },
};

const recordedProposalsResponse = {
  status: "ok",
  owner: "consultation",
  reason: null,
  empty: false,
  fallback_used: false,
  data: {
    id: "management-meeting-proposals",
    status: "ok",
    source: "consultation",
    empty: false,
    items: [
      {
        id: "prop-001",
        proposal_id: "prop-001",
        meeting_id: "mtg-001",
        meeting_href: "/management/meetings/mtg-001",
        kind: "research_demand",
        sponsor_persona_id: "persona-alpha",
        downstream: {
          target: "research_demand",
          id: "rd-101",
          status: "pending",
          href: "/management/experiments",
        },
      },
      {
        id: "prop-002",
        proposal_id: "prop-002",
        meeting_id: "mtg-002",
        meeting_href: "/management/meetings/mtg-002",
        kind: "governance_approval",
        sponsor_persona_id: "persona-beta",
        downstream: {
          target: "governance_approval",
          id: "apv-202",
          status: "pending_operator",
          href: "/management/approvals?id=apv-202",
        },
      },
    ],
  },
};

const recordedCatalogueResponse = {
  status: "ok",
  owner: "consultation",
  reason: null,
  empty: false,
  fallback_used: false,
  data: {
    id: "management-meeting-catalogue",
    status: "ok",
    source: "consultation",
    types: [
      {
        meeting_type: "MT-1",
        enabled: true,
        cadence: "weekly",
        roster_rule: "owner_plus_peer_plus_risk",
        budget: { max_participants: 5, max_rounds: 2, weekly_limit: 3 },
      },
      {
        meeting_type: "MT-4",
        enabled: true,
        cadence: "event_attribution",
        roster_rule: "subject_plus_counterparty_plus_risk_plus_red_team",
        budget: { max_participants: 5, max_rounds: 2, weekly_limit: 3 },
      },
    ],
    schedule: [
      {
        persona_id: "persona-alpha",
        meeting_type: "MT-1",
        last_run_at: "2026-11-09T10:00:00Z",
        next_due_at: "2026-11-16T10:00:00Z",
        weekly_count: 1,
        weekly_limit: 3,
      },
    ],
    refusals: [
      {
        persona_id: "persona-alpha",
        meeting_type: "MT-3",
        reason: "insufficient_participants",
        at: "2026-11-16T09:00:00Z",
      },
    ],
  },
};

const recordedDetailResponse = {
  status: "ok",
  owner: "consultation",
  reason: null,
  fallback_used: false,
  data: {
    id: "mtg-001",
    meeting_id: "mtg-001",
    meeting_type: "MT-4",
    topic: "Performance attribution review for trader-alice",
    status: "closed",
    outcome: "PROPOSALS_ISSUED",
    chair_persona_id: "persona-alpha",
    convened_by: { kind: "agora_user", id: "trader-alice", agora_user_id: "trader-alice" },
    subject_ref: { kind: "trader", id: "trader-alice", account_id: "acct-alice-01" },
    attribution_record_id: "attr-001",
    attribution_record: {
      record_id: "attr-001",
      subject_kind: "trader",
      subject_id: "trader-alice",
      agora_user_id: "trader-alice",
      account_id: "acct-alice-01",
      broker_ids: ["brk-ib-01"],
      direction: "outstanding",
      decomposition: {
        selection: 0.04,
        entry_timing: 0.02,
        sizing: 0.01,
        exit: 0.01,
        costs: -0.002,
      },
      sample_size: 18,
      luck_interval: [0.01, 0.06],
    },
    participants: [
      { persona_id: "persona-alpha", role: "chair", origin: "institutional" },
      { persona_id: "persona-red-team", role: "red_team", origin: "institutional" },
      {
        persona_id: "servant-alice",
        role: "participant",
        origin: "private_servant",
        servant: true,
        agora_user_id: "trader-alice",
        account_id: "acct-alice-01",
        broker_ids: ["brk-ib-01"],
      },
    ],
    agenda: ["Review outlier attribution attr-001", "Formulate testable causal hypothesis"],
    case_file_items: [
      {
        item_id: "cf-shared-1",
        kind: "pool_health",
        relevance_scope: "committee",
        source_owner: "evaluation",
        excerpt: "Shared pool Sharpe 1.62 over 20d window",
      },
      {
        item_id: "cf-private-leak-1",
        kind: "memory",
        relevance_scope: "persona_private",
        memory_layer: "persona_private",
        source_owner: "memory",
        excerpt: "NEVER_SHOW_PRIVATE_MEMORY_EXCERPT_001",
      },
      {
        item_id: "cf-agora-lock-1",
        kind: "agora_decision_lock",
        relevance_scope: "committee",
        source_owner: "agora",
        agora_user_id: "trader-alice",
        account_id: "acct-alice-01",
        broker_ids: ["brk-ib-01"],
        raw_text: "Trader Alice entered early stop-loss on high VIX day",
        excerpt: "Decision lock dl-99",
      },
    ],
    private_items_withheld: 2,
    pre_read: {
      interpretations: [
        {
          persona_id: "persona-alpha",
          relevance_scope: "committee",
          text: "Committee-visible interpretation of drawdown control.",
          private_memory: "NEVER_SHOW_PRIVATE_FIELD_002",
        },
        {
          persona_id: "persona-secret",
          relevance_scope: "persona_private",
          text: "NEVER_SHOW_PRIVATE_INTERPRETATION_003",
        },
      ],
    },
    rounds: [
      {
        round: 1,
        positions: [
          {
            label: "participant:chair:momentum",
            persona_id: "persona-alpha",
            revealed_persona_id: "persona-alpha",
            role: "chair",
            style: "momentum",
            stance: "support_hypothesis",
            confidence: 0.82,
            citations: ["cf-shared-1", "cf-agora-lock-1"],
            changed: false,
            private_memory: "NEVER_SHOW_PRIVATE_ROUND_004",
          },
          {
            label: "participant:red_team:contrarian",
            persona_id: "persona-red-team",
            revealed_persona_id: "persona-red-team",
            role: "red_team",
            style: "contrarian",
            stance: "argue_small_sample",
            confidence: 0.65,
            citations: ["cf-shared-1"],
            changed: false,
          },
        ],
      },
      {
        round: 2,
        positions: [
          {
            label: "participant:chair:momentum",
            persona_id: "persona-alpha",
            revealed_persona_id: "persona-alpha",
            role: "chair",
            style: "momentum",
            stance: "support_with_regime_control",
            confidence: 0.88,
            citations: ["cf-shared-1", "cf-agora-lock-1"],
            changed: true,
          },
          {
            label: "participant:red_team:contrarian",
            persona_id: "persona-red-team",
            revealed_persona_id: "persona-red-team",
            role: "red_team",
            style: "contrarian",
            stance: "dissent_recorded",
            confidence: 0.6,
            citations: ["cf-shared-1"],
            changed: false,
          },
        ],
      },
    ],
    label_reveal: {
      "participant:chair:momentum": "persona-alpha",
      "participant:red_team:contrarian": "persona-red-team",
    },
    anonymised_labels_revealed: true,
    synthesis: {
      proposals: [
        {
          proposal_id: "prop-001",
          meeting_id: "mtg-001",
          kind: "research_demand",
          sponsor_persona_id: "persona-alpha",
          downstream: {
            target: "research_demand",
            id: "rd-101",
            status: "pending",
            href: "/management/experiments",
          },
        },
      ],
      tally: { support: 0.88, dissent: 0.6, binding: false },
      dissent_memo_id: "memo-dissent-001",
      outcome: "PROPOSALS_ISSUED",
    },
    proposals: [
      {
        proposal_id: "prop-001",
        meeting_id: "mtg-001",
        kind: "research_demand",
        sponsor_persona_id: "persona-alpha",
        downstream: {
          target: "research_demand",
          id: "rd-101",
          status: "pending",
          href: "/management/experiments",
        },
      },
    ],
    writebacks: [
      {
        persona_id: "persona-alpha",
        entry_id: "pmem-wb-001",
        content: "NEVER_SHOW_WRITEBACK_PRIVATE_TEXT_005",
      },
      {
        persona_id: "persona-red-team",
        entry_id: "pmem-wb-002",
      },
    ],
    usage: { participants: 3, rounds: 2, calls: 10 },
    created_at: "2026-11-16T10:00:00Z",
    closed_at: "2026-11-16T10:05:00Z",
  },
};

beforeEach(() => {
  routes = [];
  calls = [];
  access.value = {
    loading: false,
    interactionAllowed: true,
    interactionDisabledReason: null,
    writeAllowed: true,
    writeDisabledReason: null,
  };
  setMockResolver((method, path) => {
    const hit = routes.find((r) => r.method === method && r.path === path);
    if (!hit) return undefined;
    return async (req) => {
      calls.push({
        method,
        path,
        query: req.query,
        body: req.body,
        headers: req.headers,
      });
      return hit.handler(req);
    };
  });
});

afterEach(() => {
  cleanup();
  setMockResolver(undefined);
  vi.restoreAllMocks();
});

function renderCenter(initialUrl = "/management/meetings") {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/management/meetings" element={<MeetingsCenterPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDetail(initialUrl = "/management/meetings/mtg-001") {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/management/meetings/:id" element={<MeetingDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Meetings route manifest and acceptance crawl inventory (AC1 & AC6)", () => {
  it("registers /management/meetings in groups.researchAndEvolution with the four tabs of design 11.3 and in the crawl baseline", () => {
    const group = MANAGEMENT_SIDEBAR_GROUPS.find((g) => g.labelKey === "groups.researchAndEvolution");
    expect(group).toBeDefined();
    const meetingsItem = group!.items.find((i) => i.id === "meetings");
    expect(meetingsItem).toBeDefined();
    expect(meetingsItem!.to).toBe("/management/meetings");

    expect(CANONICAL_CENTERS.meetings.path).toBe("/management/meetings");
    expect(CANONICAL_CENTERS.meetings.tabs.map((t) => t.id)).toEqual([
      "upcoming",
      "history",
      "proposals",
      "rules",
    ]);

    expect(BASELINE_ROUTES.some((r: { path: string; kind: string }) => r.path === "/management/meetings" && r.kind === "nav")).toBe(true);
    expect(BASELINE_ROUTES.some((r: { path: string; entity?: string }) => r.path === "/management/meetings/mtg_001" && r.entity === "meetings")).toBe(true);
    expect(ENTITY_LIST_ENDPOINTS.meetings).toBe("/bff/management/meetings");
  });
});

describe("MeetingsCenterPage (AC1, AC5, AC6, AC7)", () => {
  it("renders all four tabs reading only the BFF meetings routes", async () => {
    on("GET", "/bff/management/meetings", recordedListResponse);
    on("GET", "/bff/management/meetings/proposals", recordedProposalsResponse);
    on("GET", "/bff/management/meetings/catalogue", recordedCatalogueResponse);

    const { unmount } = renderCenter("/management/meetings?tab=upcoming");

    // Upcoming tab shows open meeting mtg-001
    expect(await screen.findByTestId("meeting-row-mtg-001")).toBeInTheDocument();
    expect(screen.getByText("Weekly pool evolution review #1")).toBeInTheDocument();
    unmount();

    // History tab shows closed meeting mtg-002 with REVIEW outcome
    const { unmount: unmountHistory } = renderCenter("/management/meetings?tab=history");
    expect(await screen.findByTestId("meeting-history-row-mtg-002")).toBeInTheDocument();
    expect(screen.getByText("REVIEW")).toBeInTheDocument();
    unmountHistory();

    // Proposals tab shows proposals and live downstream links
    const { unmount: unmountProposals } = renderCenter("/management/meetings?tab=proposals");
    expect(await screen.findByTestId("meeting-proposal-row-prop-001")).toBeInTheDocument();
    expect(screen.getByTestId("proposal-downstream-link-prop-001")).toHaveAttribute(
      "href",
      "/management/experiments",
    );
    expect(screen.getByTestId("proposal-downstream-link-prop-002")).toHaveAttribute(
      "href",
      "/management/approvals?id=apv-202",
    );
    unmountProposals();

    // Rules & Budget tab (reachable via ?tab=rules and ?tab=budget) shows types, schedule, and refusals
    const { unmount: unmountRules } = renderCenter("/management/meetings?tab=budget");
    expect(await screen.findByTestId("meetings-catalogue-view")).toBeInTheDocument();
    expect(screen.getByTestId("catalogue-type-MT-1")).toBeInTheDocument();
    expect(screen.getByTestId("catalogue-schedule-persona-alpha-MT-1")).toHaveTextContent(
      "2026-11-16T10:00:00Z",
    );
    expect(screen.getByTestId("catalogue-refusal-MT-3-0")).toHaveTextContent(
      "insufficient_participants",
    );
    unmountRules();

    // Verify only BFF meetings routes were read
    for (const call of calls) {
      expect(call.path.startsWith("/bff/management/meetings")).toBe(true);
    }
  });

  it("renders explicit empty states and explicit unavailable states with recorded reason", async () => {
    // 1. Explicit empty states
    on("GET", "/bff/management/meetings", { status: "ok", owner: "consultation", data: { items: [] } });
    on("GET", "/bff/management/meetings/proposals", { status: "ok", owner: "consultation", data: { items: [] } });
    on("GET", "/bff/management/meetings/catalogue", {
      status: "ok",
      owner: "consultation",
      data: { types: [], schedule: [], refusals: [] },
    });

    const { unmount } = renderCenter("/management/meetings?tab=upcoming");
    expect(await screen.findByTestId("meetings-upcoming-empty")).toBeInTheDocument();
    unmount();

    // 2. Explicit unavailable states
    routes = [];
    on("GET", "/bff/management/meetings", {
      status: "unavailable",
      owner: "consultation",
      reason: "consultation_owner_unavailable",
      data: { status: "unavailable", reason: "consultation_owner_unavailable", items: [] },
    });
    on("GET", "/bff/management/meetings/proposals", {
      status: "unavailable",
      owner: "consultation",
      reason: "consultation_owner_unavailable",
      data: { status: "unavailable", reason: "consultation_owner_unavailable", items: [] },
    });
    on("GET", "/bff/management/meetings/catalogue", {
      status: "unavailable",
      owner: "consultation",
      reason: "consultation_owner_unavailable",
      data: { status: "unavailable", reason: "consultation_owner_unavailable", types: [], schedule: [], refusals: [] },
    });

    renderCenter("/management/meetings?tab=upcoming");
    const unavailable = await screen.findByTestId("meetings-unavailable");
    expect(unavailable).toHaveTextContent("consultation_owner_unavailable");
  });

  it("write-gates the convene action and sends an Idempotency-Key when enabled", async () => {
    on("GET", "/bff/management/meetings", recordedListResponse);
    on("GET", "/bff/management/meetings/proposals", recordedProposalsResponse);
    on("GET", "/bff/management/meetings/catalogue", recordedCatalogueResponse);
    on("POST", "/bff/management/meetings", {
      status: "ok",
      meeting_id: "mtg-conv-001",
      data: {
        meeting_id: "mtg-conv-001",
        status: "convened",
        meeting_type: "MT-3",
        topic: "Evaluate volatility breakout candidates",
      },
    });

    // 1. Write-gated when disabled
    access.value = {
      loading: false,
      interactionAllowed: false,
      interactionDisabledReason: "Interaction writes are disabled by deployment policy.",
      writeAllowed: false,
      writeDisabledReason: "Writes are disabled.",
    };
    const { unmount } = renderCenter();
    await screen.findByTestId("meeting-row-mtg-001");
    expect(screen.getByTestId("convene-meeting-submit")).toBeDisabled();
    expect(screen.getByTestId("meetings-write-disabled")).toHaveTextContent(
      "Interaction writes are disabled by deployment policy.",
    );
    unmount();

    // 2. Enabled write sends POST with Idempotency-Key
    access.value = {
      loading: false,
      interactionAllowed: true,
      interactionDisabledReason: null,
      writeAllowed: true,
      writeDisabledReason: null,
    };
    renderCenter();
    await screen.findByTestId("meeting-row-mtg-001");

    fireEvent.change(screen.getByTestId("convene-meeting-type"), { target: { value: "MT-3" } });
    fireEvent.change(screen.getByTestId("convene-meeting-topic"), {
      target: { value: "Evaluate volatility breakout candidates" },
    });
    fireEvent.change(screen.getByTestId("convene-meeting-participants"), {
      target: { value: "persona-alpha, persona-red-team" },
    });
    fireEvent.click(screen.getByTestId("convene-meeting-submit"));

    const receipt = await screen.findByTestId("convene-meeting-receipt");
    expect(receipt).toHaveTextContent("mtg-conv-001");

    const postCall = calls.find((c) => c.method === "POST" && c.path === "/bff/management/meetings");
    expect(postCall).toBeDefined();
    expect(postCall!.headers["Idempotency-Key"]).toBeTruthy();
    expect(postCall!.body).toEqual({
      meeting_type: "MT-3",
      topic: "Evaluate volatility breakout candidates",
      participants: ["persona-alpha", "persona-red-team"],
    });
  });
});

describe("MeetingDetailPage (AC2, AC6, AC7)", () => {
  it("renders header, MT-4 attribution, agenda, case-file items, pre-read, rounds with anonymised labels and operator reveal, synthesis, dissent, proposals with downstream links, writeback IDs, and usage while never showing private memory text", async () => {
    on("GET", "/bff/management/meetings/mtg-001", recordedDetailResponse);

    renderDetail("/management/meetings/mtg-001");

    expect(await screen.findByTestId("meeting-detail-header")).toHaveTextContent("mtg-001");
    expect(screen.getByTestId("meeting-detail-header")).toHaveTextContent(
      "Performance attribution review for trader-alice",
    );
    expect(screen.getByTestId("servant-flag-servant-alice")).toHaveTextContent("servant");

    // MT-4 attribution record above rounds
    expect(screen.getByTestId("meeting-detail-attribution")).toHaveTextContent("attr-001");
    expect(screen.getByTestId("meeting-detail-attribution")).toHaveTextContent("trader-alice");
    expect(screen.getByTestId("meeting-detail-attribution")).toHaveTextContent("selection=0.04");

    // Agenda
    expect(screen.getByTestId("meeting-detail-agenda")).toHaveTextContent(
      "Review outlier attribution attr-001",
    );

    // Case-file items
    expect(screen.getByTestId("case-file-item-cf-shared-1")).toHaveTextContent(
      "Shared pool Sharpe 1.62 over 20d window",
    );
    expect(screen.getByTestId("case-file-item-cf-agora-lock-1")).toHaveTextContent(
      "Trader Alice entered early stop-loss on high VIX day",
    );

    // Pre-read interpretations
    expect(screen.getByTestId("pre-read-item-persona-alpha")).toHaveTextContent(
      "Committee-visible interpretation of drawdown control.",
    );

    // Round 1 & Round 2 with anonymised labels + operator-only reveal
    expect(screen.getByTestId("meeting-round-1")).toHaveTextContent("participant:chair:momentum");
    expect(screen.getByTestId("meeting-round-2")).toHaveTextContent(
      "support_with_regime_control",
    );
    expect(screen.getByTestId("meeting-label-reveal")).toHaveTextContent(
      "participant:chair:momentum → persona-alpha",
    );
    expect(screen.getByTestId("round-2-revealed-participant:chair:momentum")).toHaveTextContent(
      "operator reveal: persona-alpha",
    );

    // Synthesis & dissent
    expect(screen.getByTestId("meeting-detail-synthesis")).toHaveTextContent("PROPOSALS_ISSUED");
    expect(screen.getByTestId("meeting-synthesis-tally")).toHaveTextContent("support=0.88");
    expect(screen.getByTestId("meeting-dissent-memo")).toHaveTextContent("memo-dissent-001");

    // Proposals with live downstream link
    expect(screen.getByTestId("proposal-downstream-link-prop-001")).toHaveAttribute(
      "href",
      "/management/experiments",
    );

    // Memory writeback IDs only
    expect(screen.getByTestId("writeback-persona-alpha-pmem-wb-001")).toHaveTextContent(
      "pmem-wb-001",
    );
    expect(screen.getByTestId("writeback-persona-red-team-pmem-wb-002")).toHaveTextContent(
      "pmem-wb-002",
    );

    // Usage
    expect(screen.getByTestId("meeting-detail-usage")).toHaveTextContent("participants: 3");
    expect(screen.getByTestId("meeting-detail-usage")).toHaveTextContent("rounds: 2");
    expect(screen.getByTestId("meeting-detail-usage")).toHaveTextContent("calls: 10");

    // Never shows private memory text anywhere
    const pageText = document.body.textContent ?? "";
    expect(pageText).not.toContain("NEVER_SHOW_PRIVATE_MEMORY_EXCERPT_001");
    expect(pageText).not.toContain("NEVER_SHOW_PRIVATE_FIELD_002");
    expect(pageText).not.toContain("NEVER_SHOW_PRIVATE_INTERPRETATION_003");
    expect(pageText).not.toContain("NEVER_SHOW_PRIVATE_ROUND_004");
    expect(pageText).not.toContain("NEVER_SHOW_WRITEBACK_PRIVATE_TEXT_005");
  });

  it("renders honest not-found on 404 for unknown meeting id and explicit unavailable when owner fails", async () => {
    on("GET", "/bff/management/meetings/mtg-unknown-999", () => ({
      kind: "error",
      error: makeBffError({
        code: "RESOURCE_NOT_FOUND",
        message: "Meeting not found",
        cause: "meeting_not_found",
      }),
    }));
    on("GET", "/bff/management/meetings/mtg-offline", {
      status: "unavailable",
      owner: "consultation",
      reason: "consultation_owner_unavailable",
      data: { status: "unavailable", reason: "consultation_owner_unavailable", meeting: null },
    });

    const { unmount } = renderDetail("/management/meetings/mtg-unknown-999");
    const notFound = await screen.findByTestId("meeting-detail-not-found");
    expect(notFound.textContent).toMatch(/not found|找不到/i);
    expect(notFound.textContent).toContain("mtg-unknown-999");
    unmount();

    renderDetail("/management/meetings/mtg-offline");
    const unavailable = await screen.findByTestId("meeting-detail-unavailable");
    expect(unavailable.textContent).toContain("consultation_owner_unavailable");
    expect(unavailable.textContent).toMatch(/Consultation owner service is unavailable|會診主控服務暫時無法使用/);
  });

  it("renders localized labels and plain-language reasons with secondary code for refused / insufficient_participants meetings", async () => {
    on("GET", "/bff/management/meetings/mtg-492d824b116f9ace", {
      status: 200,
      data: {
        meeting_id: "mtg-492d824b116f9ace",
        meeting_type: "MT-3",
        topic: "Strategy ideation",
        status: "refused",
        outcome: "insufficient_participants",
        participants: [],
        rounds: [],
        proposals: [],
        writebacks: [],
      },
    });

    renderDetail("/management/meetings/mtg-492d824b116f9ace");
    const header = await screen.findByTestId("meeting-detail-header");
    expect(header.textContent).toMatch(/Refused|已拒絕召開/);
    expect(header.textContent).toMatch(/Insufficient eligible participants to convene meeting|合格參與人數不足，無法召開會議/);
    expect(header.textContent).toContain("insufficient_participants");
  });

  it("renders BFF persona and strategy display names, secondary raw IDs, and name_missing flags on MeetingsCenterPage and MeetingDetailPage without resolving names client-side (AC1/AC4)", async () => {
    await i18n.changeLanguage("en-US");
    routes = [];
    on("GET", "/bff/management/meetings", {
      status: "ok",
      owner: "consultation",
      data: {
        items: [
          {
            meeting_id: "mtg-display-01",
            meeting_type: "MT-1",
            topic: "Weekly review with display names",
            status: "open",
            outcome: "IN_PROGRESS",
            chair_persona_id: "persona-alpha",
            chair_persona_display_name: "Alpha Macro Strategist",
            chair_persona_name_missing: false,
            strategy_id: "strategy-alpha-2330",
            strategy_display_name: "Alpha 2330 Core",
            strategy_name_missing: false,
            participants: [
              {
                persona_id: "persona-alpha",
                persona_display_name: "Alpha Macro Strategist",
                persona_name_missing: false,
                role: "chair",
              },
              {
                persona_id: "persona-orphan-01",
                persona_display_name: null,
                persona_name_missing: true,
                role: "risk",
              },
            ],
            participant_count: 2,
          },
        ],
        summary: { total_items: 1, open_count: 1, closed_count: 0, review_count: 0 },
      },
    });
    on("GET", "/bff/management/meetings/proposals", {
      status: "ok",
      owner: "consultation",
      data: {
        items: [
          {
            proposal_id: "prop-display-01",
            meeting_id: "mtg-display-01",
            kind: "research_demand",
            sponsor_persona_id: "persona-alpha",
            sponsor_persona_display_name: "Alpha Macro Strategist",
            sponsor_persona_name_missing: false,
            strategy_id: "strategy-orphan-prop",
            strategy_display_name: null,
            strategy_name_missing: true,
            downstream: { target: "research_demand", id: "rd-101", status: "pending" },
          },
        ],
      },
    });
    on("GET", "/bff/management/meetings/catalogue", recordedCatalogueResponse);
    on("GET", "/bff/management/meetings/mtg-display-01", {
      status: "ok",
      owner: "consultation",
      data: {
        meeting_id: "mtg-display-01",
        meeting_type: "MT-1",
        topic: "Weekly review with display names",
        status: "open",
        chair_persona_id: "persona-alpha",
        chair_persona_display_name: "Alpha Macro Strategist",
        chair_persona_name_missing: false,
        strategy_id: "strategy-alpha-2330",
        strategy_display_name: "Alpha 2330 Core",
        strategy_name_missing: false,
        participants: [
          {
            persona_id: "persona-alpha",
            persona_display_name: "Alpha Macro Strategist",
            persona_name_missing: false,
            role: "chair",
          },
          {
            persona_id: "persona-orphan-01",
            persona_display_name: null,
            persona_name_missing: true,
            role: "risk",
          },
        ],
        pre_read: {
          interpretations: [
            {
              persona_id: "persona-alpha",
              persona_display_name: "Alpha Macro Strategist",
              persona_name_missing: false,
              relevance_scope: "committee",
              text: "Shared committee interpretation",
            },
          ],
        },
        rounds: [],
        proposals: [
          {
            proposal_id: "prop-display-01",
            meeting_id: "mtg-display-01",
            kind: "research_demand",
            sponsor_persona_id: "persona-orphan-01",
            sponsor_persona_display_name: null,
            sponsor_persona_name_missing: true,
            downstream: { target: "research_demand", id: "rd-101", status: "pending" },
          },
        ],
        writebacks: [
          {
            persona_id: "persona-alpha",
            persona_display_name: "Alpha Macro Strategist",
            persona_name_missing: false,
            entry_id: "wb-display-01",
          },
        ],
      },
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={["/management/meetings"]}>
        <Routes>
          <Route path="/management/meetings" element={<MeetingsCenterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByTestId("meeting-chair-mtg-display-01-primary"),
    ).toHaveTextContent("Alpha Macro Strategist");
    expect(screen.getByTestId("meeting-chair-mtg-display-01-id")).toHaveTextContent(
      "(persona-alpha)",
    );
    expect(
      screen.getByTestId("meeting-strategy-mtg-display-01-primary"),
    ).toHaveTextContent("Alpha 2330 Core");
    expect(
      screen.getByTestId(
        "meeting-row-mtg-display-01-participant-persona-orphan-01-name-missing",
      ),
    ).toHaveTextContent("Name missing");
    unmount();

    renderDetail("/management/meetings/mtg-display-01");
    expect(
      await screen.findByTestId("meeting-detail-chair-primary"),
    ).toHaveTextContent("Alpha Macro Strategist");
    expect(screen.getByTestId("meeting-detail-chair-id")).toHaveTextContent("(persona-alpha)");
    expect(
      screen.getByTestId("participant-persona-orphan-01-name-missing"),
    ).toHaveTextContent("Name missing");
    expect(
      screen.getByTestId("detail-proposal-sponsor-prop-display-01-name-missing"),
    ).toHaveTextContent("Name missing");
    expect(
      screen.getByTestId("writeback-persona-persona-alpha-wb-display-01-primary"),
    ).toHaveTextContent("Alpha Macro Strategist");
  });
});

describe("ConsultRulesPage (AC3 & AC7)", () => {
  it("separates gate panels from deliberative meetings and links to the meetings rules tab", async () => {
    vi.spyOn(managementConsoleReads, "consultRules").mockResolvedValue({
      items: [
        {
          id: "rule-1",
          name: "Risk gate before paper trial",
          fromPersonaId: "persona-alpha",
          toPersonaId: "persona-risk-officer",
          mode: "blocking",
          envScope: ["paper"],
          trigger: "decision.type == trial_admission",
          enabled: true,
          owner: "risk-team",
          updatedAt: "2026-11-15T00:00:00Z",
        },
      ],
      degradation: { kind: "complete" },
    } as unknown as Awaited<ReturnType<typeof managementConsoleReads.consultRules>>);
    vi.spyOn(bffV1.personas, "list").mockResolvedValue([]);
    on("GET", "/bff/management/meetings/catalogue", recordedCatalogueResponse);

    render(
      <MemoryRouter initialEntries={["/management/governance/consult"]}>
        <Routes>
          <Route path="/management/governance/consult" element={<ConsultRulesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("consult-gate-panels-section")).toBeInTheDocument();
    expect(screen.getByTestId("consult-deliberative-meetings-section")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("consult-deliberative-type-MT-1")).toBeInTheDocument();
      expect(screen.getByTestId("consult-deliberative-type-MT-4")).toBeInTheDocument();
    });
    expect(screen.getByTestId("consult-link-meetings-rules")).toHaveAttribute(
      "href",
      "/management/meetings?tab=rules",
    );
    expect(screen.getByTestId("consult-section-link-meetings-rules")).toHaveAttribute(
      "href",
      "/management/meetings?tab=rules",
    );
  });
});

// FE-RISK-STRATEGY-RESEARCH-UI-20261120 WP6.3 — dead_letter Round 0 meeting (BFF contract shape).
describe("MeetingsCenterPage failed meetings (FE-RISK-STRATEGY-RESEARCH-UI-20261120)", () => {
  const deadLetterList = (includeFailed: boolean) => ({
    status: "ok",
    owner: "consultation",
    reason: null,
    empty: false,
    fallback_used: false,
    data: {
      id: "management-meetings",
      status: "ok",
      source: "consultation",
      empty: false,
      items: [
        {
          id: "mtg-real-1",
          meeting_id: "mtg-real-1",
          meeting_type: "MT-1",
          topic: "池子演進檢討",
          topic_summary: {
            kind: "pool_evolution_review",
            subject_persona_id: "persona-alpha",
            period: "2026-Q3",
            lesson_count: 4,
          },
          status: "open",
          execution_state: { status: "convened", attempt_count: 1, max_attempts: 3, last_error: null, updated_at: "2026-11-20T10:00:00Z" },
          chair_persona_id: "persona-alpha",
          chair_persona_display_name: "青禾",
          persona_display_name: "青禾",
          participants: [],
          round: 2,
          created_at: "2026-11-20T10:00:00Z",
          href: "/management/meetings/mtg-real-1",
        },
        ...(includeFailed
          ? [
              {
                id: "mtg-dead-1",
                meeting_id: "mtg-dead-1",
                meeting_type: "MT-2",
                topic: "優化會議",
                topic_summary: {
                  kind: "optimisation_review",
                  subject_persona_id: "persona-beta",
                  period: "2026-Q3",
                  lesson_count: 2,
                },
                status: "convened",
                effective_status: "execution_failed",
                execution_state: {
                  status: "dead_letter",
                  attempt_count: 3,
                  max_attempts: 3,
                  last_error: "provider_unavailable",
                  updated_at: "2026-11-20T09:05:00Z",
                },
                chair_persona_id: "persona-beta",
                chair_persona_display_name: "墨竹",
                participants: [],
                round: 0,
                created_at: "2026-11-20T09:00:00Z",
                href: "/management/meetings/mtg-dead-1",
              },
            ]
          : []),
      ],
      summary: { dead_letter_count: 3 },
    },
  });

  function mountRoutes() {
    on("GET", "/bff/management/meetings", (req: { query?: Record<string, string> }) =>
      json(deadLetterList(req.query?.include_failed === "true")),
    );
    on("GET", "/bff/management/meetings/proposals", { status: "ok", owner: "consultation", data: { items: [] } });
    on("GET", "/bff/management/meetings/catalogue", { status: "ok", owner: "consultation", data: {} });
  }

  it("titles cards by type + chair + topic, localizes the authority badge and hides failed meetings by default", async () => {
    await i18n.changeLanguage("zh-TW");
    mountRoutes();
    renderCenter("/management/meetings?tab=upcoming");
    expect(await screen.findByTestId("meeting-row-mtg-real-1")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-title-mtg-real-1")).toHaveTextContent("池子演進會議 · 青禾");
    expect(screen.getByTestId("meeting-topic-mtg-real-1")).toHaveTextContent("池子演進檢討：青禾（2026-Q3，4 則教訓）");
    expect(screen.getByTestId("meetings-authority-badge")).not.toHaveTextContent("execution_authority");
    expect(screen.queryByTestId("meeting-row-mtg-dead-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("meetings-failed-text")).toHaveTextContent("3");
    await i18n.changeLanguage("en-US");
  });

  it("include_failed toggle shows 執行失敗（未開成） with the localized last_error instead of Round 0", async () => {
    await i18n.changeLanguage("zh-TW");
    mountRoutes();
    renderCenter("/management/meetings?tab=upcoming&include_failed=true");
    const row = await screen.findByTestId("meeting-row-mtg-dead-1");
    expect(screen.getByTestId("meeting-execution-failed-mtg-dead-1")).toHaveTextContent("執行失敗（未開成）");
    expect(screen.getByTestId("meeting-last-error-mtg-dead-1")).toBeInTheDocument();
    expect(row.textContent ?? "").not.toMatch(/Round:\s*0/);
    expect(calls.some((c) => c.path === "/bff/management/meetings" && c.query?.include_failed === "true")).toBe(true);
    await i18n.changeLanguage("en-US");
  });
});

describe("MeetingDetailPage review disposition (FE-MEETING-REVIEW-DISPOSITION-20261121)", () => {
  const makeLegacyMt1ReviewMeeting = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    status: "ok",
    owner: "consultation",
    data: {
      id: "mtg-2c016da5651a0dc4",
      meeting_id: "mtg-2c016da5651a0dc4",
      meeting_type: "MT-1",
      topic: "Weekly pool evolution review for 澄川",
      status: "closed",
      outcome: "REVIEW",
      chair_persona_id: "persona-2448c7053e33ea48da47",
      chair_persona_display_name: "澄川",
      chair_persona_name_missing: false,
      participants: [
        {
          persona_id: "persona-2448c7053e33ea48da47",
          persona_display_name: "澄川",
          role: "chair",
          origin: "institutional",
        },
        {
          persona_id: "persona-risk-officer",
          persona_display_name: "風控官",
          role: "risk",
          origin: "institutional",
        },
      ],
      case_file_items: [
        {
          item_id: "facts:pool:persona-2448c7053e33ea48da47:v1",
          kind: "pool_health",
          relevance_scope: "committee",
          source_owner: "evaluation",
          excerpt: "Shared pool momentum member 2317 allocation & turnover summary",
        },
      ],
      rounds: [
        {
          round: 1,
          positions: [
            {
              label: "participant:chair:momentum",
              stance: "request_more_research",
              rationale: "Need more chip-flow evidence before changing pool weights.",
              citations: ["facts:pool:persona-2448c7053e33ea48da47:v1"],
            },
            {
              label: "participant:risk:guardian",
              stance: "request_more_research",
              rationale: "Hold pool composition until next week's regime evidence is complete.",
              citations: ["facts:pool:persona-2448c7053e33ea48da47:v1"],
            },
          ],
        },
        {
          round: 2,
          positions: [
            {
              label: "participant:chair:momentum",
              stance: "request_more_research",
              rationale: "Second round confirms no reweight proposal is warranted today.",
              citations: ["facts:pool:persona-2448c7053e33ea48da47:v1"],
            },
            {
              label: "participant:risk:guardian",
              stance: "request_more_research",
              rationale: "Agree to close without proposal and revisit after fresh research.",
              citations: ["facts:pool:persona-2448c7053e33ea48da47:v1"],
            },
          ],
        },
      ],
      anonymised_labels_revealed: true,
      synthesis: {
        proposals: [],
        outcome: "REVIEW",
        unreadable_reason: null,
        summary: "Synthesis empty or unreadable; recorded as REVIEW with no proposal.",
      },
      proposals: [],
      writebacks: [],
      operator_review: null,
      created_at: "2026-11-20T17:38:10Z",
      closed_at: "2026-11-20T17:40:52Z",
      ...overrides,
    },
  });

  it("navigates from MeetingsCenterPage history to the legacy MT-1 REVIEW meeting, explains the missing legacy reason alongside the 2-round transcript and case-file citations in zh-TW and en-US, and makes no automatic writes on load", async () => {
    on("GET", "/bff/management/meetings", {
      status: "ok",
      owner: "consultation",
      data: {
        items: [
          {
            id: "mtg-2c016da5651a0dc4",
            meeting_id: "mtg-2c016da5651a0dc4",
            meeting_type: "MT-1",
            topic: "Weekly pool evolution review for 澄川",
            status: "closed",
            outcome: "REVIEW",
            chair_persona_id: "persona-2448c7053e33ea48da47",
            chair_persona_display_name: "澄川",
            participants: [
              {
                persona_id: "persona-2448c7053e33ea48da47",
                persona_display_name: "澄川",
                role: "chair",
              },
            ],
            round: 2,
            closed_at: "2026-11-20T17:40:52Z",
            href: "/management/meetings/mtg-2c016da5651a0dc4",
          },
        ],
      },
    });
    on("GET", "/bff/management/meetings/proposals", { status: "ok", owner: "consultation", data: { items: [] } });
    on("GET", "/bff/management/meetings/catalogue", recordedCatalogueResponse);
    on("GET", "/bff/management/meetings/mtg-2c016da5651a0dc4", makeLegacyMt1ReviewMeeting());

    await i18n.changeLanguage("zh-TW");
    const { unmount } = render(
      <MemoryRouter initialEntries={["/management/meetings?tab=history"]}>
        <Routes>
          <Route path="/management/meetings" element={<MeetingsCenterPage />} />
          <Route path="/management/meetings/:id" element={<MeetingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const historyLink = await screen.findByTestId("meeting-link-mtg-2c016da5651a0dc4");
    fireEvent.click(historyLink);

    const reviewCard = await screen.findByTestId("meeting-detail-review-disposition");
    expect(reviewCard).toHaveTextContent("會議綜合結論人工審核與處置");
    expect(screen.getByTestId("meeting-review-blocking-reason")).toHaveTextContent(
      "會議綜合結論為待人工審查（REVIEW，零提案），需操作員審核處置",
    );
    expect(screen.getByTestId("meeting-review-cause")).toHaveTextContent(
      "未記錄詳細舊版原因（舊紀錄未保存具體原因代碼）",
    );
    expect(screen.getByTestId("meeting-review-cause-explanation")).toHaveTextContent(
      "此筆舊版會議紀錄未保存細部機器原因代碼（cause: unknown）",
    );
    expect(screen.getByTestId("meeting-review-transcript-summary")).toHaveTextContent(
      "已記錄 2 輪討論（共 4 則發言立場）、1 筆共享事實卷宗、0 筆提案",
    );
    expect(screen.getByTestId("meeting-review-transcript-summary")).toHaveTextContent(
      "Need more chip-flow evidence before changing pool weights.",
    );
    expect(screen.getByTestId("meeting-review-evidence-list")).toHaveTextContent(
      "facts:pool:persona-2448c7053e33ea48da47:v1",
    );
    expect(screen.getByTestId("meeting-review-consequence")).toHaveTextContent(
      "closed_no_proposal",
    );
    expect(screen.getByTestId("meeting-review-convene-followup-link")).toHaveAttribute(
      "href",
      "/management/meetings?tab=upcoming&type=MT-1&persona_id=persona-2448c7053e33ea48da47&source_meeting_id=mtg-2c016da5651a0dc4",
    );
    // Zero automatic writes on load
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    unmount();

    await i18n.changeLanguage("en-US");
    renderDetail("/management/meetings/mtg-2c016da5651a0dc4");
    expect(await screen.findByTestId("meeting-review-blocking-reason")).toHaveTextContent(
      "Meeting synthesis ended in REVIEW with no proposal and requires operator review disposition",
    );
    expect(screen.getByTestId("meeting-review-cause")).toHaveTextContent(
      "No detailed legacy reason recorded (specific cause was not stored on this legacy record)",
    );
    expect(screen.getByTestId("meeting-review-consequence")).toHaveTextContent(
      "Submitting records an operator review with disposition closed_no_proposal via the meeting review API",
    );
  });

  it("renders fresh specific cause, handles write failure truthfully, saves review with no proposal, prevents accidental resubmits, persists across refresh, and keeps follow-up convene separate", async () => {
    await i18n.changeLanguage("en-US");
    let currentMeeting = makeLegacyMt1ReviewMeeting({
      unreadable_reason: "model_output_missing",
      synthesis_unreadable_reason: "model_output_missing",
      synthesis: {
        proposals: [],
        outcome: "REVIEW",
        unreadable_reason: "model_output_missing",
        summary: "Synthesis empty or unreadable; recorded as REVIEW with no proposal.",
      },
    });
    let shouldFailReview = true;

    on("GET", "/bff/management/meetings/mtg-2c016da5651a0dc4", () => json(currentMeeting));
    on("POST", "/bff/management/meetings/mtg-2c016da5651a0dc4/review", (req) => {
      if (shouldFailReview) {
        return {
          kind: "error" as const,
          error: makeBffError({
            code: "BACKEND_UNAVAILABLE",
            message: "Consultation owner rejected review request: consultation_owner_unavailable",
            cause: "consultation_owner_unavailable",
          }),
        };
      }
      const body = req.body as { note: string };
      const reviewedData = {
        ...(currentMeeting.data as Record<string, unknown>),
        operator_review: {
          status: "reviewed",
          disposition: "closed_no_proposal",
          note: body.note,
          reviewed_by: "op-reviewer-1",
          reviewed_at: "2026-11-21T14:40:00Z",
          cause: "model_output_missing",
        },
      };
      currentMeeting = {
        ...currentMeeting,
        data: reviewedData,
      };
      return json(currentMeeting);
    });
    on("POST", "/bff/management/meetings", {
      status: "ok",
      meeting_id: "mtg-followup-777",
      data: {
        meeting_id: "mtg-followup-777",
        status: "convened",
        meeting_type: "MT-1",
      },
    });

    const { unmount } = renderDetail("/management/meetings/mtg-2c016da5651a0dc4");

    // 1. Fresh specific cause rendered
    expect(await screen.findByTestId("meeting-review-cause")).toHaveTextContent(
      "Model did not return a parseable synthesis output",
    );
    expect(screen.getByTestId("meeting-review-explanation")).toHaveTextContent(
      "model_output_missing",
    );

    // 2. Separate follow-up convene button works only when explicitly clicked and does not close review
    fireEvent.click(screen.getByTestId("meeting-review-convene-followup-button"));
    expect(await screen.findByTestId("meeting-review-followup-receipt")).toHaveTextContent(
      "mtg-followup-777",
    );
    const convenePost = calls.find(
      (c) => c.method === "POST" && c.path === "/bff/management/meetings",
    );
    expect(convenePost).toBeDefined();
    expect(convenePost!.body).toMatchObject({
      meeting_type: "MT-1",
      participants: ["persona-2448c7053e33ea48da47", "persona-risk-officer"],
      evidence_refs: ["facts:pool:persona-2448c7053e33ea48da47:v1"],
    });
    expect(screen.getByTestId("meeting-review-form")).toBeInTheDocument();

    // 2b. Supplementary-plane CJK/emoji Unicode code-point boundary: 2001 rejected before network, 2000 accepted
    const supplementary2001 = "𠮷".repeat(1001) + "🧪".repeat(1000);
    fireEvent.change(screen.getByTestId("meeting-review-note-input"), {
      target: { value: supplementary2001 },
    });
    expect(screen.getByTestId("meeting-review-submit")).toBeDisabled();
    fireEvent.submit(screen.getByTestId("meeting-review-form"));
    expect(await screen.findByTestId("meeting-review-error")).toHaveTextContent(
      "review_note_too_long",
    );
    expect(
      calls.filter(
        (c) => c.method === "POST" && c.path === "/bff/management/meetings/mtg-2c016da5651a0dc4/review",
      ),
    ).toHaveLength(0);

    // 3. First review submission with 2000 supplementary-plane CJK/emoji characters (4000 UTF-16 units) reaches network and reports failure truthfully
    const noteText = "𠮷".repeat(1000) + "🧪".repeat(1000);
    fireEvent.change(screen.getByTestId("meeting-review-note-input"), {
      target: { value: noteText },
    });
    expect(screen.getByTestId("meeting-review-submit")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("meeting-review-submit"));

    const errBanner = await screen.findByTestId("meeting-review-error");
    expect(errBanner).toHaveTextContent("Consultation owner service is unavailable");
    expect(errBanner).toHaveTextContent("consultation_owner_unavailable");
    expect(screen.getByTestId("meeting-review-note-input")).toHaveValue(noteText);

    // 4. Retry succeeds; form disappears (preventing accidental resubmits), recorded disposition shown, REVIEW outcome & 0 proposals intact
    shouldFailReview = false;
    fireEvent.click(screen.getByTestId("meeting-review-submit"));

    const recorded = await screen.findByTestId("meeting-review-recorded");
    expect(screen.getByTestId("meeting-review-status-badge")).toHaveTextContent(
      "Reviewed · Closed with No Proposal",
    );
    expect(recorded).toHaveTextContent("Reviewed and closed with no proposal");
    expect(recorded).toHaveTextContent("closed_no_proposal");
    expect(screen.getByTestId("meeting-review-recorded-by")).toHaveTextContent("op-reviewer-1");
    expect(screen.getByTestId("meeting-review-recorded-at")).toHaveTextContent(
      "2026-11-21T14:40:00Z",
    );
    expect(screen.getByTestId("meeting-review-recorded-note")).toHaveTextContent(noteText);
    expect(screen.queryByTestId("meeting-review-submit")).not.toBeInTheDocument();
    expect(screen.getByTestId("meeting-detail-synthesis")).toHaveTextContent("REVIEW");
    expect(screen.getByTestId("meeting-detail-proposals")).toHaveTextContent(
      "No proposals issued in this meeting.",
    );

    const reviewPosts = calls.filter(
      (c) => c.method === "POST" && c.path === "/bff/management/meetings/mtg-2c016da5651a0dc4/review",
    );
    expect(reviewPosts).toHaveLength(2);
    expect(reviewPosts[0].headers["Idempotency-Key"]).toBeTruthy();
    // Retry with identical note reuses the same Idempotency-Key
    expect(reviewPosts[1].headers["Idempotency-Key"]).toBe(
      reviewPosts[0].headers["Idempotency-Key"],
    );

    // 5. Re-entry / refetch across unmount & remount shows persisted note, reviewer, and time
    unmount();
    renderDetail("/management/meetings/mtg-2c016da5651a0dc4");
    expect(await screen.findByTestId("meeting-review-recorded-note")).toHaveTextContent(noteText);
    expect(screen.getByTestId("meeting-review-recorded-by")).toHaveTextContent("op-reviewer-1");
    expect(screen.getByTestId("meeting-review-recorded-at")).toHaveTextContent(
      "2026-11-21T14:40:00Z",
    );
    expect(screen.queryByTestId("meeting-review-form")).not.toBeInTheDocument();
  });

  it("allows a read-only user to inspect the meeting review explanation, transcript, case-file facts, and evidence without write controls", async () => {
    access.value = {
      loading: false,
      interactionAllowed: false,
      interactionDisabledReason: "Read-only viewer role",
      writeAllowed: false,
      writeDisabledReason: "Read-only viewer role",
    };
    on(
      "GET",
      "/bff/management/meetings/mtg-2c016da5651a0dc4",
      makeLegacyMt1ReviewMeeting({
        anonymised_labels_revealed: false,
        case_file_items: [],
        rounds: [],
      }),
    );

    renderDetail("/management/meetings/mtg-2c016da5651a0dc4");

    expect(await screen.findByTestId("meeting-detail-review-disposition")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-review-read-only")).toHaveTextContent(/Read-only view|唯讀檢視模式/);
    expect(screen.getByTestId("meeting-review-evidence-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("meeting-review-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("meeting-review-submit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("meeting-review-convene-followup-button")).not.toBeInTheDocument();
  });
});
