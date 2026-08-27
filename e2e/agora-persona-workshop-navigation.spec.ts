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
import { installOidcDevLogin } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const NOW = "2026-07-14T12:00:00Z";
const PERSONA_ID = "per_quant";
const PERSONA_NAME = "Quant Architect";
const WORKSHOP_ID = "ws-agc-07-nav";
const FE_ORIGIN = new URL(
  process.env.PANTHEON_FE_BASE_URL || "http://localhost:5173",
).origin;

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

const CORS_HEADERS = {
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers":
    "Accept, Authorization, Content-Type, Idempotency-Key, If-Match, X-Request-Id, X-Tenant-Id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": FE_ORIGIN,
  "Access-Control-Expose-Headers": "ETag, X-Request-Id",
  Vary: "Origin",
};

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
    headers: { ...CORS_HEADERS, ...options.headers },
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

  await installOidcDevLogin(page, {
    goto: false,
    roles: ["operator", "reviewer", "approver"],
    tenantId: "pantheon-dev",
  });
  await installQuietEventSource(page);

  await page.route(
    (url) => url.pathname === "/health" || url.pathname.startsWith("/bff/"),
    async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname;

      if (method === "OPTIONS") {
        await route.fulfill({ headers: CORS_HEADERS, status: 204 });
        return;
      }

      if (method !== "GET") {
        state.requests.push({ body: requestBody(request), headers: request.headers(), method, path });
      }

      if (method === "GET" && path === "/health") {
        return json(route, { status: "ok", service: "agc-07-fixture" });
      }
      if (method === "GET" && path === "/bff/me") {
        return json(route, {
          data: {
            user: { id: "op-fe-gate", displayName: "AGC-07 Operator", email: "agc-07@pantheon.local" },
            tenant: { id: "pantheon-dev", name: "Pantheon Dev", tz: "UTC", locale: "en-US", baseCurrency: "USD" },
            roles: ["operator", "reviewer", "approver"],
            capabilities: ["management.read", "persona.view", "archive"],
            session: { authenticated: true, session_kind: "bearer" },
            env: "dev",
            featureFlags: {},
            serverTime: NOW,
            sessionExpiresAt: "2026-07-15T12:00:00Z",
            permissionsVersion: "agc-07-v1",
          },
        });
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
        return json(route, {
          data: {
            workshop_id: WORKSHOP_ID,
            verified: true,
            environment: captured.environment ?? "paper",
            context_digest: "sha256:agc-07-nav",
            context_refs: captured.context_refs ?? [],
            context_binding: {
              binding_id: `binding-${state.requests.length}`,
              workshop_id: WORKSHOP_ID,
              tenant_id: "pantheon-dev",
              source_route: captured.source_route ?? `/management/personas/${PERSONA_ID}`,
              return_route: captured.return_route ?? `/management/personas/${PERSONA_ID}`,
              context_refs: captured.context_refs ?? [],
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

  return state;
}

function mutationRequests(state: FixtureState, path: string): CapturedRequest[] {
  return state.requests.filter((request) => request.path === path);
}

test("Talk with Persona hands off to the canonical Workshop with a resumed mode and participant", async ({ page }) => {
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
  await installFixture(page);

  await page.goto(
    `/agora/strategy-workshop/${WORKSHOP_ID}?mode=challenge&participants=${PERSONA_ID}&picker=named`,
  );

  await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("mode-selector")).toContainText("Challenge");
  await expect(page.getByTestId("participant-picker")).toContainText("Named");
  await expect(page.getByTestId("servant-composer-input")).toBeEnabled({ timeout: 30_000 });
});
