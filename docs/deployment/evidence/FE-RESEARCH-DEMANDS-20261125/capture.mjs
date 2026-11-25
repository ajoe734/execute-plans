// Real Chromium screenshot of /management/experiments against a fixture BFF.
// Run from the repo root: node docs/deployment/evidence/FE-RESEARCH-DEMANDS-20261125/capture.mjs
// Row shapes are the recorded hosted shapes from BFF-RESEARCH-DEMAND-READ-20261125.
import { createServer } from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const outDir = path.dirname(fileURLToPath(import.meta.url));
const lang = process.argv[2] || "zh-TW";

const A = "persona-ee7112a829d38b9135ac", B = "persona-6507750312870d03a241";
const demand = (id, persona, name, extra = {}) => ({
  demand_id: id, persona_id: persona, persona_display_name: name, short_measure: "effective_bets",
  tried_families: ["momentum"], missing_datasets: [], mandate: "meeting_research_demand",
  created_at: "2026-11-25T05:00:00Z", expires_at: "2026-12-02T05:00:00Z", status: "open",
  evidence_ref: "pool-health:" + persona, last_template_search_reason: null, last_discovery_reason: null, ...extra,
});
const tasks = [
  { id: "rtask-tmpl-1", task_id: "rtask-tmpl-1", status: "failed", title: "Search registered templates for rd-975bb89106f1c696a680",
    name: "Search registered templates for rd-975bb89106f1c696a680", created_by: "persona-pool-cycle", updated_at: "2026-11-25T05:11:00Z", run_count: 2,
    latest_run: { run_id: "r2", status: "failed", adapter: "template_demand_gate", dispatch_mode: "replication_gate" },
    demand: { demand_id: "rd-975bb89106f1c696a680", persona_id: A, attempt_count: 2, last_reason_code: "template_search_unavailable:ValueError:mandate_universe_missing", short_measure: "effective_bets", status: "open" } },
  { id: "rtask-factor-1", task_id: "rtask-factor-1", name: "rtask-factor-1", name_is_fallback_id: true, task_type: "factor_eval", status: "completed",
    display_summary: { symbol: "2330" }, is_non_real: false, run_count: 1, latest_run: { run_id: "r1", status: "completed", adapter: "imitation", dispatch_mode: "real" }, updated_at: "2026-11-24T00:00:00Z" },
];
const bff = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*"); res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "*"); res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  res.setHeader("Content-Type", "application/json");
  if (url.pathname.endsWith("/research/tickets")) {
    return res.end(JSON.stringify({ items: [{ ticket_id: "rt-20261125-001", title: "Find a diversifying template", owner_display_name: "Momentum Persona A", due_at: "2026-11-30T00:00:00Z", status: "open", origin_meeting_id: "mtg-77" }] }));
  }
  if (url.pathname.includes("research-tasks")) {
    return res.end(JSON.stringify({ items: tasks, meta: { hidden_non_real_count: 3, surfaces: { research_demands: { status: "ok" } } },
      open_demands: [
        demand("rd-975bb89106f1c696a680", A, "Momentum Persona A", { last_template_search_reason: "template_search_unavailable:ValueError:mandate_universe_missing", last_discovery_reason: "no_external_match" }),
        demand("rd-796e24e24bf2055d3c42", B, "Value Persona B"),
      ] }));
  }
  res.end("{}");
});
await new Promise((r) => bff.listen(0, "127.0.0.1", r));
const bffBase = `http://127.0.0.1:${bff.address().port}`;
const out = await build({
  absWorkingDir: root, write: false, bundle: true, format: "iife", platform: "browser", jsx: "automatic", logLevel: "silent",
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import { createRoot } from "react-dom/client";
    import { BrowserRouter, Routes, Route } from "react-router-dom";
    import i18n from "@/i18n";
    import { TooltipProvider } from "@/components/ui/tooltip";
    import { ResearchList } from "@/management/pages/Lists";
    void i18n.changeLanguage(${JSON.stringify(lang)});
    createRoot(document.getElementById("root")!).render(<TooltipProvider><BrowserRouter><Routes>
      <Route path="/management/experiments" element={<ResearchList />} /></Routes></BrowserRouter></TooltipProvider>);` },
  alias: { "@": path.join(root, "src") },
  define: { "import.meta.env": JSON.stringify({ MODE: "production", VITE_BFF_MODE: "live", VITE_BFF_BASE_URL: bffBase, VITE_BFF_FALLBACK: "strict", VITE_BFF_REAL_WRITES: "false" }), "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
  plugins: [{ name: "auth-stub", setup(b) {
    b.onResolve({ filter: /^@\/lib\/auth\/AuthProvider$/u }, () => ({ path: "auth-stub", namespace: "stub" }));
    b.onLoad({ filter: /.*/u, namespace: "stub" }, () => ({ contents: 'export const useAuth = () => ({ bffSession: { identity: { tenantId: "tenant-dev" } }, session: null, user: null, loading: false });', loader: "js", resolveDir: root }));
  } }],
});
const html = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;margin:16px"><div id="root"></div><script>${out.outputFiles[0].text.replace(/<\/script/g, "<\\/script")}</script>`;
const fe = createServer((req, res) => { res.setHeader("Content-Type", "text/html"); res.end(html); });
await new Promise((r) => fe.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
page.on("console", (m) => console.log("console:", m.text().slice(0, 300)));
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 400)));
page.on("requestfailed", (r) => console.log("reqfail:", r.url()));
await page.goto(`http://127.0.0.1:${fe.address().port}/management/experiments`);
await page.waitForSelector('[data-testid="research-demand-row"]', { timeout: 15000 });
await page.waitForSelector('[data-testid="research-ticket-row"]', { timeout: 15000 });
await page.waitForSelector('[data-testid="research-search-outcome"]', { timeout: 15000 });
const file = path.join(outDir, `research-demands-${lang}.png`);
await page.screenshot({ path: file, fullPage: true });
console.log("saved", file, "\n" + (await page.innerText("body")).slice(0, 1500));
await browser.close(); bff.close(); fe.close();
