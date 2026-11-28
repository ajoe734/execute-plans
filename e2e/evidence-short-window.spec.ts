/**
 * FE-EVIDENCE-CITED-20261125 - Evidence and Persona Fleet stay readable in a
 * short window, with real (non-overlay) scrollbars.
 *
 * Hosted read-only facts 2026-11-25 (BFF adc027da9): at 1274x627 the evidence
 * table viewport was 23 px and no row was visible. The fix lets the page
 * scroll and keeps a table area of at least 320 px. This spec measures that
 * on the cited list (default, scope=cited), the ingested list
 * (scope=ingested) and Persona Fleet, and captures browser screenshots into
 * $E2E_EVIDENCE_DIR when that variable is set.
 *
 * Row shapes: the cited rows follow GET /bff/management/evidence?scope=cited
 * (BFF-EVIDENCE-CITED-LIST-20261125, ajoe734/pantheon 381f1ea88) with the
 * hosted reference ids recorded there; ingested rows follow the bounded
 * source_ingest_evidence_items envelope; the item detail follows
 * service.py get_evidence_item; Persona Fleet rows follow the
 * /bff/management/persona-fleet row used by e2e/24-persona-fleet-click-map.
 */
import { mkdirSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import {
  installContainedLoopbackAuth,
  installContainedLoopbackAuthAuthority,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";
const SCREENSHOT_SUBDIR = "FE-EVIDENCE-CITED-20261125/screenshots";

/**
 * Evidence capture is opt-in: screenshots are written only when
 * E2E_EVIDENCE_DIR is set, so a plain run never touches committed files
 * (FE-E2E-NO-TRACKED-EVIDENCE-WRITES-20261126).
 */
async function captureEvidence(
  page: Page,
  subdir: string,
  file: string,
  options: { fullPage?: boolean } = {},
): Promise<void> {
  const evidenceDir = process.env.E2E_EVIDENCE_DIR;
  if (!evidenceDir) return;
  const dir = `${evidenceDir}/${subdir}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${file}`, ...options });
}

function frontendUrl(path: string): string {
  const base =
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.PANTHEON_FE_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers":
      "accept,authorization,content-type,idempotency-key,if-match,x-bff-api-version,x-correlation-id,x-locale,x-request-id,x-tenant-id,x-trace-id",
    vary: "Origin",
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", headers: corsHeaders(route), body: JSON.stringify(body) });
}

const SNAPSHOT = "2026-11-25T07:16:00Z";
const PERSONAS = [
  ["persona-ee7112a829d38b9135ac", "衡岳｜2330 台股 Paper 學習 R2"],
  ["persona-2448c7053e33ea48da47", "青禾｜2330 台股 Paper 學習 R2"],
  ["persona-6507750312870d03a241", "澄川｜2330 台股 Paper 學習 R2"],
  ["persona-d57f6d76254c20418a9e", "Pantheon Dev Paper Baseline 3"],
  ["persona-59b2143dcecf205acbf1", "Pantheon Dev Paper Release 42123862167 Attempt 1"],
  ["persona-98e2f843d829665c2cd0", "Pantheon Dev Paper Release 3623d82dbfb3 Attempt 1"],
  ["persona-b74d2d121d01589eb9c8", "Pantheon Dev Paper Release 52b322fff22e Attempt 1"],
  ["persona-0b1f6c2d9e8a7b6c5d4e", "遠山｜0050 台股 Paper 學習 R1"],
  ["persona-1c2d3e4f5a6b7c8d9e0f", "白石｜2317 台股 Paper 學習 R1"],
  ["persona-2d3e4f5a6b7c8d9e0f1a", "臨溪｜2454 台股 Paper 學習 R1"],
  ["persona-3e4f5a6b7c8d9e0f1a2b", "雲棲｜2881 台股 Paper 學習 R1"],
  ["persona-4f5a6b7c8d9e0f1a2b3c", "松濤｜2303 台股 Paper 學習 R1"],
] as const;
const ARTIFACTS = [
  "artifact-persona-paper-a81b4fd15944698341aa",
  "artifact-persona-paper-039ad01f8bcd2b4aa466",
  "artifact-persona-paper-06d4775a9b6a8f63b311",
];
const MEETING = "mtg-6edaff7d0ff76275";

