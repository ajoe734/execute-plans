import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { setMockResolver } from "./client";
import { makeBffError } from "./errors";
import { liveStatus } from "./liveStatus";
import {
  conveneMeeting,
  getMeetingCatalogue,
  getMeetingDetail,
  getMeetingProposals,
  getMeetings,
  paths,
  stripPrivateMemory,
} from "./index";
import {
  buildFollowUpConveneInput,
  formatMeetingRosterRule,
  getMeetingActionTicket,
  mgmtMeetingReviewPath,
  normalizeMeetingAction,
  reviewMeeting,
  submitMeetingActionResponse,
} from "./meetings";
import { onV5Event } from "./sse/bridge";

describe("BFF v1 meetings client (FE-MANAGEMENT-MEETINGS-20261115)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    liveStatus._reset({ mode: "mock", effective: "mock", baseUrl: "" });
    setMockResolver(undefined);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    setMockResolver(undefined);
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it.each([
    [{ owner_kind: "persona", owner_id: "persona-alpha", owner_display_name: "澄川" }, "澄川", "persona"],
    [{ meeting_action: { owner_kind: "human", owner_id: "operator", owner_display_name: "Operator" } }, "Operator", "human"],
    [{ owner_kind: "human", owner_id: "operator", owner: "research" }, "operator", "human"],
    [{ assignee: { kind: "human", display_name: "Alice" } }, "Alice", "human"],
    [{ assignee: "Alice", assignee_kind: "human" }, "Alice", "human"],
    [{ meeting_action: { assignee: "Alice", assignee_kind: "human" } }, "Alice", "human"],
  ])("normalizes canonical and legacy accountable owners: %j", (fields, label, kind) => {
    expect(normalizeMeetingAction({ ticket_id: "tkt-w47-1", ...fields })).toMatchObject({
      owner_label: label, owner_kind: kind,
    });
  });

  it("builds canonical management meetings paths", () => {
    expect(paths.mgmtMeetings()).toBe("/bff/management/meetings");
    expect(paths.mgmtMeetings({ status: "open", type: "MT-1", personaId: "persona-alpha", limit: 25 })).toBe(
      "/bff/management/meetings?status=open&type=MT-1&persona_id=persona-alpha&limit=25",
    );
    expect(paths.mgmtMeetingDetail("mtg-001")).toBe("/bff/management/meetings/mtg-001");
    expect(paths.mgmtMeetingProposals({ personaId: "persona-alpha", meetingId: "mtg-001" })).toBe(
      "/bff/management/meetings/proposals?persona_id=persona-alpha&meeting_id=mtg-001",
    );
    expect(paths.mgmtMeetingCatalogue({ personaId: "persona-alpha" })).toBe(
      "/bff/management/meetings/catalogue?persona_id=persona-alpha",
    );
    expect(paths.mgmtMeetingConvene()).toBe("/bff/management/meetings");
  });

  it("reads meetings list, proposals, catalogue, and detail while stripping private memory", async () => {
    const seenQueries: Record<string, Record<string, string>> = {};
    setMockResolver((method, path) => {
      if (method === "GET" && path === "/bff/management/meetings") {
        return (req) => {
          seenQueries.list = req.query;
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "consultation",
              data: {
                items: [
                  {
                    meeting_id: "mtg-001",
                    meeting_type: "MT-1",
                    topic: "Weekly pool evolution review",
                    status: "open",
                    outcome: "IN_PROGRESS",
                    chair_persona_id: "persona-alpha",
                    participants: [{ persona_id: "persona-alpha", role: "chair", origin: "institutional" }],
                    private_memory: "SECRET_LIST_LEAK",
                  },
                ],
                summary: { total_items: 1, open_count: 1, closed_count: 0, review_count: 0 },
              },
            },
          };
        };
      }
      if (method === "GET" && path === "/bff/management/meetings/proposals") {
        return (req) => {
          seenQueries.proposals = req.query;
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "consultation",
              data: {
                items: [
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
              },
            },
          };
        };
      }
      if (method === "GET" && path === "/bff/management/meetings/catalogue") {
        return (req) => {
          seenQueries.catalogue = req.query;
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "consultation",
              data: {
                types: [
                  {
                    meeting_type: "MT-1",
                    enabled: true,
                    cadence: "weekly",
                    roster_rule: {
                      chair: "owning_persona",
                      participants: [
                        "owning_persona",
                        "peer_different_style",
                        "persona-risk-officer",
                      ],
                      min_trading_personas: 1,
                      requires_risk: true,
                      requires_red_team: false,
                      allow_agora_advisor: true,
                      allow_owning_user_servant: true,
                      allow_subject_trader_servant: false,
                      description:
                        "owner + 1 peer trading persona of a different style (rotating) + risk persona",
                    },
                    budget: { max_participants: 5, max_rounds: 2, weekly_limit: 3 },
                  },
                  {
                    meeting_type: "MT-4",
                    enabled: true,
                    cadence: "weekly_and_event",
                    roster_rule: {
                      chair: "closest_institutional_persona",
                      participants: [
                        "subject_persona_or_trader_servant",
                        "counter_party_persona",
                        "peers_same_strategy_family",
                        "persona-risk-officer",
                        "persona-red-team",
                      ],
                      min_trading_personas: 1,
                      requires_risk: true,
                      requires_red_team: true,
                      red_team_assigned_case: "luck_or_small_sample_or_confounder",
                      allow_agora_advisor: true,
                      allow_owning_user_servant: true,
                      allow_subject_trader_servant: true,
                      description:
                        "subject (persona or trader's own servant) + party that decided the other way + peers of same strategy family + risk persona + red-team persona",
                    },
                    budget: { max_participants: 5, max_rounds: 2, weekly_limit: 3 },
                  },
                ],
                schedule: [
                  {
                    persona_id: "persona-alpha",
                    meeting_type: "MT-1",
                    last_run_at: "2026-11-09T10:00:00Z",
                    next_due_at: "2026-11-16T10:00:00Z",
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
            },
          };
        };
      }
      if (method === "GET" && path === "/bff/management/meetings/mtg-001") {
        return () => ({
          kind: "json",
          status: 200,
          body: {
            status: "ok",
            owner: "consultation",
            data: {
              meeting_id: "mtg-001",
              meeting_type: "MT-4",
              topic: "Performance attribution review",
              status: "closed",
              outcome: "PROPOSALS_ISSUED",
              chair_persona_id: "persona-alpha",
              participants: [{ persona_id: "persona-alpha", role: "chair", origin: "institutional" }],
              agenda: ["Review attribution attr-001"],
              case_file_items: [
                { item_id: "cf-shared-1", kind: "pool_health", relevance_scope: "committee", excerpt: "Sharpe 1.62" },
                { item_id: "cf-priv-1", kind: "memory", relevance_scope: "persona_private", excerpt: "PRIVATE_EXCERPT_LEAK" },
              ],
              pre_read: {
                interpretations: [
                  { persona_id: "persona-alpha", relevance_scope: "committee", text: "Shared interpretation", private_memory: "PRIVATE_PRE_READ_LEAK" },
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
                      stance: "support",
                      confidence: 0.85,
                      citations: ["cf-shared-1"],
                      private_memory: "PRIVATE_ROUND_LEAK",
                    },
                  ],
                },
              ],
              label_reveal: { "participant:chair:momentum": "persona-alpha" },
              anonymised_labels_revealed: true,
              synthesis: {
                proposals: [
                  {
                    proposal_id: "prop-001",
                    meeting_id: "mtg-001",
                    kind: "research_demand",
                    sponsor_persona_id: "persona-alpha",
                    downstream: { target: "research_demand", id: "rd-101", status: "pending", href: "/management/experiments" },
                  },
                ],
                tally: { support: 0.85, dissent: 0.2, binding: false },
                dissent_memo_id: "memo-dissent-001",
                outcome: "PROPOSALS_ISSUED",
              },
              writebacks: [
                {
                  persona_id: "persona-alpha",
                  entry_id: "pmem-wb-001",
                  content: "PRIVATE_WRITEBACK_CONTENT_LEAK",
                },
              ],
              usage: { participants: 3, rounds: 2, calls: 8 },
            },
          },
        });
      }
      return undefined;
    });

    const listRes = await getMeetings({ status: "open", type: "MT-1", personaId: "persona-alpha" });
    expect(listRes.state).toBe("ok");
    if (listRes.state === "ok") {
      expect(listRes.data.items).toHaveLength(1);
      expect(listRes.data.items[0].meeting_id).toBe("mtg-001");
      expect(JSON.stringify(listRes.data)).not.toContain("SECRET_LIST_LEAK");
    }
    expect(seenQueries.list).toEqual({ status: "open", type: "MT-1", persona_id: "persona-alpha" });

    const propRes = await getMeetingProposals({ personaId: "persona-alpha" });
    expect(propRes.state).toBe("ok");
    if (propRes.state === "ok") {
      expect(propRes.data.items[0].downstream.href).toBe("/management/experiments");
    }

    const catRes = await getMeetingCatalogue({ personaId: "persona-alpha" });
    expect(catRes.state).toBe("ok");
    if (catRes.state === "ok") {
      expect(catRes.data.types[0].meeting_type).toBe("MT-1");
      expect(catRes.data.types[0].roster_rule).toEqual({
        chair: "owning_persona",
        participants: ["owning_persona", "peer_different_style", "persona-risk-officer"],
        min_trading_personas: 1,
        requires_risk: true,
        requires_red_team: false,
        allow_agora_advisor: true,
        allow_owning_user_servant: true,
        allow_subject_trader_servant: false,
        description:
          "owner + 1 peer trading persona of a different style (rotating) + risk persona",
      });
      expect(catRes.data.types[1].meeting_type).toBe("MT-4");
      expect(catRes.data.types[1].roster_rule).toEqual({
        chair: "closest_institutional_persona",
        participants: [
          "subject_persona_or_trader_servant",
          "counter_party_persona",
          "peers_same_strategy_family",
          "persona-risk-officer",
          "persona-red-team",
        ],
        min_trading_personas: 1,
        requires_risk: true,
        requires_red_team: true,
        red_team_assigned_case: "luck_or_small_sample_or_confounder",
        allow_agora_advisor: true,
        allow_owning_user_servant: true,
        allow_subject_trader_servant: true,
        description:
          "subject (persona or trader's own servant) + party that decided the other way + peers of same strategy family + risk persona + red-team persona",
      });
      expect(catRes.data.refusals[0].reason).toBe("insufficient_participants");
    }

    const detailRes = await getMeetingDetail("mtg-001");
    expect(detailRes.state).toBe("ok");
    if (detailRes.state === "ok") {
      const serialized = JSON.stringify(detailRes.data);
      expect(serialized).not.toContain("PRIVATE_EXCERPT_LEAK");
      expect(serialized).not.toContain("PRIVATE_PRE_READ_LEAK");
      expect(serialized).not.toContain("PRIVATE_ROUND_LEAK");
      expect(serialized).not.toContain("PRIVATE_WRITEBACK_CONTENT_LEAK");
      expect(detailRes.data.case_file_items.map((i) => i.item_id)).toEqual(["cf-shared-1"]);
      expect(detailRes.data.writebacks).toEqual([{ persona_id: "persona-alpha", entry_id: "pmem-wb-001" }]);
      expect(detailRes.data.label_reveal).toEqual({ "participant:chair:momentum": "persona-alpha" });
    }
  });

  it("maps 404 responses on getMeetingDetail to honest not_found state and unavailable envelopes to unavailable state", async () => {
    setMockResolver((method, path) => {
      if (method === "GET" && path === "/bff/management/meetings/mtg-404") {
        return () => ({
          kind: "error",
          error: makeBffError({ code: "RESOURCE_NOT_FOUND", message: "Meeting not found", cause: "meeting_not_found" }),
        });
      }
      if (method === "GET" && path === "/bff/management/meetings") {
        return () => ({
          kind: "json",
          status: 200,
          body: {
            status: "unavailable",
            owner: "consultation",
            reason: "consultation_owner_unavailable",
            data: { status: "unavailable", reason: "consultation_owner_unavailable", items: [] },
          },
        });
      }
      return undefined;
    });

    const missing = await getMeetingDetail("mtg-404");
    expect(missing).toEqual({ state: "not_found", reason: "meeting_not_found" });

    const unavail = await getMeetings();
    expect(unavail).toEqual({
      state: "unavailable",
      reason: "consultation_owner_unavailable",
      owner: "consultation",
    });
  });

  it("write-gates conveneMeeting and sends an Idempotency-Key header when permitted", async () => {
    // 1. Write gate closed when real writes are disabled
    vi.stubEnv("VITE_BFF_REAL_WRITES", "false");
    let postCalled = false;
    setMockResolver((method, path) => {
      if (method === "POST" && path === "/bff/management/meetings") {
        return () => {
          postCalled = true;
          return { kind: "json", status: 202, body: { meeting_id: "mtg-conv-001", status: "convened" } };
        };
      }
      return undefined;
    });

    const blocked = await conveneMeeting({ meeting_type: "MT-3", topic: "Blocked convene" });
    expect(blocked).toEqual({
      state: "unavailable",
      reason: "live_write_gate_closed",
      owner: "consultation",
    });
    expect(postCalled).toBe(false);

    // 2. Write gate open in mock resolver mode (or with authenticated bearer in liveWriteGated)
    vi.unstubAllEnvs();
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: unknown = null;
    setMockResolver((method, path) => {
      if (method === "POST" && path === "/bff/management/meetings") {
        return (req) => {
          capturedHeaders = req.headers;
          capturedBody = req.body;
          return {
            kind: "json",
            status: 202,
            body: {
              status: "ok",
              meeting_id: "mtg-conv-001",
              data: {
                meeting_id: "mtg-conv-001",
                status: "convened",
                meeting_type: "MT-3",
                topic: "Evaluate volatility breakout candidates",
              },
            },
          };
        };
      }
      return undefined;
    });

    const ok = await conveneMeeting(
      {
        meeting_type: "MT-3",
        topic: "Evaluate volatility breakout candidates",
        participants: ["persona-alpha", "persona-red-team"],
      },
      "idem-convene-test-001",
    );
    expect(ok.state).toBe("ok");
    if (ok.state === "ok") {
      expect(ok.data.meeting_id).toBe("mtg-conv-001");
      expect(ok.data.status).toBe("convened");
    }
    expect(capturedHeaders["Idempotency-Key"]).toBe("idem-convene-test-001");
    expect(capturedBody).toEqual({
      meeting_type: "MT-3",
      topic: "Evaluate volatility breakout candidates",
      participants: ["persona-alpha", "persona-red-team"],
    });
  });

  it("stripPrivateMemory removes private memory items and fields recursively", () => {
    const cleaned = stripPrivateMemory({
      public_field: "keep",
      private_memory: "drop",
      items: [
        { id: "1", relevance_scope: "committee", text: "shared" },
        { id: "2", relevance_scope: "persona_private", text: "secret" },
      ],
      writebacks: [{ persona_id: "p1", entry_id: "wb-1", content: "secret writeback" }],
    });
    expect(cleaned).toEqual({
      public_field: "keep",
      items: [{ id: "1", relevance_scope: "committee", text: "shared" }],
      writebacks: [{ persona_id: "p1", entry_id: "wb-1" }],
    });
  });

  it("stripPrivateMemory preserves persona_display_name and persona_name_missing on writebacks while stripping private content", () => {
    const cleaned = stripPrivateMemory({
      writebacks: [
        {
          persona_id: "persona-alpha",
          persona_display_name: "Alpha Macro Strategist",
          persona_name_missing: false,
          entry_id: "wb-101",
          status: "committed",
          written_at: "2026-11-20T09:00:00Z",
          content: "SECRET_PRIVATE_MEMORY_TEXT",
        },
      ],
    });
    expect(cleaned).toEqual({
      writebacks: [
        {
          persona_id: "persona-alpha",
          persona_display_name: "Alpha Macro Strategist",
          persona_name_missing: false,
          entry_id: "wb-101",
          status: "committed",
          written_at: "2026-11-20T09:00:00Z",
        },
      ],
    });
  });

  it("stripPrivateMemory recursively sanitizes retained citation and evidence_ref objects even when withheldIds is non-empty", () => {
    const cleaned = stripPrivateMemory({
      case_file_items: [
        { item_id: "cf-priv-1", relevance_scope: "persona_private", excerpt: "SECRET_CASE_FILE" },
        { item_id: "cf-pub-1", relevance_scope: "committee", excerpt: "Public case file" },
      ],
      citations: [
        "cf-priv-1",
        "cf-pub-1",
        {
          id: "cit-pub-obj",
          relevance_scope: "committee",
          label: "Public citation object",
          private_memory_text: "SECRET_CITATION_DIRECT_PRIVATE_FIELD",
          metadata: {
            public_note: "keep-note",
            private_text: "SECRET_CITATION_NESTED_PRIVATE_FIELD",
          },
        },
        {
          id: "cit-unlisted-priv-obj",
          relevance_scope: "persona_private",
          label: "SECRET_PRIVATE_CITATION_ITEM",
        },
      ],
      evidence_refs: [
        "cf-priv-1",
        {
          ref_id: "ev-pub-obj",
          label: "Public evidence object",
          private_content: "SECRET_EVIDENCE_DIRECT_PRIVATE_FIELD",
          metadata: {
            public_tag: "keep-tag",
            private_interpretation: "SECRET_EVIDENCE_NESTED_PRIVATE_FIELD",
          },
        },
      ],
    });

    const serialized = JSON.stringify(cleaned);
    expect(serialized).not.toContain("SECRET_CASE_FILE");
    expect(serialized).not.toContain("SECRET_CITATION_DIRECT_PRIVATE_FIELD");
    expect(serialized).not.toContain("SECRET_CITATION_NESTED_PRIVATE_FIELD");
    expect(serialized).not.toContain("SECRET_PRIVATE_CITATION_ITEM");
    expect(serialized).not.toContain("SECRET_EVIDENCE_DIRECT_PRIVATE_FIELD");
    expect(serialized).not.toContain("SECRET_EVIDENCE_NESTED_PRIVATE_FIELD");

    expect(cleaned).toEqual({
      case_file_items: [{ item_id: "cf-pub-1", relevance_scope: "committee", excerpt: "Public case file" }],
      citations: [
        "cf-pub-1",
        {
          id: "cit-pub-obj",
          relevance_scope: "committee",
          label: "Public citation object",
          metadata: {
            public_note: "keep-note",
          },
        },
      ],
      evidence_refs: [
        {
          ref_id: "ev-pub-obj",
          label: "Public evidence object",
          metadata: {
            public_tag: "keep-tag",
          },
        },
      ],
    });
  });

  it("normalizes legacy REVIEW detail (null unreadable_reason -> unknown) and specific causes while stripping private item IDs from evidence_refs", async () => {
    setMockResolver((method, path) => {
      if (method === "GET" && path === "/bff/management/meetings/mtg-2c016da5651a0dc4") {
        return () => ({
          kind: "json",
          status: 200,
          body: {
            status: "ok",
            owner: "consultation",
            data: {
              meeting_id: "mtg-2c016da5651a0dc4",
              meeting_type: "MT-1",
              topic: "Weekly pool evolution review",
              status: "closed",
              outcome: "REVIEW",
              chair_persona_id: "persona-2448c7053e33ea48da47",
              chair_persona_display_name: "澄川",
              participants: [
                {
                  persona_id: "persona-2448c7053e33ea48da47",
                  persona_display_name: "澄川",
                  role: "chair",
                  origin: "institutional",
                },
              ],
              case_file_items: [
                {
                  item_id: "facts:pool:persona-2448c7053e33ea48da47:v1",
                  kind: "pool_health",
                  relevance_scope: "committee",
                  excerpt: "Pool Sharpe 1.18",
                },
                {
                  item_id: "secret-private-item",
                  kind: "memory",
                  relevance_scope: "persona_private",
                  excerpt: "PRIVATE_EXCERPT",
                },
              ],
              rounds: [
                {
                  round: 1,
                  positions: [
                    {
                      label: "participant:1",
                      stance: "request_more_research",
                      citations: ["facts:pool:persona-2448c7053e33ea48da47:v1", "secret-private-item"],
                    },
                    {
                      label: "participant:priv",
                      is_private: true,
                      citations: ["secret-private-pos-ref"],
                    },
                  ],
                },
              ],
              evidence_refs: [
                "facts:pool:persona-2448c7053e33ea48da47:v1",
                "secret-private-item",
                "secret-private-pos-ref",
              ],
              synthesis: {
                outcome: "REVIEW",
                proposals: [],
                unreadable_reason: null,
                summary: "Synthesis empty or unreadable; recorded as REVIEW with no proposal.",
              },
              proposals: [],
              operator_review: null,
            },
          },
        });
      }
      return undefined;
    });

    const res = await getMeetingDetail("mtg-2c016da5651a0dc4");
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.data.unreadable_reason).toBe("unknown");
      expect(res.data.synthesis_unreadable_reason).toBe("unknown");
      expect(res.data.operator_review).toBeNull();
      expect(res.data.evidence_refs).toEqual(["facts:pool:persona-2448c7053e33ea48da47:v1"]);
      expect(res.data.rounds[0].positions).toHaveLength(1);
      expect(res.data.rounds[0].positions[0].citations).toEqual([
        "facts:pool:persona-2448c7053e33ea48da47:v1",
      ]);

      const followUp = buildFollowUpConveneInput(res.data);
      expect(followUp).toEqual({
        meeting_type: "MT-1",
        topic: "Weekly pool evolution review (follow-up research for mtg-2c016da5651a0dc4)",
        participants: ["persona-2448c7053e33ea48da47"],
        subject_ref: { source_meeting_id: "mtg-2c016da5651a0dc4" },
        evidence_refs: ["facts:pool:persona-2448c7053e33ea48da47:v1"],
      });
    }
  });

  it("write-gates reviewMeeting, validates 2000-character Unicode notes, emits inbox refresh events on save, and maps backend write errors truthfully", async () => {
    expect(mgmtMeetingReviewPath("mtg-2c016da5651a0dc4")).toBe(
      "/bff/management/meetings/mtg-2c016da5651a0dc4/review",
    );

    // 1. Validation before network call
    const emptyNote = await reviewMeeting("mtg-2c016da5651a0dc4", { note: "   " });
    expect(emptyNote).toEqual({
      state: "unavailable",
      reason: "review_note_required",
      owner: "consultation",
    });

    const overLimitNote = await reviewMeeting("mtg-2c016da5651a0dc4", {
      note: "審".repeat(2001),
    });
    expect(overLimitNote).toEqual({
      state: "unavailable",
      reason: "review_note_too_long",
      owner: "consultation",
    });

    const overLimitSupplementaryNote = await reviewMeeting("mtg-2c016da5651a0dc4", {
      note: "𠮷".repeat(1001) + "🧪".repeat(1000),
    });
    expect(overLimitSupplementaryNote).toEqual({
      state: "unavailable",
      reason: "review_note_too_long",
      owner: "consultation",
    });

    // 2. Write gate closed when real writes are disabled
    vi.stubEnv("VITE_BFF_REAL_WRITES", "false");
    const gated = await reviewMeeting("mtg-2c016da5651a0dc4", {
      note: "Participants requested more research; closing with no proposal.",
    });
    expect(gated).toEqual({
      state: "unavailable",
      reason: "live_write_gate_closed",
      owner: "consultation",
    });
    vi.unstubAllEnvs();

    // 3. Backend conflict error mapped truthfully
    setMockResolver((method, path) => {
      if (method === "POST" && path === "/bff/management/meetings/mtg-conflict/review") {
        return () => ({
          kind: "error",
          error: makeBffError({
            code: "STATE_CONFLICT",
            message: "Consultation owner rejected review request: meeting_already_reviewed",
          }),
        });
      }
      return undefined;
    });
    const conflictRes = await reviewMeeting("mtg-conflict", {
      note: "Attempt conflicting review.",
    });
    expect(conflictRes).toEqual({
      state: "unavailable",
      reason: "meeting_already_reviewed",
    });

    // 4. Successful 2000-character supplementary-plane CJK/emoji note (4000 UTF-16 code units, 2000 Unicode code points) review with Idempotency-Key & inbox V5 event
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: unknown = null;
    const v5Events: unknown[] = [];
    const off = onV5Event((ev) => v5Events.push(ev));
    const maxCjkNote = "𠮷".repeat(1000) + "🧪".repeat(1000);
    expect(Array.from(maxCjkNote).length).toBe(2000);
    expect(maxCjkNote.length).toBe(4000);

    setMockResolver((method, path) => {
      if (method === "POST" && path === "/bff/management/meetings/mtg-2c016da5651a0dc4/review") {
        return (req) => {
          capturedHeaders = req.headers;
          capturedBody = req.body;
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "consultation",
              replayed: false,
              data: {
                meeting_id: "mtg-2c016da5651a0dc4",
                meeting_type: "MT-1",
                status: "closed",
                outcome: "REVIEW",
                unreadable_reason: "unknown",
                synthesis_unreadable_reason: "unknown",
                operator_review: {
                  status: "reviewed",
                  disposition: "closed_no_proposal",
                  note: maxCjkNote,
                  reviewed_by: "op-lead",
                  reviewed_at: "2026-11-21T14:30:00Z",
                  cause: "unknown",
                },
                synthesis: {
                  outcome: "REVIEW",
                  proposals: [],
                  summary: "Synthesis empty or unreadable; recorded as REVIEW with no proposal.",
                },
                rounds: [{ round: 1, positions: [] }],
                proposals: [],
              },
            },
          };
        };
      }
      return undefined;
    });

    try {
      const ok = await reviewMeeting(
        "mtg-2c016da5651a0dc4",
        { note: maxCjkNote },
        "idem-review-2c016da5651a0dc4",
      );
      expect(ok.state).toBe("ok");
      if (ok.state === "ok") {
        expect(ok.data.outcome).toBe("REVIEW");
        expect(ok.data.proposals).toEqual([]);
        expect(ok.data.operator_review).toEqual({
          status: "reviewed",
          disposition: "closed_no_proposal",
          note: maxCjkNote,
          reviewed_by: "op-lead",
          reviewed_at: "2026-11-21T14:30:00Z",
          cause: "unknown",
          unreadable_reason: "unknown",
        });
      }
      expect(capturedHeaders["Idempotency-Key"]).toBe("idem-review-2c016da5651a0dc4");
      expect(capturedBody).toEqual({ note: maxCjkNote });
      expect(v5Events.length).toBeGreaterThan(0);
    } finally {
      off();
    }
  });

  it("invalidates and clears inactive inbox/detail queries in a provider-owned QueryClient when unmounted during reviewMeeting", async () => {
    const providerClient = new QueryClient();
    let pendingList = ["meeting_review:mtg-cache"];
    const inboxLoader = vi.fn(async () => pendingList);
    const gateLoader = vi.fn(async () => ({
      id: "meeting_review:mtg-cache",
      status: pendingList.length > 0 ? "pending" : "reviewed",
    }));

    function InboxProbe() {
      const inbox = useV5Live(inboxLoader, [], { cacheKey: "oversight.humanInbox" });
      const detail = useV5Live(gateLoader, ["meeting_review:mtg-cache"], {
        cacheKey: "oversight.humanGateDetail.meeting_review:mtg-cache",
      });
      return React.createElement(
        "div",
        null,
        React.createElement(
          "div",
          { "data-testid": "provider-inbox-items" },
          inbox.loading ? "loading" : JSON.stringify(inbox.data ?? []),
        ),
        React.createElement(
          "div",
          { "data-testid": "provider-gate-status" },
          detail.loading ? "loading" : (detail.data?.status ?? "none"),
        ),
      );
    }

    const firstRender = render(
      React.createElement(
        QueryClientProvider,
        { client: providerClient },
        React.createElement(InboxProbe),
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("provider-inbox-items")).toHaveTextContent(
        JSON.stringify(["meeting_review:mtg-cache"]),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("provider-gate-status")).toHaveTextContent("pending"),
    );
    expect(inboxLoader).toHaveBeenCalledTimes(1);
    expect(gateLoader).toHaveBeenCalledTimes(1);

    // Unmount inbox while review happens on the meeting route (no active V5 event listener on inbox)
    firstRender.unmount();

    setMockResolver((method, path) => {
      if (method === "POST" && path === "/bff/management/meetings/mtg-cache/review") {
        return () => {
          pendingList = [];
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "consultation",
              data: {
                meeting_id: "mtg-cache",
                meeting_type: "MT-1",
                status: "closed",
                outcome: "REVIEW",
                operator_review: {
                  status: "reviewed",
                  disposition: "closed_no_proposal",
                  note: "Closed with no proposal after review.",
                  reviewed_by: "op-lead",
                  reviewed_at: "2026-11-21T15:10:00Z",
                  cause: "unknown",
                },
                synthesis: { outcome: "REVIEW", proposals: [] },
                rounds: [],
                proposals: [],
              },
            },
          };
        };
      }
      return undefined;
    });

    const reviewRes = await reviewMeeting("mtg-cache", {
      note: "Closed with no proposal after review.",
    });
    expect(reviewRes.state).toBe("ok");

    // Remount under the same provider-owned QueryClient within the 60s staleTime window
    const secondRender = render(
      React.createElement(
        QueryClientProvider,
        { client: providerClient },
        React.createElement(InboxProbe),
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("provider-inbox-items")).toHaveTextContent("[]"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("provider-gate-status")).toHaveTextContent("reviewed"),
    );
    expect(inboxLoader).toHaveBeenCalledTimes(2);
    expect(gateLoader).toHaveBeenCalledTimes(2);

    secondRender.unmount();
    cleanup();
  });

  it("formats structured catalogue roster_rule objects with canonical MT-1/MT-4 values and honest absent-description fallback (FE-MEETING-ROSTER-CATALOGUE-20261121)", () => {
    const mt1Rule = {
      chair: "owning_persona",
      participants: ["owning_persona", "peer_different_style", "persona-risk-officer"],
      min_trading_personas: 1,
      requires_risk: true,
      requires_red_team: false,
      allow_agora_advisor: true,
      allow_owning_user_servant: true,
      allow_subject_trader_servant: false,
      description: "owner + 1 peer trading persona of a different style (rotating) + risk persona",
    };
    expect(formatMeetingRosterRule(mt1Rule)).toBe(
      "owner + 1 peer trading persona of a different style (rotating) + risk persona",
    );

    const mt4WithoutDescription = {
      chair: "closest_institutional_persona",
      participants: [
        "subject_persona_or_trader_servant",
        "counter_party_persona",
        "peers_same_strategy_family",
        "persona-risk-officer",
        "persona-red-team",
      ],
      min_trading_personas: 1,
      requires_risk: true,
      requires_red_team: true,
      red_team_assigned_case: "luck_or_small_sample_or_confounder",
      allow_agora_advisor: true,
      allow_owning_user_servant: true,
      allow_subject_trader_servant: true,
      description: "   ",
    };
    expect(formatMeetingRosterRule(mt4WithoutDescription)).toBe(
      "chair: closest_institutional_persona · participants: subject_persona_or_trader_servant + counter_party_persona + peers_same_strategy_family + persona-risk-officer + persona-red-team · min_trading_personas=1 · requires_risk · requires_red_team (luck_or_small_sample_or_confounder)",
    );

    expect(formatMeetingRosterRule({})).toBe("—");
    expect(formatMeetingRosterRule(null)).toBe("—");
    expect(formatMeetingRosterRule(undefined)).toBe("—");
  });

  it("normalizes prior_actions, adopted_actions, dispatch_pending receipts, live_owner_status, and participant_action_capabilities while surfacing action_read unavailable/denied truthfully (FE-MEETING-ACTION-FOLLOWTHROUGH-20261123)", async () => {
    let detailPayload: Record<string, unknown> = {
      meeting_id: "mtg-w48-001",
      meeting_type: "MT-1",
      topic: "Weekly pool evolution review W48",
      status: "closed",
      outcome: "ACTIONS_ADOPTED",
      decision_kind: "adopt_actions",
      chair_persona_id: "persona-alpha",
      anonymised_labels_revealed: false,
      label_reveal: {
        "#1": "persona-alpha",
        "#2": "persona-beta",
      },
      action_read: {
        status: "ok",
        owner: "research",
        reason: null,
        pages: 1,
      },
      prior_actions: [
        {
          ticket_id: "tkt-w47-1",
          title: "Backtest low-turnover chip filter",
          owner_kind: "persona",
          owner_id: "persona-alpha",
          owner_display_name: "澄川",
          deliverable: "experiment_spec",
          acceptance_criterion: "IC > 0.03 over 60d",
          due_meeting_type: "MT-1",
          status: "submitted",
          live_owner_status: "accepted",
          executed: true,
          evidence_refs: [
            { kind: "research_artifact", artifact_id: "artifact-exp-2330-v2", checksum: "sha256:abc" },
          ],
          evidence_notes: [
            {
              note_id: "note-w47-1",
              title: "Backtest summary",
              body: "60d out-of-sample IC reached 0.041.",
              source_refs: ["exp-2330-v2"],
            },
          ],
          revision: 3,
        },
      ],
      prior_action_reviews: [
        {
          ticket_id: "tkt-w47-1",
          decision: "accepted",
          reason: "Verified out-of-sample IC and turnover limits.",
          reviewer_id: "persona-alpha",
        },
      ],
      adopted_actions: [
        {
          ticket_id: "tkt-w48-human",
          title: "Confirm external data license scope",
          owner_kind: "human",
          owner_id: "operator",
          deliverable: "external_action",
          acceptance_criterion: "Attach vendor terms summary",
          status: "open",
          live_owner_status: "waiting_for_input",
          human_requirement: "Vendor contract terms require operator confirmation.",
          revision: 1,
        },
        {
          ticket_id: null,
          title: "Pending ticket dispatch after transient timeout",
          owner_kind: "persona",
          owner_id: "persona-beta",
          deliverable: "experiment_spec",
          acceptance_criterion: "Run stress test",
          status: "dispatch_pending",
          dispatch_error: "research_owner_timeout",
        },
      ],
      participant_action_capabilities: [
        {
          label: "#1",
          role: "chair",
          persona_id: "persona-alpha",
          persona_display_name: "SECRET_CHAIR_NAME",
          status: "allowed",
          reason: "eligible",
          can_receive_persona_action: true,
          allowed_deliverables: ["experiment_spec", "factor_Hypothesis", "risk_check_report"],
          denial_reasons: {},
        },
        {
          label: "#2",
          role: "advisor",
          persona_id: "advisor-1",
          persona_display_name: "SECRET_ADVISOR_NAME",
          status: "advisory_only",
          reason: "agora_advisor_cannot_own_persona_action",
          can_receive_persona_action: false,
          allowed_deliverables: [],
          denial_reasons: { experiment_spec: "advisory_participant_only" },
        },
      ],
    };

    setMockResolver((method, path) => {
      if (method === "GET" && path === "/bff/management/meetings/mtg-w48-001") {
        return () => ({
          kind: "json",
          status: 200,
          body: { status: "ok", owner: "consultation", data: detailPayload },
        });
      }
      return undefined;
    });

    detailPayload = { ...detailPayload, anonymised_labels_revealed: true };
    const revealed = await getMeetingDetail("mtg-w48-001");
    if (revealed.state !== "ok" || revealed.data.prior_actions?.state !== "ok") throw new Error("missing revealed fixture");
    expect(revealed.data.prior_actions.items[0].owner_label).toBe("澄川");
    detailPayload = { ...detailPayload, anonymised_labels_revealed: false };
    const okRes = await getMeetingDetail("mtg-w48-001");
    expect(okRes.state).toBe("ok");
    if (okRes.state === "ok") {
      expect(okRes.data.decision_kind).toBe("adopt_actions");
      expect(okRes.data.prior_actions?.state).toBe("ok");
      if (okRes.data.prior_actions?.state === "ok") {
        expect(okRes.data.prior_actions.items[0]).toMatchObject({ owner_label: "#1", owner_kind: "persona" });
      }
      expect(okRes.data.adopted_actions?.[0]).toMatchObject({ owner_label: "operator", owner_kind: "human" });
      if (okRes.data.prior_actions?.state === "ok") {
        const prior = okRes.data.prior_actions.items[0];
        expect(prior.ticket_id).toBe("tkt-w47-1");
        expect(prior.state).toBe("accepted");
        expect(prior.live_owner_status?.state).toBe("accepted");
        expect(prior.review_decision).toBe("accepted");
        expect(prior.review_reason).toBe("Verified out-of-sample IC and turnover limits.");
        expect(prior.evidence_items?.[0]).toMatchObject({
          id: "artifact-exp-2330-v2",
          kind: "research_artifact",
          href: "/management/artifacts/artifact-exp-2330-v2",
        });
        expect(prior.evidence_notes?.[0]?.body).toBe("60d out-of-sample IC reached 0.041.");
      }

      expect(okRes.data.adopted_actions).toHaveLength(2);
      if (okRes.data.adopted_actions) {
        const [humanAct, pendingAct] = okRes.data.adopted_actions;
        expect(humanAct.ticket_id).toBe("tkt-w48-human");
        expect(humanAct.state).toBe("open");
        expect(humanAct.live_owner_status?.state).toBe("waiting_for_input");
        expect(humanAct.human_requirement).toBe("Vendor contract terms require operator confirmation.");
        expect(pendingAct.state).toBe("dispatch_pending");
        expect(pendingAct.ticket_id).toBeNull();
        expect(pendingAct.ticket_href).toBeNull();
        expect(pendingAct.dispatch_error).toBe("research_owner_timeout");
      }

      expect(okRes.data.participant_capabilities).toHaveLength(2);
      expect(okRes.data.participant_capabilities?.[0]).toMatchObject({
        label: "#1",
        status: "allowed",
        can_receive_persona_action: true,
      });
      expect(okRes.data.participant_capabilities?.[1]).toMatchObject({
        label: "#2",
        status: "advisory_only",
        reason: "agora_advisor_cannot_own_persona_action",
        can_receive_persona_action: false,
      });
    }

    // Empty prior_actions array + action_read.status = "unavailable" must report unavailable, not fake zero
    detailPayload = {
      ...detailPayload,
      prior_actions: [],
      prior_action_reviews: [],
      action_read: {
        status: "unavailable",
        owner: "research",
        reason: "prior_action_owner_unavailable",
      },
    };
    const unavailPriorRes = await getMeetingDetail("mtg-w48-001");
    expect(unavailPriorRes.state).toBe("ok");
    if (unavailPriorRes.state === "ok") {
      expect(unavailPriorRes.data.prior_actions).toEqual({
        state: "unavailable",
        reason: "prior_action_owner_unavailable",
      });
    }

    // Empty prior_actions array + action_read.status = "denied" must report forbidden
    detailPayload = {
      ...detailPayload,
      prior_actions: [],
      action_read: {
        status: "denied",
        owner: "research",
        reason: "prior_action_owner_denied",
      },
    };
    const deniedPriorRes = await getMeetingDetail("mtg-w48-001");
    expect(deniedPriorRes.state).toBe("ok");
    if (deniedPriorRes.state === "ok") {
      expect(deniedPriorRes.data.prior_actions).toEqual({
        state: "forbidden",
        reason: "prior_action_owner_denied",
      });
    }
  });

  it("sends canonical PATCH /api/v1/research/tickets/{ticket_id} payload and reads back GET /api/v1/research/tickets/{ticket_id} (FE-MEETING-ACTION-FOLLOWTHROUGH-20261123)", async () => {
    // 1. Missing note & refs rejected before network
    const emptySubmit = await submitMeetingActionResponse({
      ticketId: "tkt-human-001",
      transition: "submit",
      revision: 2,
    });
    expect(emptySubmit).toEqual({
      state: "invalid",
      reason: "note_required",
    });

    // 2. Canonical PATCH payload and headers
    let patchHeaders: Record<string, string> = {};
    let patchBody: unknown = null;
    setMockResolver((method, path) => {
      if (method === "PATCH" && path === "/api/v1/research/tickets/tkt-human-001") {
        return (req) => {
          patchHeaders = req.headers;
          patchBody = req.body;
          return {
            kind: "json",
            status: 200,
            body: {
              status: "ok",
              owner: "research",
              data: {
                ticket_id: "tkt-human-001",
                status: "submitted",
                revision: 3,
                evidence_refs: [{ kind: "research_artifact", artifact_id: "artifact-900" }],
                evidence_notes: [
                  {
                    note_id: "note-1",
                    title: "Human response: tkt-human-001",
                    body: "Vendor license terms verified and attached.",
                    source_refs: ["artifact-900"],
                  },
                ],
                meeting_action: {
                  meeting_id: "mtg-w48-001",
                  meeting_type: "MT-1",
                  owner_kind: "human",
                  owner_id: "operator",
                  deliverable: "external_action",
                  acceptance_criterion: "Attach vendor terms summary",
                },
              },
            },
          };
        };
      }
      if (method === "GET" && path === "/api/v1/research/tickets/tkt-human-001") {
        return () => ({
          kind: "json",
          status: 200,
          body: {
            status: "ok",
            owner: "research",
            data: {
              ticket_id: "tkt-human-001",
              title: "Confirm external data license scope",
              status: "submitted",
              revision: 3,
              evidence_refs: [{ kind: "research_artifact", artifact_id: "artifact-900" }],
              evidence_notes: [
                {
                  note_id: "note-1",
                  title: "Human response: tkt-human-001",
                  body: "Vendor license terms verified and attached.",
                  source_refs: ["artifact-900"],
                },
              ],
              meeting_action: {
                meeting_id: "mtg-w48-001",
                meeting_type: "MT-1",
                owner_kind: "human",
                owner_id: "operator",
                deliverable: "external_action",
                acceptance_criterion: "Attach vendor terms summary",
              },
            },
          },
        });
      }
      return undefined;
    });

    const patchRes = await submitMeetingActionResponse(
      {
        ticketId: "tkt-human-001",
        transition: "submit",
        revision: 2,
        evidenceNote: {
          title: "Human response: tkt-human-001",
          body: "Vendor license terms verified and attached.",
          sourceRefs: ["artifact-900"],
        },
        evidenceRefs: [{ kind: "research_artifact", artifact_id: "artifact-900" }],
      },
      "idem-action-tkt-human-001",
    );

    expect(patchRes.state).toBe("ok");
    expect(patchHeaders["Idempotency-Key"]).toBe("idem-action-tkt-human-001");
    expect(patchBody).toEqual({
      action: "submit",
      expected_revision: 2,
      evidence_note: {
        title: "Human response: tkt-human-001",
        body: "Vendor license terms verified and attached.",
        source_refs: ["artifact-900"],
      },
      evidence_refs: [{ kind: "research_artifact", artifact_id: "artifact-900" }],
    });

    // 3. Read back via canonical GET /api/v1/research/tickets/{ticket_id}
    const getRes = await getMeetingActionTicket("tkt-human-001");
    expect(getRes.state).toBe("ok");
    if (getRes.state === "ok") {
      expect(getRes.data.ticket_id).toBe("tkt-human-001");
      expect(getRes.data.state).toBe("submitted");
      expect(getRes.data.revision).toBe(3);
      expect(getRes.data.evidence_notes?.[0]?.body).toBe(
        "Vendor license terms verified and attached.",
      );
      expect(getRes.data.evidence_items?.[0]?.href).toBe("/management/artifacts/artifact-900");
    }
  });

  it("normalizes gate_panel list and detail payloads (conclusion, gated_decision, positions, memo, case_file_view) and strips withheld private items and citations (FE-MGMT-MEETINGS-GATE-PANELS-20261126)", async () => {
    const panelId = "consult-envelope-publication-02695a7e4b41ea27d7db1138405bff6a-r2";
    setMockResolver((method, path) => {
      if (method === "GET" && path === "/bff/management/meetings") {
        return () => ({
          kind: "json",
          status: 200,
          body: {
            status: "ok",
            owner: "consultation",
            data: {
              items: [
                {
                  id: panelId,
                  meeting_id: panelId,
                  session_id: panelId,
                  request_id: panelId,
                  session_class: "gate_panel",
                  consultation_type: "persona_panel",
                  meeting_type: "gate_panel",
                  title:
                    "青禾 pool v6 envelope publication: 青禾 request_more_research, Risk Officer request_more_research -> operator_decision",
                  topic: "Risk review of paper envelope publication of pool v6 (live membership changed)",
                  status: "published",
                  effective_status: "published",
                  outcome: "operator_decision",
                  subject_persona_id: "persona-2448c7053e33ea48da47",
                  subject_persona_display_name: "青禾",
                  gated_decision: {
                    type: "envelope_publication",
                    id: "envelope-publication-02695a7e4b41ea27d7db1138405bff6a",
                    target_version: "6",
                  },
                  conclusion: {
                    gate_decision: "operator_decision",
                    operator_decision_required: true,
                    vetoed_by: null,
                    reasons: ["persona-risk-officer: risk did not support (request_more_research)"],
                    reviewers: [
                      {
                        persona_id: "persona-2448c7053e33ea48da47",
                        persona_display_name: "青禾",
                        role: "primary_reviewer",
                        recommendation: "request_more_research",
                      },
                      {
                        persona_id: "persona-risk-officer",
                        persona_display_name: "Risk Officer",
                        role: "risk_reviewer",
                        recommendation: "request_more_research",
                      },
                    ],
                  },
                  participants: [
                    {
                      persona_id: "persona-2448c7053e33ea48da47",
                      persona_display_name: "青禾",
                      role: "primary_reviewer",
                      origin: "institutional",
                    },
                    {
                      persona_id: "persona-risk-officer",
                      persona_display_name: "Risk Officer",
                      role: "risk_reviewer",
                      origin: "institutional",
                    },
                  ],
                  created_at: "2026-11-24T08:00:00Z",
                  completed_at: "2026-11-24T08:04:00Z",
                  closed_at: "2026-11-24T08:04:00Z",
                  private_memory: "SECRET_GATE_PANEL_LIST_PRIVATE",
                },
              ],
              summary: {
                total_items: 1,
                returned_items: 1,
                open_count: 0,
                closed_count: 1,
                gate_panel_count: 1,
              },
            },
          },
        });
      }
      if (method === "GET" && path === `/bff/management/meetings/${panelId}`) {
        return () => ({
          kind: "json",
          status: 200,
          body: {
            status: "ok",
            owner: "consultation",
            data: {
              id: panelId,
              meeting_id: panelId,
              request_id: panelId,
              session_class: "gate_panel",
              consultation_type: "persona_panel",
              meeting_type: "gate_panel",
              status: "published",
              outcome: "operator_decision",
              subject_persona_id: "persona-2448c7053e33ea48da47",
              subject_persona_display_name: "青禾",
              gated_decision: {
                type: "envelope_publication",
                id: "envelope-publication-02695a7e4b41ea27d7db1138405bff6a",
                target_version: "6",
              },
              conclusion: {
                gate_decision: "operator_decision",
                operator_decision_required: true,
                reviewers: [
                  {
                    persona_id: "persona-2448c7053e33ea48da47",
                    persona_display_name: "青禾",
                    role: "primary_reviewer",
                    recommendation: "request_more_research",
                  },
                  {
                    persona_id: "persona-risk-officer",
                    persona_display_name: "Risk Officer",
                    role: "risk_reviewer",
                    recommendation: "request_more_research",
                  },
                ],
              },
              positions: [
                {
                  label: "primary_reviewer",
                  persona_id: "persona-2448c7053e33ea48da47",
                  persona_display_name: "青禾",
                  role: "primary_reviewer",
                  stance: "request_more_research",
                  citations: ["cf-pool-v6", "cf-private-secret"],
                  private_text: "SECRET_GATE_POSITION_PRIVATE_TEXT",
                },
                {
                  label: "risk_reviewer",
                  persona_id: "persona-risk-officer",
                  persona_display_name: "Risk Officer",
                  role: "risk_reviewer",
                  stance: "request_more_research",
                  citations: ["cf-pool-v6"],
                },
              ],
              memo: {
                memo_id: "mem-868b462cd4fe32838ccf",
                request_id: panelId,
                memo_type: "committee_summary",
                summary: "Both reviewers requested additional research before publishing pool v6.",
                recommendation: "request_more_research",
                status: "published",
                private_memory: "SECRET_MEMO_PRIVATE_MEMORY",
              },
              case_file_view: {
                status: "ok",
                reason: null,
                case_file: {
                  case_file_id: "cf-2448-v6",
                  decision_type: "envelope_publication",
                  persona_id: "persona-2448c7053e33ea48da47",
                  composed_at: "2026-11-24T08:00:00Z",
                  private_items_withheld: 1,
                  groups: {
                    pool_facts: {
                      status: "ok",
                      reason: null,
                      truncated: false,
                      unavailable: [],
                      items: [
                        {
                          item_id: "cf-pool-v6",
                          kind: "pool_envelope",
                          source_owner: "strategy_pool",
                          source_id: "pool-2448-v6",
                          retrieval_mode: "direct",
                          excerpt: "Pool v6 adds 2454.TW at 15% target weight.",
                        },
                        {
                          item_id: "cf-private-secret",
                          kind: "memory",
                          relevance_scope: "persona_private",
                          excerpt: "SECRET_CASE_FILE_VIEW_PRIVATE_EXCERPT",
                        },
                      ],
                    },
                  },
                },
                contributions: [
                  {
                    persona_id: "persona-2448c7053e33ea48da47",
                    event_id: "evt-1",
                    role: "primary_reviewer",
                    recommendation: "request_more_research",
                    claims: [
                      {
                        claim: "Need 20-day slippage check on 2454.TW before live paper shift.",
                        cited_item_ids: ["cf-pool-v6", "cf-private-secret"],
                        unresolved_item_ids: [],
                      },
                    ],
                  },
                ],
                rejected_contributions: [],
              },
            },
          },
        });
      }
      return undefined;
    });

    const listRes = await getMeetings({ type: "gate_panel" });
    expect(listRes.state).toBe("ok");
    if (listRes.state === "ok") {
      expect(listRes.data.items).toHaveLength(1);
      expect(listRes.data.items[0].session_class).toBe("gate_panel");
      expect(listRes.data.summary?.gate_panel_count).toBe(1);
      expect(JSON.stringify(listRes.data)).not.toContain("SECRET_GATE_PANEL_LIST_PRIVATE");
    }

    const detailRes = await getMeetingDetail(panelId);
    expect(detailRes.state).toBe("ok");
    if (detailRes.state === "ok") {
      expect(detailRes.data.session_class).toBe("gate_panel");
      expect(detailRes.data.memo?.memo_id).toBe("mem-868b462cd4fe32838ccf");
      expect(detailRes.data.positions).toHaveLength(2);
      expect(detailRes.data.rounds).toHaveLength(1);
      expect(detailRes.data.positions?.[0].citations).toEqual(["cf-pool-v6"]);
      const serialized = JSON.stringify(detailRes.data);
      expect(serialized).not.toContain("SECRET_GATE_POSITION_PRIVATE_TEXT");
      expect(serialized).not.toContain("SECRET_MEMO_PRIVATE_MEMORY");
      expect(serialized).not.toContain("SECRET_CASE_FILE_VIEW_PRIVATE_EXCERPT");
      expect(serialized).not.toContain("cf-private-secret");
    }
  });
});
