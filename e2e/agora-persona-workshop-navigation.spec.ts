/**
 * Persona -> Workshop handoff and resumable composer UX.
 *
 * Regression coverage for the gap PR #665 fixed: the Persona entry route
 * must reuse its initial resolver receipt instead of a redundant rebind when
 * eligibility leaves the participant set unchanged, and the Workshop
 * composer must not be blocked indefinitely by a failing/loading daily
 * interaction history readback.
 */
import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { execSync } from "node:child_process";
import { installOidcDevLogin } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const NOW = "2026-07-14T12:00:00Z";
const PERSONA_ID = "per_quant";
const PERSONA_NAME = "Quant Architect";
const WORKSHOP_ID = "ws-agc-07-nav";

function feOrigin(): string {
  return new URL(
    process.env.PANTHEON_FE_BASE_URL || "http://127.0.0.1:5173",
  ).origin;
}

function expectedFrontendSha(): string {
  if (process.env.EXPECTED_FE_SHA) {
    return process.env.EXPECTED_FE_SHA.trim().toLowerCase();
  }
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim().toLowerCase();
  } catch {
    return "";
  }
}

async function assertServerIdentity(page: Page): Promise<void> {
  const expectedSha = expectedFrontendSha();
  const response = await page.request.get(`/deployment.json?agora_e2e_isolation=${Date.now()}`);
  expect(response.ok(), `deployment.json returned ${response.status()}`).toBe(true);
  const deployment = (await response.json()) as JsonRecord;
  const buildMode = (deployment.buildMode ?? {}) as JsonRecord;

  expect(deployment.app).toBe("execute-plans");
  if (expectedSha) {
    const deploymentCommit = String(
      deployment.commit ?? (deployment.frontend as JsonRecord)?.commitSha ?? "",
    ).toLowerCase();
    expect(deploymentCommit, "server identity commit must match execute-plans HEAD").toBe(expectedSha);
  }
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");
  expect(buildMode.VITE_BFF_REAL_WRITES).toBe("false");
}

type JsonRecord = Record<string, unknown>;

type CapturedRequest = {
  body: unknown;
  headers: Record<string, string>;
  method: string;
  path: string;
};

type FixtureState = {
  requests: CapturedRequest[];
};

function corsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers()?.origin || feOrigin();
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "Accept, Authorization, Content-Type, Idempotency-Key, If-Match, X-Request-Id, X-Tenant-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "ETag, X-Request-Id",
    Vary: "Origin",
  };
}

function requestBody(request: Request): unknown {
  const data = request.postData();
  if (!data) return null;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

async function json(
  route: Route,
  body: unknown,
  options: { headers?: Record<string, string>; status?: number } = {},
): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    headers: { ...corsHeaders(route.request()), ...options.headers },
    status: options.status ?? 200,
  });
}

const personaFixture = {
  id: PERSONA_ID,
  persona_id: PERSONA_ID,
  name: PERSONA_NAME,
  display_name: PERSONA_NAME,
  archetype: "Quant",
  owner: "alice",
  updatedAt: NOW,
  state: "deployed",
  risk: "low",
  successRate: 0.85,
  routedStrategies: 1,
};

function workshopFixture() {
  return {
    spec_version: "1.0",
    workshop_id: WORKSHOP_ID,
    operator_id: "op-fe-gate",
    status: "open",
    subject: { kind: "strategy_spec", ref: "strategy-agc-07", title: "AGC-07 Navigation" },
    participant_persona_ids: [PERSONA_ID],
    created_at: NOW,
  };
}

/**
 * Installs a minimal route fixture covering exactly the Persona detail page,
 * the canonical interaction resolver/eligibility endpoints, and the Workshop
 * session page. The daily-interaction history list is intentionally left
 * unhandled so it fails closed -- proving that failure no longer blocks the
 * composer (the exact hosted gap PR #665 fixed).
 */
