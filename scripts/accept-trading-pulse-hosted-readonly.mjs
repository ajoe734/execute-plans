/**
 * RC6 WP6.5 page assertions/helpers for the existing hosted read-only runner.
 *
 * node scripts/accept-persona-strategy-hosted-readonly.mjs --mode trading-pulse --out-dir <private-dir> < input.json
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
 * pnl_currency/pnl_period are independently string or explicit null, even when
 * pnl is numeric. Such a row is not evidence for a comparable subtotal.
 * quantity_unit is optional (null/omitted), a literal label, or locale-keyed
 * labels such as {"zh-TW":"股","en-US":"shares"}, quoted from the witness.
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
import { isDeepStrictEqual } from "node:util";
import { sha256 } from "./accept-persona-strategy-hosted-readonly.mjs";

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
    for (const key of ["pnl_currency", "pnl_period"])
      need(r[key] === null || string(r[key]), `source row ${key} (string or explicit null)`);
    need(r.quantity_unit == null || string(r.quantity_unit) ||
      (typeof r.quantity_unit === "object" && !Array.isArray(r.quantity_unit) &&
        Object.keys(r.quantity_unit).length > 0 && Object.entries(r.quantity_unit).every(([l, v]) =>
          ["zh-TW", "en-US"].includes(l) && (v === null || string(v)))), "optional localized quantity unit");
  }
  need(new Set(s.rows.map((r) => r.runtime_id)).size === s.rows.length, "unique runtimes");
  need(!s.excluded.some((x) => s.rows.some((r) => r.persona_id === x.persona_id)), "operator/excluded separation");
  for (const g of s.pnl_groups) {
    need(["stage", "currency", "period"].every((k) => string(g[k])) && finite(g.value), "group scope/value");
    const eligible = s.rows.filter((r) => r.stage === g.stage && r.pnl_currency === g.currency && r.pnl_period === g.period);
    const covered = eligible.filter((r) => finite(r.pnl));
    need(covered.length > 0, "group requires comparable measured PnL");
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
export function unknownText(text) { return /尚無|尚未|無法|未知|不足|不適用|unavailable|unknown|no (?:fill(?:s|\s+p&l)?|trades|orders|pnl|p&l)|not (?:available|yet)|insufficient|—/i.test(text); }

const LABELS = {
  fills: /成交筆數|成交數|交易筆數|成交.*筆|trades|fill count|fills/i,
  pnl: /損益|p&l|pnl/i,
  rate: /成交率|fill rate/i,
};
const stageText = (text, stage) => stage === "paper" ? /模擬|紙上|paper/i.test(text)
  : stage === "canary" ? /canary|金絲雀/i.test(text) : /實盤|live/i.test(text);

export function assessRow(source, row, locale = "zh-TW") {
  const failures = [];
  const check = (ok, code) => { if (!ok) failures.push(code); };
  check(row?.text?.includes(source.persona_name), "persona_name");
  check(row?.text?.includes(source.underlying_symbol), "symbol");
  check(stageText(row?.text || "", source.stage), "stage");
  const field = (kind) => (row?.fields || []).filter((x) => LABELS[kind].test(x.label)).map((x) => x.value).join(" ");
  const fills = field("fills"), pnl = field("pnl"), rate = field("rate");
  check(source.ledger_fill_count === null ? unknownText(fills) : hasNumber(fills, source.ledger_fill_count, 0), "ledger_fill_count");
  check(source.pnl === null ? unknownText(pnl) && !hasNumber(pnl, 0)
    : hasNumber(pnl, source.pnl) && (!string(source.pnl_currency) || pnl.includes(source.pnl_currency)), "pnl_value_currency");
  if (source.requested_quantity > 0 && source.filled_quantity !== null) {
    check(hasNumber(rate, 100 * source.filled_quantity / source.requested_quantity) && rate.includes("%"), "fill_rate_percent");
    const unit = typeof source.quantity_unit === "object" ? source.quantity_unit?.[locale] : source.quantity_unit;
    check(hasNumber(rate, source.filled_quantity) && hasNumber(rate, source.requested_quantity) &&
      (!string(unit) || rate.includes(unit)), "fill_rate_basis_unit");
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
    else failures.push(...assessRow(r, matches[0], locale).map((f) => `row[${i}]:${f}`));
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
  // Subtotal regions are separate from row PnL: a finite per-row amount does
  // not authorize summing rows with unverified currency or different periods.
  for (const text of snapshot.subtotals || []) {
    if (!sources.pnl_groups.some((g) => stageText(text, g.stage) && text.includes(g.currency) &&
      text.includes(g.period) && hasNumber(text, g.value))) failures.push("unverified_comparable_subtotal");
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
    if (c?.ledger_fill_count !== s.ledger_fill_count || r?.telemetry_summary?.metrics?.pnl !== s.pnl) failures.push(`row[${i}]:ledger_values`);
    if (!c || !Object.hasOwn(c, "pnl_currency") ||
      !["pnl_period", "pnl_period_label", "pnl_period_start_at"].some((k) => Object.hasOwn(c, k)) ||
      (c.pnl_currency ?? null) !== s.pnl_currency ||
      (c?.pnl_period ?? c?.pnl_period_label ?? c?.pnl_period_start_at ?? null) !== s.pnl_period)
      failures.push(`row[${i}]:pnl_scope`);
  }
  const actualGroups = data?.summary?.pnl_groups || [];
  if (actualGroups.length !== sources.pnl_groups.length || actualGroups.some((x) => !sources.pnl_groups.some((g) =>
    x.stage === g.stage && x.currency === g.currency && (x.period ?? x.period_label ?? x.period_start_at) === g.period)))
    failures.push("unverified_comparable_subtotal");
  for (const [i, g] of sources.pnl_groups.entries()) {
    const actual = data?.summary?.pnl_groups?.find((x) => x.stage === g.stage && x.currency === g.currency &&
      (x.period ?? x.period_label ?? x.period_start_at) === g.period);
    if (!actual || !["value", "covered_persona_count", "eligible_persona_count"].every((k) => actual[k] === g[k])) failures.push(`group[${i}]:wire_scope_sum`);
  }
  // ManagementService returns blocks in data.items, and the sorted value is
  // ranking_metric_value. Never fall through a null/missing value to another
  // field: zero is measured, null and an absent measurement are distinct.
  const blocks = ranks?.items;
  const criteria = { "pnl-leaders": ["pnl", "desc"], "drawdown-control": ["drawdown", "asc"],
    "execution-quality": ["fill_rate", "desc"], "sharpe-leaders": ["sharpe_ratio", "desc"] };
  if (!Array.isArray(blocks) || !eq(blocks.map((b) => b?.block_id).sort(), Object.keys(criteria).sort()))
    failures.push("rankings_missing");
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const criterion = criteria[block?.block_id];
    if (!criterion || block.metric !== criterion[0] || block.sort_order !== criterion[1] || !Array.isArray(block.items)) {
      failures.push("rankings_invalid_block"); continue;
    }
    const seen = new Set(), scopes = [];
    for (const item of block.items) {
      const source = sources.rows.find((r) => r.persona_id === item?.persona_id && r.runtime_id === item?.runtime_id);
      const row = rows.find((r) => r.runtime_id === item?.runtime_id), c = row?.performance_context;
      if (!source || item.persona_name !== source.persona_name || seen.has(item.runtime_id)) failures.push("rankings_wrong_operator");
      seen.add(item?.runtime_id);
      const value = item?.ranking_metric_value;
      const observed = row?.telemetry_summary?.metrics?.[block.metric];
      if (!string(item?.persona_name) || !finite(value) || value !== observed ||
        item?.[block.metric] !== value || (block.metric === "pnl" && value !== source?.pnl))
        failures.push("rankings_name_or_value");
      const scope = item?.comparison_scope;
      const window = c?.fill_rate_details?.window;
      const period = block.metric === "fill_rate" && window?.start_at && window?.end_exclusive_at
        ? window : c?.metric_periods?.[block.metric];
      if (item?.ranking_eligible !== true || item?.ranking_metric !== block.metric || item?.ranking_block_id !== block.block_id ||
        !scope || scope.stage !== row?.deployment_stage || !string(scope.unit) || scope.unit !== c?.metric_units?.[block.metric] ||
        ["stale", "unavailable"].includes(c?.source_status) || !period ||
        !(string(period.start_at) || (string(period.as_of) && string(period.window))) ||
        !isDeepStrictEqual(scope.period, period) || (block.metric === "pnl" &&
          (!string(source?.pnl_currency) || !string(source?.pnl_period) || scope.unit !== source.pnl_currency ||
            period.start_at !== source.pnl_period || !string(c?.pnl_at) || !string(c?.pnl_definition) || scope.definition !== c.pnl_definition)) ||
        (block.metric === "fill_rate" && (scope.basis !== c?.fill_rate_basis || scope.quantity_unit !== c?.fill_rate_details?.unit))) failures.push("rankings_unverified_scope");
      // Ranks restart in each comparable scope; never compare different money
      // currencies, stages or observation windows as a single league table.
      const previous = scopes.find((entry) => isDeepStrictEqual(entry.scope, scope));
      if (item?.rank !== (previous?.rank ?? 0) + 1 || (previous &&
        (block.sort_order === "desc" ? value > previous.value : value < previous.value))) failures.push("rankings_invalid_order");
      if (previous) Object.assign(previous, { rank: item?.rank, value });
      else scopes.push({ scope, rank: item?.rank, value });
    }
    if (!Number.isInteger(block.eligible_item_count) || !Number.isInteger(ranks?.summary?.limit) || ranks.summary.limit < 1 ||
      block.items.length !== Math.min(block.eligible_item_count, ranks.summary.limit) ||
      !Number.isInteger(block.missing_metric_count) || !Array.isArray(block.missing_metric_runtime_ids) ||
      block.missing_metric_count !== block.missing_metric_runtime_ids.length ||
      new Set(block.missing_metric_runtime_ids).size !== block.missing_metric_count ||
      block.eligible_item_count + block.missing_metric_count !== rows.length ||
      block.missing_metric_runtime_ids.some((id) => !rows.some((r) => r.runtime_id === id) || seen.has(id)))
      failures.push("rankings_coverage");
  }
  if (!eq(ranks?.summary?.operator_scope, scope)) failures.push("ranking_denominator_mismatch");
  return failures;
}

export function assessPersona(source, tenant, body, text) {
  const record = unwrap(body), r = record?.persona ?? record;
  const failures = [];
  const ids = [r?.persona_id, r?.id].filter((v) => v !== undefined);
  if (!ids.length || ids.some((id) => id !== source.persona_id)) failures.push("detail_persona_identity");
  const tenants = [r?.tenant_id, r?.tenantId, record?.tenant_id, record?.tenantId].filter((v) => v !== undefined);
  if (!tenants.length || tenants.some((t) => t !== tenant)) failures.push("detail_tenant");
  const symbol = String(source.underlying_symbol || "").replace(/\.(?:TWSE|TPEX)$/, "");
  if (!text.includes(source.persona_name) || !string(symbol) || !(text.includes(source.underlying_symbol) || text.includes(symbol)) || !stageText(text, source.stage)) failures.push("detail_visible_object_and_stage");
  return failures;
}

const escapePattern = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Journey titles put the full/short Persona name directly before the optional
// localized side and symbol. Whitespace alone cannot delimit the Persona name.
export function journeyHeadingPattern(history) {
  const full = history.persona_name.trim();
  const short = full.split(/[｜|]/)[0].trim() || full;
  const names = [...new Set([full, short])].map(escapePattern).join("|");
  const symbols = [...new Set([history.symbol, history.symbol.split(".")[0]])].map(escapePattern).join("|");
  return new RegExp(`^(?:${names})\\s+(?:(?:買|賣|Buy|Sell)\\s+)?(?:${symbols})(?=\\s|$)`);
}

export function assessJourneyReads(history, detail, timeline) {
  const failures = [];
  for (const [label, capture, suffix] of [["detail", detail, ""], ["timeline", timeline, "/timeline"]]) {
    if (capture?.path !== `/bff/management/trade-journeys/${history.journey_id}${suffix}` || capture?.status !== 200)
      failures.push(`journey_${label}_http_200`);
    const query = new URLSearchParams(capture?.query);
    if (query.getAll("tenant_id").length !== 1 || query.get("tenant_id") !== history.tenant_id ||
      query.getAll("environment").length !== 1 || query.get("environment") !== history.environment)
      failures.push(`journey_${label}_query_scope`);
  }
  return failures;
}

export function assessJourney(history, detail, text, locale, heading = text) {
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
  const symbol = new RegExp(`(?:^|\\s)${escapePattern(history.symbol)}(?=\\s|$)`);
  if (!journeyHeadingPattern(history).test(heading) ||
    !(symbol.test(text) || symbol.test(heading)) || !stageText(text, history.environment)) failures.push("journey_visible_object_scope");
  // The immutable witness may use older business wording; the existing Journey
  // page translates this same wire reason_code with these canonical labels.
  const renderedReason = history.reason_code === "insufficient_cash"
    ? { "zh-TW": "現金不足", "en-US": "Not enough cash" }[locale] : null;
  if (![history.reason_text[locale], renderedReason].some((reason) => string(reason) && text.includes(reason)) || !hasNumber(text, history.required) || !hasNumber(text, history.available) ||
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
    const subtotals = [];
    for (const heading of root.querySelectorAll("h2,h3,h4")) {
      if (!visible(heading) || !/(?:損益|p&l|pnl).*?(?:小計|subtotal)|(?:小計|subtotal).*?(?:損益|p&l|pnl)/i.test(text(heading))) continue;
      const region = heading.parentElement?.parentElement;
      if (!region) continue;
      const blocks = [...region.querySelectorAll("[role=group],article,dl")].filter(visible);
      subtotals.push(...blocks.filter((e) => !blocks.some((child) => child !== e && e.contains(child))).map(text));
      // Also catch a plain numeric subtotal, including an invented zero. Counts
      // and dates in explanatory prose are not standalone monetary values.
      if (!blocks.length) subtotals.push(...text(region).split("\n").filter((line) =>
        /^(?:[A-Z]{3}\s*|[$€£¥]\s*)?[−+-]?\d[\d,]*(?:\.\d+)?(?:\s*[A-Z]{3})?$/.test(line.trim())));
    }
    return { heading: text(h1), text: text(root), rows, groups, subtotals,
      summaryText: text(root).split(rows[0]?.text || "\0")[0],
      diagnosticsCollapsed: !!diagnostic && (diagnostic.tagName === "SUMMARY" ? !diagnostic.parentElement.open : diagnostic.getAttribute("aria-expanded") === "false") };
  }, { sources });
}

export async function browserRead(page, endpoint) {
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
    !/^\/bff\/(?:management\/trading-pulse(?:\/|$)|(?:management\/)?personas\/[^/]+$|management\/trade-journeys\/)/.test(u.pathname)) return null;
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

