/**
 * Regression tests for scripts/accept-persona-strategy-hosted-readonly.mjs.
 * Local loopback fixtures only: they prove CLI logic, NOT hosted behaviour.
 */
import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const cliUrl = pathToFileURL(path.resolve(process.cwd(), "scripts/accept-persona-strategy-hosted-readonly.mjs")).href;
let cli: any;
beforeAll(async () => {
  cli = await import(/* @vite-ignore */ cliUrl);
});

const SECRETS = { TEST_ADMIN: "s3cret-admin-value", OPERATOR_A: "s3cret-opa-value", OPERATOR_B: "s3cret-opb-value", VIEWER: "s3cret-viewer-value" } as const;
const NAMES = Object.keys(SECRETS) as (keyof typeof SECRETS)[];
const ROLES: Record<string, string[]> = { TEST_ADMIN: ["admin"], OPERATOR_A: ["operator"], OPERATOR_B: ["operator"], VIEWER: ["viewer"] };
const PERSONA = "persona-fixture-1";
const PAIR = { fe: "fe-sha-1", bff: "bff-sha-1", root: "4321", pair: "pair-1" };
const CONNECTORS = ["c-alpha", "c-beta"];

function sha(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function baselinePaths() {
  const paths = ["/bff/strategies?page_size=20", "/bff/strategies?hide_retired_personas=true&page_size=20", `/bff/strategies?page_size=20&persona_id=${PERSONA}`];
  for (let i = 1; i <= 9; i++) paths.push(`/bff/strategies?page=${i}&page_size=5`);
  return paths;
}
function strategyBody(p: string, mutate: boolean) {
  return { data: { items: [{ id: `s-${p.length}`, name: "stable", note: mutate && p === "/bff/strategies?page_size=20" ? "CHANGED" : "same" }] } };
}
function dataSourcesBody(mode: "legacy_projection" | "governed_owner") {
  return {
    data: { items: CONNECTORS.map((id) => ({ connector_id: id, health: "ok", ...(mode === "governed_owner" ? { allowed_actions: ["pause"] } : {}) })) },
    meta: mode === "legacy_projection" ? { status: "degraded", source: "legacy_projection", source_commands_enabled: false } : { status: "ok", source: "governed_owner", source_commands_enabled: true },
  };
}
function baselineFile() {
  const base: Record<string, unknown> = {};
  for (const p of baselinePaths()) base[p] = { s: 200, ms: 100, j: strategyBody(p, false) };
  base["/bff/management/data-sources"] = { s: 200, ms: 100, j: dataSourcesBody("legacy_projection") };
  return JSON.stringify(base);
}

type Opts = { mutate?: boolean; dsMode?: "legacy_projection" | "governed_owner"; wrongRoleFor?: string; writeOnDetail?: boolean; leakSecret?: boolean; slowFleetMs?: number; pairId?: string; detailError?: boolean; detailHttpError?: boolean; detailReqFail?: boolean };

function startFixture(opts: Opts = {}) {
  const sessions = new Map<string, string>();
  const receivedWrites: string[] = [];
  const dsMode = opts.dsMode ?? "legacy_projection";
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://x");
    const cookie = /sid=([a-f0-9]+)/.exec(req.headers.cookie || "")?.[1];
    const user = cookie ? sessions.get(cookie) : undefined;
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "x-request-id": `req-${Math.random().toString(16).slice(2)}` });
      res.end(JSON.stringify(body));
    };
    let body = "";
    for await (const chunk of req) body += chunk;
    if (url.pathname === "/deployment.json")
      return json(200, { deploymentState: "accepted", frontendSha: PAIR.fe, bffCommit: PAIR.bff, pairId: opts.pairId ?? PAIR.pair, releaseAdmission: { controller: { runId: PAIR.root } } });
    if (url.pathname === "/bff/version") return json(200, { source_commit_sha: PAIR.bff, config_posture: { auth_mode: "strict", auth_stub: false, mfa_required: false } });
    if (url.pathname === "/bff/auth/dev-login" && req.method === "POST") {
      const { client_id: id, client_secret: secret } = JSON.parse(body);
      if (SECRETS[id as keyof typeof SECRETS] !== secret) return json(401, { error: "bad" });
      const sid = crypto.randomBytes(8).toString("hex");
      sessions.set(sid, id);
      res.setHeader("set-cookie", `sid=${sid}; Path=/`);
      return json(200, { ok: true });
    }
    if (url.pathname === "/bff/logout" && req.method === "POST") {
      if (cookie) sessions.delete(cookie);
      return json(200, { ok: true });
    }
    if (req.method !== "GET") {
      receivedWrites.push(`${req.method} ${url.pathname}`);
      return json(200, { ok: true });
    }
    if (url.pathname === "/bff/me" || url.pathname === "/bff/readiness") {
      if (!user) return json(401, { error: "unauth" });
      if (url.pathname === "/bff/readiness") return json(200, {});
      const roles = opts.wrongRoleFor === user ? ["admin", "extra"] : ROLES[user];
      return json(200, { data: { user_id: `subject-${user}`, tenant_id: "tenant-x", roles } });
    }
    if (url.pathname.startsWith("/bff/")) {
      if (!user) return json(401, { error: "unauth" });
      if (url.pathname === "/bff/management/persona-fleet") {
        if (opts.slowFleetMs) await new Promise((r) => setTimeout(r, opts.slowFleetMs));
        return json(200, { data: { items: [{ persona_id: "p1", persona_purpose: "trading", data_scope: "regular", classification_confirmed: true, archived: false }], summary: { filters: { purpose: "trading", data_scope: "regular", archived: "exclude" } } } });
      }
      if (url.pathname === "/bff/management/portfolio-book/holdings") return json(200, { data: { items: [{ id: "h1" }] } });
      if (url.pathname === "/bff/nonexistent") return json(500, { error: "fixture-api-error" });
      if (url.pathname === "/bff/socketdrop") return void req.socket.destroy();
      if (url.pathname === "/bff/management/data-sources") return json(200, dataSourcesBody(dsMode));
      if (url.pathname.startsWith("/bff/personas/")) return json(200, { data: { id: PERSONA } });
      const key = url.pathname + url.search;
      if (url.pathname === "/bff/strategies") return json(200, { ...strategyBody(key, Boolean(opts.mutate)) });
    }
    if (url.pathname.startsWith("/management/")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(pageHtml(url, Boolean(user), opts));
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise<{ origin: string; close: () => Promise<void>; receivedWrites: string[] }>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ origin: `http://127.0.0.1:${port}`, receivedWrites, close: () => new Promise<void>((r) => server.close(() => r())) });
    }),
  );
}

