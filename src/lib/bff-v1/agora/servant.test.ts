import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildServantContextAttachmentRefs,
  createServantSession,
  ensureServant,
  formatServantDisplayName,
  getServant,
  getServantSession,
  getServantSessionStream,
  parseServantSessionSse,
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
});