async function installFixture(page: Page): Promise<FixtureState> {
  const state: FixtureState = { requests: [] };

  await page.addInitScript(() => {
    window.sessionStorage.setItem("pantheon.e2e.realWrites", "true");
  });

  await installQuietEventSource(page);

  await page.route(
    (url) => url.pathname === "/health" || url.pathname.startsWith("/bff/"),
    async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname;

      if (method === "OPTIONS") {
        await route.fulfill({ headers: corsHeaders(request), status: 204 });
        return;
      }

      if (path.startsWith("/bff/auth/") || path === "/bff/me") {
        await route.fallback();
        return;
      }

      if (method !== "GET") {
        state.requests.push({ body: requestBody(request), headers: request.headers(), method, path });
      }

      if (method === "GET" && path === "/health") {
        return json(route, { status: "ok", service: "agc-07-fixture" });
      }
      if (method === "GET" && path === "/bff/agora/capabilities") {
        return json(route, {
          data: {
            capabilities: [
              { name: "agora.workshop.v1", auth_level: "operator", route_prefixes: ["/bff/agora/workshops"] },
              { name: "agora.persona.interaction.v1", auth_level: "operator", route_prefixes: ["/bff/agora/interactions"] },
            ],
          },
        });
      }
      if (method === "GET" && path === `/bff/personas/${PERSONA_ID}`) {
        return json(route, { data: personaFixture });
      }

      if (method === "POST" && path === "/bff/agora/interactions/context:resolve") {
        const captured = state.requests.at(-1)?.body as JsonRecord;
        const selectedPersonaIds = Array.isArray(captured.selected_persona_ids)
          ? captured.selected_persona_ids
          : [PERSONA_ID];
        const capturedRefs = Array.isArray(captured.context_refs)
          ? (captured.context_refs as JsonRecord[])
          : [];
        const bindingContextRefs = capturedRefs.map((ref) => ({
          kind: String(ref.type ?? ref.kind ?? "persona"),
          id: String(ref.id ?? PERSONA_ID),
          version: ref.version_id ? String(ref.version_id) : (ref.version ? String(ref.version) : null),
        }));
        return json(route, {
          data: {
            workshop_id: WORKSHOP_ID,
            verified: true,
            environment: captured.environment ?? "paper",
            context_digest: "sha256:agc-07-nav",
            context_refs: capturedRefs,
            context_binding: {
              binding_id: `binding-${state.requests.length}`,
              workshop_id: WORKSHOP_ID,
              tenant_id: "pantheon-dev",
              source_route: captured.source_route ?? `/management/personas/${PERSONA_ID}`,
              return_route: captured.return_route ?? `/management/personas/${PERSONA_ID}`,
              context_refs: bindingContextRefs,
              context_digest: "sha256:agc-07-nav",
              advice_environment: captured.environment ?? "paper",
              evidence_cutoff: captured.evidence_cutoff ?? NOW,
              resolved_at: NOW,
              focused_object: captured.focused_object ?? { kind: "persona", id: PERSONA_ID },
              strategy_ref: null,
              decision_ref: null,
              journal_ref: null,
              position_risk_snapshot_refs: [],
              selected_persona_ids: selectedPersonaIds,
              initial_mode: captured.initial_mode ?? "ask",
            },
          },
        });
      }
      if (method === "POST" && path === "/bff/agora/interactions/participants:eligible") {
        return json(route, {
          data: {
            included: [{
              persona_id: PERSONA_ID,
              display_name: PERSONA_NAME,
              eligible: true,
              reasons: [],
              recommended: true,
              capability_snapshot_id: "snap-quant-agc-07",
              participant_snapshot: {
                persona_id: PERSONA_ID,
                persona_version: "v7",
                session_persona_id: "session-quant-agc-07",
                provider_agent_id: "agent-quant-agc-07",
                workspace_id: "workspace-agc-07",
                captured_at: NOW,
                capability_snapshot: ["persona_opinion"],
              },
            }],
            excluded: [],
          },
        });
      }

      const workshopMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)$/);
      if (method === "GET" && workshopMatch) {
        return json(route, { data: workshopFixture() });
      }
      const cardsMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)\/cards$/);
      if (method === "GET" && cardsMatch) {
        return json(route, { data: { items: [] } });
      }
      const eventsMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)\/events$/);
      if (method === "GET" && eventsMatch) {
        return json(route, { data: { items: [] } });
      }
      const completenessMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)\/completeness$/);
      if (method === "GET" && completenessMatch) {
        return json(route, { data: null, meta: { state: "not_assessed" } });
      }
      const readinessMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)\/readiness$/);
      if (method === "GET" && readinessMatch) {
        return json(route, { data: null, meta: { state: "not_assessed" } });
      }

      // GET /bff/agora/interactions (daily interaction history) is
      // intentionally left unhandled below -- it falls through to the
      // fixture's non-array default and the FE must treat that as a
      // recoverable readback failure, not a submission blocker.

      return json(
        route,
        { data: { items: [] }, meta: { fixture: "unhandled-read" } },
        { status: method === "GET" ? 200 : 501 },
      );
    },
  );

  await installOidcDevLogin(page, {
    env: {
      ...process.env,
      VITE_GCP_IDENTITY_API_KEY:
        process.env.VITE_GCP_IDENTITY_API_KEY ||
        "AIza01234567890123456789012345678901234",
    },
    goto: false,
    roles: ["operator", "reviewer", "approver"],
    tenantId: "pantheon-dev",
  });

  return state;
}

