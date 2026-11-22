#!/usr/bin/env node
/**
 * Caller-run RC6 WP6.5 browser acceptance; never scheduled or a release gate.
 *
 * node scripts/accept-trading-pulse-hosted-readonly.mjs --out-dir <private-dir> < input.json
 * node --test scripts/accept-trading-pulse-hosted-readonly.test.mjs
 *
 * One JSON document on stdin (credentials stay in RAM):
 * { profile:{client_id,client_secret}, expected:{fe,bff,tenant_id},
 *   sources:{tenant_id,captured_at,provenance:[{source,sha256}],
 *     rows:[{persona_id,persona_name,runtime_id,binding_id,underlying_symbol,
 *       stage,ledger_fill_count,pnl,pnl_currency,pnl_period,
 *       filled_quantity,requested_quantity,quantity_unit}],
 *     excluded:[{persona_id,persona_name,runtime_id}],
 *     pnl_groups:[{stage,currency,period,value,covered_persona_count,eligible_persona_count}]},
 *   history:{journey_id,event_id,persona_id,persona_name,tenant_id,environment,
 *     symbol,reason_code,reason_text:{"zh-TW":...,"en-US":...},
 *     required,available,requested_quantity,submitted_to_broker,occurred_at} }
 *
 * sources is an independently read, same-tenant CURRENT registry/ledger witness,
 * not a copy of trading-pulse. Retain the raw witness at its existing private
 * evidence location; source and sha256 identify it. E supplies fresh facts from
 * A's owner reads. null means unknown; zero is a measurement. pnl_period is the
 * source's comparable period label (not an invented business timestamp).
 * History is separately supplied from an immutable event; never apply its old
 * quantities or amounts to current rows. Missing history is a failed proof.
 *
 * Only the maintained dev pair is credentialed. Uses the existing GUI dev-login
 * and cookie session, redactor and write classification. Three isolated browser
 * contexts: zh-TW 1440/390 and en-US 1440. Evidence is exactly one sanitized
 * summary and at most two masked screenshots, <=5 MiB including summary.
 * Browser profiles are temporary and deleted by Playwright close; no storage
 * state, trace, HAR, raw API bodies or credentials are persisted. Daily growth 0.
 * Exit 0 accepted; 1 measured failures/missing evidence; 2 invalid input/runtime.
 * --record-baseline permits missing sources and records observed legacy defects;
 * this mode ALWAYS exits 1 and can never establish acceptance.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { classifyRequest, makeRedactor, sha256 } from "./accept-persona-strategy-hosted-readonly.mjs";

export const FE = "https://app.dev.mvl-cap.tw";
export const BFF = "https://api.dev.mvl-cap.tw";
export const PULSE = "/management/trading-pulse";
export const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT = 20_000;
const unwrap = (v) => v?.data ?? v;
const string = (v) => typeof v === "string" && v.trim().length > 0;
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const digest = (v) => sha256(JSON.stringify(v));

export function validateInput(input, now = Date.now(), { baseline = false } = {}) {
  const need = (condition, field) => assert.ok(condition, `invalid input: ${field}`);
  need(string(input?.profile?.client_id) && string(input?.profile?.client_secret), "viewer GUI credentials");
  for (const key of ["fe", "bff"]) need(/^[0-9a-f]{40}$/.test(input.expected?.[key]), `expected.${key}`);
  need(string(input.expected?.tenant_id), "expected.tenant_id");
  if (baseline) return input;
  const s = input.sources;
  need(s?.tenant_id === input.expected.tenant_id, "source tenant");
  need(Math.abs(now - Date.parse(s.captured_at)) <= 15 * 60_000, "source capture within 15 minutes");
  need(Array.isArray(s.provenance) && s.provenance.length > 0 && s.provenance.every((p) =>
    string(p.source) && !/trading-pulse/i.test(p.source) && /^[0-9a-f]{64}$/.test(p.sha256)), "independent source provenance");
  need(Array.isArray(s.rows) && s.rows.length > 0, "nonempty independently verified operator roster (empty is missing evidence)");
  need(Array.isArray(s.excluded) && Array.isArray(s.pnl_groups), "excluded roster and comparable groups");
  for (const r of s.rows) {
    for (const key of ["persona_id", "persona_name", "runtime_id", "binding_id", "underlying_symbol", "stage"])
      need(string(r[key]), `source row ${key}`);
    for (const key of ["ledger_fill_count", "pnl", "filled_quantity", "requested_quantity"])
      need(r[key] === null || finite(r[key]), `source row ${key} (number or explicit null)`);
    need(r.pnl === null || (string(r.pnl_currency) && string(r.pnl_period)), "pnl scope");
    need(r.requested_quantity === null || string(r.quantity_unit), "quantity unit");
  }
  need(new Set(s.rows.map((r) => r.runtime_id)).size === s.rows.length, "unique runtimes");
  need(!s.excluded.some((x) => s.rows.some((r) => r.persona_id === x.persona_id)), "operator/excluded separation");
  for (const g of s.pnl_groups) {
    need(["stage", "currency", "period"].every((k) => string(g[k])) && finite(g.value), "group scope/value");
    const eligible = s.rows.filter((r) => r.stage === g.stage && r.pnl_currency === g.currency && r.pnl_period === g.period);
    const covered = eligible.filter((r) => finite(r.pnl));
    need(new Set(covered.map((r) => r.persona_id)).size === g.covered_persona_count &&
      new Set(eligible.map((r) => r.persona_id)).size === g.eligible_persona_count, "group denominator");
    need(Math.abs(covered.reduce((n, r) => n + r.pnl, 0) - g.value) < 1e-7, "comparable group sum");
  }
  if (input.history) {
    const h = input.history;
    for (const k of ["journey_id", "event_id", "persona_id", "persona_name", "environment", "symbol", "reason_code", "occurred_at"])
      need(string(h[k]), `history.${k}`);
    need(h.tenant_id === s.tenant_id && ["paper", "canary", "live"].includes(h.environment), "historical scope");
    need(["zh-TW", "en-US"].every((l) => string(h.reason_text?.[l])), "source reason business text in both locales");
    need(["required", "available", "requested_quantity"].every((k) => finite(h[k])) &&
      h.submitted_to_broker === false, "historical rejection quantities and pre-broker proof");
  }
  return input;
}

export function safeTarget(href, base = FE) {
  if (!string(href) || href === "#") return null;
  try {
    const u = new URL(href, base);
    return u.origin === base && !u.username && !u.password && u.pathname.startsWith("/management/") && !u.hash ? u : null;
  } catch { return null; }
}

// Tolerates business rounding to 2 decimals, separators and Unicode minus, but
// does not confuse null, an em dash or unrelated digits with a real zero.
export function hasNumber(text, value, decimals = 2) {
  if (!finite(value)) return false;
  const numbers = String(text).replaceAll("−", "-").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/g) || [];
  const expected = Number(value.toFixed(decimals));
  return numbers.some((n) => Number(n) === expected || Math.abs(Number(n) - value) < 1e-7);
}
export function unknownText(text) { return /尚無|尚未|無法|未知|不足|不適用|unavailable|unknown|no (?:fills|trades|orders|pnl)|not (?:available|yet)|insufficient|—/i.test(text); }

const LABELS = {
  fills: /成交筆數|成交數|交易筆數|成交.*筆|trades|fill count|fills/i,
  pnl: /損益|p&l|pnl/i,
  rate: /成交率|fill rate/i,
};
const stageText = (text, stage) => stage === "paper" ? /模擬|紙上|paper/i.test(text)
  : stage === "canary" ? /canary|金絲雀/i.test(text) : /實盤|live/i.test(text);

export function assessRow(source, row) {
  const failures = [];
  const check = (ok, code) => { if (!ok) failures.push(code); };
  check(row?.text?.includes(source.persona_name), "persona_name");
  check(row?.text?.includes(source.underlying_symbol), "symbol");
  check(stageText(row?.text || "", source.stage), "stage");
  const field = (kind) => (row?.fields || []).filter((x) => LABELS[kind].test(x.label)).map((x) => x.value).join(" ");
  const fills = field("fills"), pnl = field("pnl"), rate = field("rate");
  check(source.ledger_fill_count === null ? unknownText(fills) : hasNumber(fills, source.ledger_fill_count, 0), "ledger_fill_count");
  check(source.pnl === null ? unknownText(pnl) && !hasNumber(pnl, 0) : hasNumber(pnl, source.pnl) && pnl.includes(source.pnl_currency), "pnl_value_currency");
  if (source.requested_quantity > 0 && source.filled_quantity !== null) {
    check(hasNumber(rate, 100 * source.filled_quantity / source.requested_quantity) && rate.includes("%"), "fill_rate_percent");
    check(hasNumber(rate, source.filled_quantity) && hasNumber(rate, source.requested_quantity) && rate.includes(source.quantity_unit), "fill_rate_basis_unit");
  } else check(unknownText(rate), "fill_rate_unknown");
  check(row?.links?.some((l) => {
    const u = safeTarget(l.href);
    const scoped = u?.pathname === `/management/personas/${encodeURIComponent(source.persona_id)}` ||
      (u?.pathname === "/management/trade-journeys" && u.searchParams.get("persona_id") === source.persona_id);
    return scoped && l.visible && l.inViewportX;
  }), "primary_entry_without_horizontal_scroll");
  return failures;
}

export function assessOverview(sources, snapshot, locale) {
  const failures = [];
  for (const [i, r] of sources.rows.entries()) {
    const matches = snapshot.rows.filter((x) => x.text.includes(r.persona_name) && x.text.includes(r.underlying_symbol));
    if (matches.length !== 1) failures.push(`row[${i}]:unique_named_runtime_missing`);
    else failures.push(...assessRow(r, matches[0]).map((f) => `row[${i}]:${f}`));
  }
  const ids = sources.rows.flatMap((r) => [r.runtime_id, r.binding_id, r.persona_id]);
  if (ids.some((id) => snapshot.text.includes(id))) failures.push("source_ids_visible_by_default");
  if (sources.excluded.some((r) => Object.values(r).filter(string).some((v) => snapshot.text.includes(v)))) failures.push("probe_persona_visible");
  if (/LIVE BFF|Row health|Checks|runtime_binding_service|telemetry_service|列健康|檢查項/i.test(snapshot.text)) failures.push("engineering_diagnostics_visible_by_default");
  if (!snapshot.diagnosticsCollapsed) failures.push("diagnostics_not_collapsed");
  if (!snapshot.heading.includes(locale === "zh-TW" ? "交易脈動" : "Trading Pulse")) failures.push("locale_heading");
  if (locale === "en-US" && /成交率|資料診斷|模擬交易|尚未成交/.test(snapshot.text)) failures.push("mixed_locale");
  if (locale === "zh-TW" && /Fill Rate|Runtime Status|Execution Quality/.test(snapshot.text)) failures.push("mixed_locale");
  const distinct = new Set(sources.rows.map((r) => r.persona_id)).size;
  const summary = snapshot.summaryText || "";
  if (!/Persona|人數|營運/.test(summary) || !hasNumber(summary, distinct, 0)) failures.push("operator_persona_count");
  for (const [i, g] of sources.pnl_groups.entries()) {
    const candidate = snapshot.groups?.find((x) => stageText(x, g.stage) && x.includes(g.currency) && x.includes(g.period));
    if (!candidate || !hasNumber(candidate, g.value) || !hasNumber(candidate, g.covered_persona_count, 0) ||
      !hasNumber(candidate, g.eligible_persona_count, 0) || !/涵蓋|coverage|covered/i.test(candidate)) failures.push(`group[${i}]:scope_value_coverage`);
  }
  return failures;
}

/** Raw BFF checks are separate from visible browser assertions. */
export function assessWire(sources, overview, rankings) {
  const failures = [], data = unwrap(overview), ranks = unwrap(rankings);
  const rows = data?.runtime_rows || [];
  if (!eq(rows.map((r) => r.runtime_id).sort(), sources.rows.map((r) => r.runtime_id).sort())) failures.push("runtime_roster");
  const scope = data?.summary?.operator_scope;
  if (scope?.status !== "verified" || scope?.persona_count !== new Set(sources.rows.map((r) => r.persona_id)).size ||
    scope?.runtime_count !== sources.rows.length) failures.push("operator_scope_denominators");
  for (const [i, s] of sources.rows.entries()) {
    const r = rows.find((r) => r.runtime_id === s.runtime_id), c = r?.performance_context;
    if (r?.persona_id !== s.persona_id || r?.persona_name !== s.persona_name ||
      (r?.runtime_binding_id ?? r?.binding_id) !== s.binding_id) failures.push(`row[${i}]:identity_binding`);
    if (c?.ledger_fill_count !== s.ledger_fill_count || r?.metrics?.pnl !== s.pnl) failures.push(`row[${i}]:ledger_values`);
  }
  for (const [i, g] of sources.pnl_groups.entries()) {
    const actual = data?.summary?.pnl_groups?.find((x) => x.stage === g.stage && x.currency === g.currency &&
      (x.period ?? x.period_label ?? x.period_start_at) === g.period);
    if (!actual || !["value", "covered_persona_count", "eligible_persona_count"].every((k) => actual[k] === g[k])) failures.push(`group[${i}]:wire_scope_sum`);
  }
  const blocks = Array.isArray(ranks) ? ranks : ranks?.ranking_blocks ?? ranks?.rankings ?? ranks?.blocks;
  if (!Array.isArray(blocks)) failures.push("rankings_missing");
  for (const block of blocks || []) for (const item of block.items || []) {
    if (!sources.rows.some((r) => r.persona_id === item.persona_id && (!item.runtime_id || r.runtime_id === item.runtime_id))) failures.push("rankings_wrong_operator");
    if (!string(item.persona_name) || !finite(item.value ?? item.metric_value ?? item.metrics?.[block.metric])) failures.push("rankings_name_or_value");
  }
  if (ranks?.summary?.operator_scope && !eq(ranks.summary.operator_scope, scope)) failures.push("ranking_denominator_mismatch");
  return failures;
}

