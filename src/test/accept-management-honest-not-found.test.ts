import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

vi.mock("tsx/esm/api", () => ({ tsImport: async () => import("../management/navigation/managementRouteManifest") }));

const source = readFileSync("scripts/accept-management-hosted-production.mjs", "utf8");
const match = source.match(/function shortContentIncomplete[\s\S]*?\n}\n/);
const shortContentIncomplete = runInNewContext(`(${match![0].replace(/^function shortContentIncomplete/, "function")})`) as
  (content: string, honest: boolean) => boolean;
// Mirrors the honestNotFound regex in crawlRoute.
const notFound = (content: string) => /not found|找不到|不存在/iu.test(content);

describe("short-content rule vs honest not-found", () => {
  it("passes the exact zh-TW stg_001 not-found message", () => {
    const content = "找不到策略 stg_001。";
    expect(content.length).toBeLessThanOrEqual(15);
    expect(notFound(content)).toBe(true);
    expect(shortContentIncomplete(content, notFound(content))).toBe(false);
  });
  it("source wires the helper into content_incomplete", () => {
    expect(source).toContain('shortContentIncomplete(snapshot.content, honestNotFound) && "content_incomplete"');
  });
  it("still fails short content that is not a not-found message", () => {
    expect(shortContentIncomplete("Loading data", notFound("Loading data"))).toBe(true);
    expect(shortContentIncomplete("", false)).toBe(true);
  });
  it("live-id 404 stays a failure (honestNotFound false)", () => {
    expect(shortContentIncomplete("找不到策略 stg_001。", false)).toBe(true);
  });
});

// --- Route-level crawl tests: drive the real crawlRoute with a fake page. ---
import { EventEmitter } from "node:events";
import { BASELINE_ROUTES, expectedCanonicalPath, ENTITY_LIST_ENDPOINTS } from "../../scripts/lib/management-routes.mjs";

const FE = "http://127.0.0.1:4173";
const BFF = "https://api.dev.mvl-cap.tw";
type FailedRead = {
  method: string; path: string; status: number | null; error: string | null; elapsedMs: number; pending: boolean;
  reason: string; honestNotFound: boolean; streamRule: string | null; counted: boolean;
};
type CrawlResult = { status: string; dataCheck: { pass: boolean; reasons: string[] }; failedReads: FailedRead[]; failedReadsOmitted: number };
type Harness = {
  crawlRoute: (page: unknown, route: object, opts: object) => Promise<CrawlResult>;
  streamResponseRule: (method: string, pathname: string, status: number) => string | null;
  sanitizeReadPath: (url: string) => string;
  failedReadDetail: (inputs: object[], opts: object) => { reads: FailedRead[]; omitted: number };
  capFailedReadsPerRun: (routes: object[], cap?: number) => { capPerRoute: number; capPerRun: number; recorded: number; omitted: number };
  FAILED_READ_CAP_PER_ROUTE: number;
  FAILED_READ_CAP_PER_RUN: number;
};
function crawlHarness() {
  return runInNewContext(`${source
    .replace(/^#![^\n]*\n/, "")
    .replace(/^import[\s\S]*?from "[^"]+";\n/gm, "")
    .replace(/\nmain\(\);\s*$/, "")}
    ({ crawlRoute, streamResponseRule, sanitizeReadPath, failedReadDetail, capFailedReadsPerRun,
      FAILED_READ_CAP_PER_ROUTE, FAILED_READ_CAP_PER_RUN });`, {
    process: { argv: ["node", "offline"], env: { PANTHEON_FE_BASE_URL: FE, PANTHEON_ACCEPT_SETTLE_TIMEOUT_MS: "2" } },
    URL, URLSearchParams, Date, Object,
    BASELINE_ROUTES, expectedCanonicalPath, ENTITY_LIST_ENDPOINTS,
    normalizeOptionalBearerToken: () => "",
  }) as Harness;
}
function fakeReq(page: any, url: string, navigation = false) {
  return {
    url: () => url, method: () => "GET", frame: () => page.mainFrame(), isNavigationRequest: () => navigation,
    timing: () => ({ startTime: Date.now() }), failure: () => null,
  };
}
async function crawlWith(path: string, content: string, readEndpoint: string, status: number, route: object, source = "baseline-or-live-nav") {
  const frame = {};
  const page: any = Object.assign(new EventEmitter(), {
    mainFrame: () => frame,
    waitForTimeout: async () => {},
    evaluate: async () => ({ path, finalUrl: path, body: `Pantheon management navigation shell\n${content}`, content, busy: false, login: false,
      buttons: 0, enabledButtons: 0, disabledButtons: 0 }),
  });
  return crawlHarness().crawlRoute(page, route, {
    source,
    transport: { navigate: async () => {
      page.emit("request", fakeReq(page, `${FE}${path}`, true));
      page.emit("framenavigated", frame);
      const req = fakeReq(page, `${BFF}${readEndpoint}`);
      page.emit("request", req);
      page.emit("response", { request: () => req, url: req.url, status: () => status, json: async () => (status === 200 ? { items: [] } : { error: "not_found" }) });
      page.emit("requestfinished", req);
      return null;
    } },
  });
}

