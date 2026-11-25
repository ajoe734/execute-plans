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
            {
              id: "strategy-retired-001",
              strategy_id: "strategy-retired-001",
              name: "退役策略 A",
              title: "退役策略 A",
              state: "retired",
              operationalStatus: "retired",
              updatedAt: "2026-11-25T06:35:00Z",
            },
          ],
          page_info: { next_page_token: null, total: 2, page_size: 20 },
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
              listScope: "current",
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
              listScope: "current",
              risk: "low",
              owner: "operator",
              updatedAt: "2026-11-25T06:35:00Z",
            },
            {
              id: "persona-retired-001",
              persona_id: "persona-retired-001",
              name: "退役舊角",
              display_name: "退役舊角",
              state: "retired",
              listScope: "retired",
              risk: "low",
              owner: "operator",
              updatedAt: "2026-11-25T06:35:00Z",
            },
            {
              id: "persona-test-001",
              persona_id: "persona-test-001",
              name: "測試探針",
              display_name: "測試探針",
              state: "paper_running",
              listScope: "test",
              risk: "low",
              owner: "operator",
              updatedAt: "2026-11-25T06:35:00Z",
            },
          ],
          page_info: { next_page_token: null, total: 4, page_size: 20 },
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

    // 1. Desktop 1274x627: unrooted /management/lineage sends no lineage request, offers current strategies & personas by name, filters by Chinese name, fetches on selection, and collapses candidate listbox
    await page.setViewportSize({ width: 1274, height: 627 });
    await page.goto(frontendUrl("/management/lineage"), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.getByTestId("lineage-lookup-prompt")).toBeVisible();
    await expect(page.getByTestId(`lineage-lookup-option-${LIVE_STRATEGY_ID}`)).toBeVisible();
    await expect(page.getByTestId(`lineage-lookup-option-${LIVE_PERSONA_ID}`)).toBeVisible();
    await expect(page.getByTestId("lineage-lookup-option-strategy-retired-001")).toHaveCount(0);
    await expect(page.getByTestId("lineage-lookup-option-persona-retired-001")).toHaveCount(0);
    await expect(page.getByTestId("lineage-lookup-option-persona-test-001")).toHaveCount(0);
    expect(lineageCalls).toEqual([]);

    const rootInput = page.getByTestId("lineage-root-input");
    await rootInput.fill("衡岳");
    expect(lineageCalls).toEqual([]);
    await expect(page.getByTestId(`lineage-lookup-option-${LIVE_PERSONA_ID}`)).toBeVisible();
    await expect(page.getByTestId("lineage-lookup-option-persona-6507750312870d03a241")).toHaveCount(0);

    await page.getByTestId(`lineage-lookup-option-${LIVE_STRATEGY_ID}`).click();
    await expect.poll(() => lineageCalls.length).toBe(1);
    expect(lineageCalls[0]).toBe(`/bff/lineage?root_id=${LIVE_STRATEGY_ID}`);

    await expect(page.getByTestId("lineage-lookup-options")).toHaveCount(0);
    await expect(page.getByTestId("lineage-lookup-selected")).toBeVisible();
    await expect(page.getByTestId("lineage-lookup-change")).toBeVisible();
    await expect(page.getByTestId(`lineage-node-${spec}`)).toHaveAttribute("data-node-highlight", "true");
    await expect(page.getByTestId(`lineage-node-${spec}`)).toHaveAttribute("data-node-type", "Strategy");
    await expect(page.getByTestId(`lineage-node-${spec}`).locator("[data-node-type-header]")).toHaveText(
      /^(策略|Strategy) · (已核准|Approved)$/,
    );
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

  test("FE-KNOWLEDGE-POSTMORTEM-TRUTH-20261125: knowledge inbox leaves sidebar and command palette, lists unconnected sources from meta.surfaces, and postmortems show plain titles, hidden_infrastructure_count toggle, collapsed technical key=value, and <=80px row height with 1 vertical scroll area at 1274x627", async ({
    page,
  }) => {
    test.skip(
      targetsExternalE2eEnvironment(),
      "route-mocked fixture coverage is loopback-only; hosted candidates use live acceptance specs",
    );

    const KNOWLEDGE_POSTMORTEM_EVIDENCE_DIR =
      "./docs/deployment/evidence/FE-KNOWLEDGE-POSTMORTEM-TRUTH-20261125";
    mkdirSync(KNOWLEDGE_POSTMORTEM_EVIDENCE_DIR, { recursive: true });

    const DRIFT_SAMPLE_KINDS = [
      "drift:runtime_state",
      "drift:drawdown",
      "drift:fill_price",
      "drift:duplicate_execution",
      "drift:rolling_drawdown_multiple",
    ];

    const buildRealDriftPostmortem = (idx: number) => {
      const idSuffix = String(idx).padStart(4, "0");
      const postmortemId = `pm-drift-20261125-${idSuffix}`;
      const incidentId = `inc-drift-20261125-${idSuffix}`;
      const clusterId = DRIFT_SAMPLE_KINDS[(idx - 1) % DRIFT_SAMPLE_KINDS.length];
      const bindingId = `rb-3823397e125e4579ba5f41740670${idSuffix}`;
      return {
        postmortem_id: postmortemId,
        incident_id: incidentId,
        title: `Postmortem draft: Drift threshold breach: ${clusterId} for ${bindingId}`,
        status: "draft",
        created_at: "2026-11-25T06:35:00Z",
        binding_id: bindingId,
        deployment_stage: "paper",
        deployment_plan_id: `plan-202611-${idSuffix}`,
        capital_pool_id: LIVE_POOL_ID,
        persona_capital_binding_id: `pcb-alpha-${idSuffix}`,
        artifact_id: LIVE_ARTIFACT_ID,
        artifact_version: "1.2.0",
        runtime_id: `rt-paper-${idSuffix}`,
        trace_id: `trace-inc-${idSuffix}-9f8e7d6c5b4a`,
        telemetry_event_ids: [`tel-${idSuffix}-a`, `tel-${idSuffix}-b`],
        incident_evidence_summary:
          "metric=rolling_drawdown_multiple observed=1.42 threshold=1.20 comparator=gt",
        lineage_ref: `${LIVE_ARTIFACT_ID}@1.2.0`,
        incident_cluster_id: clusterId,
        root_cause: `Draft generated from resolved incident ${incidentId}; root cause pending analysis.`,
        contributing_factors: [
          "incident_severity=high",
          `incident_cluster_id=${clusterId}`,
          "incident_evidence_summary=metric=rolling_drawdown_multiple observed=1.42 threshold=1.20 comparator=gt",
        ],
        timeline: [
          {
            ts: "2026-11-25T06:00:00Z",
            description: `Incident ${incidentId} opened`,
            actor: "incident-service",
          },
          {
            ts: "2026-11-25T06:35:00Z",
            description: "Postmortem draft generated from resolved incident evidence",
            actor: "postmortem-service",
          },
        ],
        action_items: [
          "Complete root cause analysis",
          "Validate remediation against linked telemetry and reconciliation evidence",
        ],
        author_ids: ["postmortem-draft-worker"],
      };
    };

    const strategyPostmortems = Array.from({ length: 12 }, (_, idx) => buildRealDriftPostmortem(idx + 1));
    const infraPostmortem = {
      ...buildRealDriftPostmortem(99),
      postmortem_id: "pm-infra-bff-1c619cdd05621fa6fabe2316",
      incident_id: "inc-infra-bff-1c619cdd05621fa6fabe2316",
      title: "Postmortem draft: BFF downstream degradation: training-session",
      incident_cluster_id: "infrastructure:tenant-dev:control-plane-bff:downstream_degradation",
      incident_evidence_summary: "non_trading_infrastructure_incident=true downstream degradation",
    };

    const postmortemRequests: string[] = [];

    await page.route(/^https?:\/\/[^/]+\/(?:bff|api\/v1|health|healthz|readyz).*/, async (route) => {
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
            user: { id: "op-postmortem-20261125", roles: ["operator", "reviewer", "approver"] },
          },
        });
        return;
      }
      if (path === "/bff/knowledge") {
        // Real hosted BFF adc027da9 response shape: meta.status ok while knowledge_inbox_insights and knowledge_inbox_memory are unavailable (source: missing)
        await fulfillJson(route, {
          data: [],
          items: [],
          page_info: { next_page_token: null, total: 0, page_size: 20, returned: 0, has_more: false },
          meta: {
            snapshot_at: "2026-11-25T06:45:00Z",
            status: "ok",
            source: "bff_composed",
            surfaces: {
              knowledge_inbox: { status: "ok", source: "bff_composed" },
              knowledge_inbox_notes: { status: "ok", source: "service_client" },
              knowledge_inbox_insights: {
                status: "unavailable",
                source: "missing",
                message: "insight_cards has no readable source records.",
              },
              knowledge_inbox_memory: {
                status: "unavailable",
                source: "missing",
                message: "institutional_memory_entries has no readable source records.",
              },
            },
            composition: {
              datasets: ["research_notes", "insight_cards", "institutional_memory_entries"],
              itemCounts: { research_note: 0, insight: 0, memory_entry: 0 },
            },
          },
        });
        return;
      }
      if (path === "/api/v1/postmortems") {
        postmortemRequests.push(url.pathname + url.search);
        const includeInfra = url.searchParams.get("include_infrastructure") === "true";
        const rows = includeInfra ? [infraPostmortem, ...strategyPostmortems] : strategyPostmortems;
        await fulfillJson(route, {
          data: rows,
          page_info: {
            total: includeInfra ? 5458 : 103,
            page_size: 50,
            next_page_token: "50",
          },
          meta: {
            total: includeInfra ? 5458 : 103,
            hidden_infrastructure_count: includeInfra ? 0 : 5355,
            staleness: null,
            surfaces: {
              postmortems: { status: "ok", source: "service_client" },
            },
          },
        });
        return;
      }
      if (path.startsWith("/api/v1/postmortems/")) {
        const requestedId = decodeURIComponent(path.slice("/api/v1/postmortems/".length));
        const match =
          [infraPostmortem, ...strategyPostmortems].find((item) => item.postmortem_id === requestedId) ??
          strategyPostmortems[0];
        await fulfillJson(route, {
          data: match,
          meta: { staleness: null },
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

    await page.setViewportSize({ width: 1274, height: 627 });

    // 1. Direct route /management/knowledge opens, sidebar & command palette do not list Knowledge Inbox, lists unconnected sources from meta.surfaces
    await page.goto(frontendUrl("/management/knowledge"), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.getByTestId("knowledge-source-issues")).toBeVisible();
    await expect(page.getByTestId("knowledge-source-knowledge_inbox_insights")).toBeVisible();
    await expect(page.getByTestId("knowledge-source-knowledge_inbox_memory")).toBeVisible();
    await expect(page.getByTestId("knowledge-inbox-empty")).toHaveCount(0);

    // Sidebar does not contain /management/knowledge
    await expect(page.locator('nav a[href="/management/knowledge"]')).toHaveCount(0);

    // Command palette does not list Knowledge Inbox
    await page.keyboard.press("Control+k");
    const cmdList = page.locator("[cmdk-list]");
    await expect(cmdList).toBeVisible();
    await expect(cmdList.getByText(/^(Knowledge Inbox|知識收件匣)$/)).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.screenshot({
      path: `${KNOWLEDGE_POSTMORTEM_EVIDENCE_DIR}/knowledge-inbox-1274x627.png`,
    });

    // 2. Postmortem Library at 1274x627
    await page.goto(frontendUrl("/management/postmortems"), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await expect(page.getByTestId("postmortem-no-review-flow-notice")).toBeVisible();
    const infraToggle = page.getByTestId("postmortem-infra-toggle");
    await expect(infraToggle).toBeVisible();
    await expect(infraToggle).toContainText("5355");

    // Plain localized title without "Postmortem draft:" prefix or raw "drift:runtime_state"
    const firstPlainTitle = page.getByTestId("postmortem-plain-title").first();
    await expect(firstPlainTitle).toHaveText(
      /^(Drift threshold breach: Runtime state|偏離門檻超限：執行環境狀態)$/,
    );
    await expect(page.getByTestId("postmortem-secondary-context").first()).toHaveText(
      "rb-3823397e125e4579ba5f417406700001",
    );
    await expect(page.getByText(/^Postmortem draft:/i)).toHaveCount(0);
    await expect(page.getByText(/drift:runtime_state/i)).toHaveCount(0);

    // Verify at 1274x627 every row is at most 80px high, table fits with no horizontal scroll, time column is not cut off, and main has one vertical scroll area
    const layoutMetrics = await page.evaluate(() => {
      const cardEl = document.querySelector<HTMLElement>('[data-testid="postmortem-table-card"]');
      const tableEl = document.querySelector<HTMLTableElement>('[data-testid="postmortem-table"]');
      const cardRect = cardEl?.getBoundingClientRect();
      const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>("main tbody tr"));
      const rowHeights = rows.map((tr) => Number(tr.getBoundingClientRect().height.toFixed(2)));
      const clippedTimeCells: Array<{ idx: number; cellRight: number; cardRight: number }> = [];
      rows.forEach((tr, idx) => {
        const timeEl = tr.querySelector<HTMLElement>("[data-time-kind]");
        if (!timeEl || !cardRect) return;
        const tRect = timeEl.getBoundingClientRect();
        if (tRect.right > cardRect.right + 1 || tRect.left < cardRect.left - 1) {
          clippedTimeCells.push({
            idx,
            cellRight: Number(tRect.right.toFixed(2)),
            cardRight: Number(cardRect.right.toFixed(2)),
          });
        }
      });
      const mainEl = document.querySelector<HTMLElement>("main");
      const mainCandidates = mainEl
        ? [mainEl, ...Array.from(mainEl.querySelectorAll<HTMLElement>("*"))]
        : [];
      const verticalScrollAreas = mainCandidates
        .filter((el) => {
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY;
          return (
            (overflowY === "auto" || overflowY === "scroll") &&
            el.scrollHeight > el.clientHeight + 2
          );
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          testId: el.getAttribute("data-testid") || el.getAttribute("data-pinned-horizontal-scrollbar") || "",
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
        }));
      return {
        rowCount: rows.length,
        maxRowHeight: rowHeights.length ? Math.max(...rowHeights) : 0,
        rowHeights,
        tableScrollWidth: tableEl?.scrollWidth ?? 0,
        cardClientWidth: cardEl?.clientWidth ?? 0,
        clippedTimeCells,
        verticalScrollAreaCount: verticalScrollAreas.length,
        verticalScrollAreas,
      };
    });

    expect(layoutMetrics.rowCount).toBe(12);
    expect(layoutMetrics.maxRowHeight).toBeGreaterThan(0);
    expect(layoutMetrics.maxRowHeight).toBeLessThanOrEqual(80);
    expect(layoutMetrics.tableScrollWidth).toBeLessThanOrEqual(layoutMetrics.cardClientWidth);
    expect(layoutMetrics.clippedTimeCells).toEqual([]);
    expect(layoutMetrics.verticalScrollAreaCount).toBe(1);
    expect(layoutMetrics.verticalScrollAreas[0]?.tag).toBe("main");

    await page.screenshot({
      path: `${KNOWLEDGE_POSTMORTEM_EVIDENCE_DIR}/postmortems-list-1274x627.png`,
    });

    // 3. Open Postmortem detail sheet and verify plain root cause, translated labels (incl. drift:runtime_state), and collapsed technical key=value section
    await firstPlainTitle.click();
    await expect(page.getByTestId("postmortem-detail-root-cause")).toBeVisible();
    await expect(page.getByTestId("postmortem-detail-root-cause")).toHaveText(
      /^(Root cause has not been analysed yet\.|尚未分析根因。)$/,
    );
    await expect(
      page.getByText(/^(• Incident category: Paper vs live drift \(Runtime state\)|• 事件分類：模擬與實盤偏離（執行環境狀態）)$/),
    ).toBeVisible();
    const techDetails = page.getByTestId("postmortem-technical-details");
    await expect(techDetails).toBeVisible();
    expect(await techDetails.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    await page.waitForTimeout(550);

    await page.screenshot({
      path: `${KNOWLEDGE_POSTMORTEM_EVIDENCE_DIR}/postmortems-detail-1274x627.png`,
    });

    // Close detail sheet and toggle system incidents on
    await page.keyboard.press("Escape");
    await infraToggle.click();
    await expect.poll(() =>
      postmortemRequests.some((req) => req.includes("include_infrastructure=true")),
    ).toBe(true);
    await expect(
      page.getByText(/^(Downstream service degradation: Training session|下游服務連線異常：訓練工作階段服務)$/),
    ).toBeVisible();
  });
});
