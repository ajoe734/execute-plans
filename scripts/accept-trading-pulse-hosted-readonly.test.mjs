import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chromium } from "@playwright/test";
import { classifyRequest, makeRedactor } from "./accept-persona-strategy-hosted-readonly.mjs";
import { assessJourney, assessOverview, assessPersona, assessRow, assessWire, enterPulseViaScreen, hasNumber,
  keyboardActivate, MAX_BYTES, readObservedJson, returnViaScreen, safeTarget, snapshotPage, validateInput, writeEvidence,
} from "./accept-trading-pulse-hosted-readonly.mjs";

// Deliberately synthetic names/IDs/numbers. These never become hosted data and
// must not replace E's fresh owner witness or the known historical source event.
const source = {
  persona_id: "persona-offline", persona_name: "離線甲", runtime_id: "rt-offline", binding_id: "rb-offline",
  underlying_symbol: "1234", stage: "paper", ledger_fill_count: 0, pnl: null,
  pnl_currency: "TWD", pnl_period: "session", filled_quantity: 0, requested_quantity: 7, quantity_unit: "股",
};
const sources = { tenant_id: "offline-tenant", captured_at: new Date().toISOString(),
  provenance: [{ source: "owner-registry-ledger.json", sha256: "a".repeat(64) }], rows: [source],
  excluded: [{ persona_id: "persona-probe", persona_name: "部署測試", runtime_id: "rt-probe" }], pnl_groups: [] };
const input = () => ({ profile: { client_id: "offline-viewer", client_secret: "offline-secret" },
  expected: { fe: "a".repeat(40), bff: "b".repeat(40), tenant_id: "offline-tenant" }, sources: structuredClone(sources) });
const row = () => ({ text: "離線甲 1234 模擬 尚無成交損益", fields: [
  { label: "成交筆數", value: "0 筆" }, { label: "損益", value: "尚無成交損益" },
  { label: "成交率", value: "0% · 0/7 股" },
], links: [{ href: "/management/personas/persona-offline", visible: true, inViewportX: true }] });
const snapshot = () => ({ heading: "交易脈動", text: row().text, rows: [row()], groups: [],
  summaryText: "營運 Persona 1 人 · 模擬 1", diagnosticsCollapsed: true });
const history = { journey_id: "tj-offline", event_id: "event-offline", persona_id: source.persona_id,
  persona_name: source.persona_name, tenant_id: sources.tenant_id, environment: "paper", symbol: "1234",
  reason_code: "insufficient_cash", reason_text: { "zh-TW": "資金不足", "en-US": "Insufficient cash" },
  required: 109.25, available: 100, requested_quantity: 7, submitted_to_broker: false, occurred_at: "2020-01-01T01:02:03Z" };
const journey = () => ({ journey_id: history.journey_id, persona_id: history.persona_id, tenant_id: history.tenant_id,
  environment: "paper", outcome: { reason_code: history.reason_code, source_event_id: history.event_id,
    submitted_to_broker: false, reason_detail: { required: 109.25, available: 100, requested_quantity: 7 } },
  timeline: [{ event_id: "derived", source_event_id: history.event_id, occurred_at: history.occurred_at }] });
const journeyText = "離線甲 1234 模擬 資金不足 109.25 100 7";

test("independent current witness accepts zero and unknown without legacy snapshot numbers", () => {
  assert.equal(validateInput(input()).sources.rows[0].ledger_fill_count, 0);
  assert.deepEqual(assessRow(source, row()), []);
  assert.deepEqual(assessOverview(sources, snapshot(), "zh-TW"), []);
});

for (const [name, mutate] of [
  ["cross tenant", (i) => { i.sources.tenant_id = "other"; }],
  ["stale witness", (i) => { i.sources.captured_at = "2000-01-01"; }],
  ["future witness", (i) => { i.sources.captured_at = "2100-01-01"; }],
  ["pulse copied as oracle", (i) => { i.sources.provenance[0].source = "/bff/management/trading-pulse"; }],
  ["unverified empty roster", (i) => { i.sources.rows = []; }],
  ["unknown omitted instead of null", (i) => { delete i.sources.rows[0].pnl; }],
  ["probe in source roster", (i) => { i.sources.rows[0].persona_id = "persona-probe"; }],
  ["duplicate runtimes", (i) => { i.sources.rows.push(i.sources.rows[0]); }],
]) test(`input rejects ${name}`, () => { const i = input(); mutate(i); assert.throws(() => validateInput(i)); });

test("baseline mode admits missing oracle but normal acceptance fails closed", () => {
  const i = input(); delete i.sources;
  assert.throws(() => validateInput(i));
  assert.equal(validateInput(i, Date.now(), { baseline: true }), i);
});

test("comparable sum and coverage use source scope, not arbitrary arithmetic", () => {
  const i = input(); Object.assign(i.sources.rows[0], { pnl: -12.75, ledger_fill_count: 2 });
  i.sources.pnl_groups = [{ stage: "paper", currency: "TWD", period: "session", value: -12.75, covered_persona_count: 1, eligible_persona_count: 1 }];
  validateInput(i);
  i.sources.pnl_groups[0].value = -127.5; assert.throws(() => validateInput(i));
  i.sources.pnl_groups[0].value = -12.75; i.sources.pnl_groups[0].currency = "USD";
  assert.throws(() => validateInput(i));
});

test("finite PnL admits independently null currency/period while omitted scope stays invalid", () => {
  for (const [currency, period] of [[null, null], [null, "valuation-start-a"], ["USD", null]]) {
    const i = input(); Object.assign(i.sources.rows[0], { pnl: -168.0851249999978, pnl_currency: currency, pnl_period: period });
    validateInput(i);
    const r = row(); r.fields[1].value = `${currency || ""} −168.09`;
    assert.deepEqual(assessRow(i.sources.rows[0], r), []);
    for (const bad of ["尚無成交損益", "0.00", "168.09", "−9.73"]) {
      r.fields[1].value = bad;
      assert.ok(assessRow(i.sources.rows[0], r).includes("pnl_value_currency"));
    }
  }
  for (const key of ["pnl_currency", "pnl_period"]) {
    const i = input(); delete i.sources.rows[0][key]; assert.throws(() => validateInput(i));
  }
});

test("0/452 is measured with optional witnessed units in the selected locale", () => {
  const s = { ...source, underlying_symbol: "2317", requested_quantity: 452,
    quantity_unit: { "zh-TW": "股", "en-US": "shares" } };
  const r = row(); r.text = "離線甲 2317 paper 模擬";
  for (const [locale, unit] of [["zh-TW", "股"], ["en-US", "shares"]]) {
    r.fields[2].value = `0% · 0/452 ${unit}`;
    assert.deepEqual(assessRow(s, r, locale), []);
    assert.ok(assessRow(s, r, locale === "zh-TW" ? "en-US" : "zh-TW").includes("fill_rate_basis_unit"));
  }
  for (const quantity_unit of [null, undefined, { "zh-TW": "股", "en-US": null }]) {
    const i = input(); Object.assign(i.sources.rows[0], s, { quantity_unit }); validateInput(i);
    r.fields[2].value = "0% · 0/452";
    assert.deepEqual(assessRow(i.sources.rows[0], r, "en-US"), []);
    r.fields[2].value = "0% · 0/451";
    assert.ok(assessRow(i.sources.rows[0], r, "en-US").includes("fill_rate_basis_unit"));
  }
  const i = input(); i.sources.rows[0].quantity_unit = { "en-US": 123 };
  assert.throws(() => validateInput(i));
  const translated = { ...sources, rows: [{ ...source, requested_quantity: 452, quantity_unit: s.quantity_unit }] };
  const view = snapshot(); view.heading = "Trading Pulse";
  view.rows[0].fields[2].value = "0% · 0/452 shares";
  assert.deepEqual(assessOverview(translated, view, "en-US"), []);
  view.rows[0].fields[2].value = "0% · 0/452 股";
  assert.ok(assessOverview(translated, view, "en-US").includes("row[0]:fill_rate_basis_unit"));
});

