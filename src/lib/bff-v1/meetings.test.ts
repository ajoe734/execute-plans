import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
                    roster_rule: "owner_plus_peer_plus_risk",
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
});