export function assessPersona(source, tenant, body, text) {
  const record = unwrap(body), r = record?.persona ?? record;
  const failures = [];
  if ((r?.persona_id ?? r?.id) !== source.persona_id) failures.push("detail_persona_identity");
  if ((r?.tenant_id ?? record?.tenant_id) !== tenant) failures.push("detail_tenant");
  if (!text.includes(source.persona_name) || !text.includes(source.underlying_symbol) || !stageText(text, source.stage)) failures.push("detail_visible_object_and_stage");
  return failures;
}

export function assessJourney(history, detail, text, locale) {
  if (!history) return ["missing_historical_event_witness"];
  const d = unwrap(detail), r = d?.row ?? d?.journey ?? d;
  const failures = [];
  for (const k of ["journey_id", "persona_id", "tenant_id", "environment"])
    if (r?.[k] !== history[k]) failures.push(`journey_${k}`);
  const events = d?.timeline ?? d?.events ?? [];
  const event = events.find((e) => e.source_event_id === history.event_id || e.event_id === history.event_id);
  const outcome = r?.outcome ?? d?.outcome;
  if (!event || !Number.isFinite(Date.parse(event.occurred_at)) || Date.parse(event.occurred_at) !== Date.parse(history.occurred_at)) failures.push("historical_event_time");
  const cause = event?.reason_code === history.reason_code ? event : outcome;
  if (cause?.reason_code !== history.reason_code || cause?.submitted_to_broker !== false ||
    ![event?.source_event_id, event?.event_id, outcome?.source_event_id].includes(history.event_id)) failures.push("historical_source_reason");
  const amounts = cause?.reason_detail ?? cause;
  for (const k of ["required", "available", "requested_quantity"])
    if (amounts?.[k] !== history[k]) failures.push(`historical_${k}`);
  if (!text.includes(history.persona_name) || !text.includes(history.symbol) || !stageText(text, history.environment)) failures.push("journey_visible_object_scope");
  if (!text.includes(history.reason_text[locale]) || !hasNumber(text, history.required) || !hasNumber(text, history.available) ||
    !hasNumber(text, history.requested_quantity)) failures.push("journey_visible_source_reason");
  return failures;
}

