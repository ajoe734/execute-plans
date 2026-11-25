import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  LOCAL_FIXTURE_AUTH_TOKEN,
  installOidcDevLogin,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

const DEFAULT_FRONTEND_BASE_URL = "http://127.0.0.1:5173";
const LINEAGE_EVIDENCE_DIR = "./docs/deployment/evidence/FE-LINEAGE-LOOKUP-20261125";
const LIVE_TOKEN = "a81b4fd15944698341aa";
const LIVE_PERSONA_ID = "persona-ee7112a829d38b9135ac";
const LIVE_STRATEGY_ID = `strategy-persona-${LIVE_TOKEN}`;
const LIVE_ARTIFACT_ID = `artifact-persona-pool-${LIVE_TOKEN}-v2`;
const LIVE_POOL_ID = `pool-persona-paper-${LIVE_TOKEN}`;
const LIVE_STRATEGY_TITLE = "衡岳｜0050 台股 Paper 學習 R2";

function frontendUrl(path = "/"): string {
  const base =
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    DEFAULT_FRONTEND_BASE_URL;
  return `${base.replace(/\/$/, "")}${path}`;
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] ?? "*";
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "accept,authorization,content-type,idempotency-key,if-match,x-bff-api-version,x-correlation-id,x-locale,x-request-id,x-tenant-id,x-trace-id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "x-bff-api-version,x-correlation-id,x-request-id",
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    headers: corsHeaders(route),
    status,
  });
}

function envelope(items: unknown[], route: string): Record<string, unknown> {
  return {
    data: { items },
    items,
    meta: {
      route,
      snapshot_at: "2026-07-01T00:00:00Z",
      source: "mgmt-gap-002-fixture",
      status: "ok",
      surfaces: {
        canonical_read: { source: "mgmt-gap-002-fixture", status: "ok" },
      },
    },
    page_info: { page_size: items.length, total: items.length, totalCountExact: true },
  };
}