function pageHtml(url: URL, loggedIn: boolean, opts: Opts) {
  if (!loggedIn) {
    return `<h2>Login</h2><input id="dev-account"><input id="dev-password" type="password">
<button onclick="fetch('/bff/me').catch(()=>{});fetch('/bff/auth/dev-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_id:document.getElementById('dev-account').value,client_secret:document.getElementById('dev-password').value})}).then(r=>r.ok&&location.reload())">Sign in</button>`;
  }
  const p = url.pathname;
  const leak = opts.leakSecret ? `setTimeout(()=>{throw new Error('leak ${SECRETS.TEST_ADMIN}')},0);` : "";
  const table = (id: string, readUrl: string, title: string, extra = "") => `<h1>${title}</h1>${extra}<div data-testid="${id}"><table><tbody></tbody></table></div>
<script>${leak}fetch('${readUrl}',{credentials:'include'}).then(r=>r.json()).then(j=>{const rows=(j.data.items||[]);document.querySelector('tbody').innerHTML=rows.map(x=>'<tr><td>'+(x.connector_id||x.persona_id||x.id)+'</td><td>cell</td></tr>').join('')||'<tr><td>none</td></tr>'});</script>`;
  if (p === "/management/persona-fleet") return table("persona-fleet-table-scroll", "/bff/management/persona-fleet?data=regular", "Persona Fleet");
  if (p === "/management/portfolio-book")
    // SPA-style client redirect (no full navigation), like the real app.
    return `<div id="app"><p>Loading</p></div><script>fetch('/bff/management/portfolio-book/holdings',{credentials:'include'}).then(r=>r.json()).then(j=>{history.replaceState(null,'','/management/performance?tab=overview');document.getElementById('app').innerHTML='<h1>Portfolio Holdings</h1><table><tbody>'+j.data.items.map(x=>'<tr><td>'+x.id+'</td></tr>').join('')+'</tbody></table>'})</script>`;
  if (p === "/management/performance") return table("holdings", "/bff/management/portfolio-book/holdings", "Portfolio Holdings");
  if (p === "/management/data-sources")
    return table("ds", "/bff/management/data-sources", "Data Sources", url.pathname && (opts.dsMode ?? "legacy_projection") === "legacy_projection" ? '<div data-testid="degraded-legacy-banner">degraded</div>' : '<button>More actions</button>');
  if (p.startsWith("/management/personas/"))
    return `${opts.detailError ? "<script>setTimeout(()=>{throw new Error('admin-detail-fixture-error')},0)</script>" : ""}${opts.detailHttpError ? "<script>fetch('/bff/nonexistent')</script>" : ""}${opts.detailReqFail ? "<script>fetch('/bff/socketdrop').catch(()=>{})</script>" : ""}${table("persona", "/bff/personas/" + PERSONA, "Persona " + PERSONA)}${opts.writeOnDetail ? "<script>fetch('/bff/strategies',{method:'POST',credentials:'include',body:'{}'}).catch(()=>{})</script>" : ""}`;
  if (p === "/management/strategies") return table("strategies", "/bff/strategies", "Strategies");
  return "<h1>Unknown</h1>";
}