// Semantic DOM only: no adapter imports, no test IDs supplied by A/B/D.
export async function snapshotPage(page, sources) {
  return page.evaluate(({ sources }) => {
    const visible = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
    const text = (e) => e?.innerText || "";
    const h1 = [...document.querySelectorAll("h1")].find(visible);
    const root = h1?.closest("section") || document.querySelector("main") || document.body;
    const diagnostic = [...root.querySelectorAll("summary,button")].find((e) => /資料診斷|技術診斷|diagnostic/i.test(text(e)));
    const candidates = [...root.querySelectorAll("tbody tr,article,[role=row],[data-persona-id]")].filter(visible);
    // Accessible card/dialog layouts may use a named group rather than a table.
    for (const r of sources.rows) {
      if (candidates.some((e) => text(e).includes(r.persona_name))) continue;
      const named = [...root.querySelectorAll("h2,h3,h4,a,button")].find((e) => visible(e) && text(e).includes(r.persona_name));
      const group = named?.closest("[role=group],li,article") || named?.parentElement?.parentElement;
      if (group && !candidates.includes(group)) candidates.push(group);
    }
    const rows = candidates.filter((e) => sources.rows.some((r) => text(e).includes(r.persona_name))).map((e) => {
      const fields = [];
      if (e.tagName === "TR") {
        const headers = [...e.closest("table").querySelectorAll("thead th")].map(text);
        [...e.querySelectorAll("td")].forEach((c, i) => fields.push({ label: headers[i] || "", value: text(c) }));
      }
      for (const dt of e.querySelectorAll("dt")) fields.push({ label: text(dt), value: text(dt.nextElementSibling) });
      for (const c of e.querySelectorAll("[aria-label]")) fields.push({ label: c.getAttribute("aria-label"), value: text(c) });
      return { text: text(e), fields, links: [...e.querySelectorAll("a")].map((a) => {
        const b = a.getBoundingClientRect();
        // Include clipping ancestors: bounding boxes alone miss scroll-container clipping.
        let inside = b.left >= 0 && b.right <= innerWidth;
        for (let p = a.parentElement; p && p !== root; p = p.parentElement) {
          if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) {
            const box = p.getBoundingClientRect(); inside &&= b.left >= box.left && b.right <= box.right;
          }
        }
        return { href: a.getAttribute("href"), label: text(a), visible: visible(a), inViewportX: inside };
      }) };
    });
    const groups = [...root.querySelectorAll("article,[role=group],dl,section > div > div")].filter(visible).map(text).filter((s) => s.length < 1800);
    return { heading: text(h1), text: text(root), rows, groups,
      summaryText: text(root).split(rows[0]?.text || "\0")[0],
      diagnosticsCollapsed: !!diagnostic && (diagnostic.tagName === "SUMMARY" ? !diagnostic.parentElement.open : diagnostic.getAttribute("aria-expanded") === "false") };
  }, { sources });
}