const partialScope = () => {
  const i = input();
  i.sources.rows = [-168.0851249999978, -9.73402125001303].map((pnl, n) => ({ ...source,
    persona_id: `persona-measured-${n}`, persona_name: `離線${n}`, runtime_id: `rt-measured-${n}`,
    binding_id: `rb-measured-${n}`, ledger_fill_count: 1, pnl, pnl_currency: null,
    pnl_period: `valuation-start-${n}` }));
  return i;
};
const partialView = (s) => ({ ...snapshot(), summaryText: "營運 Persona 2 人", text: "可比損益小計 尚無可比範圍",
  rows: s.rows.map((r) => ({ ...row(), text: `${r.persona_name} 1234 模擬`,
    fields: [{ label: "成交筆數", value: "1" }, { label: "損益", value: r.pnl.toFixed(2) }, row().fields[2]],
    links: [{ href: `/management/personas/${r.persona_id}`, visible: true, inViewportX: true }] })), subtotals: [] });
const partialWire = (s) => ({ runtime_rows: s.rows.map((r) => ({ runtime_id: r.runtime_id,
  runtime_binding_id: r.binding_id, persona_id: r.persona_id, persona_name: r.persona_name, telemetry_summary: { metrics: { pnl: r.pnl } },
  performance_context: { ledger_fill_count: r.ledger_fill_count, pnl_currency: r.pnl_currency, pnl_period_start_at: r.pnl_period } })),
  summary: { operator_scope: { status: "verified", persona_count: 2, runtime_count: 2 }, pnl_groups: [] } });

const emptyRanks = (wire) => ({ items: [
  ["pnl-leaders", "pnl", "desc"], ["drawdown-control", "drawdown", "asc"],
  ["execution-quality", "fill_rate", "desc"], ["sharpe-leaders", "sharpe_ratio", "desc"],
].map(([block_id, metric, sort_order]) => ({ block_id, metric, sort_order, items: [], eligible_item_count: 0,
  missing_metric_count: wire.runtime_rows.length, missing_metric_runtime_ids: wire.runtime_rows.map((r) => r.runtime_id) })),
summary: { ...wire.summary, limit: 20 } });

test("partial PnL scope preserves both row amounts and rejects invented UI/wire subtotals", () => {
  const i = partialScope(); validateInput(i);
  const view = partialView(i.sources), wire = partialWire(i.sources), ranks = emptyRanks(wire);
  assert.deepEqual(assessOverview(i.sources, view, "zh-TW"), []);
  assert.deepEqual(assessWire(i.sources, wire, ranks), []);
  for (const value of [-177.82, 0]) {
    view.subtotals = [`模擬 TWD session ${value} 涵蓋 2/2`];
    assert.ok(assessOverview(i.sources, view, "zh-TW").includes("unverified_comparable_subtotal"));
    wire.summary.pnl_groups = [{ stage: "paper", currency: "TWD", period: "session", value,
      covered_persona_count: 2, eligible_persona_count: 2 }];
    assert.ok(assessWire(i.sources, wire, ranks).includes("unverified_comparable_subtotal"));
    i.sources.pnl_groups = wire.summary.pnl_groups;
    assert.throws(() => validateInput(i));
    i.sources.pnl_groups = [];
  }
});

test("known currencies with differing periods do not authorize a combined subtotal", () => {
  const i = partialScope(); i.sources.rows.forEach((r) => { r.pnl_currency = "USD"; });
  validateInput(i);
  i.sources.pnl_groups = [{ stage: "paper", currency: "USD", period: "combined", value: -177.81914625001083,
    covered_persona_count: 2, eligible_persona_count: 2 }];
  assert.throws(() => validateInput(i));
  i.sources.pnl_groups = i.sources.rows.map((r) => ({ stage: r.stage, currency: r.pnl_currency,
    period: r.pnl_period, value: r.pnl, covered_persona_count: 1, eligible_persona_count: 1 }));
  validateInput(i);
  const wire = partialWire(i.sources); wire.summary.pnl_groups = i.sources.pnl_groups;
  assert.deepEqual(assessWire(i.sources, wire, emptyRanks(wire)), []);
});

test("wire scope and amount are checked independently, including unknown versus zero", () => {
  const i = partialScope(), wire = partialWire(i.sources), ranks = emptyRanks(wire);
  wire.runtime_rows[0].performance_context.pnl_currency = "TWD";
  assert.ok(assessWire(i.sources, wire, ranks).includes("row[0]:pnl_scope"));
  wire.runtime_rows[0].performance_context.pnl_currency = null;
  wire.runtime_rows[0].telemetry_summary.metrics.pnl = null;
  assert.ok(assessWire(i.sources, wire, ranks).includes("row[0]:ledger_values"));
  i.sources.rows[0].pnl = null; wire.runtime_rows[0].telemetry_summary.metrics.pnl = 0;
  assert.ok(assessWire(i.sources, wire, ranks).includes("row[0]:ledger_values"));
});

for (const [name, mutate, code] of [
  ["zero fills to unknown", (r) => { r.fields[0].value = "—"; }, "ledger_fill_count"],
  ["unknown PnL to zero", (r) => { r.fields[1].value = "TWD 0"; }, "pnl_value_currency"],
  ["ratio instead of percent", (r) => { r.fields[2].value = "0 · 0/7 股"; }, "fill_rate_percent"],
  ["lost denominator", (r) => { r.fields[2].value = "0%"; }, "fill_rate_basis_unit"],
  ["wrong row", (r) => { r.text = "別人 5678 實盤"; }, "persona_name"],
  ["placeholder target", (r) => { r.links[0].href = "#"; }, "primary_entry_without_horizontal_scroll"],
  ["wrong Persona target", (r) => { r.links[0].href = "/management/personas/wrong"; }, "primary_entry_without_horizontal_scroll"],
  ["unfiltered public list", (r) => { r.links[0].href = "/management/trade-journeys"; }, "primary_entry_without_horizontal_scroll"],
  ["horizontally hidden target", (r) => { r.links[0].inViewportX = false; }, "primary_entry_without_horizontal_scroll"],
]) test(`row rejects ${name}`, () => { const r = row(); mutate(r); assert.ok(assessRow(source, r).includes(code)); });