async function installCanonicalReadFixture(page: Page, calls: string[]): Promise<void> {
  await page.route(/^https?:\/\/[^/]+\/(?:bff|health|healthz|readyz).*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders(route), status: 204 });
      return;
    }
    calls.push(path);

    if (path === "/bff/events/stream") {
      await route.fulfill({ body: ": connected\n\n", contentType: "text/event-stream", headers: corsHeaders(route), status: 200 });
      return;
    }
    if (path === "/health" || path === "/healthz" || path === "/readyz") {
      await fulfillJson(route, { status: "ok", live: true, ready: true });
      return;
    }
    if (path === "/bff/me") {
      await fulfillJson(route, {
        data: {
          environment: { name: "playwright", strict_auth: false },
          tenant_id: "pantheon-dev",
          user: { id: "op-gap-002", roles: ["operator", "reviewer", "approver"] },
        },
      });
      return;
    }

    if (path === "/bff/management/data-sources") {
      await fulfillJson(route, envelope([{
        connector_id: "canonical_ibkr",
        provider: "Canonical IBKR",
        kind: "broker_execution",
        health: "read_ok",
        universe: ["US"],
        consumer_persona_ids: ["persona-canonical"],
        consumer_persona_names: ["Canonical Persona"],
        credential_state: "configured",
      }], path));
      return;
    }
    if (path === "/bff/management/permissions") {
      await fulfillJson(route, envelope([{
        instance: "persona-tool",
        rows: [{ id: "persona-canonical", label: "Canonical Persona" }],
        cols: [{ id: "tool-canonical", label: "Canonical Tool", risk: "medium" }],
        cells: [{ rowId: "persona-canonical", colId: "tool-canonical", grant: "use" }],
      }], path));
      return;
    }
    if (path === "/bff/management/memory-governance") {
      await fulfillJson(route, envelope([{
        id: "memory-canonical",
        persona_id: "persona-canonical",
        kind: "fact",
        source: "operator",
        proposed_by: "ops",
        proposed_at: "2026-07-01T00:00:00Z",
        status: "queued",
        after: "Canonical memory change",
      }], path));
      return;
    }
    if (path === "/bff/management/consult-rules") {
      await fulfillJson(route, envelope([{
        id: "consult-canonical",
        name: "Canonical consult rule",
        from_persona_id: "persona-a",
        to_persona_id: "persona-b",
        trigger: "risk=high",
        mode: "blocking",
        env_scope: ["paper"],
        enabled: true,
        owner: "ops",
        updated_at: "2026-07-01T00:00:00Z",
      }], path));
      return;
    }
    if (path === "/bff/lineage") {
      const rootId = (url.searchParams.get("root_id") ?? "").trim();
      await fulfillJson(route, {
        data: {
          nodes: rootId
            ? [
                {
                  id: "artifact-canonical",
                  label: "Canonical Artifact",
                  display_name: "Canonical Artifact",
                  name_missing: false,
                  type: "Artifact",
                  state: "approved",
                  risk: "low",
                },
                {
                  id: "strategy-canonical",
                  label: "Canonical Strategy",
                  display_name: "Canonical Strategy",
                  name_missing: false,
                  type: "Strategy",
                  state: "paper",
                  risk: "medium",
                },
              ]
            : [],
          edges: rootId ? [{ from: "artifact-canonical", to: "strategy-canonical", label: "scaffolds" }] : [],
        },
        meta: { status: "ok", source: "mgmt-gap-002-fixture" },
      });
      return;
    }
    if (path === "/bff/workflows") {
      await fulfillJson(route, envelope([{
        id: "workflow-canonical",
        name: "Canonical Workflow",
        category: "rebalance",
        steps: ["Capture evidence"],
        inputs: ["persona_id"],
        last_run: "2026-07-01T00:00:00Z",
        runs: 1,
        owner: "ops",
      }], path));
      return;
    }
    if (path === "/bff/hooks") {
      await fulfillJson(route, {
        data: {
          crons: [{
            id: "cron-canonical",
            name: "Canonical Cron",
            schedule: "0 0 * * *",
            target: "workflow-canonical",
            enabled: true,
            last_run: "2026-07-01T00:00:00Z",
            next_run: "2026-07-02T00:00:00Z",
          }],
          hooks: [{
            id: "hook-canonical",
            name: "Canonical Hook",
            event: "canonical.event",
            target: "workflow-canonical",
            filters: "*",
            enabled: true,
            fired_today: 1,
          }],
        },
        meta: { status: "ok", source: "mgmt-gap-002-fixture" },
      });
      return;
    }
    if (path === "/bff/knowledge") {
      await fulfillJson(route, envelope([{
        id: "knowledge-canonical",
        title: "Canonical Insight",
        source: "Canonical Source",
        kind: "research_note",
        risk: "medium",
        ts: "2026-07-01T00:00:00Z",
        body: "Canonical insight body",
      }], path));
      return;
    }

    await fulfillJson(route, envelope([], path));
  });
}