async function browserRead(page, endpoint) {
  return page.evaluate(async ({ endpoint, base, timeout }) => {
    const response = await fetch(base + endpoint, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error(`read ${endpoint.split("?")[0]} HTTP ${response.status}`);
    return response.json();
  }, { endpoint, base: BFF, timeout: TIMEOUT });
}

// Shell SSE responses stay open until context close. Only relevant finite JSON
// bodies are evidence; never await an event stream before closing the context.
export async function readObservedJson(response, timeout = TIMEOUT) {
  const u = new URL(response.url());
  if (u.origin !== BFF || response.request().method() !== "GET" ||
    !/application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers()["content-type"] || "") ||
    !/^\/bff\/(?:management\/trading-pulse(?:\/|$)|(?:management\/)?personas\/|management\/trade-journeys\/)/.test(u.pathname)) return null;
  let timer;
  try {
    const body = await Promise.race([response.json(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`JSON body timeout: ${u.pathname}`)), timeout);
    })]);
    return { path: u.pathname, query: u.search, body };
  } finally { clearTimeout(timer); }
}

export async function enterPulseViaScreen(page, locale) {
  const nav = page.locator(`a[href="${PULSE}"]:visible`).first();
  if (await nav.isVisible()) { await nav.click(); return "sidebar"; }
  // The maintained shell hides its sidebar below lg and provides Ctrl/Cmd+K.
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog");
  const name = locale === "zh-TW" ? "交易脈動" : "Trading Pulse";
  await dialog.getByRole("combobox").fill(name);
  await dialog.getByRole("option", { name, exact: true }).click();
  return "command_palette";
}

