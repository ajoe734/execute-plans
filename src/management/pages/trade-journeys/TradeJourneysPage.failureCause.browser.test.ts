import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  completedRow,
  fixtureMeta,
  makeTj57418ba7Timeline,
  rejectedBeforeRepairRow,
  rejectedBeforeRepairTimeline,
  rejectedDetailStages,
  rejectedRow,
  rejectedTimeline,
  tj57418ba7BrokerUnavailableRow,
  tj57418ba7GenuineMismatchRow,
  tj57418ba7RepairedRuntimeRow,
  tj57418ba7UnverifiedRow,
  tj57418ba7UpstreamOmissionRow,
} from "./__fixtures__/readableJourneys";
import recordedVarianceDetail from "./__fixtures__/recorded/detail_tj_29473e86-63ff-5384-bda1-23eef61cebb2.json";
import recordedVarianceTimeline from "./__fixtures__/recorded/timeline_tj_29473e86-63ff-5384-bda1-23eef61cebb2.json";

/**
 * Hosted read-only verification steps for the end-to-end probe
 * (PAPER-RISK-JOURNEY-HOSTED-PROOF-20261121 / acceptance/probes/trade-journey-readable).
 */
export const HOSTED_READONLY_VERIFICATION_STEPS = [
  {
    step: 1,
    id: "verify_deployed_fe_bff_pair",
    method: "GET",
    endpoints: [
      "https://app.dev.mvl-cap.tw/deployment.json",
      "https://api.dev.mvl-cap.tw/bff/version",
    ],
    readOnly: true,
    assertion:
      "Confirm deployment.json commit matches execute-plans dev SHA, buildMode has VITE_BFF_MODE=live, VITE_BFF_FALLBACK=strict, VITE_BFF_REAL_WRITES=false, and /bff/version source_commit_sha contains TRADE-JOURNEY-FAILURE-CAUSE-20261121.",
  },
  {
    step: 2,
    id: "execute_readonly_release_probe",
    method: "GET",
    endpoints: [
      "https://api.dev.mvl-cap.tw/bff/management/trade-journeys?tenant_id=tenant-dev&environment=paper&page_size=50",
      "https://api.dev.mvl-cap.tw/bff/management/trade-journeys?tenant_id=tenant-dev&environment=paper&page_size=50&attention=recon_mismatch",
    ],
    readOnly: true,
    assertion:
      "Run acceptance/probes/trade-journey-readable against ACCEPTANCE_BFF_URL=https://api.dev.mvl-cap.tw. Confirm 0 expression choice rejection codes (long_cash), 0 deferred reconciliation rows in attention=recon_mismatch, and 0 unproven accounting_variance claims without valid discrepancies.",
  },
  {
    step: 3,
    id: "verify_zh_tw_list_and_repaired_pre_broker_refusal",
    method: "GET",
    endpoints: [
      "https://app.dev.mvl-cap.tw/management/trade-journeys?tenant_id=tenant-dev&environment=paper",
      "https://app.dev.mvl-cap.tw/management/trade-journeys/tj_79726064-4cc2-5510-8e11-7f5e59ff89bd?tenant_id=tenant-dev&environment=paper",
    ],
    readOnly: true,
    assertion:
      "In zh-TW browser view, verify tj_79726064-4cc2-5510-8e11-7f5e59ff89bd (event 91d55953-b575-4fe8-8d39-6e0cade58d59) shows 風控駁回 and 未送單 across list, detail banner, 風險評估/下單送出 stage cards, and timeline, with cause 現金不足 and figures 需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股, and grounded persona link /management/personas/persona-6507750312870d03a241.",
  },
  {
    step: 4,
    id: "verify_zh_tw_repaired_reconciliation_and_variance_controls",
    method: "GET",
    endpoints: [
      "https://app.dev.mvl-cap.tw/management/trade-journeys/tj_57418ba7-ef37-5015-9b5e-b6423872da89?tenant_id=tenant-dev&environment=paper",
    ],
    readOnly: true,
    assertion:
      "In zh-TW browser view after history repair and refresh, verify tj_57418ba7-ef37-5015-9b5e-b6423872da89 (event 48c946c8-39d1-52bd-b1a1-ce72dc7f6e14) displays 賣 1 · @ 218.5 · 成交 1 股 and 對帳待確認 with runtime health / unverified accounting evidence across list, detail banner, 對帳 stage card, and timeline; verify proven accounting_variance rows show compared values (預期/實際/差額) and missing-evidence rows explicitly identify 證據不足（缺少：...）.",
  },
] as const;

