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
function crawlHarness() {
  return runInNewContext(`${source
    .replace(/^#![^\n]*\n/, "")
    .replace(/^import[\s\S]*?from "[^"]+";\n/gm, "")
    .replace(/\nmain\(\);\s*$/, "")}
    ({ crawlRoute });`, {
    process: { argv: ["node", "offline"], env: { PANTHEON_FE_BASE_URL: FE, PANTHEON_ACCEPT_SETTLE_TIMEOUT_MS: "2" } },
    URL, URLSearchParams, Date, Object,
    BASELINE_ROUTES, expectedCanonicalPath, ENTITY_LIST_ENDPOINTS,
    normalizeOptionalBearerToken: () => "",
  }) as { crawlRoute: (page: unknown, route: object, opts: object) => Promise<{ dataCheck: { pass: boolean; reasons: string[] } }> };
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