export async function keyboardActivate(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  // Start at the document boundary and actually traverse the tab order.
  await page.evaluate(() => { document.activeElement?.blur(); document.body.setAttribute("tabindex", "-1"); document.body.focus(); document.body.removeAttribute("tabindex"); });
  for (let i = 0; i < 250; i++) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((e) => e === document.activeElement)) {
      await page.keyboard.press("Enter"); return;
    }
  }
  throw new Error("primary link not reachable by keyboard Tab");
}

export async function returnViaScreen(page, targetPath) {
  const links = page.locator("a");
  for (let i = 0; i < await links.count(); i++) {
    const link = links.nth(i), u = safeTarget(await link.getAttribute("href"));
    if (u?.pathname === targetPath && await link.isVisible()) { await link.click(); return; }
  }
  throw new Error("missing on-screen return to origin");
}

export function writeEvidence(dir, report, redactor) {
  const file = path.join(dir, "summary.json");
  const images = fs.readdirSync(dir).filter((n) => n.endsWith(".png"));
  assert.ok(images.length <= 2, "two screenshot cap");
  const imageBytes = images.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  report.evidence = { files: ["summary.json", ...images], bytes: 0, max_bytes: MAX_BYTES, routine_daily_growth_bytes: 0 };
  for (let i = 0; i < 8; i++) report.evidence.bytes = imageBytes + Buffer.byteLength(redactor.json(report, 2) + "\n");
  if (report.evidence.bytes > MAX_BYTES) {
    for (const f of images) fs.unlinkSync(path.join(dir, f));
    report.failures.push("evidence_budget_exceeded_screenshots_removed"); report.pass = false;
    if (images.length === 0) {
      // A pathological response/error storm must not recurse forever or write
      // an oversized summary. Retain its digest and an explicit failed result.
      const overflow = digest(report);
      for (const key of Object.keys(report)) delete report[key];
      Object.assign(report, { schema: "trading-pulse-browser-readonly.v1", pass: false,
        failures: ["evidence_summary_budget_exceeded"], overflow_digest: overflow });
    }
    return writeEvidence(dir, report, redactor);
  }
  fs.writeFileSync(file, redactor.json(report, 2) + "\n", { mode: 0o600 });
  assert.equal(report.evidence.bytes, fs.statSync(file).size + imageBytes);
}