function meetingPosition(persona: string, round: number) {
  return {
    entity_type: "meeting_position",
    entity_ref: MEETING,
    label: `Pool evolution review for ${PERSONAS[0][1]} (2026-W48)`,
    parts: { meeting_id: MEETING, meeting_name: `Pool evolution review for ${PERSONAS[0][1]} (2026-W48)`, round, position: "A", persona_id: persona },
    route_href: `/management/meetings/${MEETING}`,
    time: `2026-11-25T0${Math.min(round, 9)}:00:00Z`,
    source: "meeting_positions",
  };
}

function citedRows() {
  const rows: Array<Record<string, unknown>> = [];
  ARTIFACTS.forEach((art, i) => {
    rows.push({
      id: art,
      ref_id: art,
      ref_kind: "registry_artifact",
      source_owner: "registry",
      label: `${PERSONAS[i][1]} momentum strategy`,
      name_missing: false,
      label_parts: { strategy_id: art },
      source_class: "registry_record",
      resolved_link: { route_href: `/management/strategies/${art}`, evidence_ref_id: null },
      route_href: `/management/strategies/${art}`,
      cited_as: [`facts:registry_entry:${art}`, art],
      cited_by: [
        meetingPosition(PERSONAS[i][0], 1),
        {
          entity_type: "approval",
          entity_ref: `apr-20261125-000${i + 1}`,
          label: null,
          parts: { decision_type: "strategy_promotion", target_id: art },
          route_href: "/management/approvals",
          time: "2026-11-25T06:30:00Z",
          source: "governance_approvals",
        },
      ],
      citation_count: 2,
      last_cited_at: "2026-11-25T06:30:00Z",
      redacted: false,
    });
  });
  PERSONAS.slice(0, 6).forEach(([persona, name], i) => {
    rows.push({
      id: `facts:strategy_pool:${persona}@${4 + i}`,
      ref_id: `facts:strategy_pool:${persona}@${4 + i}`,
      ref_kind: "strategy_pool",
      source_owner: "persona",
      label: name,
      name_missing: false,
      label_parts: { persona_id: persona, pool_version: String(4 + i) },
      source_class: "owner_fact",
      resolved_link: { route_href: `/management/personas/${persona}`, evidence_ref_id: null },
      route_href: `/management/personas/${persona}`,
      cited_as: [`facts:strategy_pool:${persona}@${4 + i}`],
      cited_by: [meetingPosition(persona, 2)],
      citation_count: 1,
      last_cited_at: "2026-11-25T05:00:00Z",
      redacted: false,
    });
  });
  rows.push({
    id: "evidence:search_excerpt:ko-evi-1217cd1c8ccc7274-94a73ebc0814",
    ref_id: "evidence:search_excerpt:ko-evi-1217cd1c8ccc7274-94a73ebc0814",
    ref_kind: "knowledge_object",
    source_owner: "search",
    label: "TW official tw_price_daily TWSE 0050 2026-11-24",
    name_missing: false,
    label_parts: {},
    source_class: "official_reference",
    resolved_link: { route_href: "/management/evidence/evi-1217cd1c8ccc7274", evidence_ref_id: "evi-1217cd1c8ccc7274" },
    route_href: "/management/evidence/evi-1217cd1c8ccc7274",
    cited_as: ["evidence:search_excerpt:ko-evi-1217cd1c8ccc7274-94a73ebc0814"],
    cited_by: [meetingPosition(PERSONAS[0][0], 1)],
    citation_count: 1,
    last_cited_at: "2026-11-25T04:00:00Z",
    redacted: false,
  });
  rows.push({
    id: "lessons:memory_committee_shared:mem-shared-0002",
    ref_id: "lessons:memory_committee_shared:mem-shared-0002",
    ref_kind: "memory",
    source_owner: "memory",
    label: "lessons:memory_committee_shared:mem-shared-0002",
    name_missing: true,
    label_parts: {},
    source_class: "memory",
    resolved_link: null,
    route_href: null,
    cited_as: ["lessons:memory_committee_shared:mem-shared-0002"],
    cited_by: [
      {
        entity_type: "persona_cycle_decision",
        entity_ref: "ooda-pkt-0001",
        label: null,
        parts: { persona_id: PERSONAS[0][0], persona_name: PERSONAS[0][1], kind: "meeting_action", decision_index: 0 },
        route_href: `/management/personas/${PERSONAS[0][0]}`,
        time: "2026-11-25T03:00:00Z",
        source: "persona_cycles",
      },
    ],
    citation_count: 1,
    last_cited_at: "2026-11-25T03:00:00Z",
    redacted: false,
  });
  return rows;
}