describe("crawlRoute data check: honest not-found vs short content", () => {
  const stg = "/management/strategies/stg_001";
  const stgRoute = { path: stg, kind: "detail-or-alias", entity: "strategies" };
  it("AC1: baseline stg_001 with 404 and exact zh-TW message passes", async () => {
    const r = await crawlWith(stg, "找不到策略 stg_001。", "/bff/strategies/stg_001", 404, stgRoute);
    expect(r.dataCheck.reasons).toEqual([]);
    expect(r.dataCheck.pass).toBe(true);
  });
  it("AC2: short non-not-found content with a valid read fails content_incomplete", async () => {
    const p = "/management/strategies";
    const r = await crawlWith(p, "策略清單", "/bff/strategies", 200, { path: p, kind: "nav" });
    expect(r.dataCheck.pass).toBe(false);
    expect(r.dataCheck.reasons).toContain("content_incomplete");
  });
  it("AC3: live-id detail with the same 404 still fails", async () => {
    const r = await crawlWith(stg, "找不到策略 stg_001。", "/bff/strategies/stg_001", 404, stgRoute, "live-id:strategies");
    expect(r.dataCheck.pass).toBe(false);
  });
});

// --- FE-CRAWL-FAILED-READ-DETAIL-20261126: per-route failed-read detail. ---
type Read = { endpoint: string; status?: number; method?: string; networkError?: string; body?: unknown };
async function crawlReads(path: string, content: string, reads: Read[], route: object, source = "baseline-or-live-nav") {
  const frame = {};
  const page: any = Object.assign(new EventEmitter(), {
    mainFrame: () => frame,
    waitForTimeout: async () => {},
    evaluate: async () => ({ path, finalUrl: path, body: `Pantheon management navigation shell\n${content}`, content, busy: false, login: false }),
  });
  return crawlHarness().crawlRoute(page, route, {
    source,
    transport: { navigate: async () => {
      page.emit("request", fakeReq(page, `${FE}${path}`, true));
      page.emit("framenavigated", frame);
      for (const read of reads) {
        const req = { ...fakeReq(page, `${BFF}${read.endpoint}`), method: () => read.method || "GET",
          failure: () => (read.networkError ? { errorText: read.networkError } : null) };
        page.emit("request", req);
        if (read.networkError) { page.emit("requestfailed", req); continue; }
        const status = read.status ?? 200;
        const body = read.body ?? (status === 200 ? { items: [] } : { error: "http_error" });
        page.emit("response", { request: () => req, url: req.url, status: () => status, json: async () => body });
        page.emit("requestfinished", req);
      }
      return null;
    } },
  });
}
const counted = (r: CrawlResult) => r.failedReads.filter((read) => read.counted);