export async function runAcceptance(input, outDir, { baseline = false } = {}) {
  validateInput(input, Date.now(), { baseline });
  const sources = input.sources ?? { rows: [], excluded: [], pnl_groups: [], provenance: [], captured_at: null };
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const dir = fs.mkdtempSync(path.join(outDir, "trading-pulse-"));
  const privateValues = [input.profile.client_id, input.profile.client_secret, input.expected.tenant_id,
    ...sources.rows.flatMap((r) => [r.persona_id, r.runtime_id, r.binding_id, r.persona_name]),
    ...sources.excluded.flatMap(Object.values),
    ...[input.history?.persona_id, input.history?.persona_name, input.history?.journey_id, input.history?.event_id]];
  const redact = makeRedactor(privateValues.filter(string));
  const report = { schema: "trading-pulse-browser-readonly.v1", started_at: new Date().toISOString(),
    expected: { fe: input.expected.fe, bff: input.expected.bff },
    mode: baseline ? "baseline_failure_record_only" : "acceptance",
    witness: { digest: digest(sources), captured_at: sources.captured_at, provenance: sources.provenance,
      persona_count: new Set(sources.rows.map((r) => r.persona_id)).size, runtime_count: sources.rows.length },
    history_witness_digest: input.history ? digest(input.history) : null,
    failures: [], runs: [], blocked_writes: [], pass: false };
  const { chromium } = await import("@playwright/test");
  let browser;
  const publicRead = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
    assert.equal(response.status, 200, "public identity read"); return response.json();
  };
  const pair = async () => {
    const [m, v] = await Promise.all([publicRead(FE + "/deployment.json"), publicRead(BFF + "/bff/version")]);
    assert.equal(m.frontendSha, input.expected.fe, "FE changed");
    assert.equal(m.bffCommit, input.expected.bff, "paired BFF changed");
    assert.equal(v.source_commit_sha, input.expected.bff, "actual BFF changed");
    assert.equal(v.config_posture?.auth_mode, "strict", "strict auth");
    assert.equal(v.config_posture?.auth_stub, false, "no stub");
    assert.equal(m.buildMode?.VITE_BFF_MODE, "live", "live mode");
    assert.equal(m.buildMode?.VITE_BFF_FALLBACK, "strict", "strict fallback");
    return { fe: m.frontendSha, bff: v.source_commit_sha, pair: m.pairId, deployment_state: m.deploymentState,
      hosted_write_flag: m.buildMode?.VITE_BFF_REAL_WRITES, probe_business_writes: "blocked" };
  };
  try {
    report.pair_before = await pair();
    browser = await chromium.launch({ headless: true });
    for (const [locale, width] of [["zh-TW", 1440], ["zh-TW", 390], ["en-US", 1440]]) {
      const run = { locale, width, checks: [], failures: [], reads: [] }; report.runs.push(run);
      const context = await browser.newContext({ locale, viewport: { width, height: 1000 }, serviceWorkers: "block" });
      const page = await context.newPage(); page.setDefaultTimeout(TIMEOUT);
      const observed = [], pending = new Set(); let authenticated = false;
      const check = async (name, work) => {
        try { await work(); run.checks.push(name); } catch (e) { run.failures.push(`${name}: ${redact(e.message)}`); }
      };
      page.on("pageerror", (e) => run.failures.push(`render: ${redact(e.message)}`));
      await context.addInitScript((l) => localStorage.setItem("pantheon.locale", l), locale);
      await context.route("**/*", async (route) => {
        const req = route.request(), u = new URL(req.url());
        const allowedOrigin = [FE, BFF].includes(u.origin);
        if (!allowedOrigin || classifyRequest(req.method(), u.pathname) === "block") {
          report.blocked_writes.push({ method: req.method(), path: u.pathname, foreign_origin: !allowedOrigin });
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
      page.on("response", (res) => {
        const u = new URL(res.url());
        if (u.origin !== BFF || !u.pathname.startsWith("/bff/")) return;
        run.reads.push({ path: u.pathname, method: res.request().method(), status: res.status() });
        if (authenticated && res.status() >= 400) run.failures.push(`authenticated_http_${res.status()}: ${u.pathname}`);
        const task = readObservedJson(res).then((capture) => { if (capture) observed.push(capture); })
          .catch((e) => run.failures.push(`response_body: ${redact(e.message)}`)).finally(() => pending.delete(task));
        pending.add(task);
      });
      try {
        await page.goto(FE + "/management/persona-fleet?data=regular", { waitUntil: "domcontentloaded" });
        await page.locator("#dev-account").fill(input.profile.client_id);
        await page.locator("#dev-password").fill(input.profile.client_secret);
        const login = page.waitForResponse((r) => r.url() === BFF + "/bff/auth/dev-login" && r.request().method() === "POST");
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        assert.equal((await login).status(), 200, "GUI login");
        authenticated = true;
        const me = unwrap(await browserRead(page, "/bff/me"));
        const roles = me.roles ?? me.user?.roles ?? [];
        assert.equal(me.tenant_id ?? me.tenant?.id ?? me.user?.tenant_id, input.expected.tenant_id, "same tenant");
        assert.ok(roles.includes("viewer") && !roles.some((r) => ["admin", "operator"].includes(r)), "viewer-only server identity");
        await page.getByRole("heading", { name: /Persona|人格/ }).first().waitFor();
        const overviewResponse = page.waitForResponse((r) => new URL(r.url()).pathname === "/bff/management/trading-pulse" && r.request().method() === "GET");
        // Attach rejection handling immediately if UI navigation itself fails.
        overviewResponse.catch(() => {});
        run.entry = await enterPulseViaScreen(page, locale);
        assert.equal((await overviewResponse).status(), 200, "browser overview");
        await page.getByRole("heading", { name: locale === "zh-TW" ? "交易脈動" : "Trading Pulse", exact: true }).waitFor();
        await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
        await page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/trading-pulse/rankings") && r.request().method() === "GET", { timeout: 5000 }).catch(() => {});
        const snapshot = await snapshotPage(page, sources);
        run.overview_digest = digest(snapshot); // no raw business/identity text retained
        if (baseline) {
          run.failures.push("baseline_only_current_owner_witness_not_supplied");
          if (/\brt-[a-z0-9]+|\brb-[a-z0-9]+/.test(snapshot.text)) run.failures.push("source_ids_visible_by_default");
          if (!snapshot.diagnosticsCollapsed) run.failures.push("diagnostics_not_collapsed");
          if (/LIVE BFF|Row health|Checks|列健康|檢查項/.test(snapshot.text)) run.failures.push("engineering_diagnostics_visible_by_default");
          run.layout = await page.locator("table").evaluateAll((tables) => tables.map((table) => ({
            width: Math.round(table.getBoundingClientRect().width),
            entries: [...table.querySelectorAll("tbody a")].map((a) => ({
              viewport_x: a.getBoundingClientRect().left >= 0 && a.getBoundingClientRect().right <= innerWidth,
              labelled_by_source_id: /persona-[a-z0-9]+/.test(a.getAttribute("aria-label") || ""),
            })),
          })));
          if (run.layout.some((x) => x.entries.some((a) => !a.viewport_x))) run.failures.push("primary_entry_requires_horizontal_scroll");
        } else {
          await check("current_operator_content", async () => assert.deepEqual(assessOverview(sources, snapshot, locale), []));
          await check("current_wire_roster_and_rankings", async () => {
            const overview = await browserRead(page, "/bff/management/trading-pulse");
            const rankings = await browserRead(page, "/bff/management/trading-pulse/rankings");
            assert.deepEqual(assessWire(sources, overview, rankings), []);
          });
        }
        if (locale === "zh-TW") await check("masked_screenshot", async () => {
          // Mask private user/tenant chrome and all source IDs wherever they occur.
          const masks = [page.locator("header").first(), page.locator("nav,aside,[data-testid*=user],[data-testid*=tenant]")];
          for (const secret of privateValues.filter(string)) masks.push(page.getByText(secret, { exact: false }));
          masks.push(page.getByText(/\brt-[a-z0-9]+|\brb-[a-z0-9]+|\bpersona-[a-z0-9]+/));
          const file = path.join(dir, width === 390 ? "narrow.png" : "desktop.png");
          await page.screenshot({ path: file, fullPage: false, mask: masks }); fs.chmodSync(file, 0o600);
        });
        await check("diagnostics_expand_source_and_collapse", async () => {
          const trigger = page.locator("summary,button").filter({ hasText: /資料診斷|技術診斷|diagnostic/i }).first();
          await keyboardActivate(page, trigger);
          const text = await page.locator("body").innerText();
          assert.ok(sources.rows.length > 0 && sources.rows.every((r) => text.includes(r.runtime_id)), "expanded diagnostics locate each runtime");
          await trigger.click();
          assert.ok(!(await page.locator("body").innerText()).includes(sources.rows[0].runtime_id), "collapse hides IDs");
        });
        await check("persona_detail_roundtrip_keyboard", async () => {
          const source = sources.rows[0]; assert.ok(source, "missing_current_roster_witness");
          const row = snapshot.rows.find((r) => r.text.includes(source.persona_name));
          const target = row?.links.find((l) => safeTarget(l.href)?.pathname.includes("/personas/"));
          assert.ok(target, "missing named Persona detail entry");
          observed.length = 0;
          await keyboardActivate(page, page.locator(`a[href=${JSON.stringify(target.href)}]`).first());
          await page.getByText(source.persona_name, { exact: false }).first().waitFor();
          await Promise.all([...pending]);
          const capture = observed.findLast((o) => o.path.includes(source.persona_id) && !o.path.includes("trade-journeys"));
          assert.ok(capture, "detail has actual Persona read");
          assert.deepEqual(assessPersona(source, input.expected.tenant_id, capture.body, await page.locator("main").innerText()), []);
          await returnViaScreen(page, PULSE);
          await page.getByRole("heading", { name: snapshot.heading, exact: true }).waitFor();
        });
        // Keep history isolated from current metrics. Traverse only UI links;
        // a public unfiltered journey list cannot satisfy this check.
        await check("historical_rejection_roundtrip", async () => {
          const h = input.history; assert.ok(h, "missing_historical_event_witness");
          if (!new URL(page.url()).pathname.startsWith(PULSE)) await returnViaScreen(page, PULSE);
          const hrefs = page.locator("a"); let entry;
          for (let i = 0; i < await hrefs.count(); i++) {
            const link = hrefs.nth(i), u = safeTarget(await link.getAttribute("href"));
            if (u?.pathname === `/management/trade-journeys/${h.journey_id}` ||
              (u?.pathname === "/management/trade-journeys" && u.searchParams.get("persona_id") === h.persona_id)) { entry = link; break; }
          }
          assert.ok(entry, "missing source-grounded rejected-journey or scoped Persona journey entry");
          await entry.click();
          if (new URL(page.url()).pathname === "/management/trade-journeys") {
            const search = page.getByRole("textbox", { name: /搜尋|search/i }).first();
            await search.fill(h.event_id);
            const target = page.locator(`a[href*="${h.journey_id}"]`).first(); await target.waitFor(); await target.click();
          }
          await page.getByRole("heading", { name: new RegExp(h.persona_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).waitFor();
          await Promise.all([...pending]);
          const capture = observed.findLast((o) => o.path === `/bff/management/trade-journeys/${h.journey_id}`);
          assert.ok(capture, "no actual scoped journey detail read");
          const query = new URLSearchParams(capture.query);
          assert.equal(query.get("tenant_id"), h.tenant_id); assert.equal(query.get("environment"), h.environment);
          const timeline = observed.findLast((o) => o.path === `/bff/management/trade-journeys/${h.journey_id}/timeline`);
          const detail = { ...unwrap(capture.body), timeline: unwrap(timeline?.body)?.items ?? unwrap(timeline?.body)?.events ?? [] };
          assert.deepEqual(assessJourney(h, detail, await page.locator("main").innerText(), locale), []);
          await returnViaScreen(page, PULSE);
          await page.getByRole("heading", { name: snapshot.heading, exact: true }).waitFor();
        });
        await Promise.all([...pending]);
        assert.ok(run.reads.some((r) => r.path.endsWith("/trading-pulse/rankings") && r.status === 200), "actual rankings browser read missing");
      } catch (e) { run.failures.push(redact(e.message)); }
      finally { await context.close(); await Promise.all([...pending]); }
    }
    report.pair_after = await pair();
    assert.ok(eq(report.pair_before, report.pair_after), "deployment pair changed during proof");
  } catch (e) { report.failures.push(redact(e.message)); }
  finally { await browser?.close(); }
  report.finished_at = new Date().toISOString();
  report.failures.push(...report.runs.flatMap((r) => r.failures.map((f) => `${r.locale}/${r.width}: ${f}`)));
  if (report.blocked_writes.length) report.failures.push("blocked_non_read_or_foreign_requests");
  if (report.runs.length !== 3) report.failures.push("missing_viewport_locale_runs");
  report.pass = report.failures.length === 0;
  writeEvidence(dir, report, redact);
  return { dir, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input;
  try {
    assert.ok([4, 5].includes(process.argv.length) && process.argv[2] === "--out-dir" &&
      (process.argv.length === 4 || process.argv[4] === "--record-baseline"), "usage: --out-dir <private-dir> [--record-baseline], JSON stdin");
    input = JSON.parse(fs.readFileSync(0, "utf8"));
    const { dir, report } = await runAcceptance(input, path.resolve(process.argv[3]), { baseline: process.argv[4] === "--record-baseline" });
    process.stdout.write(JSON.stringify({ pass: report.pass, summary: path.join(dir, "summary.json"), bytes: report.evidence.bytes, failures: report.failures }) + "\n");
    process.exitCode = report.pass ? 0 : 1;
  } catch (e) {
    const redact = makeRedactor([input?.profile?.client_id, input?.profile?.client_secret].filter(string));
    process.stderr.write(redact(e.message) + "\n"); process.exitCode = 2;
  }
}