function citedAnswer(denyApprovals: boolean) {
  const ok = (extra: Record<string, unknown> = {}) => ({
    status: "ok", reason: null, read_count: 3, truncated: false, failed_count: 0, citation_count: 3, withheld_count: 0, calls: 1, response_bytes: 4200, ...extra,
  });
  const sources = {
    meeting_proposals: ok({ citation_count: 0 }),
    meeting_positions: ok({ read_count: 20, calls: 21, response_bytes: 495000 }),
    governance_approvals: denyApprovals
      ? { status: "denied", reason: "owner_denied", read_count: null, truncated: false, failed_count: null, citation_count: 0, withheld_count: 0, calls: 1, response_bytes: 0 }
      : ok(),
    evolution_proposals: ok({ citation_count: 0 }),
    research_demands: ok({ citation_count: 0 }),
    research_tickets: ok({ citation_count: 0 }),
    persona_cycles: ok({ withheld_count: 1 }),
  };
  const items = citedRows();
  const status = denyApprovals ? "degraded" : "ok";
  return {
    data: {
      id: "management-evidence-cited",
      scope: "cited",
      items,
      summary: {
        scope: "cited", complete: !denyApprovals, incomplete: denyApprovals, reference_total: items.length, returned: items.length,
        references_truncated: false, max_references: 500, redacted_count: 0,
        excluded: { meeting_topic: 1, private_or_trader: 0, memory_scope_unproven: 1, unparsed: 0 },
        sources_ok: denyApprovals ? 6 : 7, sources_not_ok: denyApprovals ? ["governance_approvals"] : [],
      },
      sources,
    },
    page_info: { next_page_token: null, total: items.length, page_size: 20 },
    meta: {
      snapshot_at: SNAPSHOT,
      surfaces: {
        management_evidence: { status, source: "bff_composed_owner_reads", snapshot_at: SNAPSHOT },
        cited_evidence: { status, source: "bff_composed_owner_reads", snapshot_at: SNAPSHOT },
        cited_evidence_sources: sources,
      },
      item_reads: { attempted: 1, resolved: 1, failed: 0, truncated: false },
      cost: { owner_calls: 27, response_bytes: 41200, item_reads: 1 },
      redacted_evidence_count: 0,
      policy: "read_only_cited_evidence",
    },
  };
}

function ingestedAnswer() {
  const symbols = ["0050", "2330", "2317", "2454", "2881", "2303", "1301", "2412", "2882", "3711", "2308", "2891", "1216", "2002", "2886", "5880", "2884", "1303", "2892", "3008"];
  const items = symbols.map((sym, i) => {
    const id = `evitem-tw_price_daily-${sym}-2026-11-24-${(0xabc100 + i).toString(16)}`;
    return {
      id,
      ref_id: id,
      evidence_item_id: id,
      title: `TW official tw_price_daily TWSE ${sym} 2026-11-24`,
      display_label: `TW official tw_price_daily TWSE ${sym} 2026-11-24`,
      source_type: "official_reference",
      source_ref: `tw-official://tw_price_daily/TWSE/${sym}/2026-11-24/3ec7b3e4e9083086`,
      captured_at: "2026-11-24T14:30:00+08:00",
      link_type: "tw_price_daily",
      source_class: "official_reference",
      source_document: { title: `TW official tw_price_daily TWSE ${sym} 2026-11-24`, source_type: "official_reference", captured_at: "2026-11-24T14:30:00+08:00", excerpt: null },
      credibility: { tier: "producer_record", verified: true },
      linked_object_summary: {},
      linked_decisions: [],
      resolved_link: { availability: "unavailable", route_href: null, display_label: "Source unavailable" },
      route_href: `/knowledge/evidence/${id}`,
      management_href: `/management/evidence?ref_id=${id}`,
      redacted: false,
    };
  });
  return {
    data: {
      id: "management-evidence",
      items,
      summary: { total_evidence: 614, returned_evidence: 20, visible_evidence: 614, redacted_evidence: 0 },
    },
    page_info: { next_page_token: "20", total: 614, page_size: 20 },
    meta: { snapshot_at: SNAPSHOT, surfaces: { management_evidence: { status: "ok", source: "service_store" }, evidence_refs: { status: "ok", source: "service_store" } }, redacted_evidence_count: 0 },
  };
}

