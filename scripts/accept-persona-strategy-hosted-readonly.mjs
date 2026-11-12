/**
 * ORIGINAL paired Persona/strategy hosted read-only acceptance (portable CLI).
 *
 * Ported from the private four-profile-readonly.cjs + strategy-readonly-acceptance.cjs
 * protocol WITHOUT changing any original threshold, sample count, check or diff rule.
 * It is a caller-run tool: the protected original dev workflow supplies credentials,
 * the exact expected pair, source-owner inventory and the ORIGINAL baseline as one
 * JSON document on stdin. Nothing is read from env/files/argv except `--out-dir`.
 *
 *   node scripts/accept-persona-strategy-hosted-readonly.mjs --out-dir <private-dir> < input.json
 *
 * stdin JSON (all fields required unless marked optional):
 *   profiles: { TEST_ADMIN|OPERATOR_A|OPERATOR_B|VIEWER: { client_id, client_secret } }
 *   identity: { DEV_FE_URL, DEV_BFF_URL }            (https, *.mvl-cap.tw only)
 *   expected: {
 *     fe, bff, root, pair,                            exact accepted pair identity
 *     tenant_id,                                      tenant `me` must report
 *     roles: { <PROFILE>: [role,...] },               exact role set per profile
 *     persona_id,                                     original per-persona query id (must occur in baseline)
 *     source_owner_registry: { connector_ids: [..], source_mode: "legacy_projection"|"governed_owner",
 *                              meta_source?: string },  independently obtained owner inventory
 *     reconciliations?: [{ path, pointer, owner, reason, before?, after? }]   documented, exact-pointer only
 *   }
 *   baseline_raw: string                              the ORIGINAL strategies_baseline.json bytes (as text)
 *   baseline_identity: { sha256 }                     hash of baseline_raw (must match)
 *
 * Output: sanitized stdout summary; private evidence under <out-dir>/<mkdtemp>/ (0700/0600).
 * Only /bff/auth/dev-login, /bff/auth/refresh, /bff/logout may write; every other
 * non-read request is blocked and reported. No screenshots/traces/video are produced.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ROLE_ORDER = Object.freeze(["TEST_ADMIN", "OPERATOR_A", "OPERATOR_B", "VIEWER"]);
export const ALLOWED_WRITE_PATHS = Object.freeze([
  "/bff/auth/dev-login",
  "/bff/auth/refresh",
  "/bff/logout",
]);
// Original acceptance thresholds. Do not relax.
export const THRESHOLDS = Object.freeze({
  fresh_entry_api_ms_max: 2000, // inclusive
  fresh_entry_usable_ms_max: 2500, // inclusive
  warm_fleet_repeats: 20,
  warm_fleet_p95_ms_max: 1000, // inclusive, nearest-rank
  per_query_repeats: 10,
  per_query_p50_ms_lt: 1200, // exclusive
  hide_retired_ms_lt: 5000, // exclusive
  persona_detail_ms_lt: 6400, // exclusive
  navigation_timeout_ms: 60000,
});
export const DEFAULT_PAGE_PATH = "/bff/strategies?page_size=20";
export const HIDE_RETIRED_PATH = "/bff/strategies?hide_retired_personas=true&page_size=20";
export const DATA_SOURCES_PATH = "/bff/management/data-sources";
const FLEET_PATH = "/bff/management/persona-fleet";
const IDENTITY_HEADERS = ["x-request-id", "x-correlation-id", "x-trace-id", "server-timing"];

// ---------------------------------------------------------------- pure helpers

export const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

const CREDENTIAL_KEY = "(?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|token|secret|password|passwd|api[_-]?key|authorization)";
const CREDENTIAL_KEY_RE = new RegExp(`^${CREDENTIAL_KEY}$`, "i");
const CREDENTIAL_FIELD_RE = new RegExp(`\\b(${CREDENTIAL_KEY}["']?(?:\\s*[:=]\\s*|%3D)["']?)(?!\\[REDACTED)[^\\s"'&,;}\\]]+`, "gi");

export function makeRedactor(secrets) {
  const base = secrets.filter((s) => typeof s === "string" && s.length > 0);
  // Also cover the JSON-escaped representation (quote/backslash/control chars).
  const list = [...new Set([...base, ...base.map((s) => JSON.stringify(s).slice(1, -1))])].filter(Boolean);
  const redact = (value) => {
    let text = String(value);
    for (const secret of list) text = text.split(secret).join("[REDACTED]");
    return text
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [REDACTED]")
      // Opaque credential fields in free text / query strings / JSON-ish text (key=value, key: value, "key":"value").
      .replace(CREDENTIAL_FIELD_RE, (_m, key, sep) => `${key}${sep}[REDACTED]`);
  };
  const deep = (v) => {
    if (typeof v === "string") return redact(v);
    if (Array.isArray(v)) return v.map(deep);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [redact(k), CREDENTIAL_KEY_RE.test(k) && x !== null && typeof x !== "object" ? "[REDACTED]" : deep(x)]));
    return v;
  };
  // Sanitize structured string values BEFORE serialization, then the text again as a backstop.
  redact.json = (value, space) => redact(JSON.stringify(deep(value), null, space));
  return redact;
}

/** Nearest-rank percentile: sorted[ceil(p*n)-1]. */
export function nearestRank(samples, p) {
  assert.ok(Array.isArray(samples) && samples.length > 0, "nearestRank needs samples");
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1];
}

