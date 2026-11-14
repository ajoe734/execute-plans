import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { runInNewContext } from "node:vm";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { BASELINE_ROUTES, expectedCanonicalPath, ENTITY_LIST_ENDPOINTS } from "../../scripts/lib/management-routes.mjs";
import { LEGACY_REDIRECTS, resolveLegacyRedirect } from "../management/navigation/managementRouteManifest";

// Vitest already compiles TS; avoid invoking esbuild inside jsdom's separate
// typed-array realm. The bare-node subprocess test covers the real tsx loader.
vi.mock("tsx/esm/api", () => ({ tsImport: async () => import("../management/navigation/managementRouteManifest") }));

const source = readFileSync("scripts/accept-management-hosted-production.mjs", "utf8");
const bff = "https://api.dev.mvl-cap.tw";
// Run the maintained crawl function without invoking the CLI or hosted I/O.
function harness(feBase = "http://127.0.0.1:4173", settle = "2", bffBase?: string) {
  return runInNewContext(`${source
    .replace(/^#![^\n]*\n/, "")
    .replace(/^import[\s\S]*?from "[^"]+";\n/gm, "")
    .replace(/\nmain\(\);\s*$/, "")}
    ({ crawlRoute, requestTimingReport, NO_ROUTE_DATA_READS, ROUTE_TIMEOUT_MS, SETTLE_TIMEOUT_MS });`, {
    process: { argv: ["node", "offline"], env: {
      PANTHEON_FE_BASE_URL: feBase, PANTHEON_ACCEPT_SETTLE_TIMEOUT_MS: settle,
      ...(bffBase ? { PANTHEON_BFF_BASE_URL: bffBase } : {}),
    } },
    URL, URLSearchParams, Date, Object,
    BASELINE_ROUTES, expectedCanonicalPath, ENTITY_LIST_ENDPOINTS,
    normalizeOptionalBearerToken: () => "",
  });
}

function request(page: EventEmitter & { mainFrame: () => object }, url: string, navigation = false) {
  return {
    url: () => url, method: () => "GET", frame: () => page.mainFrame(),
    isNavigationRequest: () => navigation,
    timing: () => ({ startTime: Date.now() }), failure: () => ({ errorText: "net::ERR_ABORTED" }),
  };
}
function response(req: ReturnType<typeof request>, status = 200, body: unknown = { items: [] }) {
  return { request: () => req, url: req.url, status: () => status, json: async () => body };
}
function pageFor(path: string, content = "Finite route content is ready and visible") {
  const frame = {};
  return Object.assign(new EventEmitter(), {
    mainFrame: () => frame,
    waitForTimeout: async () => {},
    evaluate: async () => ({
      path, finalUrl: path, body: content, content, busy: false, login: false,
      buttons: 0, enabledButtons: 0, disabledButtons: 0,
    }),
  });
}
function commit(page: ReturnType<typeof pageFor>, path: string) {
  page.emit("request", request(page, `http://127.0.0.1:4173${path}`, true));
  page.emit("framenavigated", page.mainFrame());
}
function completedRead(page: ReturnType<typeof pageFor>, endpoint = "/bff/current", status = 200, body?: unknown) {
  const req = request(page, `${bff}${endpoint}`);
  page.emit("request", req);
  page.emit("response", response(req, status, body));
  page.emit("requestfinished", req);
  return req;
}
async function crawl(path: string, events: (page: ReturnType<typeof pageFor>) => void, options = {}) {
  const page = pageFor(path);
  const result = await harness().crawlRoute(page, { path, kind: "nav", ...options }, {
    source: "baseline-or-live-nav",
    transport: { navigate: async () => { commit(page, path); events(page); return null; } },
  });
  return { result, page };
}