function mutationRequests(state: FixtureState, path: string): CapturedRequest[] {
  return state.requests.filter((request) => request.path === path);
}

test("isolated server identity matches execute-plans HEAD in live/mock-write mode", async ({ page }) => {
  await assertServerIdentity(page);
});

test("Talk with Persona hands off to the canonical Workshop with a resumed mode and participant", async ({ page }) => {
  await assertServerIdentity(page);
  const state = await installFixture(page);

  await page.goto(`/management/personas/${PERSONA_ID}`);
  await page.getByRole("button", { name: `Talk with ${PERSONA_NAME}` }).click();

  await expect(page).toHaveURL(new RegExp(`/agora/strategy-workshop/${WORKSHOP_ID}\\?`));
  const url = new URL(page.url());
  expect(url.searchParams.get("mode")).toBe("ask");
  expect(url.searchParams.get("participants")).toBe(PERSONA_ID);

  await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("mode-selector")).toContainText("Ask");

  // The Persona entry point reuses its initial resolver receipt because
  // eligibility left the single-Persona selection unchanged -- exactly one
  // context:resolve call happens before navigation, and the Workshop page
  // performs its own independent resolution after landing.
  await expect
    .poll(() => mutationRequests(state, "/bff/agora/interactions/context:resolve").length)
    .toBe(2);

  // A failing daily-interaction history readback must not leave the
  // composer stuck disabled -- it becomes submittable once context and
  // eligibility resolve and a draft is entered.
  const composerInput = page.getByTestId("servant-composer-input");
  await expect(composerInput).toBeEnabled({ timeout: 30_000 });
  await composerInput.fill("Resume this Persona conversation in the Workshop");
  await expect(page.getByTestId("servant-composer-submit")).toBeEnabled();
});

test("reloading the Workshop entry URL resumes the same mode and participant selection", async ({ page }) => {
  await assertServerIdentity(page);
  await installFixture(page);

  await page.goto(
    `/agora/strategy-workshop/${WORKSHOP_ID}?mode=challenge&participants=${PERSONA_ID}&picker=named`,
  );

  await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("mode-selector")).toContainText("Challenge");
  await expect(page.getByTestId("participant-picker")).toContainText("Named");
  await expect(page.getByTestId("servant-composer-input")).toBeEnabled({ timeout: 30_000 });
});

