import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chromium } from "@playwright/test";
import { classifyRequest, makeRedactor } from "./accept-persona-strategy-hosted-readonly.mjs";
import { assessJourney, assessOverview, assessPersona, assessRow, assessWire, hasNumber,
  keyboardActivate, MAX_BYTES, returnViaScreen, safeTarget, snapshotPage, validateInput, writeEvidence,
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
    persona_id: source.persona_id, persona_name: source.persona_name, metrics: { pnl: null }, performance_context: { ledger_fill_count: 0 } }],
    summary: { operator_scope: { status: "verified", persona_count: 1, runtime_count: 1 }, pnl_groups: [] } } };
  const ranks = { data: { ranking_blocks: [{ metric: "pnl", items: [] }], summary: overview.data.summary } };
  assert.deepEqual(assessWire(sources, overview, ranks), []);
  ranks.data.ranking_blocks[0].items.push({ persona_id: "persona-probe", persona_name: "部署測試", value: 0 });
  assert.ok(assessWire(sources, overview, ranks).includes("rankings_wrong_operator"));
  overview.data.runtime_rows[0].performance_context.ledger_fill_count = null;
  assert.ok(assessWire(sources, overview, ranks).includes("row[0]:ledger_values"));
});

test("Persona detail needs rendered name/symbol/mode and response tenant/object, URL alone insufficient", () => {
  const body = { data: { persona_id: source.persona_id, tenant_id: sources.tenant_id } };
  assert.deepEqual(assessPersona(source, sources.tenant_id, body, row().text), []);
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

test("real Chromium DOM: narrow clipping, diagnostics, actual Tab/Enter and on-screen return", { timeout: 30_000 }, async () => {
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
  } finally { await browser.close(); }
});