/** Original p50: mean of the two middle samples for even n (10 samples -> [4],[5]). */
export function median(samples) {
  assert.ok(Array.isArray(samples) && samples.length > 0, "median needs samples");
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return Number.isInteger(mid) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
}

export function evaluateFreshEntry(apiMs, usableMs) {
  return (
    Number.isFinite(apiMs) &&
    Number.isFinite(usableMs) &&
    apiMs <= THRESHOLDS.fresh_entry_api_ms_max &&
    usableMs <= THRESHOLDS.fresh_entry_usable_ms_max
  );
}

export function evaluateWarmFleet(samplesMs) {
  const repeats = samplesMs.length;
  const p95 = repeats ? nearestRank(samplesMs, 0.95) : null;
  return {
    repeats,
    p95_ms: p95,
    p95_method: "nearest-rank ceil(0.95*n), all samples retained",
    requirement_ms: THRESHOLDS.warm_fleet_p95_ms_max,
    pass: repeats === THRESHOLDS.warm_fleet_repeats && p95 <= THRESHOLDS.warm_fleet_p95_ms_max,
  };
}

export function evaluateRepeatP50(samplesMs) {
  const repeats = samplesMs.length;
  const p50 = repeats ? median(samplesMs) : null;
  return {
    repeats,
    p50_ms: p50,
    requirement_ms: THRESHOLDS.per_query_p50_ms_lt,
    pass: repeats === THRESHOLDS.per_query_repeats && p50 < THRESHOLDS.per_query_p50_ms_lt,
  };
}

