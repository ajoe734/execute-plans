// @vitest-environment node
/**
 * Regression tests for scripts/accept-persona-strategy-hosted-readonly.mjs.
 * Local loopback fixtures only: they prove CLI logic, NOT hosted behaviour.
 */
import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
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

const MUTATED_BASELINE_PATH = "/bff/strategies?page_size=5";

function baselinePaths() {
  const paths = [
    MUTATED_BASELINE_PATH,
    "/bff/strategies?page_size=50",
    "/bff/strategies?page_size=20&page_token=20",
    "/bff/strategies?hide_retired_personas=true&page_size=20",
    `/bff/strategies?page_size=20&persona_id=${PERSONA}`,
  ];
  for (let i = 1; i <= 7; i++) paths.push(`/bff/strategies?page=${i}&page_size=5`);
  return paths;
}
function strategyBody(p: string, mutate: boolean) {
  return { data: { items: [{ id: `s-${p.length}`, name: "stable", note: mutate && p === MUTATED_BASELINE_PATH ? "CHANGED" : "same" }] } };
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

type Opts = { mutate?: boolean; dsMode?: "legacy_projection" | "governed_owner"; wrongRoleFor?: string; writeOnDetail?: boolean; leakSecret?: boolean; slowFleetMs?: number; pairId?: string; detailError?: boolean; detailHttpError?: boolean; detailReqFail?: boolean; suppEmptyMcp?: boolean; suppRetiredOk?: boolean; suppDeploymentsHidden?: boolean; lateTeardown500?: boolean };

function startFixture(opts: Opts = {}) {
  const sessions = new Map<string, string>();
  const receivedWrites: string[] = [];
  let tornDown = false;
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
      tornDown = false;
      res.setHeader("set-cookie", `sid=${sid}; Path=/`);
      return json(200, { ok: true });
    }
    if (url.pathname === "/bff/teardown-probe") return json(tornDown ? 500 : 200, { ok: !tornDown });
    if (url.pathname === "/bff/logout" && req.method === "POST") {
      if (cookie) sessions.delete(cookie);
      tornDown = true;
      // Hold the logout response so the still-open page's polling observes teardown 500s before close.
      if (opts.lateTeardown500) await new Promise((r) => setTimeout(r, 250));
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
      if (url.pathname === "/bff/personas") return json(200, { data: { personas: [{ id: PERSONA }] } });
      if (url.pathname === "/bff/deployments") return json(200, { data: { items: [{ id: "d1" }] } });
      if (url.pathname === "/bff/runtimes" || url.pathname === "/bff/ranking-formulas" || url.pathname === "/bff/mcp-tools") return json(200, { data: { items: [{ id: "x1" }] } });
      if (url.pathname === "/bff/mcp-servers") return json(200, { data: { items: opts.suppEmptyMcp ? [] : [{ id: "m1" }] } });
      if (url.pathname === "/bff/management/persona-league") return json(200, { data: { items: [{ id: "r1" }] } });
      if (url.pathname === "/bff/management/performance-attribution") return json(200, { data: { items: [{ id: "a1" }] } });
      if (url.pathname.startsWith("/bff/strategies/")) return json(200, { data: { id: "s", rules: {} }, meta: { surfaces: ["fixture"] } });
      if (opts.suppRetiredOk && url.pathname === "/bff/ranking/formulas") return json(200, { data: { items: [] } });
      if (url.pathname === "/bff/ranking/formulas" || url.pathname === "/bff/mcp/servers") return json(405, { error: "method" });
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
  const poll = opts.lateTeardown500 ? "<script>setInterval(()=>fetch('/bff/teardown-probe',{credentials:'include'}).catch(()=>{}),10)</script>" : "";
  const leak = opts.leakSecret ? `setTimeout(()=>{throw new Error('leak ${SECRETS.TEST_ADMIN}')},0);` : "";
  const table = (id: string, readUrl: string, title: string, extra = "") => `<h1>${title}</h1>${extra}<div data-testid="${id}"><table><tbody></tbody></table></div>
<script>${leak}fetch('${readUrl}',{credentials:'include'}).then(r=>r.json()).then(j=>{const rows=(j.data.items||[]);document.querySelector('tbody').innerHTML=rows.map(x=>'<tr><td>'+(x.connector_id||x.persona_id||x.id)+'</td><td>cell</td></tr>').join('')||'<tr><td>none</td></tr>'});</script>`;
  if (poll) return poll + pageHtml(url, true, { ...opts, lateTeardown500: false });
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
  if (p === "/management/deployments") return opts.suppDeploymentsHidden ? "<h1>Deployments</h1>" : table("deployments", "/bff/deployments", "Deployments");
  if (p === "/management/rankings") return table("rankings", "/bff/management/persona-league", "Rankings");
  if (p === "/management/mcp") return table("mcp", "/bff/mcp-servers", "MCP");
  if (p === "/management/performance-attribution") return `<div id="app"><p>載入中</p></div><script>fetch('/bff/management/performance-attribution',{credentials:'include'}).then(r=>r.json()).then(j=>{history.replaceState(null,'','/management/performance?tab=attribution');document.getElementById('app').innerHTML='<h1>Attribution</h1><table><tbody>'+j.data.items.map(x=>'<tr><td>'+x.id+'</td></tr>').join('')+'</tbody></table>'})</script>`;
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

  it("redacts credential values inside diff and parity records while retaining every difference", () => {
    const redact = cli.makeRedactor([]);
    const diff = {
      "/bff/x": cli.differences(
        { access_token: "fixture-old-opaque", nested: { refresh_token: "fixture-old-refresh" }, ok: 1 },
        { access_token: "fixture-new-opaque", nested: { refresh_token: "fixture-new-refresh" }, ok: 2 },
      ),
    };
    const parity = cli.reconcileDifferences(diff, [{ path: "/bff/x", pointer: "/ok", owner: "o", reason: "r" }]);
    for (const data of [diff, parity]) {
      const text = redact.json(data, 2);
      expect(text).not.toMatch(/fixture-(old|new)-/);
      expect(() => JSON.parse(text)).not.toThrow();
    }
    expect(parity.exact_equal).toBe(false);
    const out = JSON.parse(redact.json(diff, 2));
    expect(out["/bff/x"].map((d: { path: string }) => d.path).sort()).toEqual(["/access_token", "/nested/refresh_token", "/ok"]);
    expect(out["/bff/x"].find((d: { path: string }) => d.path === "/ok")).toMatchObject({ before: 1, after: 2 });
  });

  it("redacts credential-valued arrays and objects wholesale as valid JSON", () => {
    const redact = cli.makeRedactor([]);
    const text = redact.json({ access_token: ["fixture-opaque"], client_secret: { v: "fixture-opaque2" } }, 2);
    expect(text).not.toContain("fixture-opaque");
    expect(JSON.parse(text)).toEqual({ access_token: "[REDACTED]", client_secret: "[REDACTED]" });
  });

  it("redacts opaque token fields in error text, URLs and structured keys", () => {
    const redact = cli.makeRedactor([]);
    const msg = "boom access_token=review-fixture-opaque-access refresh_token=review-fixture-opaque-refresh";
    const url = "https://x.example/cb?id_token=opaque-idtok&client_secret=opaque-cs&keep=1";
    const json = '{"access_token":"opaque-json-a","refresh_token": "opaque-json-r"}';
    const text = redact.json({ msg, url, json, access_token: "opaque-struct", nested: { refresh_token: "opaque-nested", ok: "fine" } }, 2);
    for (const leaked of ["review-fixture-opaque", "opaque-idtok", "opaque-cs", "opaque-json", "opaque-struct", "opaque-nested"]) expect(text).not.toContain(leaked);
    expect(text).toContain("keep=1");
    expect(text).toContain("fine");
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
    it("accepts an abort caused by an already-started main-frame navigation", () => {
      const a = mk();
      a.emit("request", a.req);
      a.emit("request", a.navReq);
      a.emit("requestfailed", a.req);
      expect(a.row.failed_api_requests).toHaveLength(0);
      expect(a.row.cancelled_api_requests).toHaveLength(1);
    });
    it("late session errors arriving during logout/close fail the final verdict", () => {
      for (const key of ["page_errors", "failed_api_requests", "http_api_errors"] as const) {
        const row: any = { errors: [], page_errors: [], failed_api_requests: [], http_api_errors: [] };
        row[key].push("reviewer-late-" + key);
        cli.foldFinalObservations(row, "OPERATOR_B");
        cli.foldFinalObservations(row, "OPERATOR_B");
        expect(row.errors).toHaveLength(1);
        expect(row.errors[0]).toContain(key);
        expect(row.errors[0]).toContain("reviewer-late-" + key);
      }
      const clean: any = { errors: [], page_errors: [], failed_api_requests: [], http_api_errors: [] };
      cli.foldFinalObservations(clean, "x");
      expect(clean.errors).toEqual([]);
    });
    it("never erases an already-witnessed live failure on later navigation or close", () => {
      const b = mk();
      b.emit("request", b.req);
      b.emit("requestfailed", b.req);
      b.emit("request", b.navReq);
      b.close();
      b.emit("close");
      expect(b.row.failed_api_requests).toHaveLength(1);
      expect(b.row.cancelled_api_requests).toHaveLength(0);
    });
  });

  describe("real Chromium abort accounting", () => {
    const scenarios: Array<[string, string, number, number]> = [
      ["same-document pushState before live abort", "history.pushState({}, '', '/pushed'); await new Promise((r) => setTimeout(r, 400)); c.abort();", 1, 0],
      ["live abort without navigation", "await new Promise((r) => setTimeout(r, 400)); c.abort();", 1, 0],
      ["same-document pushState after live abort", "c.abort(); await new Promise((r) => setTimeout(r, 100)); history.pushState({}, '', '/pushed');", 1, 0],
      ["real document navigation cancels", "location.href = '/next';", 0, 1],
    ];
    it("live abort then later unrelated document navigation keeps the failure", async () => {
      const server = http.createServer((req, res) => {
        if (req.url?.startsWith("/bff/hang")) { res.writeHead(200, { "content-type": "text/plain" }); return void res.write("first-byte"); }
        res.setHeader("content-type", "text/html");
        res.end("<p>doc</p>");
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
        const failedEvt = page.waitForEvent("requestfailed", { predicate: (r) => r.url().includes("/bff/hang") });
        await page.evaluate(() => { (window as any).c = new AbortController(); void fetch("/bff/hang", { signal: (window as any).c.signal }).catch(() => {}); });
        await page.waitForTimeout(100);
        await page.evaluate(() => (window as any).c.abort());
        await failedEvt;
        await page.goto(origin + "/later-unrelated");
        await page.waitForTimeout(300);
        expect(row.failed_api_requests).toHaveLength(1);
        expect(row.cancelled_api_requests).toHaveLength(0);
      } finally {
        await browser.close();
        server.closeAllConnections();
        server.close();
      }
    }, 30000);
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

  it("admits the original 13-response capture key structure without standalone default page_size=20 and requires hide_retired", () => {
    const origin = "http://127.0.0.1:1";
    const allow = { isAllowedOrigin: () => true };
    const good = makeInput(origin);
    const keys = Object.keys(JSON.parse(good.baseline_raw));
    expect(keys).toHaveLength(13);
    expect(keys.filter((k) => k.startsWith("/bff/strategies"))).toHaveLength(12);
    expect(keys).toContain("/bff/strategies?page_size=5");
    expect(keys).toContain("/bff/strategies?page_size=50");
    expect(keys).toContain("/bff/strategies?page_size=20&page_token=20");
    expect(keys).toContain(cli.HIDE_RETIRED_PATH);
    expect(keys).toContain(cli.DATA_SOURCES_PATH);
    expect(keys).not.toContain(cli.DEFAULT_PAGE_PATH);
    const parsed = cli.validateInput(good, allow);
    expect(Object.keys(parsed.baseline)).toEqual(keys);
    expect(parsed.personaPath).toBe(`/bff/strategies?page_size=20&persona_id=${PERSONA}`);

    const missingHideRetired = JSON.parse(JSON.stringify(good));
    const b = JSON.parse(missingHideRetired.baseline_raw);
    delete b[cli.HIDE_RETIRED_PATH];
    b["/bff/strategies?page=99&page_size=5"] = { s: 200, ms: 100, j: strategyBody("/bff/strategies?page=99&page_size=5", false) };
    missingHideRetired.baseline_raw = JSON.stringify(b);
    missingHideRetired.baseline_identity.sha256 = sha(missingHideRetired.baseline_raw);
    expect(() => cli.validateInput(missingHideRetired, allow)).toThrow(/hide_retired/);
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
      ["missing hide_retired", (i) => { const b = JSON.parse(i.baseline_raw); delete b[cli.HIDE_RETIRED_PATH]; b["/bff/strategies?page=99&page_size=5"] = { s: 200, ms: 100, j: strategyBody("/bff/strategies?page=99&page_size=5", false) }; i.baseline_raw = JSON.stringify(b); i.baseline_identity.sha256 = sha(i.baseline_raw); }, /hide_retired/],
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
      const m = out.profiles[n].fresh_entry_measurement;
      expect(Date.parse(m.started_utc)).not.toBeNaN();
      expect(Date.parse(m.api_finished_utc)).not.toBeNaN();
      expect(Date.parse(m.usable_finished_utc)).not.toBeNaN();
      expect(m.request_identity["x-request-id"]).toMatch(/^req-/);
    }
    expect(out.strategy.performance.fleet_browser_warm.samples).toHaveLength(20);
    expect(Object.keys(out.strategy.captures)).toHaveLength(13);
    expect(Object.keys(out.strategy.captures)).not.toContain(cli.DEFAULT_PAGE_PATH);
    expect(out.strategy.parity.captured_paths).toBe(13);
    expect(out.strategy.parity.original_strategy_paths).toBe(12);
    expect(out.strategy.performance.default_first_page).toMatchObject({ path: cli.DEFAULT_PAGE_PATH, repeats: 10, requirement_ms: 1200, pass: true });
    expect(out.strategy.performance.default_first_page.samples_ms).toHaveLength(10);
    expect(out.strategy.performance.per_persona).toMatchObject({ path: `/bff/strategies?page_size=20&persona_id=${PERSONA}`, repeats: 10, requirement_ms: 1200, pass: true });
    expect(out.strategy.performance.per_persona.samples_ms).toHaveLength(10);
    expect(out.strategy.performance.hide_retired_without_state).toMatchObject({ path: cli.HIDE_RETIRED_PATH, requirement_ms: 5000, pass: true });
    expect(out.supplementary).toMatchObject({ pass: true, api_reads: expect.any(Array), api_logout_status: 200, after_logout_me_status: 401 });
    expect(out.supplementary.api_reads).toHaveLength(9);
    expect(out.supplementary.retired_reads.map((r: { status: number }) => r.status).every((x: number) => x === 404 || x === 405)).toBe(true);
    expect(out.supplementary.retired_reads).toHaveLength(4);
    expect(out.supplementary.views.map((v: { actual_path: string }) => v.actual_path)).toEqual(["/management/deployments", "/management/rankings", "/management/mcp", "/management/performance"]);
    expect(out.supplementary.views[3].actual_query).toBe("?tab=attribution");
    expect(out.supplementary.api_reads.at(-1).path).toBe("/bff/strategies/s-" + "/bff/strategies?page_size=5".length);
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
      (i.expected as Record<string, unknown>).reconciliations = [{ path: MUTATED_BASELINE_PATH, pointer: "/data/items/0/note", owner: "strategy-owner", reason: "documented fixture reconciliation", after: "CHANGED" }];
    });
    expect(reconciled.out.strategy.parity.exact_equal).toBe(false);
    expect(reconciled.out.strategy.parity.documented_reconciliations).toHaveLength(1);
    expect(reconciled.out.pass).toBe(true);
  }, 240_000);

  it("supplementary: honest empty MCP is an observation, not a failure", async () => {
    const { out } = await execute({ suppEmptyMcp: true });
    expect(out.supplementary.views[2].readiness).toBe("honest_empty_observed");
    expect(out.supplementary.pass).toBe(true);
    expect(out.pass).toBe(true);
  }, 120_000);

  it("supplementary: failures stay real in out.pass but not in the original aggregation", async () => {
    for (const o of [{ suppRetiredOk: true }, { suppDeploymentsHidden: true }] as Opts[]) {
      const { out } = await execute(o);
      expect(out.supplementary.pass).toBe(false);
      expect(out.supplementary.errors.length).toBeGreaterThan(0);
      expect(out.verdict.all_acceptances_proven).toBe(true);
      expect(out.verdict.supplementary_pass).toBe(false);
      expect(out.pass).toBe(false);
    }
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

  it("real late HTTP 500 during logout/close fails four roles, admin batch and supplementary", async () => {
    const { out } = await execute({ lateTeardown500: true });
    for (const n of NAMES) {
      expect(out.profiles[n].http_api_errors.some((e: { path: string; status: number }) => e.path === "/bff/teardown-probe" && e.status === 500)).toBe(true);
      expect(out.profiles[n].errors.join()).toContain("http_api_errors observed by session shutdown");
      expect(out.profiles[n].pass).toBe(false);
      expect(out.profiles[n].after_logout_me_status).toBe(401);
    }
    expect(out.strategy.session.http_api_errors.some((e: { path: string }) => e.path === "/bff/teardown-probe")).toBe(true);
    expect(out.supplementary.http_api_errors.some((e: { path: string }) => e.path === "/bff/teardown-probe")).toBe(true);
    expect(out.supplementary.pass).toBe(false);
    expect(out.verdict.four_role_pass).toBe(false);
    expect(out.verdict.strategy_measured_checks_pass).toBe(false);
    expect(out.pass).toBe(false);
  }, 240_000);

  it("accepts a genuine governed-owner inventory when declared", async () => {
    const { out } = await execute({ dsMode: "governed_owner" }, (i) => {
      i.expected.source_owner_registry = { connector_ids: CONNECTORS, source_mode: "governed_owner", meta_source: "governed_owner" } as never;
    });
    expect(out.strategy.data_sources.pass).toBe(true);
    expect(out.profiles.TEST_ADMIN.errors).toEqual([]);
  }, 120_000);
});

describe("Trading Pulse mode in the existing viewer runner", () => {
  it("shares pair and strict auth checks while keeping each mode's extra posture requirements", () => {
    const manifest = { frontendSha: PAIR.fe, bffCommit: PAIR.bff,
      buildMode: { VITE_BFF_MODE: "live", VITE_BFF_FALLBACK: "strict" } };
    const version = { source_commit_sha: PAIR.bff, config_posture: { auth_mode: "strict", auth_stub: false } };
    const pulse = { mode: "trading-pulse" };
    expect(cli.assessPair(manifest, version, PAIR, pulse).ok).toBe(true);
    expect(cli.assessPair(manifest, version, PAIR).failures).toEqual(expect.arrayContaining([
      "deploymentState mismatch", "root mismatch", "pairId mismatch", "mfa_required mismatch",
    ]));
    for (const options of [undefined, pulse]) {
      expect(cli.assessPair({ ...manifest, frontendSha: "wrong" }, version, PAIR, options).failures).toContain("frontendSha mismatch");
      expect(cli.assessPair({ ...manifest, bffCommit: "wrong" }, version, PAIR, options).failures).toContain("bffCommit mismatch");
      expect(cli.assessPair(manifest, { ...version, source_commit_sha: "wrong" }, PAIR, options).failures).toContain("version.source_commit_sha mismatch");
      expect(cli.assessPair(manifest, { ...version, config_posture: { auth_mode: "stub", auth_stub: true } }, PAIR, options).failures)
        .toEqual(expect.arrayContaining(["auth_mode mismatch", "auth_stub mismatch"]));
    }
    expect(cli.assessPair({ ...manifest, buildMode: {} }, version, PAIR, pulse).failures)
      .toEqual(["VITE_BFF_MODE mismatch", "VITE_BFF_FALLBACK mismatch"]);
  });

  it("routes the actual process entry without circular-import deadlock and returns terminal input exits", () => {
    for (const [options, error] of [
      [["--mode", "trading-pulse"], "viewer GUI credentials"],
      [[], "profiles"],
      [["--record-baseline"], "requires trading-pulse mode"],
    ] as [string[], string][]) {
      const child = spawnSync(process.execPath, ["scripts/accept-persona-strategy-hosted-readonly.mjs", "--out-dir", "/unused", ...options], {
        input: "{}", encoding: "utf8", timeout: 10_000,
      });
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(2);
      expect(child.stderr).toContain(error);
      expect(child.stderr).not.toContain("unsettled top-level await");
    }
  });
  it("keeps the original default and rejects ambiguous modes/options", async () => {
    expect(cli.parseArgs(["--out-dir", "/private"])).toEqual({ outDir: "/private", mode: "persona-strategy", baseline: false });
    expect(cli.parseArgs(["--mode", "trading-pulse", "--out-dir", "/private", "--record-baseline"])).toEqual({ outDir: "/private", mode: "trading-pulse", baseline: true });
    for (const args of [["--out-dir"], ["--out-dir", "/x", "--mode", "other"],
      ["--out-dir", "/x", "--record-baseline"], ["--out-dir", "/x", "--out-dir", "/y"], ["--unknown", "/x"]]) {
      expect(() => cli.parseArgs(args)).toThrow();
    }
    await expect(cli.run({}, { mode: "trading-pulse", outDir: "/unused" })).rejects.toThrow("viewer GUI credentials");
    await expect(cli.run({}, { outDir: "/unused" })).rejects.toThrow("profiles");
    const helper = fs.readFileSync("scripts/accept-trading-pulse-hosted-readonly.mjs", "utf8");
    expect(helper).not.toContain("process.argv");
    expect(helper).not.toContain("chromium.launch");
  });

  it.each([false, true])("runs three real Chromium viewer sessions through shared mode (blocked attempts=%s)", async (attemptWrites) => {
    const FE = "https://app.dev.mvl-cap.tw", BFF = "https://api.dev.mvl-cap.tw";
    const fe = "a".repeat(40), bff = "b".repeat(40);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-pulse-fixture-"));
    const browser = await chromium.launch({ headless: true });
    const credentials = { client_id: "offline-viewer", client_secret: "offline-viewer-secret" };
    const logins: unknown[] = [], viewports: unknown[] = [];
    const manifest = { frontendSha: fe, bffCommit: bff, pairId: "offline-pair", deploymentState: "accepted",
      buildMode: { VITE_BFF_MODE: "live", VITE_BFF_FALLBACK: "strict", VITE_BFF_REAL_WRITES: "false" } };
    const version = { source_commit_sha: bff, config_posture: { auth_mode: "strict", auth_stub: false } };
    const html = `<html><body><header>Private session</header><nav><a href="/management/trading-pulse">交易脈動 Trading Pulse</a></nav>
      <main><h1>Persona Fleet</h1><input id="dev-account"><input id="dev-password"><button>Sign in</button></main>
      <script>
        const api = '${BFF}';
        document.querySelector('button').onclick = async () => {
          await fetch(api+'/bff/auth/dev-login', {method:'POST',body:JSON.stringify({client_id:document.querySelector('#dev-account').value,client_secret:document.querySelector('#dev-password').value})});
          ${attemptWrites ? "await fetch(api+'/bff/strategies', {method:'POST',body:'{}'}).catch(()=>{}); await fetch('https://foreign.invalid/probe').catch(()=>{});" : ""}
        };
        document.querySelector('a').onclick = async (e) => {
          e.preventDefault(); history.pushState({},'', '/management/trading-pulse');
          await fetch(api+'/bff/management/trading-pulse');
          document.querySelector('main').innerHTML = '<h1>'+ (localStorage.getItem('pantheon.locale') === 'en-US' ? 'Trading Pulse' : '交易脈動') +'</h1><details><summary>資料診斷 Diagnostics</summary><p>rt-offline</p></details>';
          await fetch(api+'/bff/management/trading-pulse/rankings');
        };
      </script></body></html>`;
    // Preserve the runner's route guard; fulfill only requests it explicitly allows.
    // All fixture traffic is intercepted before network; no real credentials or BFF.
    const fixtureChromium = { launch: async () => ({
      newContext: async (options: any) => {
        viewports.push({ locale: options.locale, width: options.viewport.width });
        const ctx = await browser.newContext(options), install = ctx.route.bind(ctx);
        ctx.route = async (pattern: any, guard: any) => install(pattern, async (route: any) => guard({
          request: () => route.request(), abort: (reason: string) => route.abort(reason),
          continue: async () => {
            const request = route.request(), url = new URL(request.url());
            expect([FE, BFF]).toContain(url.origin);
            if (url.pathname === "/bff/auth/dev-login") logins.push(request.postDataJSON());
            if (url.origin === FE) return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
            const body = url.pathname === "/bff/me" ? { data: { tenant_id: "offline-tenant", roles: ["viewer"] } } : { data: {} };
            return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
          },
        }));
        return ctx;
      }, close: () => browser.close(),
    }) };
    try {
      const result = await cli.run({ profile: credentials, expected: { fe, bff, tenant_id: "offline-tenant" } }, {
        mode: "trading-pulse", baseline: true, outDir, chromium: fixtureChromium,
        fetchImpl: async (url: string) => ({ status: 200, json: async () => url === FE + "/deployment.json" ? manifest : version }),
      });
      expect(logins).toEqual([credentials, credentials, credentials]);
      expect(viewports).toEqual([{ locale: "zh-TW", width: 1440 }, { locale: "zh-TW", width: 390 }, { locale: "en-US", width: 1440 }]);
      expect(result.out.mode).toBe("baseline_failure_record_only");
      expect(result.out.pass).toBe(false);
      expect(result.out.pair_before).toEqual(result.out.pair_after);
      expect(result.out.blocked_writes).toEqual(attemptWrites ? Array.from({ length: 3 }, () => [
        { method: "POST", path: "/bff/strategies", foreign_origin: false },
        { method: "GET", path: "/probe", foreign_origin: true },
      ]).flat() : []);
      expect(result.out.runs.every((r: any) => r.entry === "sidebar" && r.checks.includes("masked_screenshot") === (r.locale === "zh-TW"))).toBe(true);
      expect(result.out.failures.join(" ")).toContain("missing_current_roster_witness");
      expect(result.out.failures.join(" ")).toContain("missing_historical_event_witness");
      const files = fs.readdirSync(result.dir);
      expect(files.sort()).toEqual(["desktop.png", "narrow.png", "summary.json"]);
      expect(result.out.evidence.bytes).toBe(files.reduce((n, f) => n + fs.statSync(path.join(result.dir, f)).size, 0));
      expect(result.out.evidence.bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
      expect(fs.readFileSync(path.join(result.dir, "summary.json"), "utf8")).not.toContain(credentials.client_secret);
    } finally {
      await browser.close(); fs.rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("completes full Trading Pulse acceptance roundtrips at 1440px and 390px (hidden sidebar, real /bff/personas/<id> entity GET with trailing sub-resources, and contextual header return)", async () => {
    const FE = "https://app.dev.mvl-cap.tw", BFF = "https://api.dev.mvl-cap.tw";
    const fe = "a".repeat(40), bff = "b".repeat(40);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-pulse-acceptance-fixture-"));
    const browser = await chromium.launch({ headless: true });
    const credentials = { client_id: "offline-viewer", client_secret: "offline-viewer-secret" };
    const manifest = { frontendSha: fe, bffCommit: bff, pairId: "offline-pair", deploymentState: "accepted",
      buildMode: { VITE_BFF_MODE: "live", VITE_BFF_FALLBACK: "strict", VITE_BFF_REAL_WRITES: "false" } };
    const version = { source_commit_sha: bff, config_posture: { auth_mode: "strict", auth_stub: false } };
    const sources = {
      tenant_id: "offline-tenant",
      captured_at: new Date().toISOString(),
      provenance: [{ source: "owner-registry-ledger.json", sha256: "c".repeat(64) }],
      rows: [{
        persona_id: "persona-offline",
        persona_name: "離線甲",
        runtime_id: "rt-offline",
        binding_id: "rb-offline",
        underlying_symbol: "1234",
        stage: "paper",
        ledger_fill_count: 0,
        pnl: null,
        pnl_currency: "TWD",
        pnl_period: "2026-11-01T00:00:00Z",
        filled_quantity: 0,
        requested_quantity: 7,
        quantity_unit: { "zh-TW": "股", "en-US": "shares" },
      }],
      excluded: [{ persona_id: "persona-probe", persona_name: "部署測試", runtime_id: "rt-probe" }],
      pnl_groups: [],
    };
    const history = {
      journey_id: "tj-offline",
      event_id: "event-offline",
      persona_id: "persona-offline",
      persona_name: "離線甲",
      tenant_id: "offline-tenant",
      environment: "paper",
      symbol: "1234",
      reason_code: "insufficient_cash",
      reason_text: { "zh-TW": "資金不足", "en-US": "Insufficient cash" },
      required: 109.25,
      available: 100,
      requested_quantity: 7,
      submitted_to_broker: false,
      occurred_at: "2020-01-01T01:02:03Z",
    };
    const overviewPayload = {
      data: {
        summary: {
          operator_scope: {
            status: "verified",
            tenant_id: "offline-tenant",
            persona_count: 1,
            runtime_count: 1,
            by_stage: { paper: { persona_count: 1, runtime_count: 1 } },
          },
          pnl_groups: [],
        },
        runtime_rows: [{
          runtime_id: "rt-offline",
          runtime_binding_id: "rb-offline",
          persona_id: "persona-offline",
          persona_name: "離線甲",
          deployment_stage: "paper",
          telemetry_summary: {
            window: "1h",
            collected_at: "2026-11-22T12:00:00Z",
            metrics: { pnl: null, drawdown: null, sharpe_ratio: null, fill_rate: 0, avg_slippage_bps: 0, total_trades: 0 },
          },
          performance_context: {
            ledger_fill_count: 0,
            pnl_currency: "TWD",
            pnl_period_start_at: "2026-11-01T00:00:00Z",
            pnl_at: "2026-11-22T12:00:00Z",
            pnl_definition: "net_ledger_pnl",
            source_status: "available",
            fill_rate_basis: "filled_quantity_over_submitted_quantity",
            fill_rate_details: {
              status: "known",
              numerator: 0,
              denominator: 7,
              unit: "shares",
              basis: "filled_quantity_over_submitted_quantity",
              window: { start_at: "2026-11-01T00:00:00Z", end_exclusive_at: "2026-11-22T12:00:00Z" },
            },
            metric_units: { pnl: "TWD", fill_rate: "fraction", drawdown: "fraction", sharpe_ratio: "ratio" },
            metric_periods: {
              pnl: { start_at: "2026-11-01T00:00:00Z", as_of: "2026-11-22T12:00:00Z", window: "1h" },
              drawdown: { start_at: "2026-11-01T00:00:00Z", as_of: "2026-11-22T12:00:00Z", window: "1h" },
              sharpe_ratio: { start_at: null, as_of: "2026-11-22T12:00:00Z", window: "1h" },
              fill_rate: { start_at: null, as_of: null, window: "1h" },
            },
          },
        }],
      },
    };
    const rankingsPayload = {
      data: {
        summary: { operator_scope: overviewPayload.data.summary.operator_scope, limit: 20 },
        items: [
          { block_id: "pnl-leaders", metric: "pnl", sort_order: "desc", items: [], eligible_item_count: 0, missing_metric_count: 1, missing_metric_runtime_ids: ["rt-offline"] },
          { block_id: "drawdown-control", metric: "drawdown", sort_order: "asc", items: [], eligible_item_count: 0, missing_metric_count: 1, missing_metric_runtime_ids: ["rt-offline"] },
          {
            block_id: "execution-quality",
            metric: "fill_rate",
            sort_order: "desc",
            eligible_item_count: 1,
            missing_metric_count: 0,
            missing_metric_runtime_ids: [],
            items: [{
              persona_id: "persona-offline",
              persona_name: "離線甲",
              runtime_id: "rt-offline",
              fill_rate: 0,
              rank: 1,
              ranking_eligible: true,
              ranking_block_id: "execution-quality",
              ranking_metric: "fill_rate",
              ranking_metric_value: 0,
              comparison_scope: {
                stage: "paper",
                period: { start_at: "2026-11-01T00:00:00Z", end_exclusive_at: "2026-11-22T12:00:00Z" },
                unit: "fraction",
                basis: "filled_quantity_over_submitted_quantity",
                quantity_unit: "shares",
              },
            }],
          },
          { block_id: "sharpe-leaders", metric: "sharpe_ratio", sort_order: "desc", items: [], eligible_item_count: 0, missing_metric_count: 1, missing_metric_runtime_ids: ["rt-offline"] },
        ],
      },
    };
    const html = `<html><head><style>@media (max-width: 1023px) { nav { display: none; } }</style></head>
      <body><header>Private session</header><nav><a href="/management/trading-pulse">交易脈動 Trading Pulse</a></nav>
      <main><h1>Persona Fleet</h1><input id="dev-account"><input id="dev-password"><button>Sign in</button></main>
      <script>
        const api = '${BFF}';
        const isEn = () => localStorage.getItem('pantheon.locale') === 'en-US';
        async function renderPulse() {
          history.pushState({}, '', '/management/trading-pulse');
          await fetch(api + '/bff/management/trading-pulse');
          document.querySelector('main').innerHTML = isEn()
            ? '<section><h1>Trading Pulse</h1><p>Operational Personas: 1 · Paper: 1</p>' +
              '<table><thead><tr><th>Persona</th><th>Fills</th><th>Fill Rate</th><th>P&amp;L</th></tr></thead>' +
              '<tbody><tr><td><a id="persona-entry" href="/management/personas/persona-offline">離線甲</a> 1234 Paper <a id="journey-entry" href="/management/trade-journeys/tj-offline?tenant_id=offline-tenant&amp;environment=paper&amp;return_to=%2Fmanagement%2Ftrading-pulse">View Trade Journey</a></td>' +
              '<td>0 fills</td><td>0% (Requested 7 shares, filled 0 shares)</td><td>No fill P&amp;L yet</td></tr></tbody></table>' +
              '<details><summary>Data Diagnostics</summary><div>rt-offline rb-offline</div></details></section>'
            : '<section><h1>交易脈動</h1><p>參與營運 Persona：1 人 · 模擬交易 1 人</p>' +
              '<table><thead><tr><th>Persona</th><th>成交筆數</th><th>成交率</th><th>損益</th></tr></thead>' +
              '<tbody><tr><td><a id="persona-entry" href="/management/personas/persona-offline">離線甲</a> 1234 模擬交易 <a id="journey-entry" href="/management/trade-journeys/tj-offline?tenant_id=offline-tenant&amp;environment=paper&amp;return_to=%2Fmanagement%2Ftrading-pulse">查看交易旅程</a></td>' +
              '<td>0 筆成交</td><td>0%（該次意向 7 股、成交 0 股）</td><td>尚無成交損益</td></tr></tbody></table>' +
              '<details><summary>資料診斷</summary><div>rt-offline rb-offline</div></details></section>';
          bindPulseLinks();
          await fetch(api + '/bff/management/trading-pulse/rankings');
        }
        function bindPulseLinks() {
          document.getElementById('persona-entry').onclick = async (e) => {
            e.preventDefault();
            history.pushState({ returnTo: '/management/trading-pulse' }, '', '/management/personas/persona-offline');
            document.querySelector('main').innerHTML = '<p>Loading</p>';
            const res = await fetch(api + '/bff/personas/persona-offline');
            await res.json();
            // Concurrent sub-resource GETs that finish after the primary entity read.
            await fetch(api + '/bff/personas/persona-offline/route-policy');
            await fetch(api + '/bff/personas/persona-offline/memory');
            const backLabel = isEn() ? 'Back to Trading Pulse' : '返回交易脈動';
            const backHtml = history.state && history.state.returnTo === '/management/trading-pulse'
              ? '<a id="pulse-return" href="/management/trading-pulse">' + backLabel + '</a>'
              : '';
            document.querySelector('main').innerHTML = '<section><h1>離線甲｜1234 Paper</h1>' + backHtml + '</section>';
            const ret = document.getElementById('pulse-return');
            if (ret) ret.onclick = (ev) => { ev.preventDefault(); renderPulse(); };
          };
          document.getElementById('journey-entry').onclick = async (e) => {
            e.preventDefault();
            history.pushState({}, '', '/management/trade-journeys/tj-offline?tenant_id=offline-tenant&environment=paper&return_to=%2Fmanagement%2Ftrading-pulse');
            await fetch(api + '/bff/management/trade-journeys/tj-offline?tenant_id=offline-tenant&environment=paper');
            await fetch(api + '/bff/management/trade-journeys/tj-offline/timeline?tenant_id=offline-tenant&environment=paper');
            const reason = isEn() ? 'Insufficient cash' : '資金不足';
            document.querySelector('main').innerHTML = '<section><h1>離線甲 1234</h1><p>Paper ' + reason + ' 109.25 100 7</p><a id="journey-return" href="/management/trading-pulse">Back</a></section>';
            document.getElementById('journey-return').onclick = (ev) => { ev.preventDefault(); renderPulse(); };
          };
        }
        document.querySelector('button').onclick = async () => {
          await fetch(api + '/bff/auth/dev-login', { method: 'POST', body: JSON.stringify({ client_id: document.querySelector('#dev-account').value, client_secret: document.querySelector('#dev-password').value }) });
        };
        document.querySelector('nav a').onclick = (e) => { e.preventDefault(); renderPulse(); };
        document.addEventListener('keydown', (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
            event.preventDefault();
            const label = isEn() ? 'Trading Pulse' : '交易脈動';
            document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><input role="combobox"><button role="option">' + label + '</button></div>');
            document.querySelector('[role="option"]').onclick = () => { document.querySelector('[role="dialog"]').remove(); renderPulse(); };
          }
        });
      </script></body></html>`;
    const fixtureChromium = { launch: async () => ({
      newContext: async (options: any) => {
        const ctx = await browser.newContext(options), install = ctx.route.bind(ctx);
        ctx.route = async (pattern: any, guard: any) => install(pattern, async (route: any) => guard({
          request: () => route.request(), abort: (reason: string) => route.abort(reason),
          continue: async () => {
            const request = route.request(), url = new URL(request.url());
            if (url.origin === FE) return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
            let body: unknown = { data: {} };
            if (url.pathname === "/bff/me") body = { data: { tenant_id: "offline-tenant", roles: ["viewer"] } };
            else if (url.pathname === "/bff/management/trading-pulse") body = overviewPayload;
            else if (url.pathname === "/bff/management/trading-pulse/rankings") body = rankingsPayload;
            else if (url.pathname === "/bff/personas/persona-offline") body = { data: { id: "persona-offline", tenantId: "offline-tenant", name: "離線甲｜1234 Paper" } };
            else if (url.pathname.startsWith("/bff/personas/persona-offline/")) body = { data: { items: [] } };
            else if (url.pathname === "/bff/management/trade-journeys/tj-offline") {
              body = {
                data: {
                  journey_id: "tj-offline",
                  persona_id: "persona-offline",
                  tenant_id: "offline-tenant",
                  environment: "paper",
                  outcome: {
                    reason_code: "insufficient_cash",
                    source_event_id: "event-offline",
                    submitted_to_broker: false,
                    reason_detail: { required: 109.25, available: 100, requested_quantity: 7 },
                  },
                },
              };
            } else if (url.pathname === "/bff/management/trade-journeys/tj-offline/timeline") {
              body = { data: { items: [{ event_id: "derived", source_event_id: "event-offline", occurred_at: "2020-01-01T01:02:03Z" }] } };
            }
            return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
          },
        }));
        return ctx;
      }, close: () => browser.close(),
    }) };
    try {
      const result = await cli.run({
        profile: credentials,
        expected: { fe, bff, tenant_id: "offline-tenant" },
        sources,
        history,
      }, {
        mode: "trading-pulse",
        baseline: false,
        outDir,
        chromium: fixtureChromium,
        fetchImpl: async (url: string) => ({ status: 200, json: async () => url === FE + "/deployment.json" ? manifest : version }),
      });
      expect(result.out.failures).toEqual([]);
      expect(result.out.pass).toBe(true);
      expect(result.out.runs.map((r: any) => ({ locale: r.locale, width: r.width, entry: r.entry, failures: r.failures }))).toEqual([
        { locale: "zh-TW", width: 1440, entry: "sidebar", failures: [] },
        { locale: "zh-TW", width: 390, entry: "command_palette", failures: [] },
        { locale: "en-US", width: 1440, entry: "sidebar", failures: [] },
      ]);
      for (const r of result.out.runs) {
        expect(r.checks).toEqual(expect.arrayContaining([
          "current_operator_content",
          "current_wire_roster_and_rankings",
          "diagnostics_expand_source_and_collapse",
          "persona_detail_roundtrip_keyboard",
          "historical_rejection_roundtrip",
        ]));
      }
    } finally {
      await browser.close(); fs.rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);
});