const DETAIL_ITEM = {
  data: {
    id: "evi-1217cd1c8ccc7274",
    ref_id: "evi-1217cd1c8ccc7274",
    title: "TW official tw_price_daily TWSE 0050 2026-11-24",
    display_label: "TW official tw_price_daily TWSE 0050 2026-11-24",
    source_type: "official_reference",
    source_ref: "https://www.twse.com.tw/exchangeReport/STOCK_DAY?date=20261124&stockNo=0050",
    captured_at: "2026-11-24T14:30:00+08:00",
    link_type: "tw_price_daily",
    source_class: "official_reference",
    source_document: {
      title: "TW official tw_price_daily TWSE 0050 2026-11-24",
      source_type: "official_reference",
      source_ref: "https://www.twse.com.tw/exchangeReport/STOCK_DAY?date=20261124&stockNo=0050",
      captured_at: "2026-11-24T14:30:00+08:00",
      excerpt: "0050 元大台灣50 2026-11-24 收盤 192.35，成交 18,204 張。",
    },
    credibility: { tier: "producer_record", verified: true },
    linked_object_summary: {},
    linked_decisions: [],
    resolved_link: { availability: "unavailable", route_href: null, display_label: "Source unavailable" },
    route_href: "/knowledge/evidence/evi-1217cd1c8ccc7274",
    management_href: "/management/evidence?ref_id=evi-1217cd1c8ccc7274",
    redacted: false,
  },
  meta: { snapshot_at: SNAPSHOT, surfaces: { evidence_ref_detail: { status: "ok", source: "service_store", snapshot_at: SNAPSHOT } } },
};

function fleetRows() {
  return PERSONAS.map(([personaId, personaName], i) => ({
    id: personaId,
    personaId,
    persona_purpose: "trading",
    data_scope: "regular",
    personaName,
    owner: "pantheon-dev-operator-a",
    ooda: ["observe", "orient", "decide", "act"][i % 4],
    autonomy: "supervised",
    state: "paper_running",
    perfDelta: null,
    has_trading_telemetry: true,
    hasTradingTelemetry: true,
    lastMutation: "2026-11-23T10:05:12Z",
    capitalMode: "paper",
    capitalPoolId: `pool-${personaId}`,
    capital_pool_id: `pool-${personaId}`,
    runtimeHealth: "paper_running",
    leagueRank: i + 1,
    leagueScore: 80 - i,
    data_sources: [{ provider_key: "shioaji", providerKey: "shioaji", status: "read_ok" }],
    dataSources: [{ provider_key: "shioaji", providerKey: "shioaji", status: "read_ok" }],
    research_status: { stage: "management_review_linked" },
    researchStatus: { stage: "management_review_linked" },
    humanNeeded: false,
    currentWork: `${personaName} paper session`,
  }));
}