test("creating a Workshop from a zh-TW strategy description reconstructs the strategy, renders the 12-block rail, and submits a decision option", async ({ page }) => {
  await assertServerIdentity(page);
  const state = await installFixture(page);

  const createdWorkshopId = "ws-v10-zh-create";
  let createdTitle = "台股大型權值與半導體龍頭波段動能策略";
  let reconstructed = false;
  let decisionConfirmed = false;

  await page.route(
    (url) => url.pathname.startsWith("/bff/agora/workshops"),
    async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname;

      if (method === "OPTIONS") {
        await route.fulfill({ headers: corsHeaders(request), status: 204 });
        return;
      }

      if (method !== "GET") {
        state.requests.push({ body: requestBody(request), headers: request.headers(), method, path });
      }

      if (method === "GET" && path === "/bff/agora/workshops") {
        return json(route, {
          data: {
            items: [
              workshopFixture(),
              ...(reconstructed
                ? [
                    {
                      spec_version: "1.0",
                      workshop_id: createdWorkshopId,
                      operator_id: "op-fe-gate",
                      status: "open",
                      title: createdTitle,
                      subject: { kind: "strategy_spec", ref: createdWorkshopId, title: createdTitle },
                      metadata: {
                        strategy_name: createdTitle,
                        description:
                          "台股大型權值與半導體龍頭波段動能策略，於月營收年增且法人連買時進場，跌破 20 日均線或單筆虧損 5% 停損出場。",
                      },
                      participant_persona_ids: [],
                      created_at: NOW,
                    },
                  ]
                : []),
            ],
          },
        });
      }

      if (method === "POST" && path === "/bff/agora/workshops") {
        const body = (requestBody(request) ?? {}) as JsonRecord;
        createdTitle = String(body.title ?? createdTitle);
        return json(
          route,
          {
            data: {
              spec_version: "1.0",
              workshop_id: createdWorkshopId,
              operator_id: "op-fe-gate",
              status: "open",
              title: createdTitle,
              subject: { kind: "strategy_spec", ref: createdWorkshopId, title: createdTitle },
              metadata: body.metadata ?? {
                strategy_name: createdTitle,
                description: body.description,
              },
              participant_persona_ids: [],
              created_at: NOW,
            },
          },
          { status: 201 },
        );
      }

      if (method === "POST" && path === `/bff/agora/workshops/${createdWorkshopId}/reconstruct`) {
        reconstructed = true;
        return json(
          route,
          {
            data: {
              card_id: "card-recon-v10-1",
              card_type: "strategy_reconstruction",
              version: 1,
              title: "策略重建卡 v1",
              summary: "已根據您的策略描述完成 12 塊策略重建與缺口盤點。",
              created_at: NOW,
              payload: {
                archetype: "momentum_breakout",
                market_scope: "TWSE Semis",
                horizon: "swing_5_20d",
                overall_completeness: decisionConfirmed ? "B+" : "B-",
                completeness_dimensions: [],
                twelve_blocks: [
                  {
                    block_id: "strategy_thesis",
                    title: "策略核心命題",
                    state: "confirmed",
                    summary: "台股大型權值與半導體龍頭波段動能",
                    note: null,
                  },
                  {
                    block_id: "position_sizing",
                    title: "部位規模與加碼",
                    state: decisionConfirmed ? "confirmed" : "missing",
                    summary: decisionConfirmed ? "固定風險比例 1%" : null,
                    note: decisionConfirmed ? null : "尚未定義單筆風險上限與部位配置方式",
                  },
                ],
                next_high_value_decision: decisionConfirmed
                  ? null
                  : {
                      decision_id: "dec-sizing-v10",
                      block_id: "position_sizing",
                      prompt: "請確認此策略的單筆部位規模配置方式：",
                      rationale: "目前進出場規則已明確，但尚缺單筆風險上限",
                      options: [
                        {
                          option_id: "opt-fixed-risk",
                          label: "固定風險比例 1%",
                          description: "依停損距離反推部位大小",
                          patch_value: "單筆風險上限 1%，依 5% 停損距離計算部位",
                        },
                      ],
                    },
                high_priority_questions: [],
              },
            },
          },
          { status: 201 },
        );
      }

      if (method === "POST" && path === `/bff/agora/workshops/${createdWorkshopId}/decisions`) {
        decisionConfirmed = true;
        return json(
          route,
          {
            data: {
              workshop_id: createdWorkshopId,
              decision_id: "dec-sizing-v10",
              block_id: "position_sizing",
              block_state: "confirmed",
              confirmed_value: "單筆風險上限 1%，依 5% 停損距離計算部位",
              completeness: {
                workshop_id: createdWorkshopId,
                version: 2,
                overall_grade: "B+",
                ready_for_backtest: true,
                ready_for_governance: false,
                dimensions: [],
                twelve_blocks: [
                  {
                    block_id: "strategy_thesis",
                    title: "策略核心命題",
                    state: "confirmed",
                    summary: "台股大型權值與半導體龍頭波段動能",
                    note: null,
                  },
                  {
                    block_id: "position_sizing",
                    title: "部位規模與加碼",
                    state: "confirmed",
                    summary: "固定風險比例 1%",
                    note: null,
                  },
                ],
                next_high_value_decision: null,
                next_question: null,
              },
            },
          },
          { status: 201 },
        );
      }

      if (method === "GET" && path === `/bff/agora/workshops/${createdWorkshopId}`) {
        return json(route, {
          data: {
            spec_version: "1.0",
            workshop_id: createdWorkshopId,
            operator_id: "op-fe-gate",
            status: "open",
            title: createdTitle,
            subject: { kind: "strategy_spec", ref: createdWorkshopId, title: createdTitle },
            metadata: {
              strategy_name: createdTitle,
              description:
                "台股大型權值與半導體龍頭波段動能策略，於月營收年增且法人連買時進場，跌破 20 日均線或單筆虧損 5% 停損出場。",
            },
            participant_persona_ids: [],
            created_at: NOW,
          },
        });
      }

      if (method === "GET" && path === `/bff/agora/workshops/${createdWorkshopId}/cards`) {
        return json(route, {
          data: {
            items: reconstructed
              ? [
                  {
                    card_id: "card-recon-v10-1",
                    card_type: "strategy_reconstruction",
                    version: 1,
                    title: "策略重建卡 v1",
                    summary: "已根據您的策略描述完成 12 塊策略重建與缺口盤點。",
                    created_at: NOW,
                    payload: {
                      archetype: "momentum_breakout",
                      market_scope: "TWSE Semis",
                      horizon: "swing_5_20d",
                      overall_completeness: decisionConfirmed ? "B+" : "B-",
                      completeness_dimensions: [],
                      twelve_blocks: [
                        {
                          block_id: "strategy_thesis",
                          title: "策略核心命題",
                          state: "confirmed",
                          summary: "台股大型權值與半導體龍頭波段動能",
                          note: null,
                        },
                        {
                          block_id: "position_sizing",
                          title: "部位規模與加碼",
                          state: decisionConfirmed ? "confirmed" : "missing",
                          summary: decisionConfirmed ? "固定風險比例 1%" : null,
                          note: decisionConfirmed ? null : "尚未定義單筆風險上限與部位配置方式",
                        },
                      ],
                      next_high_value_decision: decisionConfirmed
                        ? null
                        : {
                            decision_id: "dec-sizing-v10",
                            block_id: "position_sizing",
                            prompt: "請確認此策略的單筆部位規模配置方式：",
                            rationale: "目前進出場規則已明確，但尚缺單筆風險上限",
                            options: [
                              {
                                option_id: "opt-fixed-risk",
                                label: "固定風險比例 1%",
                                description: "依停損距離反推部位大小",
                                patch_value: "單筆風險上限 1%，依 5% 停損距離計算部位",
                              },
                            ],
                          },
                      high_priority_questions: [],
                    },
                  },
                ]
              : [],
          },
        });
      }

      if (method === "GET" && path === `/bff/agora/workshops/${createdWorkshopId}/completeness`) {
        if (!reconstructed) {
          return json(route, { data: null, meta: { state: "not_assessed" } });
        }
        return json(route, {
          data: {
            workshop_id: createdWorkshopId,
            version: decisionConfirmed ? 2 : 1,
            overall_grade: decisionConfirmed ? "B+" : "B-",
            ready_for_backtest: decisionConfirmed,
            ready_for_governance: false,
            dimensions: [],
            twelve_blocks: [
              {
                block_id: "strategy_thesis",
                title: "策略核心命題",
                state: "confirmed",
                summary: "台股大型權值與半導體龍頭波段動能",
                note: null,
              },
              {
                block_id: "position_sizing",
                title: "部位規模與加碼",
                state: decisionConfirmed ? "confirmed" : "missing",
                summary: decisionConfirmed ? "固定風險比例 1%" : null,
                note: decisionConfirmed ? null : "尚未定義單筆風險上限與部位配置方式",
              },
            ],
            next_high_value_decision: decisionConfirmed
              ? null
              : {
                  decision_id: "dec-sizing-v10",
                  block_id: "position_sizing",
                  prompt: "請確認此策略的單筆部位規模配置方式：",
                  rationale: "目前進出場規則已明確，但尚缺單筆風險上限",
                  options: [
                    {
                      option_id: "opt-fixed-risk",
                      label: "固定風險比例 1%",
                      description: "依停損距離反推部位大小",
                      patch_value: "單筆風險上限 1%，依 5% 停損距離計算部位",
                    },
                  ],
                },
            next_question: null,
          },
        });
      }

      await route.fallback();
    },
  );

  await page.goto("/agora/strategy-workshop");
  await expect(page.getByTestId("strategy-workshop-page-list")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("create-workshop-btn").click();
  await expect(page.getByTestId("create-workshop-description-input")).toBeVisible();
  await page
    .getByTestId("create-workshop-description-input")
    .fill("台股大型權值與半導體龍頭波段動能策略\n於月營收年增且法人連買時進場，跌破 20 日均線或單筆虧損 5% 停損出場。");
  await expect(page.getByTestId("create-workshop-derived-title")).toContainText(
    "台股大型權值與半導體龍頭波段動能策略",
  );
  await page.getByTestId("create-workshop-submit").click();

  await expect(page).toHaveURL(new RegExp(`/agora/strategy-workshop/${createdWorkshopId}$`));
  await expect(page.getByTestId("workshop-card-strategy_reconstruction")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("v10-twelve-blocks-section")).toBeVisible();
  await expect(page.getByTestId("rail-next-high-value-decision")).toBeVisible();
  await expect(page.getByTestId("servant-default-composer-badge")).toBeVisible();

  await page.getByTestId("rail-decision-option-opt-fixed-risk").click();
  await expect
    .poll(() => mutationRequests(state, `/bff/agora/workshops/${createdWorkshopId}/decisions`).length)
    .toBe(1);
});
