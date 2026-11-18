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
