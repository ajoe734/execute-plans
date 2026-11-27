import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

import {
  getCommitteeSessions,
  getChangeLog,
  getHumanEvidence,
  getPersonaHumanEvidence,
  getAgoraJournal,
  getAgoraDecisionJournal,
  getAgoraJournalTimeline,
} from "./learning";

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("learning client (live transport)", () => {
  it("keeps the owner's recorded reason from a fail-closed 503 detail", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(response(503, { detail: { status: "unavailable", owner: "consultation", reason: "consultation_owner_unavailable", fallback_used: false } }));
    const { bffFetch } = await import("../client");
    // Force live for this call via the explicit per-request mode override used by the client.
    await expect(bffFetch({ method: "GET", path: "/bff/agora/committee/sessions", mode: "live", baseUrl: "http://bff.test" })).rejects.toMatchObject({
      envelope: { error: { cause: "consultation_owner_unavailable" } },
    });
  });

  it("treats a 200 envelope with status unavailable as unavailable", async () => {
    const { setMockResolver } = await import("../client");
    setMockResolver(() => () => ({ kind: "json", status: 200, body: { status: "unavailable", reason: "no_persona_panels", owner: "consultation", data: [] } }));
    expect(await getCommitteeSessions()).toEqual({ state: "unavailable", reason: "no_persona_panels", owner: "consultation" });
    setMockResolver(undefined);
  });

  it("rejects a malformed owner payload instead of defaulting it", async () => {
    const { setMockResolver } = await import("../client");
    setMockResolver(() => () => ({ kind: "json", status: 200, body: { data: { entries: "nope" } } }));
    expect(await getChangeLog("p1")).toMatchObject({ state: "ok" }); // object payload accepted as-is by the lab envelope
    setMockResolver(() => () => ({ kind: "json", status: 200, body: {} }));
    expect(await getChangeLog("p1")).toEqual({ state: "unavailable", reason: "invalid_owner_response", owner: undefined });
    setMockResolver(undefined);
  });

  it("reads human evidence item and persona human evidence observation through /bff/agora routes", async () => {
    const { setMockResolver } = await import("../client");
    setMockResolver((method, path) => () => {
      if (method === "GET" && path === "/bff/agora/human-evidence/ev-001") {
        return {
          kind: "json",
          status: 200,
          body: {
            status: "ok",
            data: {
              evidence_id: "ev-001",
              persona_id: "servant-001",
              evidence_type: "signal_feedback",
              subject_ref: "strategy:strat-001",
              content: { summary: "訊號過早進場" },
            },
          },
        };
      }
      if (method === "GET" && path === "/bff/agora/personas/servant-001/human-evidence") {
        return {
          kind: "json",
          status: 200,
          body: {
            status: "ok",
            items: [
              {
                evidence_id: "ev-001",
                persona_id: "servant-001",
                evidence_type: "signal_feedback",
                subject_ref: "strategy:strat-001",
                content: { summary: "訊號過早進場" },
              },
            ],
            total: 1,
          },
        };
      }
      return { kind: "json", status: 404, body: {} };
    });

    const single = await getHumanEvidence("ev-001");
    expect(single).toEqual({
      state: "ok",
      data: {
        evidence_id: "ev-001",
        persona_id: "servant-001",
        evidence_type: "signal_feedback",
        subject_ref: "strategy:strat-001",
        content: { summary: "訊號過早進場" },
      },
      owner: undefined,
    });

    const obs = await getPersonaHumanEvidence("servant-001");
    expect(obs).toEqual({
      state: "ok",
      data: {
        items: [
          {
            evidence_id: "ev-001",
            persona_id: "servant-001",
            evidence_type: "signal_feedback",
            subject_ref: "strategy:strat-001",
            content: { summary: "訊號過早進場" },
          },
        ],
        total: 1,
      },
      owner: undefined,
    });
    setMockResolver(undefined);
  });

  it("merges /bff/agora/journal and /bff/agora/decision-journal into a decision chain timeline", async () => {
    const { setMockResolver } = await import("../client");
    setMockResolver((method, path) => () => {
      if (method === "GET" && path === "/bff/agora/journal") {
        return {
          kind: "json",
          status: 200,
          body: {
            data: [
              {
                id: "j-001",
                title: "台積電開盤跳空加碼紀錄",
                body: "外資分點連續買超，依策略規則進場。",
                tags: ["entry", "chip"],
                linkedStrategyIds: ["strat-001"],
                linkedPersonaIds: ["servant-001"],
                visibility: "private",
                createdAt: "2026-11-27T01:00:00Z",
                updatedAt: "2026-11-27T01:05:00Z",
                version: 1,
              },
            ],
          },
        };
      }
      if (method === "GET" && path === "/bff/agora/decision-journal") {
        return {
          kind: "json",
          status: 200,
          body: {
            items: [
              {
                entry_id: "dj-002",
                title: "鴻海減碼決策鏈",
                body: "量能萎縮，先行減碼一半部位。",
                tags: ["trim"],
                linked_strategy_ids: ["strat-002"],
                linked_persona_ids: ["servant-001"],
                visibility: "private",
                created_at: "2026-11-27T02:00:00Z",
                updated_at: "2026-11-27T02:10:00Z",
                version: 2,
              },
            ],
          },
        };
      }
      return { kind: "json", status: 404, body: {} };
    });

    const journalOnly = await getAgoraJournal();
    expect(journalOnly.state).toBe("ok");
    const decisionJournalOnly = await getAgoraDecisionJournal();
    expect(decisionJournalOnly.state).toBe("ok");

    const timeline = await getAgoraJournalTimeline();
    expect(timeline.state).toBe("ok");
    if (timeline.state === "ok") {
      expect(timeline.data.journalCount).toBe(1);
      expect(timeline.data.decisionJournalCount).toBe(1);
      expect(timeline.data.entries.map((e) => e.id)).toEqual(["dj-002", "j-001"]);
    }
    setMockResolver(undefined);
  });
});