test("real zero PnL accepted; wrong currency and unlabelled number rejected", () => {
  const s = { ...source, pnl: 0 }, r = row(); r.fields[1].value = "TWD 0.00";
  assert.deepEqual(assessRow(s, r), []);
  r.fields[1].value = "USD 0.00"; assert.ok(assessRow(s, r).includes("pnl_value_currency"));
  r.fields[1].label = "unrelated"; assert.ok(assessRow(s, r).includes("pnl_value_currency"));
});

test("default business screen rejects probes, source IDs, expanded diagnostics and mixed locale", () => {
  const s = snapshot(); s.text += " rt-offline 部署測試 Fill Rate"; s.diagnosticsCollapsed = false;
  const failures = assessOverview(sources, s, "zh-TW");
  for (const code of ["source_ids_visible_by_default", "probe_persona_visible", "diagnostics_not_collapsed", "mixed_locale"]) assert.ok(failures.includes(code));
  assert.ok(assessOverview(sources, snapshot(), "en-US").includes("locale_heading"));
});

test("group scope, value and covered denominator must be rendered together", () => {
  const s = { ...sources, pnl_groups: [{ stage: "paper", currency: "TWD", period: "session", value: -1.25, covered_persona_count: 1, eligible_persona_count: 2 }] };
  const view = snapshot(); view.groups = ["模擬 TWD session -1.25 涵蓋 1/2"];
  assert.ok(!assessOverview(s, view, "zh-TW").some((x) => x.includes("group")));
  view.groups[0] = "模擬 USD session -1.25 涵蓋 1/2";
  assert.ok(assessOverview(s, view, "zh-TW").some((x) => x.includes("group")));
});

test("raw wire roster, ledger values and rankings checked independently of UI", () => {
  const overview = { data: { runtime_rows: [{ runtime_id: source.runtime_id, runtime_binding_id: source.binding_id,
    persona_id: source.persona_id, persona_name: source.persona_name, telemetry_summary: { metrics: { pnl: null } },
    performance_context: { ledger_fill_count: 0, pnl_currency: "TWD", pnl_period: "session" } }],
    summary: { operator_scope: { status: "verified", persona_count: 1, runtime_count: 1 }, pnl_groups: [] } } };
  const ranks = emptyRanks(overview.data);
  assert.deepEqual(assessWire(sources, overview, ranks), []);
  ranks.items[0].items.push({ persona_id: "persona-probe", persona_name: "部署測試", value: 0 });
  assert.ok(assessWire(sources, overview, ranks).includes("rankings_wrong_operator"));
  overview.data.runtime_rows[0].performance_context.ledger_fill_count = null;
  assert.ok(assessWire(sources, overview, ranks).includes("row[0]:ledger_values"));
});

test("Persona detail needs rendered name/symbol/mode and response tenant/object, URL alone insufficient", () => {
  const body = { data: { persona_id: source.persona_id, tenant_id: sources.tenant_id } };
  assert.deepEqual(assessPersona(source, sources.tenant_id, body, row().text), []);
  // Real GET /bff/personas/<id> DTO shape uses id + camelCase tenantId, and witness symbol may carry an exchange suffix.
  const dtoBody = { data: { id: source.persona_id, tenantId: sources.tenant_id } };
  assert.deepEqual(assessPersona({ ...source, underlying_symbol: "1234.TWSE" }, sources.tenant_id, dtoBody, row().text), []);
  assert.ok(assessPersona({ ...source, underlying_symbol: "5678.TWSE" }, sources.tenant_id, dtoBody, row().text).includes("detail_visible_object_and_stage"));
  assert.ok(assessPersona(source, sources.tenant_id, { data: { id: "wrong", tenantId: sources.tenant_id } }, row().text).includes("detail_persona_identity"));
  assert.ok(assessPersona(source, sources.tenant_id, { data: { id: source.persona_id, tenantId: "other" } }, row().text).includes("detail_tenant"));
  body.data.persona_id = "wrong";
  assert.ok(assessPersona(source, sources.tenant_id, body, row().text).includes("detail_persona_identity"));
  body.data.persona_id = source.persona_id; body.data.tenant_id = "other";
  assert.ok(assessPersona(source, sources.tenant_id, body, row().text).includes("detail_tenant"));
});

test("historical event remains separately provable after current Persona starts trading", () => {
  const current = { ...source, ledger_fill_count: 6, pnl: 8.25 };
  assert.equal(current.ledger_fill_count, 6);
  assert.deepEqual(assessJourney(history, journey(), journeyText, "zh-TW"), []);
  assert.deepEqual(assessJourney(undefined, journey(), journeyText, "zh-TW"), ["missing_historical_event_witness"]);
});
for (const key of ["journey_id", "persona_id", "tenant_id", "environment"]) test(`history rejects wrong ${key}`, () => {
  const j = journey(); j[key] = "wrong";
  assert.ok(assessJourney(history, j, journeyText, "zh-TW").includes(`journey_${key}`));
});
test("history rejects removed/wrong source event, reason, amounts, broker submission and text", () => {
  for (const change of [
    (j) => { j.timeline = []; }, (j) => { j.timeline[0].occurred_at = "2021-01-01"; },
    (j) => { j.outcome.source_event_id = "wrong"; j.timeline[0].source_event_id = "wrong"; },
    (j) => { j.outcome.reason_code = "long_cash"; }, (j) => { j.outcome.reason_detail.required = 0; },
    (j) => { j.outcome.submitted_to_broker = true; },
  ]) { const j = journey(); change(j); assert.ok(assessJourney(history, j, journeyText, "zh-TW").length > 0); }
  assert.ok(assessJourney(history, journey(), "HTTP 200", "zh-TW").length > 0);
});

test("navigation rejects empty/hash/foreign/javascript/public links", () => {
  for (const href of ["", "#", "javascript:alert(1)", "https://example.com/management/personas/p", "/login", "/management/personas/p#x"])
    assert.equal(safeTarget(href), null);
  assert.equal(safeTarget("/management/personas/p").pathname, "/management/personas/p");
});

test("numeric formatting preserves negatives and never turns missing into zero", () => {
  assert.ok(hasNumber("TWD −1,234.57", -1234.567));
  assert.ok(!hasNumber("—", 0)); assert.ok(!hasNumber("TWD 12", -12)); assert.ok(!hasNumber("452", 52));
});

test("existing request policy allows only reads/auth and blocks business writes", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(classifyRequest(method, "/bff/orders"), "block");
  assert.equal(classifyRequest("POST", "/bff/auth/dev-login"), "allow");
  assert.equal(classifyRequest("GET", "/bff/management/trading-pulse"), "allow");
});