// Hosted evidence (Root 45740904149, viewer crawl 04:13-04:30Z): these four
// fixture details rendered an honest not-found yet failed api_data_failure.
// Their kind/source classification is honest-not-found eligible; the extra
// >= 400 reads were (a) the viewer-only GET /bff/approvals 403 that the
// rebalance, deployment and evolution detail pages issue whether or not the
// entity exists, and (b) GET /bff/events/stream 409 replay_unavailable, which
// the FE handles by dropping Last-Event-ID and reconnecting.
describe("why the four fixture-id details failed while rendering an honest not-found", () => {
  const fixtures = [
    { path: "/management/strategies/stg_001", entity: "strategies", api: "/bff/strategies/stg_001", text: "找不到策略 stg_001。" },
    { path: "/management/rebalance/rb_q2_2026", entity: "rebalance", api: "/bff/rebalances/rb_q2_2026", text: "Rebalance Not Found" },
    { path: "/management/evolution/ev_001", entity: "evolution", api: "/bff/evolution-programs/ev_001", text: "找不到 Evolution Program" },
    { path: "/management/deployments/dp_001", entity: "deployments", api: "/bff/deployments/dp_001", text: "Deployment Not Found" },
  ];

  it("classification is not the cause: all four are baseline detail-or-alias fixtures with an entity endpoint", () => {
    for (const f of fixtures) {
      expect(BASELINE_ROUTES).toContainEqual({ path: f.path, kind: "detail-or-alias", entity: f.entity });
      expect(f.api.startsWith(`${ENTITY_LIST_ENDPOINTS[f.entity as keyof typeof ENTITY_LIST_ENDPOINTS]}/`)).toBe(true);
    }
  });

  it("rebalance, deployment and evolution detail pages read /bff/approvals regardless of the entity; strategy gates it on a loaded strategy", () => {
    for (const file of ["RebalanceDetail", "DeploymentDetail", "EvolutionDetail"]) {
      expect(readFileSync(`src/management/pages/${file}.tsx`, "utf8")).toMatch(/bffV1\.approvals\s*\.list\(\)/);
    }
    const strategy = readFileSync("src/management/pages/StrategyDetail.tsx", "utf8");
    expect(strategy).toContain("if (!s || !activeEntityId || primaryLoadSeq <= 0) return;");
  });

  for (const f of fixtures) {
    const route = { path: f.path, kind: "detail-or-alias", entity: f.entity };
    it(`${f.path}: 404 + stream 409 is an honest not-found and passes`, async () => {
      const r = await crawlReads(f.path, f.text, [
        { endpoint: f.api, status: 404 },
        { endpoint: "/bff/events/stream", status: 409 },
      ], route);
      expect(r.dataCheck.reasons).toEqual([]);
      expect(r.status).toBe("ok");
      expect(r.failedReads).toEqual([]);
    });
  }

  for (const f of fixtures.slice(1)) {
    const route = { path: f.path, kind: "detail-or-alias", entity: f.entity };
    it(`${f.path}: the viewer-only GET /bff/approvals 403 still fails and is named`, async () => {
      const r = await crawlReads(f.path, f.text, [
        { endpoint: f.api, status: 404 },
        { endpoint: "/bff/approvals", status: 403 },
        { endpoint: "/bff/events/stream", status: 409 },
      ], route);
      expect(r.dataCheck.reasons).toEqual(["api_data_failure"]);
      expect(counted(r)).toEqual([expect.objectContaining({ method: "GET", path: "/bff/approvals", status: 403, reason: "http_status", honestNotFound: false })]);
      expect(r.failedReads).toContainEqual(expect.objectContaining({ path: f.api, status: 404, honestNotFound: true, counted: false }));
      expect(r.failedReads).toContainEqual(expect.objectContaining({ path: "/bff/events/stream", status: 409, streamRule: "stream_replay_resync", counted: false }));
    });
  }
});