async function installFixtureBff(page: Page, opts: { denyApprovals?: boolean } = {}): Promise<{ evidenceQueries: string[] }> {
  const evidenceQueries: string[] = [];
  await installContainedLoopbackAuth(page);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    if (path === "/health" || path === "/healthz" || path === "/readyz") {
      return fulfillJson(route, { status: "ok", live: true, ready: true, checked_at: SNAPSHOT });
    }
    if (path === "/bff/events/stream") {
      await route.fulfill({ status: 200, contentType: "text/event-stream", headers: corsHeaders(route), body: ": connected\n\n" });
      return;
    }
    if (path === "/bff/management/evidence") {
      evidenceQueries.push(url.search);
      if (url.searchParams.get("scope") === "cited") return fulfillJson(route, citedAnswer(Boolean(opts.denyApprovals)));
      return fulfillJson(route, ingestedAnswer());
    }
    if (path === "/bff/management/evidence/evi-1217cd1c8ccc7274") {
      return fulfillJson(route, DETAIL_ITEM);
    }
    if (path.startsWith("/bff/management/evidence/")) {
      return fulfillJson(route, { error: { code: "RESOURCE_NOT_FOUND", message: "Evidence not found" } }, 404);
    }
    if (path === "/bff/management/persona-fleet") {
      const items = fleetRows();
      return fulfillJson(route, {
        data: { items, summary: { filtered_archived_total: 0 } },
        items,
        meta: { route: path, snapshot_at: SNAPSHOT, status: "ok", surfaces: { canonical_read: { status: "ok" } } },
        page_info: { next_page_token: null, total: items.length, filtered_total: items.length, page_size: 25 },
      });
    }
    if (path.startsWith("/bff/") || path.startsWith("/api/")) {
      return fulfillJson(route, { data: [], items: [], page_info: { total: 0 }, meta: { snapshot_at: SNAPSHOT, status: "ok" } });
    }
    await route.continue();
  });
  await installContainedLoopbackAuthAuthority(page);
  return { evidenceQueries };
}

type Measurement = {
  sectionClientHeight: number;
  sectionScrollHeight: number;
  scrollerClientHeight: number;
  scrollerHeight: number;
  totalRows: number;
  fullRowsAfterPageScroll: number;
  theadStickyDelta: number;
};