test("one summary/two screenshot evidence budget and credential redaction", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-evidence-test-"));
  try {
    fs.writeFileSync(path.join(dir, "desktop.png"), Buffer.alloc(256));
    const report = { pass: true, failures: [], secret: "opaque-super-secret", note: "Bearer 1234567890" };
    writeEvidence(dir, report, makeRedactor(["opaque-super-secret"]));
    const text = fs.readFileSync(path.join(dir, "summary.json"), "utf8");
    assert.ok(!text.includes("opaque-super-secret") && !text.includes("1234567890"));
    assert.equal(report.evidence.bytes, Buffer.byteLength(text) + 256);
    assert.equal(report.evidence.routine_daily_growth_bytes, 0);
    fs.writeFileSync(path.join(dir, "desktop.png"), Buffer.alloc(MAX_BYTES));
    writeEvidence(dir, report, makeRedactor([]));
    assert.equal(report.pass, false); assert.ok(report.evidence.bytes < MAX_BYTES);
    assert.ok(!fs.existsSync(path.join(dir, "desktop.png")));
    report.huge_error = "x".repeat(MAX_BYTES);
    writeEvidence(dir, report, makeRedactor([]));
    assert.equal(report.pass, false); assert.ok(report.evidence.bytes < MAX_BYTES);
    assert.ok(report.failures.includes("evidence_summary_budget_exceeded"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("response capture excludes open SSE, unrelated shell JSON and Persona sub-resources without reading their bodies", async () => {
  const response = (url, type) => ({ url: () => url, request: () => ({ method: () => "GET" }),
    headers: () => ({ "content-type": type }), json: () => { throw new Error("must not read an open or unrelated body"); } });
  assert.equal(await readObservedJson(response("https://api.dev.mvl-cap.tw/bff/events", "text/event-stream")), null);
  assert.equal(await readObservedJson(response("https://api.dev.mvl-cap.tw/bff/management/trading-pulse", "text/event-stream")), null);
  assert.equal(await readObservedJson(response("https://api.dev.mvl-cap.tw/bff/shell-summary", "application/json")), null);
  assert.equal(await readObservedJson(response("https://api.dev.mvl-cap.tw/bff/personas/persona-offline/route-policy", "application/json")), null);
  assert.equal(await readObservedJson(response("https://api.dev.mvl-cap.tw/bff/personas/persona-offline/memory", "application/json")), null);
  assert.deepEqual(await readObservedJson({ url: () => "https://api.dev.mvl-cap.tw/bff/personas/persona-offline",
    request: () => ({ method: () => "GET" }), headers: () => ({ "content-type": "application/json" }),
    json: async () => ({ data: { id: "persona-offline", tenantId: "offline-tenant" } }) }), {
    path: "/bff/personas/persona-offline", query: "", body: { data: { id: "persona-offline", tenantId: "offline-tenant" } },
  });
});

test("relevant JSON capture is finite, retains query scope and times out an unfinished body", { timeout: 1000 }, async () => {
  const response = { url: () => "https://api.dev.mvl-cap.tw/bff/management/trade-journeys/tj-offline?tenant_id=offline&environment=paper",
    request: () => ({ method: () => "GET" }), headers: () => ({ "content-type": "application/json; charset=utf-8" }),
    json: async () => ({ id: "synthetic" }) };
  assert.deepEqual(await readObservedJson(response), { path: "/bff/management/trade-journeys/tj-offline",
    query: "?tenant_id=offline&environment=paper", body: { id: "synthetic" } });
  await assert.rejects(readObservedJson({ ...response, json: () => new Promise(() => {}) }, 15), /JSON body timeout/);
});

test("real Chromium DOM: narrow clipping, diagnostics, actual Tab/Enter, on-screen return and mobile palette", { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
    await page.route("https://app.dev.mvl-cap.tw/**", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `
      <main><section><h1>交易脈動</h1><p>營運 Persona 1 人 · 模擬 1</p>
      <div style="max-width:350px;overflow-x:auto"><table style="min-width:1040px"><thead><tr>
      <th>Persona</th><th>成交筆數</th><th>損益</th><th>成交率</th><th>明細</th></tr></thead>
      <tbody><tr><td>離線甲 1234 模擬</td><td>0 筆</td><td>尚無成交損益</td><td>0% 0/7 股</td>
      <td><a href="/management/personas/persona-offline">Persona 明細</a></td></tr></tbody></table></div>
      <details><summary>資料診斷</summary><div>rt-offline rb-offline</div></details>
      <a href="/management/trading-pulse">返回交易脈動</a></section></main>` }));
    await page.goto("https://app.dev.mvl-cap.tw/management/trading-pulse");
    const initial = await snapshotPage(page, sources);
    assert.ok(initial.diagnosticsCollapsed); assert.ok(!initial.text.includes("rt-offline"));
    assert.equal(initial.rows.length, 1);
    assert.ok(assessRow(source, initial.rows[0]).includes("primary_entry_without_horizontal_scroll"));
    await keyboardActivate(page, page.locator("summary"));
    assert.ok((await page.locator("body").innerText()).includes("rt-offline"));
    await keyboardActivate(page, page.getByRole("link", { name: "Persona 明細", exact: true }));
    await page.waitForURL("**/management/personas/persona-offline");
    assert.equal(new URL(page.url()).pathname, "/management/personas/persona-offline");
    await returnViaScreen(page, "/management/trading-pulse");
    await page.waitForURL("**/management/trading-pulse");
    assert.equal(new URL(page.url()).pathname, "/management/trading-pulse");
    // Moving the main entry before the wide fields makes it operable at 390px.
    await page.locator("tbody tr").evaluate((tr) => tr.firstElementChild.append(tr.querySelector("a")));
    const repaired = await snapshotPage(page, sources);
    assert.ok(!assessRow(source, repaired.rows[0]).includes("primary_entry_without_horizontal_scroll"));
    for (const title of ["可比損益小計", "Comparable P&L subtotal"]) {
      await page.locator("section").evaluate((section, title) => section.insertAdjacentHTML("beforeend",
        `<div id="subtotal"><div><h2>${title}</h2><p>Comparable scope</p></div><p>尚無可比範圍</p></div>`), title);
      assert.deepEqual((await snapshotPage(page, sources)).subtotals, []);
      await page.locator("#subtotal").evaluate((region) => region.insertAdjacentHTML("beforeend",
        '<div role="group">模擬 TWD session -177.82 涵蓋 2/2</div>'));
      let view = await snapshotPage(page, sources);
      assert.ok(assessOverview(sources, view, "zh-TW").includes("unverified_comparable_subtotal"));
      const scoped = { ...sources, pnl_groups: [{ stage: "paper", currency: "TWD", period: "session",
        value: -177.82, covered_persona_count: 2, eligible_persona_count: 2 }] };
      assert.ok(!assessOverview(scoped, view, "zh-TW").some((f) => f.includes("subtotal") || f.includes("group")));
      await page.locator('#subtotal [role="group"]').evaluate((group) => { group.outerHTML = "<p>0.00</p>"; });
      view = await snapshotPage(page, sources);
      assert.deepEqual(view.subtotals, ["0.00"]);
      assert.ok(assessOverview(sources, view, "zh-TW").includes("unverified_comparable_subtotal"));
      await page.locator("#subtotal").evaluate((region) => region.remove());
    }
    // Mobile shell has no menu button: use its real documented keyboard entry.
    await page.setContent(`<main><p>Fleet</p></main><script>
      document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
          event.preventDefault();
          document.body.insertAdjacentHTML('beforeend', '<div role="dialog"><input role="combobox"><button role="option">交易脈動</button></div>');
          document.querySelector('[role="option"]').onclick = () => { history.pushState({}, '', '/management/trading-pulse'); document.querySelector('[role="dialog"]').remove(); };
        }
      });
    </script>`);
    await page.evaluate(() => history.replaceState({}, "", "/management/persona-fleet"));
    assert.equal(await enterPulseViaScreen(page, "zh-TW"), "command_palette");
    assert.equal(new URL(page.url()).pathname, "/management/trading-pulse");
    assert.equal(await page.getByRole("dialog").count(), 0);
  } finally { await browser.close(); }
});

// Projected verbatim from ManagementService + the existing _OperatorStore at
// pantheon d6f959222 (task packet). Removed only unrelated response fields.
// Original fixture SHA-256: e36a57cbd8f53a6e169bbcbf5b446406ad718b10ca428fc455ebc67641c89370
const managementServiceFixtures = [
  {
    "comparable": false,
    "sources": {
      "rows": [
        {
          "runtime_id": "r-p1",
          "binding_id": "b-p1",
          "persona_id": "p1",
          "persona_name": "青禾",
          "ledger_fill_count": 1,
          "pnl": -168.085,
          "pnl_currency": null,
          "pnl_period": "2026-11-01T00:00:00Z"
        },
        {
          "runtime_id": "r-p2",
          "binding_id": "b-p2",
          "persona_id": "p2",
          "persona_name": "澄川",
          "ledger_fill_count": 0,
          "pnl": null,
          "pnl_currency": null,
          "pnl_period": "2026-11-01T00:00:00Z"
        }
      ],
      "pnl_groups": []
    },
    "overview": {
      "data": {
        "summary": {
          "operator_scope": {
            "status": "verified",
            "tenant_id": "tenant-test",
            "persona_count": 2,
            "runtime_count": 2,
            "verified_runtime_count": 2,
            "reason": null,
            "by_stage": {
              "paper": {
                "persona_count": 2,
                "runtime_count": 2
              }
            }
          },
          "pnl_groups": []
        },
        "runtime_rows": [
          {
            "runtime_id": "r-p1",
            "runtime_binding_id": "b-p1",
            "persona_id": "p1",
            "deployment_stage": "paper",
            "telemetry_summary": {
              "window": "1h",
              "collected_at": "2026-11-22T12:00:00Z",
              "metrics": {
                "pnl": -168.085,
                "drawdown": null,
                "sharpe_ratio": null,
                "fill_rate": 0.0,
                "avg_slippage_bps": 0,
                "total_trades": 1
              },
              "binding_id": "b-p1",
              "deployment_stage": "paper",
              "last_event_at": "2026-11-22T12:00:00Z"
            },
            "persona_name": "青禾",
            "performance_context": {
              "ledger_fill_count": 1,
              "pnl_currency": null,
              "pnl_period_start_at": "2026-11-01T00:00:00Z",
              "pnl_at": "2026-11-22T12:00:00Z",
              "pnl_definition": "net_ledger_pnl",
              "fill_rate_details": {
                "status": "known",
                "numerator": 0,
                "denominator": 452,
                "unit": "shares",
                "basis": "filled_quantity_over_submitted_quantity",
                "window": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "end_exclusive_at": "2026-11-22T12:00:00Z"
                }
              },
              "source_status": "available",
              "fill_rate_basis": "filled_quantity_over_submitted_quantity",
              "metric_units": {
                "pnl": null,
                "fill_rate": "fraction",
                "drawdown": "fraction",
                "sharpe_ratio": "ratio",
                "avg_slippage_bps": "bps",
                "total_trades": "fills"
              },
              "metric_periods": {
                "pnl": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "drawdown": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "sharpe_ratio": {
                  "start_at": null,
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "fill_rate": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                },
                "avg_slippage_bps": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                },
                "total_trades": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                }
              }
            }
          },
          {
            "runtime_id": "r-p2",
            "runtime_binding_id": "b-p2",
            "persona_id": "p2",
            "deployment_stage": "paper",
            "telemetry_summary": {
              "window": "1h",
              "collected_at": "2026-11-22T12:00:00Z",
              "metrics": {
                "pnl": null,
                "drawdown": null,
                "sharpe_ratio": null,
                "fill_rate": 0.0,
                "avg_slippage_bps": 0,
                "total_trades": 0
              },
              "binding_id": "b-p2",
              "deployment_stage": "paper",
              "last_event_at": "2026-11-22T12:00:00Z"
            },
            "persona_name": "澄川",
            "performance_context": {
              "ledger_fill_count": 0,
              "pnl_currency": null,
              "pnl_period_start_at": "2026-11-01T00:00:00Z",
              "pnl_at": "2026-11-22T12:00:00Z",
              "pnl_definition": "net_ledger_pnl",
              "fill_rate_details": {
                "status": "known",
                "numerator": 0,
                "denominator": 452,
                "unit": "shares",
                "basis": "filled_quantity_over_submitted_quantity",
                "window": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "end_exclusive_at": "2026-11-22T12:00:00Z"
                }
              },
              "source_status": "available",
              "fill_rate_basis": "filled_quantity_over_submitted_quantity",
              "metric_units": {
                "pnl": null,
                "fill_rate": "fraction",
                "drawdown": "fraction",
                "sharpe_ratio": "ratio",
                "avg_slippage_bps": "bps",
                "total_trades": "fills"
              },
              "metric_periods": {
                "pnl": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "drawdown": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "sharpe_ratio": {
                  "start_at": null,
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "fill_rate": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                },
                "avg_slippage_bps": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                },
                "total_trades": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                }
              }
            }
          }
        ]
      }
    },
    "ranking": {
      "data": {
        "id": "management-trading-pulse-rankings",
        "items": [
          {
            "block_id": "pnl-leaders",
            "label": "P&L Leaders",
            "metric": "pnl",
            "sort_order": "desc",
            "items": [],
            "eligible_item_count": 0,
            "missing_metric_count": 2,
            "missing_metric_runtime_ids": [
              "r-p1",
              "r-p2"
            ],
            "ranking_basis": "within_comparison_scope",
            "metric_reasons": {
              "r-p1": "comparison_scope_unverified",
              "r-p2": "no_fills"
            }
          },
          {
            "block_id": "drawdown-control",
            "label": "Drawdown Control",
            "metric": "drawdown",
            "sort_order": "asc",
            "items": [],
            "eligible_item_count": 0,
            "missing_metric_count": 2,
            "missing_metric_runtime_ids": [
              "r-p1",
              "r-p2"
            ],
            "ranking_basis": "within_comparison_scope",
            "metric_reasons": {
              "r-p1": "not_observed",
              "r-p2": "no_fills"
            }
          },
          {
            "block_id": "execution-quality",
            "label": "Execution Quality",
            "metric": "fill_rate",
            "sort_order": "desc",
            "items": [
              {
                "persona_id": "p2",
                "persona_name": "澄川",
                "runtime_id": "r-p2",
                "pnl": null,
                "drawdown": null,
                "sharpe_ratio": null,
                "fill_rate": 0.0,
                "rank": 1,
                "ranking_eligible": true,
                "comparison_scope": {
                  "stage": "paper",
                  "period": {
                    "start_at": "2026-11-01T00:00:00Z",
                    "end_exclusive_at": "2026-11-22T12:00:00Z"
                  },
                  "unit": "fraction",
                  "basis": "filled_quantity_over_submitted_quantity",
                  "quantity_unit": "shares"
                },
                "ranking_block_id": "execution-quality",
                "ranking_metric": "fill_rate",
                "ranking_metric_value": 0.0
              },
              {
                "persona_id": "p1",
                "persona_name": "青禾",
                "runtime_id": "r-p1",
                "pnl": -168.085,
                "drawdown": null,
                "sharpe_ratio": null,
                "fill_rate": 0.0,
                "rank": 2,
                "ranking_eligible": true,
                "comparison_scope": {
                  "stage": "paper",
                  "period": {
                    "start_at": "2026-11-01T00:00:00Z",
                    "end_exclusive_at": "2026-11-22T12:00:00Z"
                  },
                  "unit": "fraction",
                  "basis": "filled_quantity_over_submitted_quantity",
                  "quantity_unit": "shares"
                },
                "ranking_block_id": "execution-quality",
                "ranking_metric": "fill_rate",
                "ranking_metric_value": 0.0
              }
            ],
            "eligible_item_count": 2,
            "missing_metric_count": 0,
            "missing_metric_runtime_ids": [],
            "ranking_basis": "within_comparison_scope",
            "metric_reasons": {},
            "secondary_metric": "avg_slippage_bps"
          },
          {
            "block_id": "sharpe-leaders",
            "label": "Sharpe Leaders",
            "metric": "sharpe_ratio",
            "sort_order": "desc",
            "items": [],
            "eligible_item_count": 0,
            "missing_metric_count": 2,
            "missing_metric_runtime_ids": [
              "r-p1",
              "r-p2"
            ],
            "ranking_basis": "within_comparison_scope",
            "metric_reasons": {
              "r-p1": "insufficient_samples",
              "r-p2": "insufficient_samples"
            }
          }
        ],
        "summary": {
          "operator_scope": {
            "status": "verified",
            "tenant_id": "tenant-test",
            "persona_count": 2,
            "runtime_count": 2,
            "verified_runtime_count": 2,
            "reason": null,
            "by_stage": {
              "paper": {
                "persona_count": 2,
                "runtime_count": 2
              }
            }
          },
          "limit": 20
        }
      },
      "page_info": {
        "next_page_token": null,
        "total": 4,
        "page_size": 4
      },
      "meta": {
        "snapshot_at": "2026-11-22T12:00:00Z",
        "version": "v1",
        "surfaces": {
          "management_trading_pulse": {
            "status": "degraded",
            "source": "bff_composed",
            "message": "Trading pulse aggregate is available, but runtime, telemetry, monitoring, row health, or baseline coverage is degraded.",
            "snapshot_at": "2026-11-22T12:00:00Z"
          },
          "runtime_roster": {
            "status": "ok",
            "source": "service_store"
          },
          "telemetry_summary": {
            "status": "ok",
            "source": "service_store"
          },
          "paper_runtime_monitoring": {
            "status": "degraded",
            "source": "service_store",
            "message": "Paper runtime monitoring session missing for one or more paper runtimes.",
            "staleness": {
              "served_from": "unverifiable",
              "last_known_at": "2026-11-22T12:00:00Z"
            }
          },
          "paper_live_drift": {
            "status": "ok",
            "source": "service_store",
            "message": "No live runtimes require paper/live baseline comparison."
          },
          "baseline_comparison": {
            "status": "ok",
            "source": "bff_composed",
            "snapshot_at": "2026-11-22T12:00:00Z"
          },
          "runtime_row_health": {
            "status": "degraded",
            "source": "bff_composed",
            "snapshot_at": "2026-11-22T12:00:00Z",
            "message": "Trading pulse row health is degraded for 2 runtime(s)."
          },
          "management_trading_pulse_rankings": {
            "status": "degraded",
            "source": "bff_composed",
            "message": "Trading pulse rankings are degraded because runtime or telemetry coverage is degraded.",
            "snapshot_at": "2026-11-22T12:00:00Z"
          }
        },
        "composition_sources": [
          "GET /bff/management/trading-pulse",
          "GET /bff/runtimes",
          "telemetry_summaries",
          "paper_runtime_monitoring_sessions",
          "paper_live_drift_reports"
        ]
      }
    }
  },
  {
    "comparable": true,
    "sources": {
      "rows": [
        {
          "runtime_id": "r-p1",
          "binding_id": "b-p1",
          "persona_id": "p1",
          "persona_name": "青禾",
          "ledger_fill_count": 1,
          "pnl": -168.085,
          "pnl_currency": "TWD",
          "pnl_period": "2026-11-01T00:00:00Z"
        },
        {
          "runtime_id": "r-p2",
          "binding_id": "b-p2",
          "persona_id": "p2",
          "persona_name": "澄川",
          "ledger_fill_count": 0,
          "pnl": null,
          "pnl_currency": "TWD",
          "pnl_period": "2026-11-01T00:00:00Z"
        }
      ],
      "pnl_groups": [
        {
          "stage": "paper",
          "currency": "TWD",
          "period": "2026-11-01T00:00:00Z",
          "value": -168.085,
          "covered_persona_count": 1,
          "eligible_persona_count": 2
        }
      ]
    },
    "overview": {
      "data": {
        "summary": {
          "operator_scope": {
            "status": "verified",
            "tenant_id": "tenant-test",
            "persona_count": 2,
            "runtime_count": 2,
            "verified_runtime_count": 2,
            "reason": null,
            "by_stage": {
              "paper": {
                "persona_count": 2,
                "runtime_count": 2
              }
            }
          },
          "pnl_groups": [
            {
              "stage": "paper",
              "currency": "TWD",
              "period_start_at": "2026-11-01T00:00:00Z",
              "period_end_at": "2026-11-22T12:00:00Z",
              "as_of": "2026-11-22T12:00:00Z",
              "pnl_definition": "net_ledger_pnl",
              "value": -168.085,
              "covered_runtime_count": 1,
              "covered_persona_count": 1,
              "eligible_persona_count": 2,
              "eligible_runtime_count": 2
            }
          ]
        },
        "runtime_rows": [
          {
            "runtime_id": "r-p1",
            "runtime_binding_id": "b-p1",
            "persona_id": "p1",
            "deployment_stage": "paper",
            "telemetry_summary": {
              "window": "1h",
              "collected_at": "2026-11-22T12:00:00Z",
              "metrics": {
                "pnl": -168.085,
                "drawdown": null,
                "sharpe_ratio": null,
                "fill_rate": 0.0,
                "avg_slippage_bps": 0,
                "total_trades": 1
              },
              "binding_id": "b-p1",
              "deployment_stage": "paper",
              "last_event_at": "2026-11-22T12:00:00Z"
            },
            "persona_name": "青禾",
            "performance_context": {
              "ledger_fill_count": 1,
              "pnl_currency": "TWD",
              "pnl_period_start_at": "2026-11-01T00:00:00Z",
              "pnl_at": "2026-11-22T12:00:00Z",
              "pnl_definition": "net_ledger_pnl",
              "fill_rate_details": {
                "status": "known",
                "numerator": 0,
                "denominator": 452,
                "unit": "shares",
                "basis": "filled_quantity_over_submitted_quantity",
                "window": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "end_exclusive_at": "2026-11-22T12:00:00Z"
                }
              },
              "source_status": "available",
              "fill_rate_basis": "filled_quantity_over_submitted_quantity",
              "metric_units": {
                "pnl": "TWD",
                "fill_rate": "fraction",
                "drawdown": "fraction",
                "sharpe_ratio": "ratio",
                "avg_slippage_bps": "bps",
                "total_trades": "fills"
              },
              "metric_periods": {
                "pnl": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "drawdown": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "sharpe_ratio": {
                  "start_at": null,
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "fill_rate": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                },
                "avg_slippage_bps": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                },
                "total_trades": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                }
              }
            }
          },
          {
            "runtime_id": "r-p2",
            "runtime_binding_id": "b-p2",
            "persona_id": "p2",
            "deployment_stage": "paper",
            "telemetry_summary": {
              "window": "1h",
              "collected_at": "2026-11-22T12:00:00Z",
              "metrics": {
                "pnl": null,
                "drawdown": null,
                "sharpe_ratio": null,
                "fill_rate": 0.0,
                "avg_slippage_bps": 0,
                "total_trades": 0
              },
              "binding_id": "b-p2",
              "deployment_stage": "paper",
              "last_event_at": "2026-11-22T12:00:00Z"
            },
            "persona_name": "澄川",
            "performance_context": {
              "ledger_fill_count": 0,
              "pnl_currency": "TWD",
              "pnl_period_start_at": "2026-11-01T00:00:00Z",
              "pnl_at": "2026-11-22T12:00:00Z",
              "pnl_definition": "net_ledger_pnl",
              "fill_rate_details": {
                "status": "known",
                "numerator": 0,
                "denominator": 452,
                "unit": "shares",
                "basis": "filled_quantity_over_submitted_quantity",
                "window": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "end_exclusive_at": "2026-11-22T12:00:00Z"
                }
              },
              "source_status": "available",
              "fill_rate_basis": "filled_quantity_over_submitted_quantity",
              "metric_units": {
                "pnl": "TWD",
                "fill_rate": "fraction",
                "drawdown": "fraction",
                "sharpe_ratio": "ratio",
                "avg_slippage_bps": "bps",
                "total_trades": "fills"
              },
              "metric_periods": {
                "pnl": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "drawdown": {
                  "start_at": "2026-11-01T00:00:00Z",
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "sharpe_ratio": {
                  "start_at": null,
                  "as_of": "2026-11-22T12:00:00Z",
                  "window": "1h"
                },
                "fill_rate": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                },
                "avg_slippage_bps": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                },
                "total_trades": {
                  "start_at": null,
                  "as_of": null,
                  "window": "1h"
                }
              }
            }
          }
        ]
      }
    },
    "ranking": {
      "data": {
        "id": "management-trading-pulse-rankings",
        "items": [
          {
            "block_id": "pnl-leaders",
            "label": "P&L Leaders",
            "metric": "pnl",
            "sort_order": "desc",
            "items": [
              {
                "persona_id": "p1",
                "persona_name": "青禾",
                "runtime_id": "r-p1",
                "pnl": -168.085,
                "drawdown": null,
                "sharpe_ratio": null,
                "fill_rate": 0.0,
                "rank": 1,
                "ranking_eligible": true,
                "comparison_scope": {
                  "stage": "paper",
                  "period": {
                    "start_at": "2026-11-01T00:00:00Z",
                    "as_of": "2026-11-22T12:00:00Z",
                    "window": "1h"
                  },
                  "unit": "TWD",
                  "definition": "net_ledger_pnl"
                },
                "ranking_block_id": "pnl-leaders",
                "ranking_metric": "pnl",
                "ranking_metric_value": -168.085
              }
            ],
            "eligible_item_count": 1,
            "missing_metric_count": 1,
            "missing_metric_runtime_ids": [
              "r-p2"
            ],
            "ranking_basis": "within_comparison_scope",
            "metric_reasons": {
              "r-p2": "no_fills"
            }
          },
          {
            "block_id": "drawdown-control",
            "label": "Drawdown Control",
            "metric": "drawdown",
            "sort_order": "asc",
            "items": [],
            "eligible_item_count": 0,
            "missing_metric_count": 2,
            "missing_metric_runtime_ids": [
              "r-p1",
              "r-p2"
            ],
            "ranking_basis": "within_comparison_scope",
            "metric_reasons": {
              "r-p1": "not_observed",
              "r-p2": "no_fills"
            }
          },
          {
            "block_id": "execution-quality",
            "label": "Execution Quality",
            "metric": "fill_rate",
            "sort_order": "desc",
            "items": [
              {
                "persona_id": "p2",
                "persona_name": "澄川",
                "runtime_id": "r-p2",
                "pnl": null,
                "drawdown": null,
                "sharpe_ratio": null,
                "fill_rate": 0.0,
                "rank": 1,
                "ranking_eligible": true,
                "comparison_scope": {
                  "stage": "paper",
                  "period": {
                    "start_at": "2026-11-01T00:00:00Z",
                    "end_exclusive_at": "2026-11-22T12:00:00Z"
                  },
                  "unit": "fraction",
                  "basis": "filled_quantity_over_submitted_quantity",
                  "quantity_unit": "shares"
                },
                "ranking_block_id": "execution-quality",
                "ranking_metric": "fill_rate",
                "ranking_metric_value": 0.0
              },
              {
                "persona_id": "p1",
                "persona_name": "青禾",
                "runtime_id": "r-p1",
                "pnl": -168.085,
                "drawdown": null,
                "sharpe_ratio": null,
                "fill_rate": 0.0,
                "rank": 2,
                "ranking_eligible": true,
                "comparison_scope": {
                  "stage": "paper",
                  "period": {
                    "start_at": "2026-11-01T00:00:00Z",
                    "end_exclusive_at": "2026-11-22T12:00:00Z"
                  },
                  "unit": "fraction",
                  "basis": "filled_quantity_over_submitted_quantity",
                  "quantity_unit": "shares"
                },
                "ranking_block_id": "execution-quality",
                "ranking_metric": "fill_rate",
                "ranking_metric_value": 0.0
              }
            ],
            "eligible_item_count": 2,
            "missing_metric_count": 0,
            "missing_metric_runtime_ids": [],
            "ranking_basis": "within_comparison_scope",
            "metric_reasons": {},
            "secondary_metric": "avg_slippage_bps"
          },
          {
            "block_id": "sharpe-leaders",
            "label": "Sharpe Leaders",
            "metric": "sharpe_ratio",
            "sort_order": "desc",
            "items": [],
            "eligible_item_count": 0,
            "missing_metric_count": 2,
            "missing_metric_runtime_ids": [
              "r-p1",
              "r-p2"
            ],
            "ranking_basis": "within_comparison_scope",
            "metric_reasons": {
              "r-p1": "insufficient_samples",
              "r-p2": "insufficient_samples"
            }
          }
        ],
        "summary": {
          "operator_scope": {
            "status": "verified",
            "tenant_id": "tenant-test",
            "persona_count": 2,
            "runtime_count": 2,
            "verified_runtime_count": 2,
            "reason": null,
            "by_stage": {
              "paper": {
                "persona_count": 2,
                "runtime_count": 2
              }
            }
          },
          "limit": 20
        }
      },
      "page_info": {
        "next_page_token": null,
        "total": 4,
        "page_size": 4
      },
      "meta": {
        "snapshot_at": "2026-11-22T12:00:00Z",
        "version": "v1",
        "surfaces": {
          "management_trading_pulse": {
            "status": "degraded",
            "source": "bff_composed",
            "message": "Trading pulse aggregate is available, but runtime, telemetry, monitoring, row health, or baseline coverage is degraded.",
            "snapshot_at": "2026-11-22T12:00:00Z"
          },
          "runtime_roster": {
            "status": "ok",
            "source": "service_store"
          },
          "telemetry_summary": {
            "status": "ok",
            "source": "service_store"
          },
          "paper_runtime_monitoring": {
            "status": "degraded",
            "source": "service_store",
            "message": "Paper runtime monitoring session missing for one or more paper runtimes.",
            "staleness": {
              "served_from": "unverifiable",
              "last_known_at": "2026-11-22T12:00:00Z"
            }
          },
          "paper_live_drift": {
            "status": "ok",
            "source": "service_store",
            "message": "No live runtimes require paper/live baseline comparison."
          },
          "baseline_comparison": {
            "status": "ok",
            "source": "bff_composed",
            "snapshot_at": "2026-11-22T12:00:00Z"
          },
          "runtime_row_health": {
            "status": "degraded",
            "source": "bff_composed",
            "snapshot_at": "2026-11-22T12:00:00Z",
            "message": "Trading pulse row health is degraded for 2 runtime(s)."
          },
          "management_trading_pulse_rankings": {
            "status": "degraded",
            "source": "bff_composed",
            "message": "Trading pulse rankings are degraded because runtime or telemetry coverage is degraded.",
            "snapshot_at": "2026-11-22T12:00:00Z"
          }
        },
        "composition_sources": [
          "GET /bff/management/trading-pulse",
          "GET /bff/runtimes",
          "telemetry_summaries",
          "paper_runtime_monitoring_sessions",
          "paper_live_drift_reports"
        ]
      }
    }
  }
];