describe("failed-read detail per non-ok route", () => {
  const stg = "/management/strategies/stg_001";
  const stgRoute = { path: stg, kind: "detail-or-alias", entity: "strategies" };

  it("live-id detail returning 404 still fails and names the 404 as not an honest not-found", async () => {
    const r = await crawlReads(stg, "找不到策略 stg_001。", [{ endpoint: "/bff/strategies/stg_001", status: 404 }], stgRoute, "live-id:strategies");
    expect(r.dataCheck.pass).toBe(false);
    expect(counted(r)).toEqual([expect.objectContaining({ path: "/bff/strategies/stg_001", status: 404, honestNotFound: false, counted: true })]);
  });

  it("a 503 read fails and is named with method, path, status and elapsed ms", async () => {
    const p = "/management/persona-fleet";
    const r = await crawlReads(p, "Persona fleet overview with finite content", [
      { endpoint: "/bff/management/persona-fleet", status: 503 },
    ], { path: p, kind: "nav" });
    expect(r.dataCheck.reasons).toContain("api_data_failure");
    expect(counted(r)).toEqual([{
      method: "GET", path: "/bff/management/persona-fleet", status: 503, error: null, elapsedMs: expect.any(Number),
      pending: false, reason: "http_status", honestNotFound: false, streamRule: null, counted: true,
    }]);
  });

  it("a fixture id whose page shows an error still fails, even with an honest 404", async () => {
    const r = await crawlReads(stg, "載入失敗\n找不到策略 stg_001。", [{ endpoint: "/bff/strategies/stg_001", status: 404 }], stgRoute);
    expect(r.dataCheck.reasons).toContain("rendered_data_error");
    expect(r.status).toBe("datafail");
  });

  it("a fixture id whose page is blank still fails", async () => {
    const r = await crawlReads(stg, "", [{ endpoint: "/bff/strategies/stg_001", status: 404 }], stgRoute);
    expect(r.dataCheck.pass).toBe(false);
    expect(r.dataCheck.reasons).toContain("content_incomplete");
  });

  it("records the network error of a failed data read and strips query values", async () => {
    const p = "/management/strategies";
    const r = await crawlReads(p, "Strategy list with finite visible content", [
      { endpoint: "/bff/strategies?exclude_state=draft&page_size=1&access_token=secret", networkError: "net::ERR_CONNECTION_RESET" },
    ], { path: p, kind: "nav" });
    expect(r.dataCheck.reasons).toContain("data_reads_incomplete");
    expect(counted(r)).toEqual([expect.objectContaining({
      path: "/bff/strategies?exclude_state=&page_size=&access_token=", status: null,
      error: "net::ERR_CONNECTION_RESET", reason: "network_error",
    })]);
    expect(JSON.stringify(r.failedReads)).not.toMatch(/secret|draft|Bearer|cookie/i);
  });

  it("names a 2xx data read whose body is an error as invalid_body, without the body", async () => {
    const p = "/management/strategies";
    const r = await crawlReads(p, "Strategy list with finite visible content", [
      { endpoint: "/bff/strategies", status: 200, body: { error: "upstream_secret_detail" } },
    ], { path: p, kind: "nav" });
    expect(counted(r)).toEqual([expect.objectContaining({ path: "/bff/strategies", status: 200, reason: "invalid_body" })]);
    expect(JSON.stringify(r.failedReads)).not.toContain("upstream_secret_detail");
  });

  it("ok routes record no failed reads", async () => {
    const p = "/management/strategies";
    const r = await crawlReads(p, "Strategy list with finite visible content", [{ endpoint: "/bff/strategies" }], { path: p, kind: "nav" });
    expect(r.status).toBe("ok");
    expect(r.failedReads).toEqual([]);
    expect(r.failedReadsOmitted).toBe(0);
  });
});