function makeInput(origin: string, over: Record<string, unknown> = {}) {
  const raw = baselineFile();
  return {
    profiles: Object.fromEntries(NAMES.map((n) => [n, { client_id: n, client_secret: SECRETS[n] }])),
    identity: { DEV_FE_URL: origin, DEV_BFF_URL: origin },
    expected: {
      ...PAIR,
      tenant_id: "tenant-x",
      roles: ROLES,
      persona_id: PERSONA,
      source_owner_registry: { connector_ids: CONNECTORS, source_mode: "legacy_projection" },
    },
    baseline_raw: raw,
    baseline_identity: { sha256: sha(raw) },
    ...over,
  };
}

const tmp: string[] = [];
afterAll(() => tmp.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
async function execute(opts: Opts, mutateInput?: (i: ReturnType<typeof makeInput>) => void) {
  const fx = await startFixture(opts);
  const input = makeInput(fx.origin);
  mutateInput?.(input);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-test-"));
  tmp.push(outDir);
  try {
    const result = await cli.run(input, { chromium, outDir, isAllowedOrigin: (u: string) => u.startsWith("http://127.0.0.1:") });
    return { ...result, fx, outDir };
  } finally {
    await fx.close();
  }
}

describe("pure acceptance logic", () => {
  it("nearest-rank p95 uses ceil(0.95n) and median averages middle pair", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(cli.nearestRank(twenty, 0.95)).toBe(19); // rank 19, NOT the max
    expect(cli.nearestRank([5, 1, 3], 0.95)).toBe(5);
    expect(cli.median([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(5.5);
  });

  it("applies original thresholds with correct inclusivity", () => {
    expect(cli.evaluateFreshEntry(2000, 2500)).toBe(true);
    expect(cli.evaluateFreshEntry(2001, 100)).toBe(false);
    expect(cli.evaluateFreshEntry(100, 2501)).toBe(false);
    const ok = Array(19).fill(10).concat([5000]); // one outlier is rank 20, p95 = rank 19
    expect(cli.evaluateWarmFleet(ok).pass).toBe(true);
    const bad = Array(18).fill(10).concat([1001, 1001]);
    expect(cli.evaluateWarmFleet(bad).pass).toBe(false);
    expect(cli.evaluateWarmFleet(Array(19).fill(1)).pass).toBe(false); // sample count is part of the acceptance
    expect(cli.evaluateRepeatP50(Array(10).fill(1199)).pass).toBe(true);
    expect(cli.evaluateRepeatP50(Array(10).fill(1200)).pass).toBe(false); // strict <
    expect(cli.evaluateRepeatP50([1, 2, 3]).pass).toBe(false);
  });

  it("keeps every raw difference, including timestamps, and never blanket-ignores", () => {
    const d = cli.differences({ a: 1, t: "2026-01-01", n: { x: [1, 2] } }, { a: 1, t: "2026-01-02", n: { x: [1] } });
    expect(d.map((x: { path: string }) => x.path).sort()).toEqual(["/n/x/1", "/t"]);
    expect(cli.differences({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it("reconciles only exact documented pointers and keeps exact_equal false", () => {
    const diff = { "/p": [{ path: "/a", before: 1, after: 2 }, { path: "/b", before: 1, after: 2 }] };
    const r = cli.reconcileDifferences(diff, [
      { path: "/p", pointer: "/a", owner: "o", reason: "r", after: 2 },
      { path: "/p", pointer: "/b", owner: "o", reason: "r", after: 999 }, // after mismatch -> not reconciled
    ]);
    expect(r.exact_equal).toBe(false);
    expect(r.documented_reconciliations).toHaveLength(1);
    expect(r.unreconciled_difference_count).toBe(1);
    expect(r.unreconciled_differences[0].path).toBe("/b");
  });

  it("guards business writes but allows reads and the three auth writes", () => {
    expect(cli.classifyRequest("GET", "/bff/x")).toBe("allow");
    for (const p of ["/bff/auth/dev-login", "/bff/auth/refresh", "/bff/logout"]) expect(cli.classifyRequest("POST", p)).toBe("allow");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(cli.classifyRequest(m, "/bff/strategies")).toBe("block");
    expect(cli.classifyRequest("POST", "/bff/auth/other")).toBe("block");
  });

  it("classifies Fleet rows by typed fields, not names", () => {
    const row = { persona_id: "paper-test-looking", persona_purpose: "trading", data_scope: "regular", classification_confirmed: true, archived: false };
    const filters = { purpose: "trading", data_scope: "regular", archived: "exclude" };
    expect(cli.evaluateFleetClassification({ data: { items: [row], summary: { filters } } }).failures).toEqual([]);
    for (const bad of [{ persona_purpose: "advisory" }, { data_scope: "test" }, { classification_confirmed: false }, { archived: true }]) {
      expect(cli.evaluateFleetClassification({ data: { items: [{ ...row, ...bad }], summary: { filters } } }).failures.length).toBeGreaterThan(0);
    }
    expect(cli.evaluateFleetClassification({ data: { items: [], summary: { filters } } }).failures.length).toBeGreaterThan(0);
  });

  it("evaluates data sources for legacy fallback and genuine governed owner", () => {
    const legacy = { source_mode: "legacy_projection", connector_ids: CONNECTORS };
    expect(cli.evaluateDataSources(dataSourcesBody("legacy_projection"), legacy).failures).toEqual([]);
    expect(cli.evaluateDataSources(dataSourcesBody("governed_owner"), legacy).failures.length).toBeGreaterThan(0); // actions + wrong source
    const governed = { source_mode: "governed_owner", connector_ids: CONNECTORS, meta_source: "governed_owner" };
    expect(cli.evaluateDataSources(dataSourcesBody("governed_owner"), governed).failures).toEqual([]);
    expect(cli.evaluateDataSources(dataSourcesBody("legacy_projection"), governed).failures.length).toBeGreaterThan(0);
    const missing = { source_mode: "legacy_projection", connector_ids: [...CONNECTORS, "c-gamma"] };
    expect(cli.evaluateDataSources(dataSourcesBody("legacy_projection"), missing).failures.join()).toContain("exactly once");
    expect(cli.evaluateDataSources({ data: { items: [] }, meta: {} }, legacy).failures.join()).toContain("empty");
  });

  it("redacts JSON-escaped secrets (quote/backslash/control) in structured evidence", () => {
    const secret = 'a"b\\c\nd\te';
    const redact = cli.makeRedactor([secret]);
    const text = redact.json({ note: secret, [secret]: [secret], n: 1 }, 2);
    expect(text).not.toContain(secret);
    expect(text).not.toContain(JSON.stringify(secret).slice(1, -1));
    expect(JSON.parse(text).note).not.toBe(secret);
  });

  describe("aborted request accounting", () => {
    const mk = () => {
      const h: Record<string, Array<(x?: unknown) => void>> = {};
      let closed = false;
      const page = {
        on: (ev: string, fn: (x?: unknown) => void) => void (h[ev] ||= []).push(fn),
        isClosed: () => closed,
      };
      const ctx = { route: async () => {} };
      const row = { page_errors: [], failed_api_requests: [], cancelled_api_requests: [], http_api_errors: [], prelogin_expected_401: [] } as Record<string, unknown[]>;
      cli.observe(ctx, page, row, "https://api.test", { onBlockedWrite: () => {} });
      const emit = (ev: string, x?: unknown) => (h[ev] || []).forEach((f) => f(x));
      const req = { url: () => "https://api.test/bff/reviewer-abort", method: () => "GET", failure: () => ({ errorText: "net::ERR_ABORTED" }), frame: () => ({ isDetached: () => false, parentFrame: () => null }), isNavigationRequest: () => false };
      const navReq = { url: () => "https://web.test/next", method: () => "GET", frame: () => ({ parentFrame: () => null }), isNavigationRequest: () => true };
      return { row, emit, req, navReq, close: () => { closed = true; } };
    };
    it("treats a live abort on a still-present page as a failure", () => {
      const t = mk();
      t.emit("request", t.req);
      t.emit("requestfailed", t.req);
      expect(t.row.failed_api_requests).toHaveLength(1);
      expect(t.row.cancelled_api_requests).toHaveLength(0);
    });
    it("ignores same-document framenavigated events as cancellation evidence", () => {
      const t = mk();
      t.emit("request", t.req);
      t.emit("framenavigated", { parentFrame: () => null });
      t.emit("requestfailed", t.req);
      expect(t.row.failed_api_requests).toHaveLength(1);
      expect(t.row.cancelled_api_requests).toHaveLength(0);
    });
    it("accepts an abort caused by a real main-frame navigation (either event order)", () => {
      const a = mk();
      a.emit("request", a.req);
      a.emit("request", a.navReq);
      a.emit("requestfailed", a.req);
      expect(a.row.failed_api_requests).toHaveLength(0);
      expect(a.row.cancelled_api_requests).toHaveLength(1);
      const b = mk();
      b.emit("request", b.req);
      b.emit("requestfailed", b.req);
      b.emit("request", b.navReq);
      expect(b.row.failed_api_requests).toHaveLength(0);
      expect(b.row.cancelled_api_requests).toHaveLength(1);
    });
  });

  describe("real Chromium abort accounting", () => {
    const scenarios: Array<[string, string, number, number]> = [
      ["same-document pushState before live abort", "history.pushState({}, '', '/pushed'); await new Promise((r) => setTimeout(r, 400)); c.abort();", 1, 0],
      ["live abort without navigation", "await new Promise((r) => setTimeout(r, 400)); c.abort();", 1, 0],
      ["same-document pushState after live abort", "c.abort(); await new Promise((r) => setTimeout(r, 100)); history.pushState({}, '', '/pushed');", 1, 0],
      ["real document navigation cancels", "location.href = '/next';", 0, 1],
    ];
    for (const [name, script, failed, cancelled] of scenarios) {
      it(name, async () => {
        const server = http.createServer((req, res) => {
          if (req.url?.startsWith("/bff/slow")) return void setTimeout(() => { try { res.end("{}"); } catch { /* closed */ } }, 3000);
          res.setHeader("content-type", "text/html");
          res.end(req.url === "/next" ? "<p>next</p>" : `<script>const c = new AbortController(); fetch('/bff/slow', {signal: c.signal}).catch(() => {}); (async () => { await new Promise((r) => setTimeout(r, 150)); ${script} })();</script>`);
        });
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
        const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        const browser = await chromium.launch();
        try {
          const ctx = await browser.newContext();
          const page = await ctx.newPage();
          const row = { page_errors: [], failed_api_requests: [], cancelled_api_requests: [], http_api_errors: [], prelogin_expected_401: [] } as Record<string, unknown[]>;
          cli.observe(ctx, page, row, origin, { onBlockedWrite: () => {} });
          await page.goto(origin + "/");
          await page.waitForTimeout(1200);
          expect(row.failed_api_requests).toHaveLength(failed);
          expect(row.cancelled_api_requests).toHaveLength(cancelled);
        } finally {
          await browser.close();
          server.close();
        }
      }, 30000);
    }
  });

  it("redacts configured secrets and JWT/bearer shapes", () => {
    const redact = cli.makeRedactor(["topsecret"]);
    const jwt = "eyJhbGciOi.eyJzdWIiOjF9.sig-nature_1";
    const out = redact(`x topsecret ${jwt} Bearer abcdefghijkl`);
    expect(out).not.toMatch(/topsecret|eyJ|abcdefghijkl/);
  });

  it("rejects missing/incorrect inputs by field name only", () => {
    const origin = "http://127.0.0.1:1";
    const allow = { isAllowedOrigin: () => true };
    const good = makeInput(origin);
    expect(() => cli.validateInput(good, allow)).not.toThrow();
    const clone = () => JSON.parse(JSON.stringify(good));
    const cases: [string, (i: ReturnType<typeof clone>) => void, RegExp][] = [
      ["profile", (i) => delete i.profiles.VIEWER, /profile VIEWER/],
      ["pair", (i) => delete i.expected.pair, /expected\.pair/],
      ["owner", (i) => delete i.expected.source_owner_registry, /source_owner_registry/],
      ["roles", (i) => delete i.expected.roles.OPERATOR_B, /expected\.roles/],
      ["baseline", (i) => { i.baseline_raw = ""; }, /baseline_raw/],
      ["hash", (i) => { i.baseline_identity.sha256 = "0".repeat(64); }, /does not match/],
      ["persona", (i) => { i.expected.persona_id = "persona-nope"; }, /persona_id/],
      ["incomplete baseline", (i) => { const b = JSON.parse(i.baseline_raw); delete b["/bff/strategies?page=1&page_size=5"]; i.baseline_raw = JSON.stringify(b); i.baseline_identity.sha256 = sha(i.baseline_raw); }, /original 13/],
      ["reconciliation", (i) => { i.expected.reconciliations = [{ path: "/x", pointer: "/y" }]; }, /reconciliation/],
    ];
    for (const [, mutate, pattern] of cases) {
      const bad = clone();
      mutate(bad);
      expect(() => cli.validateInput(bad, allow), String(pattern)).toThrow(pattern);
    }
    // origin policy: Pantheon https only by default
    expect(cli.isPantheonHttpsOrigin("https://app.dev.mvl-cap.tw")).toBe(true);
    expect(cli.isPantheonHttpsOrigin("https://evil.example.com")).toBe(false);
    expect(cli.isPantheonHttpsOrigin("http://app.dev.mvl-cap.tw")).toBe(false);
    expect(() => cli.validateInput(good)).toThrow(/allowed Pantheon origin/);
  });

  it("assessPair fails on any identity mismatch", () => {
    const manifest = { deploymentState: "accepted", frontendSha: "fe-sha-1", bffCommit: "bff-sha-1", pairId: "pair-1", releaseAdmission: { controller: { runId: 4321 } } };
    const version = { source_commit_sha: "bff-sha-1", config_posture: { auth_mode: "strict", auth_stub: false, mfa_required: false } };
    expect(cli.assessPair(manifest, version, PAIR).ok).toBe(true);
    expect(cli.assessPair({ ...manifest, pairId: "other" }, version, PAIR).ok).toBe(false);
    expect(cli.assessPair(manifest, { ...version, source_commit_sha: "x" }, PAIR).ok).toBe(false);
    expect(cli.assessPair(manifest, { ...version, config_posture: { auth_mode: "stub", auth_stub: true, mfa_required: false } }, PAIR).ok).toBe(false);
  });
});

describe("sequential protocol against a local fixture (not hosted proof)", () => {
  it("passes end to end, runs roles in order, and leaves no secrets in evidence", async () => {
    const { out, dir, fx } = await execute({});
    expect(out.errors).toEqual([]);
    expect(out.profiles.TEST_ADMIN.errors).toEqual([]);
    expect(Object.keys(out.profiles)).toEqual(["TEST_ADMIN", "OPERATOR_A", "OPERATOR_B", "VIEWER"]);
    for (const n of NAMES) {
      expect(out.profiles[n].api_logout_status).toBe(200);
      expect(out.profiles[n].after_logout_me_status).toBe(401);
      expect(out.profiles[n].fresh_entry_pass).toBe(true);
    }
    expect(out.strategy.performance.fleet_browser_warm.samples).toHaveLength(20);
    expect(Object.keys(out.strategy.captures)).toHaveLength(13);
    expect(out.verdict.exact_equal).toBe(true);
    expect(out.pass).toBe(true);
    expect(fx.receivedWrites).toEqual([]);
    expect(out.blocked_writes).toEqual([]);
    const evidence = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
    for (const s of Object.values(SECRETS)) expect(evidence).not.toContain(s);
    expect(fs.readdirSync(dir).some((f) => /\.(png|zip|webm)$/.test(f))).toBe(false);
    expect(fs.statSync(path.join(dir, "result.json")).mode & 0o777).toBe(0o600);
  }, 120_000);

  it("keeps exact_equal false on semantic change; documented reconciliation is separate", async () => {
    const changed = await execute({ mutate: true });
    expect(changed.out.verdict.exact_equal).toBe(false);
    expect(changed.out.strategy.parity.unreconciled_difference_count).toBeGreaterThan(0);
    expect(changed.out.pass).toBe(false);
    expect(changed.out.strategy.performance.fleet_browser_warm.pass).toBe(true); // measured checks stay independent of parity

    const reconciled = await execute({ mutate: true }, (i) => {
      (i.expected as Record<string, unknown>).reconciliations = [{ path: "/bff/strategies?page_size=20", pointer: "/data/items/0/note", owner: "strategy-owner", reason: "documented fixture reconciliation", after: "CHANGED" }];
    });
    expect(reconciled.out.strategy.parity.exact_equal).toBe(false);
    expect(reconciled.out.strategy.parity.documented_reconciliations).toHaveLength(1);
    expect(reconciled.out.pass).toBe(true);
  }, 240_000);

  it("aggregates a failing role without hiding the other three", async () => {
    const { out } = await execute({ wrongRoleFor: "OPERATOR_B" });
    expect(out.profiles.OPERATOR_B.pass).toBe(false);
    expect(out.profiles.OPERATOR_B.errors.join()).toMatch(/identity|roles/);
    for (const n of ["TEST_ADMIN", "OPERATOR_A", "VIEWER"]) expect(out.profiles[n].pass).toBe(true);
    expect(out.verdict.four_role_pass).toBe(false);
    expect(out.pass).toBe(false);
  }, 120_000);

  it("fails honestly on pair mismatch before any login", async () => {
    const { out } = await execute({ pairId: "another-pair" });
    expect(out.errors.join()).toMatch(/pair before/);
    expect(Object.keys(out.profiles)).toEqual([]);
    expect(out.pass).toBe(false);
  }, 60_000);

  it("blocks and reports business writes without sending them", async () => {
    const { out, fx } = await execute({ writeOnDetail: true });
    expect(out.blocked_writes.map((w: { path: string }) => w.path)).toContain("/bff/strategies");
    expect(fx.receivedWrites).toEqual([]);
    expect(out.pass).toBe(false);
  }, 120_000);

  it("redacts a secret that leaks into a page error", async () => {
    const { out, dir } = await execute({ leakSecret: true });
    expect(out.pass).toBe(false);
    const evidence = fs.readFileSync(path.join(dir, "result.json"), "utf8");
    expect(evidence).not.toContain(SECRETS.TEST_ADMIN);
    expect(evidence).toContain("[REDACTED]");
  }, 120_000);

  it.each([
    ["pageerror", { detailError: true }, "page_errors"],
    ["HTTP 500", { detailHttpError: true }, "http_api_errors"],
    ["non-aborted request failure", { detailReqFail: true }, "failed_api_requests"],
  ] as const)("admin-only %s fails acceptance", async (_n, opts, key) => {
    const { out } = await execute(opts);
    expect(out.strategy.session[key].length).toBeGreaterThan(0);
    expect(out.verdict.strategy_measured_checks_pass).toBe(false);
    expect(out.pass).toBe(false);
  }, 120_000);

  it("accepts a genuine governed-owner inventory when declared", async () => {
    const { out } = await execute({ dsMode: "governed_owner" }, (i) => {
      i.expected.source_owner_registry = { connector_ids: CONNECTORS, source_mode: "governed_owner", meta_source: "governed_owner" } as never;
    });
    expect(out.strategy.data_sources.pass).toBe(true);
    expect(out.profiles.TEST_ADMIN.errors).toEqual([]);
  }, 120_000);
});