for (const fixture of managementServiceFixtures) {
  test(`actual ManagementService wire accepts comparable=${fixture.comparable}`, () => {
    assert.ok(fixture.ranking.data.items.some((b) => b.items.length > 0));
    assert.deepEqual(assessWire(fixture.sources, fixture.overview, fixture.ranking), []);
  });
}

const serviceFixture = (comparable = true) => structuredClone(managementServiceFixtures.find((f) => f.comparable === comparable));
for (const [name, mutate, code] of [
  ["wrong amount", (f) => { f.overview.data.runtime_rows[0].telemetry_summary.metrics.pnl = -1; }, "row[0]:ledger_values"],
  ["missing amount", (f) => { delete f.overview.data.runtime_rows[0].telemetry_summary.metrics.pnl; }, "row[0]:ledger_values"],
  ["null to zero", (f) => { f.overview.data.runtime_rows[1].telemetry_summary.metrics.pnl = 0; }, "row[1]:ledger_values"],
  ["missing blocks", (f) => { delete f.ranking.data.items; }, "rankings_missing"],
  ["empty blocks", (f) => { f.ranking.data.items = []; }, "rankings_missing"],
  ["missing block items", (f) => { delete f.ranking.data.items[0].items; }, "rankings_invalid_block"],
  ["rank value tamper", (f) => { f.ranking.data.items[0].items[0].ranking_metric_value = 0; }, "rankings_name_or_value"],
  ["rank value missing", (f) => { delete f.ranking.data.items[0].items[0].ranking_metric_value; }, "rankings_name_or_value"],
  ["rank value null with fallback", (f) => { f.ranking.data.items[2].items[0].ranking_metric_value = null; }, "rankings_name_or_value"],
  ["wrong operator", (f) => { f.ranking.data.items[2].items[0].persona_id = "intruder"; }, "rankings_wrong_operator"],
  ["duplicate runtime", (f) => { f.ranking.data.items[2].items[1] = structuredClone(f.ranking.data.items[2].items[0]); }, "rankings_wrong_operator"],
  ["illegal rank", (f) => { f.ranking.data.items[2].items[0].rank = 2; }, "rankings_invalid_order"],
  ["ineligible ranking", (f) => { f.ranking.data.items[0].items[0].ranking_eligible = false; }, "rankings_unverified_scope"],
  ["unverified currency", (f) => { f.sources.rows[0].pnl_currency = null; }, "rankings_unverified_scope"],
  ["missing comparison period", (f) => { delete f.ranking.data.items[0].items[0].comparison_scope.period; }, "rankings_unverified_scope"],
  ["wrong denominator", (f) => { f.ranking.data.summary.operator_scope.runtime_count++; }, "ranking_denominator_mismatch"],
  ["invented group", (f) => { f.overview.data.summary.pnl_groups[0].value = 0; }, "group[0]:wire_scope_sum"],
  ["erased ranked evidence", (f) => { f.ranking.data.items[2].items = []; }, "rankings_coverage"],
  ["missing coverage", (f) => { delete f.ranking.data.items[2].missing_metric_count; }, "rankings_coverage"],
]) test(`actual wire rejects ${name}`, () => {
  const f = serviceFixture(); mutate(f);
  assert.ok(assessWire(f.sources, f.overview, f.ranking).includes(code));
});