describe("crawl document attribution and request diagnostics", () => {
  it("excludes successful/error/aborted old-document requests before commit and late prior responses", async () => {
    const path = "/management/performance";
    const page = pageFor(path);
    const alreadyInFlight = request(page, `${bff}/bff/prior-route`);
    const result = await harness().crawlRoute(page, { path, kind: "nav" }, {
      source: "baseline-or-live-nav",
      transport: { navigate: async () => {
        // Before navigation starts, and while the replacement is pending.
        completedRead(page, "/bff/before-navigation", 503);
        page.emit("request", request(page, `http://127.0.0.1:4173${path}`, true));
        completedRead(page, "/bff/old-document", 500);
        const aborted = request(page, `${bff}/bff/old-abort`);
        page.emit("request", aborted);
        page.emit("framenavigated", page.mainFrame());
        page.emit("requestfailed", aborted);
        page.emit("response", response(alreadyInFlight, 503));
        completedRead(page);
        // Same-document alias redirects must keep the committed document's reads.
        page.emit("framenavigated", page.mainFrame());
        return null;
      } },
    });
    expect(result.status).toBe("ok");
    expect(result.bffRequestCount).toBe(1);
    expect(result.bffResponseCount).toBe(1);
    expect(result.bffFailedCount).toBe(0);
    expect(result.dataCheck.reads).toHaveLength(1);
    expect(result.bffRequests).toHaveLength(4);
    expect(result.bffRequests.filter((r: { attributed: boolean }) => !r.attributed)).toHaveLength(3);
    expect(result.bffRequests.find((r: { url: string }) => r.url.endsWith("old-abort"))).toMatchObject({
      attributed: false, failedAtMs: expect.any(Number), failure: "net::ERR_ABORTED",
    });
    expect(page.eventNames()).toEqual([]);
  });

  it("retains the current document's successful read and its start/response/finish times", async () => {
    const { result } = await crawl("/management/performance", (page) => { completedRead(page); });
    expect(result.dataCheck.pass).toBe(true);
    expect(result.bffRequests[0]).toMatchObject({
      attributed: true, startedAtMs: expect.any(Number), observedAtMs: expect.any(Number),
      responseAtMs: expect.any(Number), finishedAtMs: expect.any(Number),
      failedAtMs: null, status: 200, failure: null,
    });
    expect(result.bffRequests[0].responseAtMs).toBeGreaterThanOrEqual(result.bffRequests[0].startedAtMs);
    expect(result.timing.navigationAttempts[0].committedAtMs).toEqual(expect.any(Number));
  });

  it("keeps current-document aborts failing even when another data read completed", async () => {
    const { result } = await crawl("/management/persona-intent", (page) => {
      completedRead(page);
      const req = request(page, `${bff}/bff/aborted`);
      page.emit("request", req);
      page.emit("requestfailed", req);
    });
    expect(result.status).toBe("datafail");
    expect(result.dataCheck.reasons).toContain("data_reads_incomplete");
    expect(result.bffFailedCount).toBe(1);
    expect(result.bffRequests[1]).toMatchObject({
      attributed: true, startedAtMs: expect.any(Number), responseAtMs: null,
      failedAtMs: expect.any(Number), failure: "net::ERR_ABORTED",
    });
  });

  it("serializes every failing request and all timing fields into JSON and Markdown without truncation", async () => {
    const { result } = await crawl("/management/performance", (page) => {
      for (let index = 0; index < 12; index += 1) {
        const req = request(page, `${bff}/bff/failure-${index}`);
        page.emit("request", req);
        page.emit("requestfailed", req);
      }
    });
    const json = JSON.parse(JSON.stringify(result));
    expect(json.status).toBe("datafail");
    expect(json.bffRequests).toHaveLength(12);
    const markdown = harness().requestTimingReport([result]).join("\n");
    for (const entry of json.bffRequests) {
      expect(entry).toMatchObject({
        startedAtMs: expect.any(Number), responseAtMs: null, failedAtMs: expect.any(Number),
      });
      expect(markdown).toContain(`GET ${new URL(entry.url).pathname}`);
      expect(markdown).toContain(`| ${entry.startedAtMs} | null | null | ${entry.failedAtMs} |`);
    }
    expect(markdown).toContain("Failure time");
    expect(markdown).toContain("(datafail)");
  });

  it("keeps a response-body failure failing with response and failure times", async () => {
    const { result } = await crawl("/management/performance", (page) => {
      const req = request(page, `${bff}/bff/broken-body`);
      page.emit("request", req);
      page.emit("response", { ...response(req), json: async () => { throw new Error("body interrupted"); } });
      page.emit("requestfailed", req);
    });
    expect(result.dataCheck.reasons).toContain("api_data_failure");
    expect(result.bffRequests[0]).toMatchObject({
      responseAtMs: expect.any(Number), failedAtMs: expect.any(Number), status: 200,
    });
  });

  it("keeps incomplete response bodies failing within the existing settle budget", async () => {
    const { result } = await crawl("/management/performance", (page) => {
      const req = request(page, `${bff}/bff/pending-body`);
      page.emit("request", req);
      page.emit("response", { ...response(req), json: () => new Promise(() => {}) });
    });
    expect(result.dataCheck.reasons).toContain("data_reads_incomplete");
    expect(result.bffRequests[0]).toMatchObject({ responseAtMs: expect.any(Number), finishedAtMs: null });
  });

  it("does not reuse reads when a second full document replaces the first", async () => {
    const path = "/management/performance";
    const { result } = await crawl(path, (page) => {
      completedRead(page);
      commit(page, path);
    });
    expect(result.dataCheck.reasons).toContain("no_completed_route_data");
    expect(result.bffRequests[0]).toMatchObject({ attributed: false, exclusionReason: "replaced_document" });
  });

  it("does not let another frame's data satisfy the route document", async () => {
    const { result } = await crawl("/management/performance", (page) => {
      const req = { ...request(page, `${bff}/bff/other-frame`), frame: () => ({}) };
      page.emit("request", req);
      page.emit("response", response(req));
    });
    expect(result.dataCheck.reasons).toContain("no_completed_route_data");
    expect(result.bffRequests[0].attributed).toBe(false);
  });

  it("requires fresh document reads after a navigation retry", async () => {
    const path = "/management/performance";
    const page = pageFor(path);
    let attempts = 0;
    const result = await harness().crawlRoute(page, { path }, {
      source: "baseline-or-live-nav",
      transport: { navigate: async () => {
        commit(page, path);
        if (++attempts === 1) { completedRead(page); return new Error("first navigation failed"); }
        return null;
      } },
    });
    expect(result.dataCheck.reasons).toContain("no_completed_route_data");
    expect(result.bffRequestCount).toBe(0);
    expect(result.bffRequests[0].attempt).toBe(1);
    expect(result.bffRequests[0].attributed).toBe(false);
    expect(result.bffRequests[0].exclusionReason).toBe("superseded_navigation_attempt");
    expect(result.timing.navigationAttempts).toHaveLength(2);
  });

  it.each(["nav", "live-id-detail", "detail-or-alias"])("allows 404 only for an honest historical fixture detail (%s)", async (kind) => {
    const path = "/management/strategies/fixture-id";
    const page = pageFor(path, "The requested strategy was not found in the registry");
    const result = await harness().crawlRoute(page, { path, kind }, {
      source: kind === "live-id-detail" ? "live-id:strategies" : "baseline-or-live-nav",
      transport: { navigate: async () => { commit(page, path); completedRead(page, "/bff/strategies/fixture-id", 404); return null; } },
    });
    expect(result.dataCheck.pass).toBe(kind === "detail-or-alias");
  });

  it("does not credit a valid unrelated read as live entity detail data", async () => {
    const { result } = await crawl("/management/strategies/live-id", (page) => { completedRead(page); }, { entity: "strategies", kind: "live-id-detail" });
    expect(result.dataCheck.reasons).toContain("entity_detail_data_missing");
  });

  it("rejects a historical fixture 404 without an honest not-found render", async () => {
    const { result } = await crawl("/management/strategies/fixture", (page) => {
      completedRead(page, "/bff/strategies/fixture", 404);
    }, { kind: "detail-or-alias" });
    expect(result.dataCheck.reasons).toContain("api_data_failure");
  });

  it("preserves route and settle defaults", () => {
    const defaults = runInNewContext(source
      .slice(source.indexOf("const ROUTE_TIMEOUT_MS"), source.indexOf("const CLICK_WRITE_CTAS")) +
      "({ ROUTE_TIMEOUT_MS, SETTLE_TIMEOUT_MS })", { process: { env: {} } });
    expect(defaults).toEqual({ ROUTE_TIMEOUT_MS: 20_000, SETTLE_TIMEOUT_MS: 4_000 });
  });
});