const RAW_LEAK_RE = /\b(succeeded|failed|skipped|rejected|partial|degraded|not_submitted|unverified|long_cash)\b/;

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function closeServer(server?: Server): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise(resolve => server.close(() => resolve()));
}

async function bundleTradeJourneysApp(bffBase: string): Promise<string> {
  const root = process.cwd();
  const script = `
    const path = require("node:path");
    const { build } = require("esbuild");
    const root = ${JSON.stringify(root)};
    const bffBase = ${JSON.stringify(bffBase)};
    build({
      absWorkingDir: root,
      write: false,
      bundle: true,
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      logLevel: "silent",
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: \`
          import { createRoot } from "react-dom/client";
          import { BrowserRouter, Routes, Route } from "react-router-dom";
          import i18n from "@/i18n";
          import { TradeJourneysPage, TradeJourneyDetailPage } from "@/management/pages/trade-journeys/TradeJourneysPage";
          void i18n.changeLanguage("zh-TW");
          const root = createRoot(document.getElementById("root")!);
          root.render(
            <BrowserRouter>
              <Routes>
                <Route path="/management/trade-journeys" element={<TradeJourneysPage />} />
                <Route path="/management/trade-journeys/:journeyId" element={<TradeJourneyDetailPage />} />
                <Route path="/management/personas/:personaId" element={<div data-testid="persona-dest">Persona Page</div>} />
                <Route path="/management/incidents/:incidentId" element={<div data-testid="incident-dest">Incident Page</div>} />
              </Routes>
            </BrowserRouter>
          );
        \`,
      },
      alias: { "@": path.join(root, "src") },
      define: {
        "import.meta.env": JSON.stringify({
          MODE: "production",
          VITE_BFF_MODE: "live",
          VITE_BFF_BASE_URL: bffBase,
          VITE_BFF_FALLBACK: "strict",
          VITE_BFF_REAL_WRITES: "false",
        }),
        "process.env.NODE_ENV": '"production"',
      },
      loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
      plugins: [
        {
          name: "auth-stub",
          setup(b) {
            b.onResolve({ filter: /^@\\/lib\\/auth\\/AuthProvider$/u }, () => ({ path: "auth-stub", namespace: "stub" }));
            b.onLoad({ filter: /.*/u, namespace: "stub" }, () => ({
              contents:
                'export const useAuth = () => ({ bffSession: { identity: { tenantId: "tenant-dev" } }, session: null, user: null, loading: false });',
              loader: "js",
              resolveDir: root,
            }));
          },
        },
      ],
    }).then(out => {
      process.stdout.write(out.outputFiles[0].text);
    }).catch(err => {
      console.error(err);
      process.exit(1);
    });
  `;
  return execFileSync(process.execPath, ["-e", script], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

describe("FE-TRADE-JOURNEY-FAILURE-CAUSE-20261121 real Chromium browser verification (zh-TW)", () => {
  let browser: Browser | undefined;
  let bffServer: Server | undefined;
  let feServer: Server | undefined;
  let feBase = "";
  let historyRepaired = false;

  const genuineControlId = "tj_57418ba7-genuine-variance";
  const omissionControlId = "tj_57418ba7-missing-evidence";
  const brokerControlId = "tj_57418ba7-broker-unavailable";

  const genuineControlRow = { ...tj57418ba7GenuineMismatchRow, journey_id: genuineControlId };
  const omissionControlRow = { ...tj57418ba7UpstreamOmissionRow, journey_id: omissionControlId };
  const brokerControlRow = { ...tj57418ba7BrokerUnavailableRow, journey_id: brokerControlId };

  beforeAll(async () => {
    bffServer = createServer((req, res) => {
      const cors = {
        "access-control-allow-origin": feBase || "*",
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,OPTIONS",
        "access-control-allow-headers":
          "authorization,content-type,accept,last-event-id,x-request-id,x-tenant-id,x-bff-api-version,x-correlation-id,x-idempotency-key,x-actor-id,x-role,x-persona-id,x-environment",
      };
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors).end();
        return;
      }
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/bff/management/trade-journeys/events") {
        const rev = historyRepaired ? 2 : 1;
        res
          .writeHead(200, { ...cors, "content-type": "text/event-stream" })
          .end(`id: ${rev}\nevent: journeys_changed\ndata: {"revision":${rev}}\n\n`);
        return;
      }

      const current7972 = historyRepaired ? rejectedRow : rejectedBeforeRepairRow;
      const current5741 = historyRepaired ? tj57418ba7RepairedRuntimeRow : tj57418ba7UnverifiedRow;
      const recorded2947 = recordedVarianceDetail.data as unknown as typeof current5741;

      if (url.pathname === "/bff/management/trade-journeys") {
        const items = [
          current7972,
          current5741,
          recorded2947,
          genuineControlRow,
          omissionControlRow,
          brokerControlRow,
        ];
        res
          .writeHead(200, { ...cors, "content-type": "application/json" })
          .end(JSON.stringify({ data: { items }, page_info: { total: items.length, page_size: 25 }, meta: fixtureMeta }));
        return;
      }

      const matchDetail = /^\/bff\/management\/trade-journeys\/([^/]+?)(?:\/(timeline|evidence))?$/u.exec(url.pathname);
      if (matchDetail) {
        const id = decodeURIComponent(matchDetail[1]);
        const sub = matchDetail[2];
        if (sub === "evidence") {
          res
            .writeHead(200, { ...cors, "content-type": "application/json" })
            .end(JSON.stringify({ data: { journey_id: id }, meta: fixtureMeta }));
          return;
        }
        if (id === rejectedRow.journey_id) {
          if (sub === "timeline") {
            const tl = historyRepaired ? rejectedTimeline : rejectedBeforeRepairTimeline;
            res
              .writeHead(200, { ...cors, "content-type": "application/json" })
              .end(JSON.stringify({ data: { items: tl }, page_info: { total: tl.length, page_size: 100 }, meta: fixtureMeta }));
            return;
          }
          const stages = historyRepaired
            ? rejectedDetailStages
            : {
                signal_generation: { status: "succeeded" },
                trade_decision: { status: "succeeded" },
                risk_evaluation: {
                  status: "rejected",
                  reason_code: "reason_not_recorded",
                  expression_reason_code: "long_cash",
                  missing_evidence: ["reject_reason"],
                  source_event_id: "91d55953-b575-4fe8-8d39-6e0cade58d59",
                },
                order_submission: {
                  status: "not_submitted",
                  order_status: "not_submitted",
                  submitted_to_broker: false,
                },
              };
          res
            .writeHead(200, { ...cors, "content-type": "application/json" })
            .end(JSON.stringify({ data: { ...current7972, stages }, meta: fixtureMeta }));
          return;
        }
        if (id === completedRow.journey_id) {
          const passedChecks = [
            { check: "broker_fill_qty", status: "passed", expected: 1, actual: 1, difference: 0 },
            { check: "cash_change", status: "passed", expected: 2206, actual: 2206, difference: 0 },
          ];
          if (sub === "timeline") {
            const tl = [
              {
                event_id: "fill-ok-1",
                stage: "fill_management",
                event_type: "paper_fill_simulated",
                stage_status: "succeeded",
                status: "succeeded",
                occurred_at: "2026-11-19T23:49:00.000000Z",
                source: "execution.paper_runtime",
              },
              {
                event_id: "recon-pass-1",
                source_event_id: "recon-pass-1",
                stage: "reconciliation",
                event_type: "reconciliation_completed",
                stage_status: "succeeded",
                status: "succeeded",
                occurred_at: "2026-11-19T23:50:03.000000Z",
                source: "reconciliation-drift.scheduled",
                reason_detail: passedChecks,
              },
            ];
            res
              .writeHead(200, { ...cors, "content-type": "application/json" })
              .end(JSON.stringify({ data: { items: tl }, page_info: { total: tl.length, page_size: 100 }, meta: fixtureMeta }));
            return;
          }
          res.writeHead(200, { ...cors, "content-type": "application/json" }).end(
            JSON.stringify({
              data: {
                ...completedRow,
                stages: {
                  signal_generation: { status: "succeeded" },
                  trade_decision: { status: "succeeded" },
                  risk_evaluation: { status: "succeeded" },
                  order_submission: { status: "succeeded" },
                  broker_acknowledgement: { status: "succeeded" },
                  fill_management: { status: "succeeded" },
                  ledger_booking: { status: "succeeded" },
                  reconciliation: { status: "succeeded", reason_detail: passedChecks },
                },
              },
              meta: fixtureMeta,
            }),
          );
          return;
        }
        if (id === recordedVarianceDetail.data.journey_id) {
          if (sub === "timeline") {
            res
              .writeHead(200, { ...cors, "content-type": "application/json" })
              .end(JSON.stringify(recordedVarianceTimeline));
            return;
          }
          res
            .writeHead(200, { ...cors, "content-type": "application/json" })
            .end(JSON.stringify(recordedVarianceDetail));
          return;
        }
        const reconMap: Record<string, typeof current5741> = {
          [tj57418ba7UnverifiedRow.journey_id]: current5741,
          [genuineControlId]: genuineControlRow,
          [omissionControlId]: omissionControlRow,
          [brokerControlId]: brokerControlRow,
        };
        const target = reconMap[id];
        if (target) {
          if (sub === "timeline") {
            const tl = makeTj57418ba7Timeline(target);
            res
              .writeHead(200, { ...cors, "content-type": "application/json" })
              .end(JSON.stringify({ data: { items: tl }, page_info: { total: tl.length, page_size: 100 }, meta: fixtureMeta }));
            return;
          }
          res.writeHead(200, { ...cors, "content-type": "application/json" }).end(
            JSON.stringify({
              data: {
                ...target,
                stages: {
                  signal_generation: { status: "succeeded" },
                  trade_decision: { status: "succeeded" },
                  risk_evaluation: { status: "succeeded" },
                  order_submission: { status: "succeeded" },
                  broker_acknowledgement: { status: "succeeded" },
                  fill_management: { status: "succeeded" },
                  ledger_booking: { status: "succeeded" },
                  reconciliation: { status: "failed", ...target.outcome },
                },
              },
              meta: fixtureMeta,
            }),
          );
          return;
        }
      }
      res.writeHead(404, { ...cors, "content-type": "application/json" }).end("{}");
    });

    const bffPort = await listen(bffServer);
    const bffBase = `http://127.0.0.1:${bffPort}`;
    const bundleJs = await bundleTradeJourneysApp(bffBase);

    feServer = createServer((_req, res) => {
      res
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(`<!doctype html><html lang="zh-TW"><body><div id="root"></div><script>${bundleJs.replaceAll("</script", "<\\/script")}</script></body></html>`);
    });
    const fePort = await listen(feServer);
    feBase = `http://127.0.0.1:${fePort}`;
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await closeServer(feServer);
    await closeServer(bffServer);
  });

  it("renders pre-repair and post-repair causes, stages, figures, variance values and insufficient evidence in zh-TW across list, detail and timeline after refresh", async () => {
    const context = await browser!.newContext({ locale: "zh-TW", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      historyRepaired = false;
      await page.goto(`${feBase}/management/trade-journeys?tenant_id=tenant-dev&environment=paper`, {
        waitUntil: "networkidle",
      });

      const readableDomText = () =>
        page.evaluate(() => {
          const rootEl = document.getElementById("root") ?? document.body;
          const clone = rootEl.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("pre,code,details,script").forEach(n => n.remove());
          return clone.textContent || "";
        });

      // 1. Pre-repair list assertions
      await page.waitForSelector(`text=${rejectedRow.journey_id}`);
      const listTextBefore = await readableDomText();
      expect(listTextBefore).toContain("風控駁回（風險評估 · 未送單）：此筆記錄沒有保存原因 · 證據不足（缺少：駁回原因）");
      expect(listTextBefore).toContain("此筆記錄沒有保存原因 · 證據不足（缺少：對帳原因、帳務比對明細）");
      expect(listTextBefore).toContain(
        "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
      );
      expect(listTextBefore).toContain(
        "對帳比對證據不完整 · 待查證原因：現金餘額與成交後應有的金額不符 · 現金變動（預期 217.5331、實際 缺少） · 證據不足（缺少：現金變動（實際值））",
      );
      expect(listTextBefore).toContain(
        "對帳時無法連到券商，等待下次排程重新對帳（檢查項目：券商訂單紀錄（HTTP 503））",
      );
      expect(listTextBefore).not.toMatch(RAW_LEAK_RE);

      // 2. Open tj_79726064 detail before history repair, then flip to repaired and refresh in browser
      await page.goto(
        `${feBase}/management/trade-journeys/${rejectedRow.journey_id}?tenant_id=tenant-dev&environment=paper`,
        { waitUntil: "networkidle" },
      );
      await page.waitForSelector("text=風險評估 · 風控駁回 · 未送單");
      let detailText = await readableDomText();
      expect(detailText).toContain("證據不足（缺少：駁回原因）");
      expect(detailText).toContain("檢查該 persona 的風控紀錄與缺少的駁回證據");
      expect(detailText).not.toMatch(RAW_LEAK_RE);

      // Flip backend to post-history-repair state and click 重新整理 in the browser
      historyRepaired = true;
      await page.click("button:has-text('重新整理')");
      await page.waitForSelector("text=現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股");
      detailText = await readableDomText();
      expect(detailText).toContain(
        "風控駁回（風險評估 · 未送單）：現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股",
      );
      expect(detailText).toContain("檢查該 persona 的現金與風控額度");
      expect(detailText).toContain("風險評估 · 風控駁回 · 未送單");
      expect(detailText).not.toMatch(RAW_LEAK_RE);

      // Also verify full browser reload preserves post-repair state
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForSelector("text=現金不足：需要 100,034.3461、可用 100,000、限額 100,000、委託 452 股");

      // 3. Open tj_57418ba7 detail after history repair and verify fill 1 @ 218.5 + 對帳待確認 + runtime health
      await page.goto(
        `${feBase}/management/trade-journeys/${tj57418ba7UnverifiedRow.journey_id}?tenant_id=tenant-dev&environment=paper`,
        { waitUntil: "networkidle" },
      );
      await page.waitForSelector("text=對帳 · 對帳待確認");
      const tj5741Text = await readableDomText();
      expect(tj5741Text).toContain("賣 1 · @ 218.5 · 成交 1 股");
      expect(tj5741Text).toContain(
        "對帳待確認：對帳時執行環境不健康，等待下次排程重新對帳（檢查項目：執行環境健康度） · 證據不足（缺少：帳務比對明細）",
      );
      expect(tj5741Text).toContain("等待下次排程對帳，無需動作。");
      expect(tj5741Text).not.toMatch(RAW_LEAK_RE);

      // 4. Open genuine variance control detail in browser
      await page.goto(
        `${feBase}/management/trade-journeys/${genuineControlId}?tenant_id=tenant-dev&environment=paper`,
        { waitUntil: "networkidle" },
      );
      await page.waitForSelector("text=對帳 · 失敗");
      const genuineText = await readableDomText();
      expect(genuineText).toContain(
        "對帳差異（現金餘額與成交後應有的金額不符）：現金變動（預期 217.5331、實際 172.5331、差額 -45）",
      );
      expect(genuineText).toContain("核對對帳差異（部位與現金）");
      expect(genuineText).not.toMatch(RAW_LEAK_RE);

      // 5. Open missing-evidence control detail in browser
      await page.goto(
        `${feBase}/management/trade-journeys/${omissionControlId}?tenant_id=tenant-dev&environment=paper`,
        { waitUntil: "networkidle" },
      );
      await page.waitForSelector("text=對帳 · 對帳待確認");
      const omissionText = await readableDomText();
      expect(omissionText).toContain("現金變動（預期 217.5331、實際 缺少）");
      expect(omissionText).toContain("證據不足（缺少：現金變動（實際值））");
      expect(omissionText).toContain("補齊缺少的對帳證據並確認帳務紀錄");
      expect(omissionText).not.toMatch(RAW_LEAK_RE);

      // 6. Open completed journey with passed reconciliation checks in browser
      await page.goto(
        `${feBase}/management/trade-journeys/${completedRow.journey_id}?tenant_id=tenant-dev&environment=paper`,
        { waitUntil: "networkidle" },
      );
      await page.waitForSelector("text=對帳 · 成功");
      const completedText = await readableDomText();
      expect(completedText).toContain("已正常完成，沒有異常。");
      expect(completedText).toContain(
        "券商成交數量（預期 1、實際 1、差額 0）、現金變動（預期 2,206、實際 2,206、差額 0）",
      );
      expect(completedText).not.toContain("對帳待確認");
      expect(completedText).not.toContain("此筆記錄沒有保存原因");
      expect(completedText).not.toContain("證據不足");
      expect(completedText).not.toMatch(RAW_LEAK_RE);
    } finally {
      await context.close();
    }
  }, 30_000);

  it("defines complete read-only hosted verification steps for the end-to-end probe", () => {
    expect(HOSTED_READONLY_VERIFICATION_STEPS).toHaveLength(4);
    for (const step of HOSTED_READONLY_VERIFICATION_STEPS) {
      expect(step.readOnly).toBe(true);
      expect(step.method).toBe("GET");
      expect(step.endpoints.length).toBeGreaterThan(0);
    }
  });
});