test("actual wire distinguishes measured zero from null and absent PnL", () => {
  const f = serviceFixture(false), r = f.overview.data.runtime_rows[0];
  f.sources.rows[0].pnl = 0; r.telemetry_summary.metrics.pnl = 0;
  assert.deepEqual(assessWire(f.sources, f.overview, f.ranking), []);
  for (const value of [null, undefined]) {
    r.telemetry_summary.metrics.pnl = value;
    assert.ok(assessWire(f.sources, f.overview, f.ranking).includes("row[0]:ledger_values"));
  }
});


test("missing wire scope is not an explicitly unknown scope", () => {
  for (const key of ["pnl_currency", "pnl_period_start_at"]) {
    const f = serviceFixture(false); delete f.overview.data.runtime_rows[0].performance_context[key];
    assert.ok(assessWire(f.sources, f.overview, f.ranking).includes("row[0]:pnl_scope"));
  }
});

test("actual ranking permits separate scopes to restart at one", () => {
  const f = serviceFixture(), row = f.overview.data.runtime_rows[0];
  row.deployment_stage = "canary";
  for (const block of f.ranking.data.items) for (const item of block.items) if (item.runtime_id === row.runtime_id) {
    item.comparison_scope.stage = "canary"; item.rank = 1;
  }
  assert.deepEqual(assessWire(f.sources, f.overview, f.ranking), []);
});

test("actual ranking rejects reversed values within a scope", () => {
  const f = serviceFixture(), block = f.ranking.data.items[2];
  const item = block.items[1]; item.fill_rate = item.ranking_metric_value = 0.5;
  f.overview.data.runtime_rows.find((r) => r.runtime_id === item.runtime_id).telemetry_summary.metrics.fill_rate = 0.5;
  assert.ok(assessWire(f.sources, f.overview, f.ranking).includes("rankings_invalid_order"));
});