/** Original raw differ: every semantic difference is retained; nothing ignored. */
export function differences(a, b, at = "", result = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return result;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${at}/${key}`, result);
  } else {
    result.push({ path: at, before: a === undefined ? "[absent]" : a, after: b === undefined ? "[absent]" : b });
  }
  return result;
}

/**
 * Separate documented owner/fallback reconciliations from raw diffs. The raw diff
 * list is never altered; exact_equal stays false when any difference exists.
 * Only exact (path, pointer) matches carrying owner+reason qualify; no wildcards.
 */
export function reconcileDifferences(diffByPath, reconciliations = []) {
  const documented = [];
  const unreconciled = [];
  for (const [requestPath, diffs] of Object.entries(diffByPath)) {
    for (const diff of diffs) {
      const match = reconciliations.find(
        (r) =>
          r.path === requestPath &&
          r.pointer === diff.path &&
          (!("before" in r) || JSON.stringify(r.before) === JSON.stringify(diff.before)) &&
          (!("after" in r) || JSON.stringify(r.after) === JSON.stringify(diff.after)),
      );
      if (match) documented.push({ request_path: requestPath, ...diff, owner: match.owner, reason: match.reason });
      else unreconciled.push({ request_path: requestPath, ...diff });
    }
  }
  const total = Object.values(diffByPath).reduce((n, d) => n + d.length, 0);
  return {
    exact_equal: total === 0,
    difference_count: total,
    documented_reconciliations: documented,
    unreconciled_difference_count: unreconciled.length,
    unreconciled_differences: unreconciled,
    all_differences_preserved: true,
  };
}

/** Business-write guard: reads and the three auth writes pass; everything else is blocked. */
export function classifyRequest(method, pathname) {
  if (["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase())) return "allow";
  return ALLOWED_WRITE_PATHS.includes(pathname) ? "allow" : "block";
}

export function isPantheonHttpsOrigin(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    !parsed.username &&
    !parsed.password &&
    !parsed.port &&
    (parsed.hostname === "mvl-cap.tw" || parsed.hostname.endsWith(".mvl-cap.tw"))
  );
}

const nonEmptyString = (v) => typeof v === "string" && v.length > 0;

/** Throws Error whose message names only the missing/invalid field (never a value). */
export function validateInput(input, { isAllowedOrigin = isPantheonHttpsOrigin } = {}) {
  const need = (cond, what) => {
    if (!cond) throw new Error(`invalid QA input: ${what}`);
  };
  need(input && typeof input === "object", "JSON object required");
  const { profiles, identity, expected, baseline_raw: raw, baseline_identity: bid } = input;
  need(profiles && typeof profiles === "object", "profiles");
  for (const name of ROLE_ORDER) {
    need(profiles[name] && nonEmptyString(profiles[name].client_id) && nonEmptyString(profiles[name].client_secret), `profile ${name} credentials`);
  }
  need(identity && nonEmptyString(identity.DEV_FE_URL) && nonEmptyString(identity.DEV_BFF_URL), "identity.DEV_FE_URL/DEV_BFF_URL");
  need(isAllowedOrigin(identity.DEV_FE_URL), "identity.DEV_FE_URL is not an allowed Pantheon origin");
  need(isAllowedOrigin(identity.DEV_BFF_URL), "identity.DEV_BFF_URL is not an allowed Pantheon origin");
  need(expected && typeof expected === "object", "expected");
  for (const key of ["fe", "bff", "pair", "tenant_id", "persona_id"]) need(nonEmptyString(expected[key]), `expected.${key}`);
  need(nonEmptyString(String(expected.root ?? "")), "expected.root");
  need(expected.roles && ROLE_ORDER.every((n) => Array.isArray(expected.roles[n]) && expected.roles[n].length > 0), "expected.roles for all four profiles");
  need(expected.roles.TEST_ADMIN?.includes("admin"), "expected.roles.TEST_ADMIN must include admin");
  const registry = expected.source_owner_registry;
  need(registry && Array.isArray(registry.connector_ids) && registry.connector_ids.length > 0, "expected.source_owner_registry.connector_ids (actual owner inventory)");
  need(["legacy_projection", "governed_owner"].includes(registry.source_mode), "expected.source_owner_registry.source_mode");
  if (expected.reconciliations !== undefined) {
    need(Array.isArray(expected.reconciliations), "expected.reconciliations must be an array");
    for (const r of expected.reconciliations) need(r && nonEmptyString(r.path) && nonEmptyString(r.pointer) && nonEmptyString(r.owner) && nonEmptyString(r.reason), "each reconciliation needs path, pointer, owner, reason");
  }
  need(nonEmptyString(raw), "baseline_raw (original baseline JSON text)");
  need(bid && nonEmptyString(bid.sha256), "baseline_identity.sha256");
  need(sha256(raw) === bid.sha256, "baseline_raw does not match baseline_identity.sha256");
  let baseline;
  try {
    baseline = JSON.parse(raw);
  } catch {
    throw new Error("invalid QA input: baseline_raw is not JSON");
  }
  const paths = Object.keys(baseline);
  const strategyPaths = paths.filter((p) => p.startsWith("/bff/strategies"));
  need(strategyPaths.length === 12 && paths.length === 13 && paths.includes(DATA_SOURCES_PATH), "baseline must be the original 13 captures (12 strategy + data-sources)");
  for (const p of paths) need(baseline[p] && baseline[p].j !== undefined, `baseline capture ${p} lacks response JSON`);
  need(paths.includes(DEFAULT_PAGE_PATH) && paths.includes(HIDE_RETIRED_PATH), "baseline lacks original default-page/hide_retired queries");
  const personaPath = paths.find((p) => p.includes(`persona_id=${expected.persona_id}`));
  need(Boolean(personaPath), "expected.persona_id does not occur in a baseline query");
  return { baseline, personaPath };
}

export function assessPair(manifest, version, expected) {
  const failures = [];
  const eq = (label, a, b) => a !== b && failures.push(`${label} mismatch`);
  eq("deploymentState", manifest?.deploymentState, "accepted");
  eq("frontendSha", manifest?.frontendSha, expected.fe);
  eq("bffCommit", manifest?.bffCommit, expected.bff);
  eq("version.source_commit_sha", version?.source_commit_sha, expected.bff);
  eq("root", String(manifest?.releaseAdmission?.controller?.runId), String(expected.root));
  eq("pairId", manifest?.pairId, expected.pair);
  eq("auth_mode", version?.config_posture?.auth_mode, "strict");
  eq("auth_stub", version?.config_posture?.auth_stub, false);
  eq("mfa_required", version?.config_posture?.mfa_required, false);
  return {
    ok: failures.length === 0,
    failures,
    identity: {
      fe: manifest?.frontendSha,
      bff: version?.source_commit_sha,
      pair: manifest?.pairId,
      root: manifest?.releaseAdmission?.controller?.runId,
    },
  };
}

export function evaluateFleetClassification(body) {
  const rows = body?.data?.items;
  const filters = body?.data?.summary?.filters;
  const failures = [];
  if (!Array.isArray(rows) || rows.length === 0) failures.push("empty actual trading Fleet");
  if (JSON.stringify(filters) !== JSON.stringify({ purpose: "trading", data_scope: "regular", archived: "exclude" })) failures.push("effective Fleet filters are not trading/regular/exclude");
  const view = (rows || []).map((x) => ({
    id: x.persona_id || x.id,
    persona_purpose: x.persona_purpose,
    data_scope: x.data_scope,
    classification_confirmed: x.classification_confirmed,
    archived: x.archived,
  }));
  if (!view.every((x) => x.persona_purpose === "trading" && x.data_scope === "regular" && x.classification_confirmed === true && x.archived === false)) {
    failures.push("regular trading Fleet includes advisory/test/unknown/archived row");
  }
  return { filters, rows: view, failures };
}

export function evaluateIdentity(self, expectedTenant, expectedRoles) {
  const subject = self?.user_id || self?.user?.id || self?.subject || self?.sub || self?.id;
  const tenant = self?.tenant_id || self?.tenant?.id || self?.user?.tenant_id;
  const roles = self?.roles || self?.user?.roles || (self?.role ? [self.role] : undefined);
  const failures = [];
  if (!nonEmptyString(subject)) failures.push("no verified server subject");
  if (tenant !== expectedTenant) failures.push("tenant mismatch");
  if (!Array.isArray(roles) || JSON.stringify([...roles].sort()) !== JSON.stringify([...expectedRoles].sort())) failures.push("roles mismatch");
  return { subject, tenant, roles, failures };
}

/** Evaluate a /bff/management/data-sources body against the independently obtained owner inventory. */
export function evaluateDataSources(body, registry) {
  const items = body?.data?.items || [];
  const meta = body?.meta || {};
  const ids = items.map((x) => x.connector_id || x.id);
  const witness = {
    count: items.length,
    status: meta.status,
    source: meta.source,
    commands_enabled: meta.source_commands_enabled,
    connector_ids: ids,
    action_fields_present: items.some((x) => "allowed_actions" in x || "allowedActions" in x),
    health_pause: items.map((x) => ({ id: x.connector_id || x.id, health: x.health ?? x.status ?? null, pause_reason: x.pause_reason ?? x.paused_reason ?? null })),
  };
  const failures = [];
  const sortedEq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (items.length === 0) failures.push("data-sources empty (unavailable-as-empty is not success)");
  if (!sortedEq(ids, registry.connector_ids)) failures.push("every actual owner connector must be present exactly once");
  if (registry.source_mode === "legacy_projection") {
    if (meta.status !== "degraded") failures.push("legacy fallback status must be degraded");
    if (meta.source !== "legacy_projection") failures.push("legacy fallback source must be legacy_projection");
    if (meta.source_commands_enabled !== false) failures.push("legacy fallback commands must be false");
    if (witness.action_fields_present) failures.push("legacy fallback rows must not carry action fields");
  } else {
    if (meta.source === "legacy_projection") failures.push("governed owner response must not be legacy_projection");
    if (registry.meta_source && meta.source !== registry.meta_source) failures.push("governed owner meta.source mismatch");
  }
  return { witness, failures };
}

// ---------------------------------------------------------------- browser run

async function loadChromium() {
  for (const pkg of ["playwright", "@playwright/test"]) {
    try {
      const mod = await import(pkg);
      if (mod.chromium) return mod.chromium;
    } catch {
      /* try next */
    }
  }
  throw new Error("Playwright package not resolvable (install playwright or @playwright/test)");
}

export function observe(ctx, page, row, API, { onBlockedWrite }) {
  const requestStarts = new WeakMap();
  const state = { loginAcceptedAt: Infinity, observeHttp: true, firstFleetStarted: undefined, firstFleetUrl: undefined };
  page.on("request", (r) => {
    requestStarts.set(r, Date.now());
    if (new URL(r.url()).pathname === FLEET_PATH && r.method() === "GET" && state.firstFleetStarted === undefined) {
      state.firstFleetStarted = Date.now();
      state.firstFleetStartedAt = new Date(state.firstFleetStarted).toISOString();
      state.firstFleetUrl = r.url();
    }
  });
  page.on("response", (r) => {
    const req = r.request();
    const url = new URL(r.url());
    if (url.origin !== new URL(API).origin) return;
    if (url.pathname === "/bff/auth/dev-login" && req.method() === "POST" && r.status() === 200) {
      state.loginAcceptedAt = Date.now();
      row.login_accepted_at = new Date(state.loginAcceptedAt).toISOString();
    }
    if (!state.observeHttp || r.status() < 400) return;
    const started = requestStarts.get(req) ?? Date.now();
    const witness = {
      path: url.pathname,
      method: req.method(),
      status: r.status(),
      request_started_at: new Date(started).toISOString(),
      dispatched_before_successful_login: started < state.loginAcceptedAt,
    };
    const expected401 = r.status() === 401 && started < state.loginAcceptedAt && ["/bff/me", "/bff/readiness"].includes(url.pathname);
    (expected401 ? row.prelogin_expected_401 : row.http_api_errors).push(witness);
  });
  page.on("pageerror", (e) => row.page_errors.push(row.__redact(e.message)));
  // net::ERR_ABORTED is ignorable ONLY with real navigation/frame/page-close evidence.
  // Unproven (e.g. a live AbortController.abort() on a still-present page) stays a failure.
  let navCount = 0;
  const navAtStart = new WeakMap();
  const unproven = [];
  const settle = () => {
    const now = Date.now();
    for (const { e, at } of unproven.splice(0)) {
      if (now - at > 250) continue; // only the event ordering race, not a later unrelated navigation
      const i = row.failed_api_requests.indexOf(e);
      if (i >= 0) row.failed_api_requests.splice(i, 1);
      row.cancelled_api_requests.push({ ...e, evidence: "navigation_or_close" });
    }
  };
  page.on("request", (r) => {
    // Only a real cross-document main-frame navigation request counts. framenavigated also fires for
    // same-document history.pushState/hash changes, which do NOT cancel in-flight fetches.
    let docNav = false;
    try { docNav = r.isNavigationRequest() && !r.frame().parentFrame(); } catch { /* frame gone */ }
    if (docNav) { navCount++; settle(); }
    navAtStart.set(r, docNav ? navCount - 1 : navCount);
  });
  page.on("close", () => { navCount++; settle(); });
  page.on("requestfailed", (r) => {
    if (!r.url().startsWith(API + "/")) return;
    const e = { url: r.url(), method: r.method(), error: r.failure()?.errorText };
    if (e.error !== "net::ERR_ABORTED") return void row.failed_api_requests.push(e);
    let detached = false;
    try { detached = Boolean(r.frame?.()?.isDetached?.()); } catch { /* frame gone */ }
    if (detached || page.isClosed?.() || navCount > (navAtStart.get(r) ?? navCount)) {
      row.cancelled_api_requests.push({ ...e, evidence: "navigation_or_close" });
    } else {
      row.failed_api_requests.push(e);
      unproven.push({ e, at: Date.now() }); // may be reclassified if the navigation event arrives afterwards
    }
  });
  return { state, install: () => ctx.route(API + "/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    if (classifyRequest(req.method(), pathname) === "allow") return route.continue();
    onBlockedWrite({ method: req.method(), path: pathname });
    return route.abort("blockedbyclient");
  }) };
}

const newRow = (redact) => {
  const row = { errors: [], routes: [], page_errors: [], failed_api_requests: [], cancelled_api_requests: [], http_api_errors: [], prelogin_expected_401: [] };
  Object.defineProperty(row, "__redact", { value: redact, enumerable: false });
  return row;
};

/**
 * @param input validated QA input (see header)
 * @param deps  { chromium?, outDir, isAllowedOrigin?, fetchImpl? }
 */
export async function run(input, deps = {}) {
  const { baseline, personaPath } = validateInput(input, { isAllowedOrigin: deps.isAllowedOrigin });
  assert.ok(deps.outDir, "--out-dir is required");
  const { profiles, identity, expected } = input;
  const WEB = trimSlash(identity.DEV_FE_URL);
  const API = trimSlash(identity.DEV_BFF_URL);
  const registry = expected.source_owner_registry;
  const redact = makeRedactor(Object.values(profiles).map((x) => x.client_secret));
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  fs.mkdirSync(deps.outDir, { recursive: true, mode: 0o700 });
  const dir = fs.mkdtempSync(path.join(deps.outDir, "paired-readonly-"));
  fs.chmodSync(dir, 0o700);
  const save = (name, data) => fs.writeFileSync(path.join(dir, name), redact.json(data, 2) + "\n", { mode: 0o600 });

  const out = {
    started_at: new Date().toISOString(),
    scope:
      "ORIGINAL same-pair Persona/strategy read-only acceptance: four sequential real GUI logins (TEST_ADMIN, OPERATOR_A, OPERATOR_B, VIEWER) with Fleet/holdings/DataSources reads, logout+me401, then admin 20 warm Fleet reads, original 13 baseline captures, 10-repeat timings; only auth login/refresh/logout writes",
    source_hashes: { baseline_sha256: input.baseline_identity.sha256, expected_pair: expected.pair },
    thresholds: THRESHOLDS,
    source_owner_registry: registry,
    public_reads: [],
    blocked_writes: [],
    errors: [],
    profiles: {},
    strategy: { captures: {}, performance: {}, routes: [] },
  };
  const blockedWrite = (w) => out.blocked_writes.push({ ...w, at: new Date().toISOString() });
  const chromium = deps.chromium || (await loadChromium());
  const browser = await chromium.launch({ headless: true });

  async function publicJson(url) {
    const r = await fetchImpl(url, { cache: "no-store" });
    const raw = await r.text();
    out.public_reads.push({ at: new Date().toISOString(), url, status: r.status, bytes: Buffer.byteLength(raw), sha256: sha256(raw) });
    assert.equal(r.status, 200, `public read ${url}`);
    return JSON.parse(raw);
  }
  async function pair(label) {
    const manifest = await publicJson(WEB + "/deployment.json");
    const version = await publicJson(API + "/bff/version");
    const assessed = assessPair(manifest, version, expected);
    assert.ok(assessed.ok, `pair ${label}: ${assessed.failures.join(", ")}`);
    return assessed.identity;
  }
  const guardedLogin = async (page, profile, row) => {
    await page.locator("#dev-account").fill(profile.client_id, { timeout: THRESHOLDS.navigation_timeout_ms });
    await page.locator("#dev-password").fill(profile.client_secret);
    const login = page.waitForResponse((r) => new URL(r.url()).pathname === "/bff/auth/dev-login" && r.request().method() === "POST", { timeout: THRESHOLDS.navigation_timeout_ms });
    return { login, click: () => page.getByRole("button", { name: "Sign in", exact: true }).click(), row };
  };

  // ---- Phase 1: four-role sequential real GUI protocol
  async function runProfile(name) {
    const profile = profiles[name];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    const row = (out.profiles[name] = newRow(redact));
    const obs = observe(ctx, page, row, API, { onBlockedWrite: blockedWrite });
    await obs.install();
    try {
      await page.goto(WEB + "/management/persona-fleet?data=regular", { waitUntil: "domcontentloaded" });
      const step = await guardedLogin(page, profile, row);
      const firstFleet = page
        .waitForResponse((r) => new URL(r.url()).pathname === FLEET_PATH && r.request().method() === "GET", { timeout: THRESHOLDS.navigation_timeout_ms })
        .then(async (response) => {
          await response.finished();
          row.fresh_entry_api_status = response.status();
          row.fresh_entry_api_ms = Date.now() - obs.state.firstFleetStarted;
          // Captured after timing has stopped; does not alter the measurement.
          const hdrs = response.headers();
          row.fresh_entry_measurement = {
            started_utc: obs.state.firstFleetStartedAt,
            api_finished_utc: new Date().toISOString(),
            request_identity: Object.fromEntries(IDENTITY_HEADERS.map((h) => [h, hdrs[h] ?? null])),
          };
          row.fresh_entry_query = response.url();
          return response;
        });
      firstFleet.catch(() => {});
      await step.click();
      row.ui_login_status = (await step.login).status();
      assert.equal(row.ui_login_status, 200, `${name} GUI login`);
      assert.equal((await firstFleet).status(), 200, `${name} fresh-entry Fleet read`);
      await page.getByTestId("persona-fleet-table-scroll").locator("tbody tr").first().waitFor({ state: "visible", timeout: THRESHOLDS.navigation_timeout_ms });
      row.fresh_entry_usable_ms = Date.now() - obs.state.firstFleetStarted;
      if (row.fresh_entry_measurement) row.fresh_entry_measurement.usable_finished_utc = new Date().toISOString();
      row.fresh_entry_visible_rows = await page.getByTestId("persona-fleet-table-scroll").locator("tbody tr").count();
      row.fresh_entry_pass = evaluateFreshEntry(row.fresh_entry_api_ms, row.fresh_entry_usable_ms);
      row.fresh_entry_definition = "New browser context and real GUI login; first actual Fleet request start to full API completion and visible first row, excluding login; no service restart or prewarm";
      const classification = evaluateFleetClassification(await (await firstFleet).json());
      row.fresh_entry_fleet_classification = { filters: classification.filters, rows: classification.rows };
      assert.deepEqual(classification.failures, [], `${name} Fleet classification`);

      const me = await ctx.request.get(API + "/bff/me");
      row.me_status = me.status();
      assert.equal(me.status(), 200, `${name} me`);
      const rawSelf = await me.json();
      const self = rawSelf.data ?? rawSelf;
      const ident = evaluateIdentity(self, expected.tenant_id, expected.roles[name]);
      row.me_shape_keys = Object.keys(self);
      Object.assign(row, { subject: ident.subject, tenant: ident.tenant, roles: ident.roles });
      assert.deepEqual(ident.failures, [], `${name} verified server identity`);

      await page.getByRole("heading", { level: 1, name: /Persona/i }).waitFor({ timeout: THRESHOLDS.navigation_timeout_ms });
      for (const [p, read, heading, destination] of [
        ["/management/persona-fleet?data=regular", FLEET_PATH, /Persona/i, "/management/persona-fleet"],
        ["/management/portfolio-book", "/bff/management/portfolio-book/holdings", /^(資金持倉總覽|Portfolio Book|Portfolio Holdings)$/i, "/management/performance"],
        ["/management/data-sources", DATA_SOURCES_PATH, /資料源|數據源|Data Sources/i, "/management/data-sources"],
      ]) {
        const began = Date.now();
        const wait = page.waitForResponse((r) => new URL(r.url()).pathname === read && r.request().method() === "GET", { timeout: THRESHOLDS.navigation_timeout_ms });
        await page.goto(WEB + p, { waitUntil: "domcontentloaded" });
        const response = await wait;
        await response.finished();
        const witness = { requested: p, read, status: response.status(), url: page.url(), elapsed_ms: Date.now() - began };
        row.routes.push(witness);
        assert.equal(response.status(), 200, `${name} protected ${read}`);
        await page.getByRole("heading", { level: 1, name: heading }).waitFor({ timeout: THRESHOLDS.navigation_timeout_ms });
        witness.url = page.url();
        witness.heading = await page.locator("h1").first().innerText();
        assert.equal(new URL(page.url()).pathname, destination);
        await page.locator('[data-testid="data-table-loading"]:visible,[data-testid="data-sources-loading"]:visible,[data-testid="data-sources-operational-readiness-loading"]:visible').first().waitFor({ state: "hidden", timeout: THRESHOLDS.navigation_timeout_ms });
        await page.locator("table tbody tr").first().waitFor({ state: "visible", timeout: THRESHOLDS.navigation_timeout_ms });
        if (destination === "/management/performance") assert.equal(new URL(page.url()).searchParams.get("tab"), "overview");
        if (destination === "/management/data-sources") {
          const body = await response.json();
          const ds = evaluateDataSources(body, registry);
          witness.data_sources = ds.witness;
          assert.deepEqual(ds.failures, [], `${name} data-sources`);
          if (registry.source_mode === "legacy_projection") await page.getByTestId("degraded-legacy-banner").waitFor({ state: "visible", timeout: THRESHOLDS.navigation_timeout_ms });
          witness.data_sources.visible_rows = await page.locator("table tbody tr").count();
          witness.data_sources.visible_text = await page.locator("table tbody").innerText();
          assert.equal(witness.data_sources.visible_rows, body.data.items.length, `${name} every returned connector is rendered`);
          assert.equal(await page.getByTestId("data-sources-unavailable").count(), 0, `${name} no empty/unavailable success`);
          witness.data_sources.row_control_labels = await page.locator("table tbody tr td:last-child").allTextContents();
          witness.data_sources.command_menu_count = await page.getByRole("button", { name: "More actions", exact: true }).count();
          if (registry.source_mode === "legacy_projection") assert.equal(witness.data_sources.command_menu_count, 0, `${name} legacy rows offer no command dropdown`);
        }
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        witness.usable_ms = Date.now() - began;
        witness.ready_definition = "Primary API body complete; real visible table state and initial loading surfaces settled; two browser animation frames";
      }
      assert.deepEqual(row.page_errors, [], `${name} page errors`);
      assert.deepEqual(row.failed_api_requests, [], `${name} failed API calls`);
      assert.deepEqual(row.http_api_errors, [], `${name} unexpected HTTP API failures`);
    } catch (e) {
      row.errors.push(redact(e.message));
    } finally {
      obs.state.observeHttp = false;
      try {
        const logout = await ctx.request.post(API + "/bff/logout", { headers: { Origin: WEB } });
        row.api_logout_status = logout.status();
        const after = await ctx.request.get(API + "/bff/me");
        row.after_logout_me_status = after.status();
        if (logout.status() !== 200) row.errors.push(`${name} logout status ${logout.status()}`);
        if (after.status() !== 401) row.errors.push(`${name} me after logout status ${after.status()} (expected 401)`);
      } catch (e) {
        row.errors.push(redact(e.message));
      } finally {
        await ctx.close().catch(() => {});
      }
    }
    row.pass = row.errors.length === 0 && row.fresh_entry_pass === true;
    if (row.errors.length === 0 && row.fresh_entry_pass !== true) row.errors.push(`${name} cold fresh entry exceeded original thresholds`);
  }

  // ---- Phase 2: admin strategy/performance batch
  async function runAdminBatch() {
    const profile = profiles.TEST_ADMIN;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    const row = (out.strategy.session = newRow(redact));
    const obs = observe(ctx, page, row, API, { onBlockedWrite: blockedWrite });
    await obs.install();
    const S = out.strategy;
    const read = async (p) => {
      const at = new Date().toISOString();
      const begin = performance.now();
      const res = await ctx.request.get(API + p, { timeout: THRESHOLDS.navigation_timeout_ms });
      const text = await res.text();
      const ms = performance.now() - begin;
      assert.equal(res.status(), 200, p);
      const headers = res.headers();
      return { s: res.status(), ms, at, request_identity: Object.fromEntries(IDENTITY_HEADERS.map((h) => [h, headers[h] ?? null])), j: JSON.parse(text), sha256: sha256(text) };
    };
    try {
      await page.goto(WEB + "/management/persona-fleet?data=regular", { waitUntil: "domcontentloaded" });
      const step = await guardedLogin(page, profile, row);
      await step.click();
      S.gui_login_status = (await step.login).status();
      assert.equal(S.gui_login_status, 200, "admin batch GUI login");
      const me = await read("/bff/me");
      const ident = evaluateIdentity(me.j.data || me.j, expected.tenant_id, expected.roles.TEST_ADMIN);
      S.me = { subject: ident.subject, tenant: ident.tenant, roles: ident.roles };
      assert.deepEqual(ident.failures, [], "admin batch verified identity");
      await page.getByRole("heading", { level: 1, name: /Persona/i }).waitFor({ timeout: THRESHOLDS.navigation_timeout_ms });
      await page.getByTestId("persona-fleet-table-scroll").locator("tbody tr").first().waitFor({ state: "visible", timeout: THRESHOLDS.navigation_timeout_ms });
      assert.ok(obs.state.firstFleetUrl, "Real hosted Fleet query was observed");
      S.actual_fleet_query = obs.state.firstFleetUrl;

      const fleetSamples = [];
      for (let i = 0; i < THRESHOLDS.warm_fleet_repeats; i++) {
        const sample = await page.evaluate(async (url) => {
          const at = new Date().toISOString();
          const begin = performance.now();
          const response = await fetch(url, { credentials: "include", cache: "no-store" });
          const body = await response.text();
          const ms = performance.now() - begin;
          const headers = {};
          for (const h of ["x-request-id", "x-correlation-id", "x-trace-id", "server-timing"]) headers[h] = response.headers.get(h);
          return { status: response.status, ms, body, at, request_identity: headers };
        }, S.actual_fleet_query);
        assert.equal(sample.status, 200, "Actual browser Fleet warm read");
        const payload = JSON.parse(sample.body);
        fleetSamples.push({ status: sample.status, ms: sample.ms, at: sample.at, request_identity: sample.request_identity, sha256: sha256(sample.body), count: payload.data?.items?.length ?? null });
      }
      S.performance.fleet_browser_warm = { path: S.actual_fleet_query, samples: fleetSamples, ...evaluateWarmFleet(fleetSamples.map((x) => x.ms)) };

      const responses = {};
      const diff = {};
      for (const [p, before] of Object.entries(baseline)) {
        const current = await read(p);
        responses[p] = current;
        diff[p] = differences(before.j, current.j);
        S.captures[p] = { status: current.s, at: current.at, request_identity: current.request_identity, sha256: current.sha256, ms: current.ms, original_ms: before.ms, exact_equal: diff[p].length === 0, difference_count: diff[p].length, changed_paths: diff[p].slice(0, 20).map((x) => x.path) };
      }
      save("current-responses.json", responses);
      save("full-baseline-differences.json", diff);
      S.parity = {
        captured_paths: Object.keys(baseline).length,
        original_strategy_paths: Object.keys(baseline).filter((x) => x.startsWith("/bff/strategies")).length,
        ...reconcileDifferences(diff, expected.reconciliations || []),
      };

      for (const [label, p] of [["default_first_page", DEFAULT_PAGE_PATH], ["per_persona", personaPath]]) {
        const samples = [];
        const identities = [];
        for (let i = 0; i < THRESHOLDS.per_query_repeats; i++) {
          const cur = await read(p);
          samples.push(cur.ms);
          identities.push({ at: cur.at, request_identity: cur.request_identity });
        }
        S.performance[label] = { path: p, samples_ms: samples, request_identities: identities, ...evaluateRepeatP50(samples) };
      }
      const hideMs = responses[HIDE_RETIRED_PATH].ms;
      S.performance.hide_retired_without_state = { path: HIDE_RETIRED_PATH, ms: hideMs, requirement_ms: THRESHOLDS.hide_retired_ms_lt, pass: hideMs < THRESHOLDS.hide_retired_ms_lt };

      const ds = evaluateDataSources(responses[DATA_SOURCES_PATH].j, registry);
      S.data_sources = { ...ds.witness, failures: ds.failures, pass: ds.failures.length === 0 };

      const pid = expected.persona_id;
      for (const [p, apiPath] of [
        ["/management/personas/" + pid, "/bff/personas/" + pid],
        ["/management/strategies", "/bff/strategies"],
        ["/management/data-sources", DATA_SOURCES_PATH],
      ]) {
        const begin = performance.now();
        const wait = page.waitForResponse((r) => new URL(r.url()).pathname === apiPath && r.request().method() === "GET", { timeout: THRESHOLDS.navigation_timeout_ms });
        await page.goto(WEB + p, { waitUntil: "domcontentloaded" });
        const res = await wait;
        await res.finished();
        assert.equal(res.status(), 200, apiPath);
        await page.locator("h1").first().waitFor({ state: "visible", timeout: THRESHOLDS.navigation_timeout_ms });
        await page.locator('[data-testid="data-table-loading"]:visible,[data-testid="data-sources-loading"]:visible,[data-testid="data-sources-operational-readiness-loading"]:visible').first().waitFor({ state: "hidden", timeout: THRESHOLDS.navigation_timeout_ms });
        if (p === "/management/strategies" || p === "/management/data-sources") await page.locator("table tbody tr").first().waitFor({ state: "visible", timeout: THRESHOLDS.navigation_timeout_ms });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const route = { path: p, actual_path: new URL(page.url()).pathname, api_status: res.status(), usable_ms: performance.now() - begin, heading: await page.locator("h1").first().innerText(), ready_definition: "Primary API body complete; real data-backed heading or visible list rows; initial loading surfaces settled; two browser animation frames" };
        assert.equal(route.actual_path, p);
        S.routes.push(route);
      }
      S.performance.persona_detail = { ms: S.routes[0].usable_ms, requirement_ms: THRESHOLDS.persona_detail_ms_lt, pass: S.routes[0].usable_ms < THRESHOLDS.persona_detail_ms_lt };
    } catch (e) {
      row.errors.push(redact(e.message));
    } finally {
      obs.state.observeHttp = false;
      try {
        const logout = await ctx.request.post(API + "/bff/logout", { headers: { Origin: WEB } });
        const after = await ctx.request.get(API + "/bff/me");
        S.logout_status = logout.status();
        S.after_logout_me_status = after.status();
        if (logout.status() !== 200 || after.status() !== 401) row.errors.push("admin batch logout/me401 failed");
      } catch (e) {
        row.errors.push(redact(e.message));
      } finally {
        await ctx.close().catch(() => {});
      }
    }
  }

  try {
    out.before = await pair("before");
    for (const name of ROLE_ORDER) await runProfile(name);
    out.after_four_role = await pair("after four-role");
    assert.deepEqual(out.after_four_role, out.before, "pair identity changed during four-role phase");
    await runAdminBatch();
    out.after = await pair("after");
    assert.deepEqual(out.after, out.before, "pair identity changed during run");
  } catch (e) {
    out.errors.push(redact(e.message));
  } finally {
    await browser.close().catch(() => {});
  }

  // ---- verdicts (never loosened)
  const S = out.strategy;
  const subjects = ROLE_ORDER.map((n) => out.profiles[n]?.subject);
  const four = {
    all_roles_ran: ROLE_ORDER.every((n) => out.profiles[n]),
    per_role_pass: Object.fromEntries(ROLE_ORDER.map((n) => [n, out.profiles[n]?.pass === true])),
    distinct_subjects: subjects.every(nonEmptyString) && new Set(subjects).size === ROLE_ORDER.length,
    cold_all_four_pass: ROLE_ORDER.every((n) => out.profiles[n]?.fresh_entry_pass === true),
  };
  const perf = S.performance;
  const perfPass = ["fleet_browser_warm", "default_first_page", "per_persona", "hide_retired_without_state", "persona_detail"].every((k) => perf[k]?.pass === true);
  const sessionOk = (S.session?.errors.length ?? 1) === 0 &&
    (S.session?.page_errors.length ?? 1) === 0 &&
    (S.session?.failed_api_requests.length ?? 1) === 0 &&
    (S.session?.http_api_errors.length ?? 1) === 0 && S.me?.subject === out.profiles.TEST_ADMIN?.subject;
  out.verdict = {
    four_role_pass: four.all_roles_ran && Object.values(four.per_role_pass).every(Boolean) && four.distinct_subjects && four.cold_all_four_pass,
    four_role: four,
    strategy_measured_checks_pass: perfPass && S.data_sources?.pass === true && sessionOk && out.blocked_writes.length === 0,
    exact_equal: S.parity?.exact_equal ?? false,
    unreconciled_difference_count: S.parity?.unreconciled_difference_count ?? null,
  };
  out.verdict.all_acceptances_proven =
    out.errors.length === 0 &&
    out.verdict.four_role_pass &&
    out.verdict.strategy_measured_checks_pass &&
    S.parity?.unreconciled_difference_count === 0;
  out.verdict.note = "Hosted-run result only when executed by the protected original caller; fixture/local runs are not hosted proof. Pass here is not product/all-roles/financial PASS.";
  out.pass = out.verdict.all_acceptances_proven;
  out.finished_at = new Date().toISOString();
  save("result.json", out);
  return { out, dir };
}

const trimSlash = (u) => String(u).replace(/\/+$/, "");

function parseArgs(argv) {
  const i = argv.indexOf("--out-dir");
  return { outDir: i >= 0 ? argv[i + 1] : undefined };
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  if (!outDir) {
    process.stderr.write("usage: accept-persona-strategy-hosted-readonly.mjs --out-dir <private-dir> < input.json\n");
    process.exitCode = 2;
    return;
  }
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.stderr.write("invalid QA input: stdin is not JSON\n");
    process.exitCode = 2;
    return;
  }
  const secrets = Object.values(input?.profiles || {}).map((x) => x?.client_secret);
  const redact = makeRedactor(secrets);
  try {
    const { out, dir } = await run(input, { outDir });
    process.stdout.write(
      redact.json({ file: path.join(dir, "result.json"), pass: out.pass, verdict: out.verdict, errors: out.errors, role_errors: Object.fromEntries(ROLE_ORDER.map((n) => [n, out.profiles[n]?.errors])), strategy_errors: out.strategy.session?.errors }) + "\n",
    );
    if (!out.pass) process.exitCode = 1;
  } catch (e) {
    process.stderr.write(redact(e.message) + "\n");
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