describe("explicit no-data route policy", () => {
  it("lists only settings, with a reason, while all other baseline routes require data", async () => {
    expect(Object.keys(harness().NO_ROUTE_DATA_READS)).toEqual(["/management/settings"]);
    for (const path of new Set<string>(BASELINE_ROUTES.map((r: { path: string }) => r.path.split("?")[0]))) {
      const { result } = await crawl(path, () => {});
      expect(result.dataCheck.reasons.includes("no_completed_route_data"), path).toBe(path !== "/management/settings");
    }
    const { result } = await crawl("/management/settings", () => {});
    expect(result.status).toBe("ok");
    expect(result.dataCheck.noDataReadReason).toMatch(/preferences/);
    expect((await crawl("/management/settings/unknown", () => {})).result.dataCheck.pass).toBe(false);
  });

  it("does not exempt settings from failures in reads it actually issues", async () => {
    const { result } = await crawl("/management/settings", (page) => { completedRead(page, "/bff/error", 500); });
    expect(result.dataCheck.pass).toBe(false);
    expect(result.dataCheck.reasons).toContain("api_data_failure");
  });
});

describe("manifest-derived canonical paths", () => {
  it("matches the frontend for every baseline manifest alias, including capital-live", () => {
    const samples = [...BASELINE_ROUTES.map((r: { path: string }) => r.path),
      "/management/promotion-allocation",
      "/management/capital-live", "/management/readiness/capital-binding-live"];
    for (const path of samples) {
      const url = new URL(path, "http://local");
      const frontend = resolveLegacyRedirect(url.pathname, url.search);
      if (frontend) expect(expectedCanonicalPath(url.pathname, url.search), path).toBe(frontend.pathname);
    }
    for (const path of ["/management/capital-live", "/management/readiness/capital-binding-live"]) {
      expect(expectedCanonicalPath(path)).toBe("/management/governance-decisions");
    }
    for (const rule of LEGACY_REDIRECTS) {
      expect(samples.some((sample) => rule.match.test(sample.split("?")[0])), rule.id).toBe(true);
    }
  });

  it.each(["real-ranking", "paper-candidates", "quarterly-capital", "formula-policy"])("uses manifest query-sensitive promotion alias %s", (tab) => {
    expect(expectedCanonicalPath("/management/promotion-allocation", `?tab=${tab}`))
      .toBe(resolveLegacyRedirect("/management/promotion-allocation", `?tab=${tab}`)?.pathname);
  });

  it("loads the actual TypeScript manifest in the bare-node CLI runtime", () => {
    expect(execFileSync(process.execPath, ["--input-type=module", "-e",
      'import {expectedCanonicalPath as p} from "./scripts/lib/management-routes.mjs"; console.log(p("/management/capital-live"));',
    ], { encoding: "utf8", timeout: 15_000 }).trim()).toBe("/management/governance-decisions");
  });
});