test.describe("MGMT-GAP-002 canonical management reads", () => {
  test("routes management pages to canonical BFF read surfaces without seed fallback", async ({ page }) => {
    test.skip(
      targetsExternalE2eEnvironment(),
      "route-mocked fixture coverage is loopback-only; hosted candidates use live acceptance specs",
    );
    const calls: string[] = [];
    await installCanonicalReadFixture(page, calls);
    await installOidcDevLogin(page, {
      goto: false,
      roles: ["operator", "reviewer", "approver"],
      tenantId: "pantheon-dev",
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    });

    const cases = [
      { path: "/management/data-sources", endpoint: "/bff/management/data-sources", text: "Canonical IBKR", absent: "persona-fleet" },
      { path: "/management/governance/permissions", endpoint: "/bff/management/permissions", text: "Canonical Tool" },
      { path: "/management/governance/memory", endpoint: "/bff/management/memory-governance", text: "Canonical memory change" },
      { path: "/management/governance/consult", endpoint: "/bff/management/consult-rules", value: "Canonical consult rule" },
      { path: "/management/lineage?root=artifact-canonical", endpoint: "/bff/lineage", text: "Canonical Artifact" },
      { path: "/management/workflows", endpoint: "/bff/workflows", text: "Canonical Workflow", absent: "Quarterly rebalance" },
      { path: "/management/hooks", endpoint: "/bff/hooks", text: "Canonical Cron", absent: "Daily brief generator" },
      { path: "/management/knowledge", endpoint: "/bff/knowledge", text: "Canonical Insight", absent: "Cross-asset momentum divergence" },
    ];

    for (const item of cases) {
      calls.length = 0;
      await page.goto(frontendUrl(item.path), { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect.poll(() => calls.includes(item.endpoint), {
        message: `${item.path} should call ${item.endpoint}`,
      }).toBe(true);
      if ("value" in item) {
        await expect.poll(async () =>
          page.locator("input, textarea").evaluateAll((fields, expected) =>
            fields.some((field) => {
              const control = field as HTMLInputElement | HTMLTextAreaElement;
              const rect = control.getBoundingClientRect();
              return control.value === expected && rect.width > 0 && rect.height > 0;
            }),
          item.value),
        ).toBe(true);
      } else {
        await expect(page.getByText(item.text).first()).toBeVisible();
      }
      if (item.absent) {
        await expect(page.getByText(item.absent)).toHaveCount(0);
      }
    }
  });

  test("FE-LINEAGE-LOOKUP-20261125: single-object lookup by name, strategy and artifact detail lineage tabs, and non-overlapping layout at 1274x627 and 390px wide", async ({
    page,
  }) => {
    test.skip(
      targetsExternalE2eEnvironment(),
      "route-mocked fixture coverage is loopback-only; hosted candidates use live acceptance specs",
    );

    const lineageCalls: string[] = [];
    const baseSpec = `reg-strategy-spec-persona-baseline-${LIVE_TOKEN}`;
    const spec = `reg-strategy-spec-persona-${LIVE_TOKEN}`;
    const baseArt = `artifact-persona-paper-baseline-${LIVE_TOKEN}`;
    const paperArt = `artifact-persona-paper-${LIVE_TOKEN}`;
    const runSpec = `persona-provisioning-forward-${LIVE_TOKEN}`;
    const runArt = `persona-provisioning-forward-artifact-${LIVE_TOKEN}`;

    const liveLineageNodes = [
      {
        id: baseSpec,
        label: baseSpec,
        type: "Strategy",
        state: "draft",
        strategy_id: LIVE_STRATEGY_ID,
        version: "1.0.0",
        display_name: LIVE_STRATEGY_TITLE,
        name_missing: false,
      },
      {
        id: spec,
        label: spec,
        type: "Strategy",
        state: "approved",
        strategy_id: LIVE_STRATEGY_ID,
        version: "1.0.1",
        display_name: LIVE_STRATEGY_TITLE,
        name_missing: false,
      },
      {
        id: baseArt,
        label: baseArt,
        type: "Artifact",
        state: "draft",
        strategy_id: LIVE_STRATEGY_ID,
        version: "1.0.0",
        display_name: LIVE_STRATEGY_TITLE,
        name_missing: false,
      },
      {
        id: paperArt,
        label: paperArt,
        type: "Artifact",
        state: "approved",
        strategy_id: LIVE_STRATEGY_ID,
        version: "1.1.0",
        display_name: LIVE_STRATEGY_TITLE,
        name_missing: false,
      },
      {
        id: LIVE_ARTIFACT_ID,
        label: LIVE_ARTIFACT_ID,
        type: "Artifact",
        state: "approved",
        strategy_id: LIVE_STRATEGY_ID,
        version: "1.2.0",
        display_name: LIVE_STRATEGY_TITLE,
        name_missing: false,
      },
      {
        id: LIVE_PERSONA_ID,
        label: LIVE_PERSONA_ID,
        type: "Persona",
        display_name: "衡岳",
        name_missing: false,
      },
      {
        id: LIVE_POOL_ID,
        label: LIVE_POOL_ID,
        type: "CapitalPool",
        display_name: `${LIVE_STRATEGY_TITLE} (CapitalPool)`,
        name_missing: false,
      },
      {
        id: runSpec,
        label: runSpec,
        type: "Experiment",
        display_name: `${LIVE_STRATEGY_TITLE} (Experiment)`,
        name_missing: false,
      },
      {
        id: runArt,
        label: runArt,
        type: "Experiment",
        display_name: null,
        name_missing: true,
      },
    ];

    const liveLineageEdges = [
      { from: baseSpec, to: spec, label: "parent" },
      { from: baseSpec, to: baseArt, label: "source_strategy_spec" },
      { from: spec, to: paperArt, label: "source_strategy_spec" },
      { from: spec, to: LIVE_ARTIFACT_ID, label: "source_strategy_spec" },
      { from: baseArt, to: paperArt, label: "parent" },
      { from: paperArt, to: LIVE_ARTIFACT_ID, label: "parent" },
      { from: LIVE_ARTIFACT_ID, to: LIVE_PERSONA_ID, label: "persona" },
      { from: LIVE_ARTIFACT_ID, to: LIVE_POOL_ID, label: "capital_pool" },
      { from: runSpec, to: spec, label: "source_run" },
      { from: runArt, to: LIVE_ARTIFACT_ID, label: "source_run" },
    ].map((e) => ({
      id: `${e.from}|${e.label}|${e.to}`,
      from: e.from,
      to: e.to,
      label: e.label,
      edge_type: e.label,
      from_artifact_id: e.from,
      to_artifact_id: e.to,
    }));

    await page.route(/^https?:\/\/[^/]+\/(?:bff|health|healthz|readyz).*/, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (request.method() === "OPTIONS") {
        await route.fulfill({ headers: corsHeaders(route), status: 204 });
        return;
      }
      if (path === "/bff/events/stream") {
        await route.fulfill({
          body: ": connected\n\n",
          contentType: "text/event-stream",
          headers: corsHeaders(route),
          status: 200,
        });
        return;
      }
      if (path === "/health" || path === "/healthz" || path === "/readyz") {
        await fulfillJson(route, { status: "ok", live: true, ready: true });
        return;
      }
      if (path === "/bff/me") {
        await fulfillJson(route, {
          data: {
            environment: { name: "playwright", strict_auth: false },
            tenant_id: "pantheon-dev",
            user: { id: "op-lineage-20261125", roles: ["operator", "reviewer", "approver"] },
          },
        });
        return;
      }
      if (path === "/bff/strategies") {
        await fulfillJson(route, {
          data: [
            {
              id: LIVE_STRATEGY_ID,
              strategy_id: LIVE_STRATEGY_ID,
              name: LIVE_STRATEGY_TITLE,
              title: LIVE_STRATEGY_TITLE,
              state: "approved",
              risk: "low",
              owner: "operator",
              capitalPoolId: LIVE_POOL_ID,
              personaIds: [LIVE_PERSONA_ID],
              persona_display_names: { [LIVE_PERSONA_ID]: "衡岳" },
              operationalStatus: "running",
              updatedAt: "2026-11-25T06:35:00Z",
            },
          ],
          page_info: { next_page_token: null, total: 1, page_size: 20 },
          meta: { status: "ok", source: "service_client" },
        });
        return;
      }
      if (path === `/bff/strategies/${LIVE_STRATEGY_ID}`) {
        await fulfillJson(route, {
          data: {
            id: LIVE_STRATEGY_ID,
            strategy_id: LIVE_STRATEGY_ID,
            name: LIVE_STRATEGY_TITLE,
            title: LIVE_STRATEGY_TITLE,
            alpha: `alpha-${LIVE_TOKEN}`,
            state: "approved",
            risk: "low",
            owner: "operator",
            capitalPoolId: LIVE_POOL_ID,
            personaIds: [LIVE_PERSONA_ID],
            persona_display_names: { [LIVE_PERSONA_ID]: "衡岳" },
            personaStates: [{ personaId: LIVE_PERSONA_ID, state: "paper_running" }],
            operationalStatus: "running",
            symbols: ["0050.TW"],
            updatedAt: "2026-11-25T06:35:00Z",
          },
          meta: { status: "ok", source: "service_client" },
        });
        return;
      }
      if (path === "/bff/personas") {
        await fulfillJson(route, {
          data: [
            {
              id: LIVE_PERSONA_ID,
              persona_id: LIVE_PERSONA_ID,
              name: "衡岳",
              display_name: "衡岳",
              state: "paper_running",
              risk: "low",
              owner: "operator",
              updatedAt: "2026-11-25T06:35:00Z",
            },
            {
              id: "persona-6507750312870d03a241",
              persona_id: "persona-6507750312870d03a241",
              name: "湛盧",
              display_name: "湛盧",
              state: "paper_running",
              risk: "low",
              owner: "operator",
              updatedAt: "2026-11-25T06:35:00Z",
            },
          ],
          page_info: { next_page_token: null, total: 2, page_size: 20 },
          meta: { status: "ok", source: "service_client" },
        });
        return;
      }
      if (path === `/bff/artifacts/${LIVE_ARTIFACT_ID}`) {
        await fulfillJson(route, {
          data: {
            id: LIVE_ARTIFACT_ID,
            registry_id: LIVE_ARTIFACT_ID,
            artifact_id: LIVE_ARTIFACT_ID,
            strategy_id: LIVE_STRATEGY_ID,
            artifact_type: "execution_bundle",
            version: "1.2.0",
            checksum: `sha256:${LIVE_TOKEN}`,
            artifact_state: "approved",
            name: LIVE_STRATEGY_TITLE,
            kind: "execution_bundle",
            state: "approved",
            risk: "low",
            hash: `sha256:${LIVE_TOKEN}`,
            owner: "operator",
            updatedAt: "2026-11-25T06:35:00Z",
            source_kind: "registry",
          },
          meta: {
            snapshot_at: "2026-11-25T06:35:00Z",
            surfaces: { artifact_detail: { status: "ok", source: "registry" } },
          },
        });
        return;
      }
      if (path === "/bff/lineage") {
        lineageCalls.push(url.pathname + url.search);
        await fulfillJson(route, {
          data: {
            id: "lineage",
            nodes: liveLineageNodes,
            edges: liveLineageEdges,
            status: "ok",
            source: "service_client",
          },
          items: liveLineageEdges,
          page_info: {
            next_page_token: null,
            total: liveLineageEdges.length,
            page_size: liveLineageEdges.length,
            returned: liveLineageEdges.length,
            has_more: false,
          },
          meta: {
            snapshot_at: "2026-11-25T06:35:00Z",
            status: "ok",
            source: "service_client",
            surfaces: {
              lineage: { status: "ok", source: "service_client" },
              display_names: { status: "ok", source: "display_name_resolver" },
            },
          },
        });
        return;
      }
      await fulfillJson(route, envelope([], path));
    });

    await installOidcDevLogin(page, {
      goto: false,
      roles: ["operator", "reviewer", "approver"],
      tenantId: "pantheon-dev",
      token: LOCAL_FIXTURE_AUTH_TOKEN,
    });

    mkdirSync(LINEAGE_EVIDENCE_DIR, { recursive: true });

    const assertGraphGeometry = async (contextLabel: string) => {
      const report = await page.evaluate(() => {
        const nodeGroups = Array.from(document.querySelectorAll<SVGGElement>("svg [data-node-id]"));
        const edgeTexts = Array.from(document.querySelectorAll<SVGTextElement>("svg [data-edge-label-text]"));
        const clippedNodes: Array<{ id: string; text: string; textRight: number; boxRight: number; textLeft: number; boxLeft: number }> = [];
        const nodeBoxes: Array<{ id: string; left: number; right: number; top: number; bottom: number }> = [];

        for (const g of nodeGroups) {
          const id = g.getAttribute("data-node-id") ?? "";
          const rect = g.querySelector("rect");
          if (!rect) continue;
          const rBox = rect.getBoundingClientRect();
          nodeBoxes.push({ id, left: rBox.left, right: rBox.right, top: rBox.top, bottom: rBox.bottom });
          const texts = Array.from(g.querySelectorAll("text"));
          for (const t of texts) {
            const tBox = t.getBoundingClientRect();
            if (tBox.width === 0) continue;
            if (tBox.left < rBox.left - 0.5 || tBox.right > rBox.right + 0.5) {
              clippedNodes.push({
                id,
                text: t.textContent ?? "",
                textLeft: Number(tBox.left.toFixed(2)),
                boxLeft: Number(rBox.left.toFixed(2)),
                textRight: Number(tBox.right.toFixed(2)),
                boxRight: Number(rBox.right.toFixed(2)),
              });
            }
          }
        }

        const overlappingEdges: Array<{ label: string; nodeId: string }> = [];
        for (const et of edgeTexts) {
          const eBox = et.getBoundingClientRect();
          if (eBox.width === 0) continue;
          for (const nb of nodeBoxes) {
            const hitX = eBox.right > nb.left + 0.5 && eBox.left < nb.right - 0.5;
            const hitY = eBox.bottom > nb.top + 0.5 && eBox.top < nb.bottom - 0.5;
            if (hitX && hitY) {
              overlappingEdges.push({ label: et.textContent ?? "", nodeId: nb.id });
            }
          }
        }

        return {
          nodeCount: nodeGroups.length,
          edgeLabelCount: edgeTexts.length,
          clippedNodes,
          overlappingEdges,
        };
      });

      expect(report.nodeCount, `${contextLabel} node count`).toBeGreaterThan(0);
      expect(report.edgeLabelCount, `${contextLabel} edge label count`).toBeGreaterThan(0);
      expect(report.clippedNodes, `${contextLabel} clipped node texts`).toEqual([]);
      expect(report.overlappingEdges, `${contextLabel} edge labels overlapping nodes`).toEqual([]);
    };

    // 1. Desktop 1274x627: unrooted /management/lineage sends no lineage request, offers strategies & personas by name, filters by Chinese name, fetches on selection
    await page.setViewportSize({ width: 1274, height: 627 });
    await page.goto(frontendUrl("/management/lineage"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.getByTestId("lineage-lookup-prompt")).toBeVisible();
    await expect(page.getByTestId(`lineage-lookup-option-${LIVE_STRATEGY_ID}`)).toBeVisible();
    await expect(page.getByTestId(`lineage-lookup-option-${LIVE_PERSONA_ID}`)).toBeVisible();
    expect(lineageCalls).toEqual([]);

    const rootInput = page.getByTestId("lineage-root-input");
    await rootInput.fill("衡岳");
    expect(lineageCalls).toEqual([]);
    await expect(page.getByTestId(`lineage-lookup-option-${LIVE_PERSONA_ID}`)).toBeVisible();
    await expect(page.getByTestId("lineage-lookup-option-persona-6507750312870d03a241")).toHaveCount(0);

    await page.getByTestId(`lineage-lookup-option-${LIVE_STRATEGY_ID}`).click();
    await expect.poll(() => lineageCalls.length).toBe(1);
    expect(lineageCalls[0]).toBe(`/bff/lineage?root_id=${LIVE_STRATEGY_ID}`);

    await expect(page.getByTestId(`lineage-node-${spec}`)).toHaveAttribute("data-node-highlight", "true");
    await assertGraphGeometry("lineage-page-1274x627");
    await page.screenshot({ path: `${LINEAGE_EVIDENCE_DIR}/lineage-page-1274x627.png` });

    // Mobile 390px wide on /management/lineage
    await page.setViewportSize({ width: 390, height: 844 });
    await assertGraphGeometry("lineage-page-390w");
    await page.screenshot({ path: `${LINEAGE_EVIDENCE_DIR}/lineage-page-390w.png` });

    // 2. Strategy Detail Lineage tab at 1274x627 and 390px wide
    await page.setViewportSize({ width: 1274, height: 627 });
    await page.goto(frontendUrl(`/management/strategies/${LIVE_STRATEGY_ID}`), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const strategyLineageTab = page.getByRole("tab", { name: /^(Lineage|血緣)$/i });
    await strategyLineageTab.click();
    await expect(page.getByTestId(`lineage-node-${spec}`)).toBeVisible();
    await expect(page.getByTestId(`lineage-node-${spec}`)).toHaveAttribute("data-node-highlight", "true");
    await assertGraphGeometry("strategy-detail-lineage-1274x627");
    await page.screenshot({ path: `${LINEAGE_EVIDENCE_DIR}/strategy-detail-lineage-1274x627.png` });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ left: 0, top: 0 }));
    await assertGraphGeometry("strategy-detail-lineage-390w");
    await page.screenshot({ path: `${LINEAGE_EVIDENCE_DIR}/strategy-detail-lineage-390w.png` });

    // 3. Artifact Detail Lineage tab at 1274x627 and 390px wide
    await page.setViewportSize({ width: 1274, height: 627 });
    await page.goto(frontendUrl(`/management/artifacts/${LIVE_ARTIFACT_ID}`), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const artifactLineageTab = page.getByRole("tab", { name: /^(Lineage|血緣)$/i });
    await artifactLineageTab.click();
    await expect(page.getByTestId(`lineage-node-${LIVE_ARTIFACT_ID}`)).toBeVisible();
    await expect(page.getByTestId(`lineage-node-${LIVE_ARTIFACT_ID}`)).toHaveAttribute("data-node-highlight", "true");
    await assertGraphGeometry("artifact-detail-lineage-1274x627");
    await page.screenshot({ path: `${LINEAGE_EVIDENCE_DIR}/artifact-detail-lineage-1274x627.png` });

    await page.setViewportSize({ width: 390, height: 844 });
    await assertGraphGeometry("artifact-detail-lineage-390w");
    await page.screenshot({ path: `${LINEAGE_EVIDENCE_DIR}/artifact-detail-lineage-390w.png` });
  });
});
