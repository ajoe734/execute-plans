import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildServantContextAttachmentRefs,
  createServantSession,
  createServantTraderReport,
  ensureServant,
  formatServantDisplayName,
  getServant,
  getServantHabits,
  getServantSession,
  getServantSessionStream,
  getServantTraderReport,
  listServantTraderReports,
  parseServantSessionSse,
  patchServantHabits,
  sendServantSessionMessage,
  terminateServantSession,
} from "./servant";
import { liveStatus } from "../liveStatus";

const realFetch = globalThis.fetch;

const liveServant = {
  persona_id: "servant-live-001",
  display_name: "Live Servant",
  status: "paper_only",
  tenant_id: "live-tenant",
  agora_user_id: "live-user",
  capability_summary: { can_ask: true, can_research: false, can_workshop: false },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const mockFetch = (impl: () => Promise<Response>) => {
  const spy = vi.fn(impl);
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
};

describe("servant client (strict live)", () => {
  beforeEach(() => {
    liveStatus._reset({ mode: "live", effective: "live" });
    vi.stubEnv("VITE_BFF_BASE_URL", "https://bff.example.test");
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    liveStatus._reset();
  });

  it("GETs the servant from the configured BFF base URL, never the page origin", async () => {
    const spy = mockFetch(() => Promise.resolve(json({ data: liveServant })));
    const profile = await getServant();
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bff.example.test/bff/agora/servant");
    expect(init.credentials).toBe("include");
    expect(profile?.persona_id).toBe("servant-live-001");
    expect(profile?.status).toBe("paper_only");
    expect(profile?.policy.execution_authority).toBe("none");
  });

  it("returns null on 404", async () => {
    mockFetch(() => Promise.resolve(json({ error: { code: "RESOURCE_NOT_FOUND", message: "none" } }, 404)));
    await expect(getServant()).resolves.toBeNull();
  });

  it("throws on 401 and on network failure instead of returning mock data", async () => {
    mockFetch(() => Promise.resolve(json({ error: { code: "UNAUTHORIZED", message: "no" } }, 401)));
    await expect(getServant()).rejects.toThrow();
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(getServant()).rejects.toThrow();
  });

  it("rejects an unknown status rather than defaulting to active", async () => {
    mockFetch(() => Promise.resolve(json({ ...liveServant, status: "weird" })));
    await expect(getServant()).rejects.toThrow(/unknown status/);
  });

  it("ensure POSTs with Idempotency-Key and X-Request-Id and returns the same persona_id twice", async () => {
    const spy = mockFetch(() => Promise.resolve(json(liveServant)));
    const a = await ensureServant();
    const b = await ensureServant();
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://bff.example.test/bff/agora/servant/ensure");
    expect(init.method).toBe("POST");
    expect(headers["Idempotency-Key"]).toBeTruthy();
    expect(headers["X-Request-Id"]).toBeTruthy();
    expect(a.persona_id).toBe(b.persona_id);
  });

  it("normalizes raw English default display names (e.g. Agora Servant) to zh-TW fallback while keeping custom names", async () => {
    mockFetch(() =>
      Promise.resolve(
        json({
          data: {
            ...liveServant,
            display_name: "Agora Servant",
          },
        }),
      ),
    );
    const defaultProfile = await getServant();
    expect(defaultProfile?.display_name).toBe("專屬僕人");
    expect(formatServantDisplayName("Agora Servant")).toBe("專屬僕人");
    expect(formatServantDisplayName("Trading Servant")).toBe("專屬僕人");
    expect(formatServantDisplayName("Your servant")).toBe("專屬僕人");
    expect(formatServantDisplayName("我的交易僕人")).toBe("我的交易僕人");
  });

  it("creates a servant session and posts a contextual message through /bff/agora/servant/sessions", async () => {
    const spy = mockFetch(() => Promise.resolve(json({})));
    spy
      .mockResolvedValueOnce(
        json(
          {
            data: {
              session_id: "sess-001",
              servant_persona_id: "servant-live-001",
              session_type: "interactive",
              status: "active",
              state: "active",
              intent: "分析分點",
              strategy_ref: "strat-winner-v4",
              metadata: {
                page: "trading-room",
                route: "/agora/trading-room/strat-winner-v4",
                strategy: "strat-winner-v4",
                selected_widget: "widget-branch-heatmap",
              },
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        json(
          {
            status: "accepted",
            data: {
              message_id: "servant-msg-001",
              session_id: "sess-001",
              session_type: "interactive",
              servant_persona_id: "servant-live-001",
              provider: {
                status: "completed",
                answer: "僕人已替您整理目前策略與選中元件的分點籌碼摘要。",
                error: null,
              },
            },
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        json({
          data: {
            session_id: "sess-001",
            servant_persona_id: "servant-live-001",
            session_type: "interactive",
            status: "active",
            state: "active",
            metadata: {},
          },
        }),
      )
      .mockResolvedValueOnce(
        json({
          data: {
            session_id: "sess-001",
            servant_persona_id: "servant-live-001",
            session_type: "interactive",
            status: "canceled",
            state: "canceled",
            metadata: {},
          },
        }),
      );

    const session = await createServantSession({
      intent: "分析分點",
      strategy_ref: "strat-winner-v4",
      session_type: "interactive",
      metadata: {
        page: "trading-room",
        route: "/agora/trading-room/strat-winner-v4",
        strategy: "strat-winner-v4",
        selected_widget: "widget-branch-heatmap",
      },
    });
    expect(session.session_id).toBe("sess-001");
    expect(session.strategy_ref).toBe("strat-winner-v4");

    const refs = buildServantContextAttachmentRefs({
      page: "trading-room",
      route: "/agora/trading-room/strat-winner-v4",
      strategy: "strat-winner-v4",
      selectedWidget: "widget-branch-heatmap",
    });
    expect(refs).toEqual([
      "page:trading-room",
      "route:/agora/trading-room/strat-winner-v4",
      "strategy:strat-winner-v4",
      "widget:widget-branch-heatmap",
    ]);

    const receipt = await sendServantSessionMessage(session.session_id, {
      content: "分析分點",
      attachment_refs: refs,
    });
    expect(receipt.message_id).toBe("servant-msg-001");
    expect(receipt.provider.answer).toBe("僕人已替您整理目前策略與選中元件的分點籌碼摘要。");

    const [createUrl, createInit] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(createUrl).toBe("https://bff.example.test/bff/agora/servant/sessions");
    expect(JSON.parse(String(createInit.body))).toEqual({
      session_type: "interactive",
      intent: "分析分點",
      strategy_ref: "strat-winner-v4",
      metadata: {
        page: "trading-room",
        route: "/agora/trading-room/strat-winner-v4",
        strategy: "strat-winner-v4",
        selected_widget: "widget-branch-heatmap",
      },
    });

    const [msgUrl, msgInit] = spy.mock.calls[1] as unknown as [string, RequestInit];
    expect(msgUrl).toBe("https://bff.example.test/bff/agora/servant/sessions/sess-001/messages");
    expect(JSON.parse(String(msgInit.body))).toEqual({
      content: "分析分點",
      attachment_refs: refs,
    });

    const lookedUp = await getServantSession("sess-001");
    expect(lookedUp.session_id).toBe("sess-001");

    const terminated = await terminateServantSession("sess-001");
    expect(terminated.state).toBe("canceled");
  });

  it("replays durable servant session messages and running turns from /bff/agora/servant/sessions/{id}/stream", async () => {
    const sseBody = [
      "id: sess-001:created",
      "event: servant.session.created",
      'data: {"session_id":"sess-001","session_type":"interactive","servant_persona_id":"servant-live-001"}',
      "",
      "id: msg-u-1",
      "event: servant.message.accepted",
      'data: {"session_id":"sess-001","message_id":"msg-u-1","role":"user","content":"分析分點","attachment_refs":["page:trading-room"]}',
      "",
      "id: msg-a-1",
      "event: servant.message.completed",
      'data: {"session_id":"sess-001","message_id":"msg-a-1","turn_id":"turn-1","reply_to":"msg-u-1","provider_status":"completed","answer":"已完成分點籌碼比對。"}',
      "",
      "id: turn-2:running",
      "event: servant.message.queued",
      'data: {"session_id":"sess-001","turn_id":"turn-2","message_id":"msg-u-2","status":"running"}',
      "",
      "",
    ].join("\n");

    const spy = mockFetch(() =>
      Promise.resolve(
        new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );

    const snapshot = await getServantSessionStream("sess-001");
    const [streamUrl] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(streamUrl).toBe("https://bff.example.test/bff/agora/servant/sessions/sess-001/stream");
    expect(snapshot.session_id).toBe("sess-001");
    expect(snapshot.sessionStatus).toBe("active");
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[0]).toMatchObject({
      message_id: "msg-u-1",
      role: "user",
      content: "分析分點",
      status: "accepted",
    });
    expect(snapshot.messages[1]).toMatchObject({
      message_id: "msg-a-1",
      role: "assistant",
      content: "已完成分點籌碼比對。",
      status: "completed",
    });
    expect(snapshot.runningTurns).toEqual([
      {
        turn_id: "turn-2",
        message_id: "msg-u-2",
        status: "running",
      },
    ]);

    const parsedFromJson = parseServantSessionSse("sess-002", {
      events: [
        {
          id: "sess-002:terminated",
          type: "servant.session.terminated",
          data: { session_id: "sess-002", status: "canceled" },
        },
      ],
    });
    expect(parsedFromJson.sessionStatus).toBe("canceled");
  });

  it("parses citations, typed clarification cards, stated assumptions, and sends clarification_choice back", async () => {
    const sseWithClarificationAndCitations = [
      "id: msg-a-clarify",
      "event: servant.message.completed",
      JSON.stringify({
        session_id: "sess-001",
        message_id: "msg-a-clarify",
        turn_id: "turn-c1",
        provider_status: "completed",
        answer: "請問您希望針對哪個週期分析分點籌碼？",
        answer_mode: "clarification",
        clarification: {
          decision_id: "dec-horizon-1",
          question_id: "q-horizon-1",
          question: "請問您分析分點籌碼的持有週期為何？",
          why_it_matters: "不同週期會篩選不同券商分點連續買超天數。",
          default_option_id: "opt-5d",
          servant_default: "近 5 個交易日（波段預設）",
          options: [
            { option_id: "opt-1d", label: "當日隔日沖（1 日）", description: "聚焦隔日沖主力分點" },
            { option_id: "opt-5d", label: "短波段（5 日）", description: "聚焦連續 5 日囤貨分點", recommended: true },
          ],
          resolves: ["holding_period"],
        },
      }).replace(/^/, "data: "),
      "",
      "id: msg-a-cited",
      "event: servant.message.completed",
      JSON.stringify({
        session_id: "sess-001",
        message_id: "msg-a-cited",
        turn_id: "turn-c2",
        provider_status: "completed",
        answer: "台積電（2330）近 5 日主力分點淨買超 4,280 張。",
        stated_assumptions: ["採用近 5 個交易日波段視角"],
        citations: [
          {
            id: "f1",
            label: "主力分點淨買超",
            value: 4280,
            unit: "張",
            source: "finmind-broker-top:2330:2026-11-26",
            connector_id: "tw-finmind-broker-daily-report",
            as_of: "2026-11-26T13:30:00Z",
            freshness: "fresh",
          },
        ],
      }).replace(/^/, "data: "),
      "",
      "",
    ].join("\n");

    const parsed = parseServantSessionSse("sess-001", sseWithClarificationAndCitations);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].clarification).toMatchObject({
      decision_id: "dec-horizon-1",
      question: "請問您分析分點籌碼的持有週期為何？",
      why_it_matters: "不同週期會篩選不同券商分點連續買超天數。",
      servant_default: "近 5 個交易日（波段預設）",
    });
    expect(parsed.messages[0].clarification?.options).toHaveLength(2);
    expect(parsed.messages[1].citations).toEqual([
      expect.objectContaining({
        source: "finmind-broker-top:2330:2026-11-26",
        as_of: "2026-11-26T13:30:00Z",
        freshness: "fresh",
      }),
    ]);
    expect(parsed.messages[1].stated_assumptions).toEqual(["採用近 5 個交易日波段視角"]);

    const spy = mockFetch(() =>
      Promise.resolve(
        json(
          {
            status: "accepted",
            data: {
              message_id: "msg-choice-1",
              turn_id: "turn-choice-1",
              session_id: "sess-001",
              session_type: "interactive",
              servant_persona_id: "servant-live-001",
              provider: { status: "queued", answer: null, error: null },
              clarification_choice: {
                decision_id: "dec-horizon-1",
                option_id: "opt-5d",
                option_label: "短波段（5 日）",
              },
            },
          },
          202,
        ),
      ),
    );

    const receipt = await sendServantSessionMessage("sess-001", {
      content: "短波段（5 日）",
      clarification_choice: {
        decision_id: "dec-horizon-1",
        question_id: "q-horizon-1",
        option_id: "opt-5d",
        selected_option_id: "opt-5d",
        option_label: "短波段（5 日）",
        resolves: ["holding_period"],
      },
    });
    expect(receipt.clarification_choice).toMatchObject({
      decision_id: "dec-horizon-1",
      option_id: "opt-5d",
    });
    const [, choiceInit] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(choiceInit.body))).toEqual({
      content: "短波段（5 日）",
      attachment_refs: [],
      clarification_choice: {
        decision_id: "dec-horizon-1",
        question_id: "q-horizon-1",
        option_id: "opt-5d",
        selected_option_id: "opt-5d",
        option_label: "短波段（5 日）",
        resolves: ["holding_period"],
      },
    });
  });

  it("reads and corrects the trader habit profile via GET and PATCH /bff/agora/servant/habits", async () => {
    const spy = mockFetch(() => Promise.resolve(json({})));
    spy
      .mockResolvedValueOnce(
        json({
          status: "ok",
          data: {
            servant_persona_id: "servant-live-001",
            profile: {
              profile_key: "habit-abc",
              version: 2,
              tenant_id: "live-tenant",
              user_id: "live-user",
              strategy_id: "strat-winner-v4",
              decision_count: 14,
              journal_count: 5,
              interaction_count: 8,
              min_sample: 10,
              computed_at: "2026-11-28T05:00:00Z",
              features: [
                {
                  key: "data_order",
                  label: "看資料的順序",
                  sample_size: 12,
                  min_sample: 10,
                  shown: true,
                  unavailable_reason: null,
                  value: { first_family: "chips", first_family_share: 0.75 },
                  headline: { metric: "first_family", value: "chips", unit: "text" },
                  inputs: ["servant_session_widget_context"],
                  source_refs: ["sess-001"],
                },
              ],
            },
            interpretations: [
              {
                interpretation_id: "hint-001",
                memory_id: "mem-001",
                feature_key: "data_order",
                feature_label: "看資料的順序",
                statement: "您偏好先看籌碼再看價格",
                origin: "servant",
                status: "active",
                fact_refs: ["data_order"],
                profile_version: 2,
                written_at: "2026-11-28T05:00:00Z",
              },
            ],
            interpretations_status: { status: "ok", reason: null },
          },
        }),
      )
      .mockResolvedValueOnce(
        json({
          status: "ok",
          data: {
            servant_persona_id: "servant-live-001",
            correction: {
              action: "replace",
              superseded_interpretation_id: "hint-001",
              interpretation: {
                interpretation_id: "hint-002",
                feature_key: "data_order",
                feature_label: "看資料的順序",
                statement: "我會先看分點集中度，再確認大盤量能與價格突破",
                origin: "trader_correction",
                status: "active",
                fact_refs: ["data_order"],
              },
              training_example: { evidence_id: "ev-habit-001" },
            },
            profile: {
              profile_key: "habit-abc",
              version: 2,
              tenant_id: "live-tenant",
              user_id: "live-user",
              strategy_id: "strat-winner-v4",
              decision_count: 14,
              journal_count: 5,
              interaction_count: 8,
              min_sample: 10,
              computed_at: "2026-11-28T05:00:00Z",
              features: [],
            },
            interpretations: [
              {
                interpretation_id: "hint-002",
                feature_key: "data_order",
                feature_label: "看資料的順序",
                statement: "我會先看分點集中度，再確認大盤量能與價格突破",
                origin: "trader_correction",
                status: "active",
                fact_refs: ["data_order"],
              },
            ],
            interpretations_status: { status: "ok", reason: null },
          },
        }),
      );

    const read = await getServantHabits({ strategyId: "strat-winner-v4" });
    expect(read.profile.decision_count).toBe(14);
    expect(read.profile.features[0].label).toBe("看資料的順序");
    expect(read.interpretations[0].statement).toBe("您偏好先看籌碼再看價格");

    const patched = await patchServantHabits({
      action: "replace",
      interpretation_id: "hint-001",
      feature_key: "data_order",
      statement: "我會先看分點集中度，再確認大盤量能與價格突破",
      strategy_id: "strat-winner-v4",
    });
    expect(patched.correction?.action).toBe("replace");
    expect(patched.interpretations[0].statement).toBe(
      "我會先看分點集中度，再確認大盤量能與價格突破",
    );
    expect(patched.interpretations[0].origin).toBe("trader_correction");
  });

  it("lists, requests, and fetches trader reports via /bff/agora/servant/reports", async () => {
    const sampleReport = {
      report_id: "trpt-2026w48-01",
      servant_persona_id: "servant-live-001",
      strategy_id: "strat-winner-v4",
      strategy_version: "v4",
      trigger: "on_demand",
      cadence: "on_demand",
      iso_week: "2026-W48",
      window_start: "2026-11-21T00:00:00Z",
      window_end: "2026-11-28T00:00:00Z",
      window_days: 7,
      status: "completed",
      narrative: "【本週交易員報告】策略版本：v4。本週共提供 12 筆決策事件，模擬帳本累計成交 4 筆。",
      facts: [
        {
          id: "f1",
          section: "decisions",
          metric_key: "offered",
          label: "本週提供決策事件數",
          value: 12,
          unit: "decisions",
          owner: "agora",
          source: "agora:decision_locks:live-tenant:live-user",
          as_of: "2026-11-28T05:00:00Z",
          freshness: "fresh",
        },
      ],
      citations: [
        {
          id: "f1",
          section: "decisions",
          metric_key: "offered",
          label: "本週提供決策事件數",
          value: 12,
          unit: "decisions",
          owner: "agora",
          source: "agora:decision_locks:live-tenant:live-user",
          as_of: "2026-11-28T05:00:00Z",
          freshness: "fresh",
        },
      ],
      sections: {
        suggested_next_steps: {
          items: [
            {
              proposal_type: "workspace_revision",
              title: "檢視待確認的交易室版面修訂提案",
              reason: "目前有 1 份版面提案待您決定是否套用。",
            },
          ],
        },
      },
      created_at: "2026-11-28T05:00:00Z",
    };

    const spy = mockFetch(() => Promise.resolve(json({})));
    spy
      .mockResolvedValueOnce(
        json({
          status: "ok",
          data: {
            items: [sampleReport],
            total: 1,
            servant_persona_id: "servant-live-001",
            on_demand_daily_used: 1,
            on_demand_daily_cap: 3,
            weekly_history_cap: 26,
          },
        }),
      )
      .mockResolvedValueOnce(json({ status: "ok", data: sampleReport }, 201))
      .mockResolvedValueOnce(json({ status: "ok", data: sampleReport }));

    const list = await listServantTraderReports({ strategyId: "strat-winner-v4" });
    expect(list.total).toBe(1);
    expect(list.on_demand_daily_used).toBe(1);
    expect(list.on_demand_daily_cap).toBe(3);
    expect(list.items[0].report_id).toBe("trpt-2026w48-01");
    expect(list.items[0].citations[0].source).toBe(
      "agora:decision_locks:live-tenant:live-user",
    );
    expect(list.items[0].suggested_next_steps[0].title).toBe(
      "檢視待確認的交易室版面修訂提案",
    );

    const created = await createServantTraderReport({
      strategy_id: "strat-winner-v4",
      trigger: "on_demand",
      window_days: 7,
    });
    expect(created.report_id).toBe("trpt-2026w48-01");

    const single = await getServantTraderReport("trpt-2026w48-01");
    expect(single.narrative).toContain("【本週交易員報告】");
  });
});