describe("explicit stream endpoint rule", () => {
  const h = crawlHarness();
  it("excuses only GET /bff/events/stream 409 (replay_unavailable resync)", () => {
    expect(h.streamResponseRule("GET", "/bff/events/stream", 409)).toBe("stream_replay_resync");
    for (const status of [401, 403, 500, 503]) expect(h.streamResponseRule("GET", "/bff/events/stream", status)).toBeNull();
    expect(h.streamResponseRule("POST", "/bff/events/stream", 409)).toBeNull();
    expect(h.streamResponseRule("GET", "/bff/strategies", 409)).toBeNull();
    expect(h.streamResponseRule("GET", "/bff/events", 409)).toBeNull();
    expect(h.streamResponseRule("GET", "constructor", 409)).toBeNull();
  });

  it("a stream 503 or 403 still fails the route and is named", async () => {
    const p = "/management/strategies";
    for (const status of [503, 403]) {
      const r = await crawlReads(p, "Strategy list with finite visible content", [
        { endpoint: "/bff/strategies" }, { endpoint: "/bff/events/stream", status },
      ], { path: p, kind: "nav" });
      expect(r.dataCheck.reasons).toEqual(["api_data_failure"]);
      expect(counted(r)).toEqual([expect.objectContaining({ path: "/bff/events/stream", status, streamRule: null })]);
    }
  });

  it("a 409 on a non-stream read still fails", async () => {
    const p = "/management/strategies";
    const r = await crawlReads(p, "Strategy list with finite visible content", [
      { endpoint: "/bff/strategies" }, { endpoint: "/bff/approvals", status: 409 },
    ], { path: p, kind: "nav" });
    expect(r.dataCheck.reasons).toEqual(["api_data_failure"]);
  });
});

describe("failed-read detail size bounds", () => {
  const h = crawlHarness();
  const entry = (i: number, status = 500) => ({
    entry: { method: "GET", url: `${BFF}/bff/r${i}?q=${i}`, status, startedAtMs: 0, responseAtMs: 5, failedAtMs: null, failure: null },
    isDataRead: true, read: { complete: true, valid: false },
  });

  it("caps each route at FAILED_READ_CAP_PER_ROUTE, counted failures first", () => {
    expect(h.FAILED_READ_CAP_PER_ROUTE).toBe(12);
    const inputs = [entry(0, 404), ...Array.from({ length: 20 }, (_, i) => entry(i + 1))];
    const detail = h.failedReadDetail(inputs, { honestNotFound: true, atMs: 10 });
    expect(detail.reads).toHaveLength(12);
    expect(detail.omitted).toBe(9);
    expect(detail.reads.every((r) => r.counted)).toBe(true);
    expect(detail.reads[0].path).toBe("/bff/r1?q=");
  });

  it("caps the run at FAILED_READ_CAP_PER_RUN and reports omitted entries", () => {
    expect(h.FAILED_READ_CAP_PER_RUN).toBe(300);
    const read = { method: "GET", path: "/bff/x", status: 500, counted: true };
    const routes = Array.from({ length: 30 }, () => ({ failedReads: Array(12).fill(read), failedReadsOmitted: 1 }));
    const summary = h.capFailedReadsPerRun(routes);
    expect(summary).toEqual({ capPerRoute: 12, capPerRun: 300, recorded: 300, omitted: 30 + 60 });
    expect(routes.reduce((n, r) => n + r.failedReads.length, 0)).toBe(300);
    expect(routes[25].failedReads).toHaveLength(0);
    expect(routes[25].failedReadsOmitted).toBe(13);
  });

  it("sanitizes paths: query values removed, unparseable urls masked", () => {
    expect(h.sanitizeReadPath(`${BFF}/bff/a?x=1&x=2&y=secret`)).toBe("/bff/a?x=&y=");
    expect(h.sanitizeReadPath("not a url")).toBe("(unparseable)");
  });
});