it("attributes Chromium's inline new-document reads and excludes old reads while navigation is pending", async () => {
  const server = createServer((req, res) => {
    const old = req.url === "/old";
    const send = () => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<main>Finite route content is ready and visible</main><script>
        ${old ? `setInterval(() => fetch('${bff}/bff/old').catch(() => {}), 5);` : `fetch('${bff}/bff/current');`}
      </script>`);
    };
    if (old) send(); else setTimeout(send, 120);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const fe = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route(`${bff}/**`, (route) => route.fulfill({
      status: route.request().url().endsWith("/old") ? 503 : 200,
      contentType: "application/json", body: '{"items":[]}',
      headers: { "Access-Control-Allow-Origin": "*" },
    }));
    await page.goto(`${fe}/old`);
    const result = await harness(fe, "1000").crawlRoute(page, { path: "/management/performance" }, {
      source: "baseline-or-live-nav",
      transport: { navigate: async (_page: unknown, target: string) => {
        await page.goto(target, { waitUntil: "commit" });
        await page.waitForLoadState("domcontentloaded");
        return null;
      } },
    });
    expect(result.status, JSON.stringify(result)).toBe("ok");
    expect(result.bffRequests.some((r: { attributed: boolean; url: string }) => !r.attributed && r.url.endsWith("/old"))).toBe(true);
    expect(result.bffRequests.filter((r: { attributed: boolean }) => r.attributed)).toHaveLength(1);
    expect(result.dataCheck.reads[0].path).toBe("/bff/current");
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}, 15_000);

describe("canonical /api/v1 read attribution through the production crawl", () => {
  const rec = (id: string) => ({ postmortem_id: id, title: `Postmortem ${id}`, status: "published", action_items: [] });
  const list = { items: [rec("pm-1"), rec("pm-2")], page_info: { has_more: false }, meta: { surfaces: { postmortems: { status: "ok" } } } };
  const detail = { data: rec("pm-1"), meta: { surfaces: { postmortems: { status: "ok" } } } };
  type Spec = { status?: number; body?: string; stream?: boolean };
  type Out = { result: any; rendered: string };
  const listen = (server: ReturnType<typeof createServer>) =>
    new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
  const close = (server: ReturnType<typeof createServer>) =>
    new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });

  // A real local BFF and real FE origin; Chromium issues the actual fetches and
  // the page renders the parsed response before the production crawl settles.
  async function run(opts: {
    script: (bffOrigin: string) => string; bff: (path: string) => Spec;
    settle?: string; old?: boolean; bffOriginOverride?: (real: string) => string;
  }): Promise<Out> {
    const bffServer = createServer((req, res) => {
      const spec = opts.bff(new URL(req.url!, "http://x").pathname);
      const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
      if (spec.stream) { res.writeHead(200, cors); res.write('{"items":['); return; } // headers + partial body, never ends
      res.writeHead(spec.status ?? 200, cors); res.end(spec.body ?? "{}");
    });
    const bffPort = await listen(bffServer);
    const bffOrigin = `http://127.0.0.1:${bffPort}`;
    const feServer = createServer((req, res) => {
      const isOld = req.url === "/old";
      const send = () => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(isOld
          ? `<main>Old finite route content here</main><script>setInterval(()=>fetch('${bffOrigin}/api/v1/postmortems').catch(()=>{}),5)</script>`
          : `<main id="m">Finite route content is ready and visible</main><script>${opts.script(opts.bffOriginOverride?.(bffOrigin) ?? bffOrigin)}</script>`);
      };
      if (!isOld && opts.old) setTimeout(send, 120); else send();
    });
    const fe = `http://127.0.0.1:${await listen(feServer)}`;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      if (opts.old) await page.goto(`${fe}/old`);
      const result = await harness(fe, opts.settle ?? "1500", bffOrigin).crawlRoute(page, { path: "/management/postmortems" }, {
        source: "baseline-or-live-nav",
        transport: { navigate: async (_p: unknown, target: string) => { await page.goto(target, { waitUntil: "commit" }); await page.waitForLoadState("domcontentloaded"); return null; } },
      });
      const rendered = await page.evaluate(() => document.querySelector("main")?.textContent ?? "").catch(() => "");
      return { result, rendered };
    } finally {
      await browser.close();
      await Promise.all([close(bffServer), close(feServer)]);
    }
  }
  const render = (o: string, path: string, pick = "d.items.map(i=>i.postmortem_id+' '+i.title).join(';')") =>
    `fetch('${o}${path}').then(r=>r.json()).then(d=>{document.getElementById('m').textContent='Rendered: '+(${pick})})`;
  const good = (path: string): Spec =>
    path === "/api/v1/postmortems/pm-1" ? { body: JSON.stringify(detail) } : { body: JSON.stringify(list) };

  it("counts a completed200 canonical list read with real record shape and rendered data", async () => {
    const { result, rendered } = await run({ script: (o) => render(o, "/api/v1/postmortems?page_size=50"), bff: good });
    expect(result.status, JSON.stringify(result.dataCheck)).toBe("ok");
    expect(result.dataCheck.reads[0]).toMatchObject({ path: "/api/v1/postmortems", status: 200, complete: true, valid: true });
    expect(rendered).toContain("pm-1 Postmortem pm-1;pm-2 Postmortem pm-2");
  }, 20_000);

  it("counts a canonical detail read (data envelope) together with a BFF read", async () => {
    const { result, rendered } = await run({
      script: (o) => `fetch('${o}/bff/me');` + render(o, "/api/v1/postmortems/pm-1", "d.data.postmortem_id+' '+d.data.title"),
      bff: good,
    });
    expect(result.status, JSON.stringify(result.dataCheck)).toBe("ok");
    expect(result.dataCheck.reads.map((r: { path: string }) => r.path)).toEqual(["/api/v1/postmortems/pm-1"]);
    expect(rendered).toContain("pm-1 Postmortem pm-1");
  }, 20_000);

  it("does not credit a wrong-origin canonical read or a same-origin static URL", async () => {
    const { result } = await run({
      script: (o) => `fetch('http://localhost:${new URL(o).port}/api/v1/postmortems').catch(()=>{});fetch('${o}/assets/data.json');fetch('${o}/api/v2/postmortems')`,
      bff: good, settle: "700",
    });
    expect(result.dataCheck.reasons).toContain("no_completed_route_data");
    expect(result.status).toBe("datafail");
  }, 20_000);

  it("does not let an old-document canonical read satisfy readiness (real Chromium navigation)", async () => {
    const { result } = await run({ script: () => "", bff: good, old: true, settle: "700" });
    expect(result.bffRequests.some((r: { attributed: boolean; url: string }) => !r.attributed && r.url.includes("/api/v1/postmortems"))).toBe(true);
    expect(result.dataCheck.reasons).toContain("no_completed_route_data");
    expect(result.status).toBe("datafail");
  }, 20_000);

  it("keeps a canonical read whose headers arrived but finite body never completes failing", async () => {
    const { result } = await run({ script: (o) => render(o, "/api/v1/postmortems"), bff: () => ({ stream: true }), settle: "700" });
    expect(result.dataCheck.reads[0]).toMatchObject({ status: 200, valid: false });
    expect(result.dataCheck.reasons).toContain("no_completed_route_data");
    expect(result.status).toBe("datafail");
  }, 20_000);

  it("retains an incomplete required canonical read beside a completed successful read", async () => {
    const { result } = await run({
      script: (o) => `fetch('${o}/api/v1/postmortems').then(r=>r.json());fetch('${o}/api/v1/postmortems/pm-1');`,
      bff: (p) => p === "/api/v1/postmortems/pm-1" ? { stream: true } : good(p), settle: "700",
    });
    expect(result.dataCheck.reads.some((r: { complete: boolean; valid: boolean }) => r.complete && r.valid)).toBe(true);
    expect(result.dataCheck.reasons).toContain("data_reads_incomplete");
    expect(result.status).toBe("datafail");
  }, 20_000);

  it("retains a failed canonical read beside a completed successful read", async () => {
    const { result } = await run({
      script: (o) => `fetch('${o}/api/v1/postmortems').then(r=>r.json());fetch('${o}/api/v1/postmortems/pm-1');`,
      bff: (p) => p === "/api/v1/postmortems/pm-1" ? { status: 500, body: '{"error":"boom"}' } : good(p), settle: "700",
    });
    expect(result.dataCheck.reasons).toContain("api_data_failure");
    expect(result.status).toBe("datafail");
  }, 20_000);

  it("keeps invalid JSON, error bodies and HTTP 500 canonical reads failing", async () => {
    for (const spec of [{ body: "not json" }, { body: '{"error":"x"}' }, { status: 500, body: "{}" }] as Spec[]) {
      const { result } = await run({ script: (o) => `fetch('${o}/api/v1/postmortems')`, bff: () => spec, settle: "700" });
      expect(result.status, JSON.stringify(spec)).toBe("datafail");
    }
  }, 40_000);

  it("excludes canonical stream/events paths from data reads", async () => {
    const { result } = await run({ script: (o) => `fetch('${o}/api/v1/postmortems/events')`, bff: good, settle: "700" });
    expect(result.dataCheck.reasons).toContain("no_completed_route_data");
  }, 20_000);
});

describe("opaque entity detail id identity through the production crawl (real Chromium)", () => {
  type Spec = { status?: number; body?: string; stream?: boolean };
  const listen = (server: ReturnType<typeof createServer>) =>
    new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
  const close = (server: ReturnType<typeof createServer>) =>
    new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });

  // routeSegment is the FE URL segment; fetchPath(o) is the exact API URL the page requests.
  async function detail(opts: {
    routeSegment: string; fetchUrl: (o: string, port: number) => string; spec?: Spec; old?: boolean; kind?: string; settle?: string;
  }) {
    const bffServer = createServer((req, res) => {
      const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
      const spec = opts.spec ?? {};
      if (spec.stream) { res.writeHead(200, cors); res.write('{"id":'); return; }
      res.writeHead(spec.status ?? 200, cors); res.end(spec.body ?? '{"id":"ok","name":"Strategy record"}');
    });
    const port = await listen(bffServer);
    const o = `http://127.0.0.1:${port}`;
    const feServer = createServer((req, res) => {
      const isOld = req.url === "/old";
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(isOld
        ? `<main>Old finite route content here</main><script>setInterval(()=>fetch('${opts.fetchUrl(o, port)}').catch(()=>{}),5)</script>`
        : `<main id="m">Finite route content is ready and visible</main><script>if(${!opts.old})fetch('${opts.fetchUrl(o, port)}').then(r=>r.json()).then(d=>{document.getElementById('m').textContent='Rendered: '+(d.name||'no record returned')},()=>{})</script>`);
    });
    const fe = `http://127.0.0.1:${await listen(feServer)}`;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      if (opts.old) await page.goto(`${fe}/old`);
      const kind = opts.kind ?? "live-id-detail";
      const result = await harness(fe, opts.settle ?? "1500", o).crawlRoute(page,
        { path: `/management/strategies/${opts.routeSegment}`, kind, entity: "strategies" }, {
          source: kind === "live-id-detail" ? "live-id:strategies" : "baseline-or-live-nav",
          transport: { navigate: async (_p: unknown, target: string) => { await page.goto(target, { waitUntil: "commit" }); await page.waitForLoadState("domcontentloaded"); return null; } },
        });
      const rendered = await page.evaluate(() => document.querySelector("main")?.textContent ?? "").catch(() => "");
      return { result, rendered };
    } finally {
      await browser.close();
      await Promise.all([close(bffServer), close(feServer)]);
    }
  }
  const api = (seg: string) => (o: string) => `${o}/bff/strategies/${seg}`;

  it.each([
    ["retained colon id (route raw, API encoded)", "strat:2026:abc", api("strat%3A2026%3Aabc")],
    ["colon id (route encoded, API encoded)", "strat%3A2026%3Aabc", api("strat%3A2026%3Aabc")],
    ["plain id control", "plain-id", api("plain-id")],
    ["encoded separator stays one segment", "a%2Fb", api("a%2Fb")],
    ["literal percent id", "100%25", api("100%25")],
  ])("passes: %s", async (_n, routeSegment, fetchUrl) => {
    const { result, rendered } = await detail({ routeSegment, fetchUrl });
    expect(result.status, JSON.stringify(result.dataCheck)).toBe("ok");
    expect(result.dataCheck.reasons).toEqual([]);
    expect(rendered).toContain("Rendered: Strategy record");
  }, 20_000);

  it.each([
    ["wrong id", "strat:2026:abc", api("strat%3A2026%3Aabd")],
    ["literal percent is not collapsed", "100%25", api("100%2525")],
    ["encoded separator is not a raw separator", "a%2Fb", api("a/b")],
    ["extra path segment", "strat:1", api("strat%3A1/child")],
    ["wrong-origin read", "plain-id", (_o: string, port: number) => `http://localhost:${port}/bff/strategies/plain-id`],
  ])("still fails: %s", async (_n, routeSegment, fetchUrl) => {
    const { result } = await detail({ routeSegment, fetchUrl, settle: "700" });
    expect(result.status).toBe("datafail");
    expect(result.dataCheck.reasons.some((r: string) => r === "entity_detail_data_missing" || r === "no_completed_route_data")).toBe(true);
  }, 20_000);

  it("does not let an old-document successful read satisfy the colon id", async () => {
    const { result } = await detail({ routeSegment: "strat:1", fetchUrl: (o) => `${o}/bff/strategies/strat%3A1`, old: true, settle: "700" });
    // The new document issues no read; the old document's reads are unattributed.
    expect(result.dataCheck.reasons).toContain("entity_detail_data_missing");
  }, 20_000);

  it.each([
    ["stream/noncomplete", { stream: true }],
    ["invalid JSON", { body: "not json" }],
    ["error body", { body: '{"error":"x"}' }],
    ["HTTP 500", { status: 500, body: "{}" }],
    ["live-id 404", { status: 404, body: '{"detail":"not found"}' }],
  ] as [string, Spec][])("keeps the colon id failing for %s", async (_n, spec) => {
    const { result } = await detail({ routeSegment: "strat:1", fetchUrl: api("strat%3A1"), spec, settle: "700" });
    expect(result.status).toBe("datafail");
  }, 20_000);
});