async function measure(page: Page, sectionSelector: string): Promise<Measurement> {
  return page.evaluate((selector) => {
    const section = document.querySelector<HTMLElement>(selector)!;
    const scroller = section.querySelector<HTMLElement>('[data-management-table-scrollbar="native"]')!;
    const thead = scroller.querySelector<HTMLElement>("thead")!;
    const rows = Array.from(scroller.querySelectorAll<HTMLElement>("tbody tr"));
    // One page scroll brings the table card into view (page scroll, not table scroll).
    const card = scroller.parentElement!.parentElement!;
    section.scrollTop = Math.max(0, card.offsetTop - section.offsetTop - 8);
    const sectionRect = section.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const theadRect = thead.getBoundingClientRect();
    const top = Math.max(sectionRect.top, scrollerRect.top, theadRect.bottom, 0);
    const bottom = Math.min(sectionRect.bottom, scrollerRect.top + scroller.clientHeight, window.innerHeight);
    const fullRowsAfterPageScroll = rows.filter((row) => {
      const r = row.getBoundingClientRect();
      return r.top >= top - 1 && r.bottom <= bottom + 1;
    }).length;
    const theadTop = thead.getBoundingClientRect().top;
    if (scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop = Math.min(120, scroller.scrollHeight - scroller.clientHeight);
    const theadStickyDelta = Math.abs(thead.getBoundingClientRect().top - theadTop);
    scroller.scrollTop = 0;
    return {
      sectionClientHeight: section.clientHeight,
      sectionScrollHeight: section.scrollHeight,
      scrollerClientHeight: scroller.clientHeight,
      scrollerHeight: Math.round(scroller.getBoundingClientRect().height),
      totalRows: rows.length,
      fullRowsAfterPageScroll,
      theadStickyDelta,
    };
  }, sectionSelector);
}

const VIEWPORTS = [
  { width: 1274, height: 627 },
  { width: 1920, height: 1000 },
] as const;

const PAGES = [
  { key: "evidence-cited", path: "/management/evidence", section: '[data-testid="evidence-route-ready"][data-evidence-scope="cited"]', row: '[data-testid="evidence-route-row"]' },
  { key: "evidence-ingested", path: "/management/evidence?scope=ingested", section: '[data-testid="evidence-route-ready"][data-evidence-scope="ingested"]', row: '[data-testid="evidence-route-row"]' },
  { key: "persona-fleet", path: "/management/persona-fleet", section: '[data-testid="persona-fleet-page"]', row: '[data-testid="persona-fleet-table-scroll"] tbody tr' },
] as const;

test.describe("FE-EVIDENCE-CITED-20261125 evidence and persona fleet in a short window", () => {
  test.setTimeout(120_000);
  test.skip(targetsExternalE2eEnvironment(), "fixture BFF layout regression runs on loopback");

  for (const vp of VIEWPORTS) {
    for (const target of PAGES) {
      test(`${target.key} at ${vp.width}x${vp.height} keeps a table area >= 320 px with page scroll and real scrollbars`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: vp });
        const page = await context.newPage();
        const { evidenceQueries } = await installFixtureBff(page);
        await page.goto(frontendUrl(target.path), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await expect(page.locator(target.section)).toBeVisible({ timeout: 30_000 });
        await expect(page.locator(target.row).first()).toBeAttached({ timeout: 30_000 });

        if (target.key === "evidence-cited") {
          expect(evidenceQueries.some((q) => new URLSearchParams(q).get("scope") === "cited")).toBe(true);
        }
        if (target.key === "evidence-ingested") {
          expect(evidenceQueries.some((q) => new URLSearchParams(q).get("scope") === "ingested")).toBe(true);
        }

        const scrollbarWidth = await page.evaluate(() => {
          const probe = document.createElement("div");
          probe.style.cssText = "width:100px;height:100px;overflow:scroll;position:absolute;top:-999px";
          document.body.appendChild(probe);
          const width = probe.offsetWidth - probe.clientWidth;
          probe.remove();
          return width;
        });
        expect(scrollbarWidth, "real scrollbars must take layout space").toBeGreaterThan(0);

        await captureEvidence(page, SCREENSHOT_SUBDIR, `${target.key}-${vp.width}x${vp.height}-top.png`);
        const m = await measure(page, target.section);
        console.log(`MEASUREMENT ${target.key}@${vp.width}x${vp.height} ${JSON.stringify({ ...m, scrollbarWidth })}`);
        await captureEvidence(page, SCREENSHOT_SUBDIR, `${target.key}-${vp.width}x${vp.height}-scrolled.png`);

        expect(m.scrollerClientHeight).toBeGreaterThanOrEqual(320);
        expect(m.scrollerHeight).toBeGreaterThanOrEqual(320);
        expect(m.fullRowsAfterPageScroll).toBeGreaterThanOrEqual(Math.min(3, m.totalRows));
        expect(m.theadStickyDelta).toBeLessThanOrEqual(1);
        if (vp.height === 627) {
          // The page scrolls instead of crushing the table.
          expect(m.sectionScrollHeight).toBeGreaterThan(m.sectionClientHeight);
        }
        await context.close();
      });
    }
  }

  test("cited table fits the 1274x627 content width without horizontal scrolling and keeps who cites it and last cited on screen", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1274, height: 627 } });
    const page = await context.newPage();
    await installFixtureBff(page);
    await page.goto(frontendUrl("/management/evidence"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator('[data-testid="evidence-cited-table"] [data-testid="evidence-route-row"]').first()).toBeAttached({ timeout: 30_000 });
    const fit = await page.evaluate(() => {
      const table = document.querySelector<HTMLElement>('[data-testid="evidence-cited-table"]');
      const main = document.querySelector<HTMLElement>("main");
      if (!table || !main) throw new Error("cited table not rendered");
      // Every ancestor of the table up to <body> must not need horizontal scrolling.
      const scrollers: string[] = [];
      for (let el = table.parentElement; el && el !== document.body; el = el.parentElement) {
        const ox = getComputedStyle(el).overflowX;
        if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1) {
          scrollers.push(`${el.tagName}.${el.getAttribute("data-testid") ?? ""} ${el.scrollWidth}>${el.clientWidth}`);
        }
      }
      const rightEdge = Math.min(window.innerWidth, main.getBoundingClientRect().right);
      const cells = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).map((el) => el.getBoundingClientRect());
      const citedBy = cells('[data-testid="evidence-cited-table"] tbody tr td:nth-child(2)');
      const lastCited = cells('[data-testid="evidence-cited-last-cited"]');
      return {
        mainWidth: Math.round(main.getBoundingClientRect().width),
        tableWidth: Math.round(table.getBoundingClientRect().width),
        horizontalScrollers: scrollers,
        citedByOffscreen: citedBy.filter((r) => r.right > rightEdge + 1 || r.width < 200).length,
        lastCitedOffscreen: lastCited.filter((r) => r.right > rightEdge + 1).length,
        lastCitedCount: lastCited.length,
      };
    });
    console.log(`MEASUREMENT evidence-cited-fit@1274x627 ${JSON.stringify(fit)}`);
    await captureEvidence(page, SCREENSHOT_SUBDIR, `evidence-cited-fit-1274x627.png`);
    expect(fit.tableWidth).toBeLessThanOrEqual(fit.mainWidth);
    expect(fit.horizontalScrollers, "no horizontal scrolling for the cited table").toEqual([]);
    expect(fit.lastCitedCount).toBeGreaterThan(0);
    expect(fit.citedByOffscreen).toBe(0);
    expect(fit.lastCitedOffscreen).toBe(0);
    await context.close();
  });

  test("ingested list and detail show recorded codes as words with the code as tooltip", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1274, height: 627 } });
    const page = await context.newPage();
    await installFixtureBff(page);
    const RAW = /\b(source record|producer record|tw price daily|official reference)\b|Source unavailable/;
    await page.goto(frontendUrl("/management/evidence?scope=ingested"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.locator('[data-testid="evidence-route-row"]').first()).toBeAttached({ timeout: 30_000 });
    await expect(page.getByTestId("evidence-row-source-type").first()).toHaveAttribute("title", "official_reference");
    expect(await page.locator("main").innerText()).not.toMatch(RAW);
    await page.goto(frontendUrl("/management/evidence/evi-1217cd1c8ccc7274"), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("evidence-detail")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[title="tw_price_daily"]').first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(RAW);
    await captureEvidence(page, SCREENSHOT_SUBDIR, `evidence-detail-codes-1274x627.png`, { fullPage: true });
    await context.close();
  });

  test("cited list names a source that could not be read and marks the total incomplete", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1274, height: 627 } });
    const page = await context.newPage();
    await installFixtureBff(page, { denyApprovals: true });
    await page.goto(frontendUrl("/management/evidence"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.getByTestId("evidence-cited-sources-incomplete")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("evidence-cited-source-governance_approvals")).toBeVisible();
    await expect(page.getByTestId("evidence-metric-card").first()).toContainText(/11/);
    await captureEvidence(page, SCREENSHOT_SUBDIR, `evidence-cited-incomplete-1274x627.png`);
    await context.close();
  });

  test("a cited row opens a readable detail with source, captured time, excerpt and external link", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1274, height: 627 } });
    const page = await context.newPage();
    await installFixtureBff(page);
    await page.goto(frontendUrl("/management/evidence"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    const link = page.locator('a[href="/management/evidence/evi-1217cd1c8ccc7274"]').first();
    await expect(link).toBeAttached({ timeout: 30_000 });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page.getByTestId("evidence-detail")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("main h1").first()).toHaveText("TW official tw_price_daily TWSE 0050 2026-11-24");
    await expect(page.getByTestId("evidence-detail-excerpt")).toContainText("收盤 192.35");
    await expect(page.getByTestId("evidence-detail-external").locator("a")).toHaveAttribute(
      "href",
      "https://www.twse.com.tw/exchangeReport/STOCK_DAY?date=20261124&stockNo=0050",
    );
    const mainText = await page.locator("main").innerText();
    expect(mainText).not.toMatch(/management-evidence|\bunknown\b/);
    await captureEvidence(page, SCREENSHOT_SUBDIR, `evidence-detail-cited-1274x627.png`, { fullPage: true });

    await page.goto(frontendUrl("/management/evidence/evi-does-not-exist"), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("evidence-detail-not-found")).toBeVisible({ timeout: 30_000 });
    await captureEvidence(page, SCREENSHOT_SUBDIR, `evidence-detail-not-found-1274x627.png`);
    await context.close();
  });
});
