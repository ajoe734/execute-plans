import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { installOidcDevLogin } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const NOW = "2026-07-14T12:00:00Z";
const WORKSHOP_ID = "ws-pint-010";
const TRADING_CONSULT_WORKSHOP_ID = "ws-trading-consult";
const JOURNAL_WORKSHOP_ID = "ws-journal-reflection";
const STRATEGY_ID = "strat-pint-010";
const STRATEGY_VERSION = "spec-v2";
const DECISION_EVENT_ID = "evt-pint-010";
const EVENT_ETAG = '"event-v1"';
const PERSONA_ID = "per_quant";
const EPISODE_ID = "ep-journal-1";
const GOVERNED_PROPOSAL_ID = "prop-pint-010";
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
  proposal: {
    governedActionLink: JsonRecord | null;
    proposedValue: unknown;
    revision: number;
    state: string;
    validation?: JsonRecord;
  };
  requests: CapturedRequest[];
  unexpected: Array<{ method: string; path: string }>;
};

type FixtureOptions = {
  roles?: string[];
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

function workshopFixture(workshopId: string) {
  return {
    spec_version: "1.0",
    workshop_id: workshopId,
    operator_id: "op-fe-gate",
    status: "open",
    subject: {
      kind: "strategy_spec",
      ref: "strategy-pint-010",
      title: "PINT-010 Persona Interaction",
    },
    participant_persona_ids: ["per_quant"],
    created_at: NOW,
  };
}

const namedOpinionCard = {
  card_id: "card-named-opinion",
  card_type: "persona_opinion",
  workshop_id: WORKSHOP_ID,
  sequence_no: 1,
  status: "completed",
  title: "Quant Architect named response",
  persona_id: "per_quant",
  payload: {
    opinion_id: "opinion-pint-010",
    persona_id: "per_quant",
    persona_version: "v7",
    stance: "conditional",
    confidence: 0.82,
    rationale: "Named Quant Architect requires fresher liquidity evidence.",
    uncertainty: "The closing-auction sample is incomplete.",
  },
  created_at: NOW,
};

const redTeamConsultCard = {
  card_id: "card-red-consult",
  card_type: "consult_result",
  workshop_id: WORKSHOP_ID,
  sequence_no: 2,
  status: "completed",
  title: "Red-team consultation result",
  payload: {
    consultation_id: "consult-red-pint-010",
    consultation_type: "red_team_challenge",
    status: "completed",
    freshness: "current",
    participant_persona_refs: ["per_quant", "per_red"],
    consensus_summary: "The panel did not reach consensus on liquidity capacity.",
    disagreements: [
      "Red Team rejects the liquidity assumption; Quant retains it.",
    ],
    risk_notes: ["Closing-auction depth is not yet independently verified."],
    conditions: ["Keep the proposal in paper validation."],
  },
  created_at: NOW,
};

const decisionEvent = {
  spec_version: "1.0",
  decision_event_id: DECISION_EVENT_ID,
  event_kind: "reduce",
  origin: "risk_rule",
  strategy_id: STRATEGY_ID,
  strategy_spec_registry_id: STRATEGY_VERSION,
  subject: { symbol: "2330.TW", asset_class: "equity", venue: "TWSE" },
  state: "pending_review",
  trigger: {
    rule_id: "liquidity-drift",
    summary: "Liquidity stress threshold approached",
    distance_to_trigger: 0.02,
  },
  triggered_at: NOW,
  confidence: {
    value: 0.72,
    basis: "mixed",
    calibration_state: "calibrated",
    sample_size: 64,
  },
  probability: {
    target_outcome: "drawdown breach",
    horizon: "5d",
    value: 0.41,
    ci_lower: 0.31,
    ci_upper: 0.51,
  },
  expected_value: {
    horizon: "5d",
    unit: "pct_return",
    gross: 0.018,
    cost: 0.004,
    net: 0.014,
    downside: -0.026,
  },
  rationale: [
    { claim: "Reduce until closing-auction depth is verified.", confidence: 0.74 },
  ],
  risk_notes: [
    {
      severity: "warning",
      domain: "liquidity",
      summary: "Exit cost is elevated near the close.",
      mitigation: "Validate in paper before changing the proposal.",
    },
  ],
  evidence_refs: [
    {
      ref_type: "telemetry_snapshot",
      ref_id: "telemetry-liquidity-1",
      summary: "Paper liquidity telemetry",
      data_cutoff: NOW,
    },
  ],
  invalidation: {
    conditions: ["Spread normalizes below 8 bps"],
    current_state: "watch",
    last_checked_at: NOW,
  },
  suggested_action: "reduce",
  suggested_size: { size_hint: "small", portfolio_pct: 0.01, non_binding: true },
  position_snapshot: { quantity: 100, notional: 95_000, environment: "paper" },
  data_cutoff: NOW,
  no_order_route_proof: "agora_decision_support_only",
};

const tradingRoomAggregate = {
  spec_version: "1.0",
  user_scope_ref: "op-fe-gate",
  strategies: [
    {
      strategy_id: STRATEGY_ID,
      strategy_spec_registry_id: STRATEGY_VERSION,
      title: "PINT-010 Liquidity Strategy",
      readiness_state: "ready",
      monitoring_state: "monitoring",
      pending_event_counts: { reduce: 1 },
      candidate_count: 1,
      position_count: 1,
    },
  ],
  queue_summary: { entry: 0, add: 0, reduce: 1, exit: 0, review: 0 },
  top_decision_events: [decisionEvent],
  position_summaries: [],
  risk_summary: {
    state: "watch",
    summary: "Paper liquidity validation is pending.",
    alerts: ["No live-capital action is authorized."],
  },
  snapshot_at: NOW,
  data_cutoff: NOW,
};

const workspaceProposal = {
  strategyId: STRATEGY_ID,
  strategyVersion: STRATEGY_VERSION,
  proposalId: "proposal-preview-pint-010",
  generatedAt: NOW,
  status: "preview",
  views: [],
  rationale: "Deterministic proposal fixture for the decision-event queue.",
  dataAvailability: { status: "complete", sources: [] },
  warnings: [],
  personalizationApplied: { status: "not_applied", items: [] },
};

const personaFixture = {
  id: PERSONA_ID,
  persona_id: PERSONA_ID,
  name: "Quant Architect",
  display_name: "Quant Architect",
  archetype: "Quant",
  owner: "alice",
  updatedAt: NOW,
  state: "deployed",
  risk: "low",
  successRate: 0.85,
  routedStrategies: 1,
};

const episodeFixture = {
  trade_episode_id: EPISODE_ID,
  persona_id: PERSONA_ID,
  environment: "paper",
  strategy_id: STRATEGY_ID,
  artifact_id: STRATEGY_VERSION,
  instrument_id: "AAPL",
  side: "long",
  status: "reflected",
  opened_at: "2026-07-12T12:00:00Z",
  closed_at: "2026-07-13T12:00:00Z",
  requested_qty: 100,
  filled_qty: 100,
  vwap: 150,
  fees: 2,
  slippage: 1,
  rejects: 0,
  realized_pnl: 500,
  unrealized_pnl: 0,
  mae: 0.1,
  mfe: 2.5,
  thesis: "Paper momentum entry with a bounded liquidity assumption.",
  reflection_summary: "Strong execution under volatility.",
  coverage: {
    reflection: {
      state: "complete",
      missing_refs: [],
      as_of: NOW,
      source_system: "persona_reflection",
    },
  },
  timeline: [
    {
      event_id: "episode-event-1",
      event_type: "closed",
      occurred_at: "2026-07-13T12:00:00Z",
      actor: PERSONA_ID,
      details: { environment: "paper" },
    },
  ],
};

function governedProposalFixture(state: FixtureState) {
  return {
    proposal_id: GOVERNED_PROPOSAL_ID,
    proposal_type: "risk_limit_recommendation",
    target_kind: "strategy",
    target_id: STRATEGY_ID,
    target_version: STRATEGY_VERSION,
    current_value: { liquidity_limit: 5 },
    proposed_value: state.proposal.proposedValue,
    rationale: "Reduce paper exposure until the red-team liquidity concern is resolved.",
    evidence_refs: ["evidence:pint-010-red-team"],
    environment_ceiling: "paper",
    required_permissions: ["strategy.review"],
    required_reviewers: ["risk", "human"],
    human_gate: true,
    execution_authority: "none",
    revision: state.proposal.revision,
    state: state.proposal.state,
    expires_at: "2026-08-01T00:00:00Z",
    validation: state.proposal.validation,
    audit: [
      { action: "create", actor: "op-fe-gate", at: NOW },
      ...(state.proposal.revision >= 2
        ? [{ action: "modify", actor: "op-fe-gate", at: NOW }]
        : []),
      ...(state.proposal.revision >= 3
        ? [{ action: "validate", actor: "paper-validator", at: NOW }]
        : []),
    ],
    governed_action_link: state.proposal.governedActionLink,
  };
}

function governedProposalEtag(state: FixtureState): string {
  return `"proposal-v${state.proposal.revision}"`;
}

function workshopMessageCount(state: FixtureState): number {
  return state.requests.filter(
    (request) =>
      request.method === "POST" &&
      request.path === "/bff/agora/interactions" &&
      (request.body as JsonRecord | null)?.workshop_id === WORKSHOP_ID,
  ).length;
}

async function installFixture(
  page: Page,
  options: FixtureOptions = {},
): Promise<FixtureState> {
  const state: FixtureState = {
    proposal: {
      governedActionLink: null,
      proposedValue: { liquidity_limit: 3 },
      revision: 1,
      state: "draft",
    },
    requests: [],
    unexpected: [],
  };

  await page.addInitScript(() => {
    window.sessionStorage.setItem("pantheon.e2e.realWrites", "true");
  });

  await installOidcDevLogin(page, {
    goto: false,
    roles: options.roles ?? ["operator", "reviewer", "approver"],
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
        state.requests.push({
          body: requestBody(request),
          headers: request.headers(),
          method,
          path,
        });
      }

      if (method === "GET" && path === "/health") {
        return json(route, { status: "ok", service: "pint-010-fixture" });
      }
      if (method === "GET" && path === "/bff/me") {
        return json(route, {
          data: {
            user: {
              id: "op-fe-gate",
              displayName: "PINT-010 Operator",
              email: "pint-010@pantheon.local",
            },
            tenant: {
              id: "pantheon-dev",
              name: "Pantheon Dev",
              tz: "UTC",
              locale: "en-US",
              baseCurrency: "USD",
            },
            roles: options.roles ?? ["operator", "reviewer", "approver"],
            capabilities: ["management.read", "persona.view", "archive"],
            session: { authenticated: true, session_kind: "bearer" },
            env: "dev",
            featureFlags: {},
            serverTime: NOW,
            sessionExpiresAt: "2026-07-15T12:00:00Z",
            permissionsVersion: "pint-010-v1",
          },
        });
      }
      if (method === "GET" && path === "/bff/agora/capabilities") {
        return json(route, {
          data: {
            capabilities: [
              {
                name: "agora.workshop.v1",
                auth_level: "operator",
                route_prefixes: ["/bff/agora/workshops"],
              },
              {
                name: "agora.persona.interaction.v1",
                auth_level: "operator",
                route_prefixes: ["/bff/agora/interactions"],
              },
            ],
          },
        });
      }
      if (method === "GET" && path === "/bff/management/shell-summary") {
        return json(route, {
          data: {
            counts: { pending_approvals: 0, open_alerts: 0, running_jobs: 0 },
            session: {},
            transport: { status: "ok" },
          },
          meta: {
            snapshot_at: NOW,
            surfaces: { shell_summary: { status: "ok", source: "fixture" } },
          },
        });
      }
      if (method === "GET" && path === "/bff/jobs") {
        return json(route, {
          data: [],
          page_info: { total: 0, page_size: 0 },
          meta: { surfaces: { jobs: { status: "ok", source: "fixture" } } },
        });
      }

      if (method === "GET" && path === `/bff/agora/proposals/${GOVERNED_PROPOSAL_ID}`) {
        return json(
          route,
          { data: governedProposalFixture(state) },
          { headers: { ETag: governedProposalEtag(state) } },
        );
      }
      if (method === "POST" && path === `/bff/agora/proposals/${GOVERNED_PROPOSAL_ID}/actions`) {
        const body = requestBody(request) as JsonRecord;
        if (request.headers()["if-match"] !== governedProposalEtag(state)) {
          return json(route, { detail: "proposal ETag is stale" }, { status: 412 });
        }
        if (body.action === "modify") {
          state.proposal.proposedValue = body.proposed_value;
          state.proposal.revision += 1;
          state.proposal.state = "draft";
        } else if (body.action === "validate") {
          state.proposal.validation = body.validation_result as JsonRecord;
          state.proposal.revision += 1;
          state.proposal.state = "validated";
          state.proposal.governedActionLink = {
            route: "/bff/actions/{type}/{id}/{action}",
            target_type: "strategy",
            target_id: STRATEGY_ID,
            action: "submit_review",
            execution_authority: "none",
          };
        } else {
          return json(route, { detail: "unsupported fixture action" }, { status: 422 });
        }
        return json(
          route,
          { data: governedProposalFixture(state) },
          { headers: { ETag: governedProposalEtag(state) } },
        );
      }

      if (method === "GET" && path === "/bff/agora/trading-room") {
        return json(route, { data: tradingRoomAggregate });
      }
      if (method === "GET" && path === "/bff/agora/trading-room/decision-events") {
        return json(
          route,
          { data: { items: [decisionEvent] }, page_info: { total: 1, page_size: 1 } },
          { headers: { ETag: EVENT_ETAG } },
        );
      }
      if (
        method === "POST" &&
        path === `/bff/agora/strategies/${STRATEGY_ID}/trading-room/proposals`
      ) {
        return json(route, { data: workspaceProposal }, { status: 201 });
      }
      if (
        method === "POST" &&
        path === `/bff/agora/trading-room/decision-events/${DECISION_EVENT_ID}/decisions`
      ) {
        return json(route, {
          data: {
            decision_event_id: DECISION_EVENT_ID,
            decision: "modify",
            status: "recorded",
          },
          meta: { liveCapitalSideEffects: false },
        });
      }

      if (method === "POST" && path === "/bff/agora/workshops") {
        return json(route, { data: workshopFixture(TRADING_CONSULT_WORKSHOP_ID) }, { status: 201 });
      }
      const workshopMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)$/);
      if (method === "GET" && workshopMatch) {
        return json(route, { data: workshopFixture(decodeURIComponent(workshopMatch[1])) });
      }
      const cardsMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)\/cards$/);
      if (method === "GET" && cardsMatch) {
        const workshopId = decodeURIComponent(cardsMatch[1]);
        const count = workshopId === WORKSHOP_ID ? workshopMessageCount(state) : 0;
        const cards = count >= 2
          ? [namedOpinionCard, redTeamConsultCard]
          : count === 1
            ? [namedOpinionCard]
            : [];
        return json(route, { data: { items: cards } });
      }
      const eventsMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)\/events$/);
      if (method === "GET" && eventsMatch) {
        return json(route, { data: { items: [] } });
      }
      const completenessMatch = path.match(
        /^\/bff\/agora\/workshops\/([^/]+)\/completeness$/,
      );
      if (method === "GET" && completenessMatch) {
        return json(route, { data: null, meta: { state: "not_assessed" } });
      }
      const readinessMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)\/readiness$/);
      if (method === "GET" && readinessMatch) {
        return json(route, { data: null, meta: { state: "not_assessed" } });
      }
      const messageMatch = path.match(/^\/bff\/agora\/workshops\/([^/]+)\/messages$/);
      if (method === "POST" && messageMatch) {
        return json(
          route,
          {
            data: {
              message_id: `message-${state.requests.length}`,
              workshop_id: decodeURIComponent(messageMatch[1]),
              created_at: NOW,
            },
            meta: { liveCapitalSideEffects: false },
          },
          { status: 201 },
        );
      }

      if (method === "GET" && path === `/bff/personas/${PERSONA_ID}/trade-journal`) {
        return json(route, {
          data: [episodeFixture],
          page_info: { next_cursor: null, has_more: false },
          meta: { coverage_state: "complete", count: 1, source: "fixture" },
        });
      }
      if (method === "GET" && path === `/bff/personas/${PERSONA_ID}`) {
        return json(route, { data: personaFixture });
      }
      if (method === "GET" && path === "/bff/personas") {
        return json(route, {
          data: [
            personaFixture,
            {
              id: "per_macro",
              persona_id: "per_macro",
              name: "Macro Strategist",
              display_name: "Macro Strategist",
              archetype: "Macro",
              owner: "bob",
              updatedAt: NOW,
              state: "deployed",
              risk: "low",
              successRate: 0.8,
              routedStrategies: 1,
            },
          ],
          page_info: { total: 2, page_size: 2 },
          meta: { surfaces: { personas: { status: "ok", source: "fixture" } } },
        });
      }
      if (method === "GET" && path === "/bff/strategies") {
        return json(route, {
          data: [],
          page_info: { total: 0, page_size: 0 },
          meta: { surfaces: { strategies: { status: "ok", source: "fixture" } } },
        });
      }
      if (method === "GET" && path === "/bff/audit") {
        return json(route, {
          data: [],
          page_info: { total: 0, page_size: 0 },
          meta: { surfaces: { audit: { status: "ok", source: "fixture" } } },
        });
      }

      if (method === "POST" && path === "/bff/agora/interactions/context:resolve") {
        const captured = state.requests.at(-1)?.body as JsonRecord;
        const contextRefs = Array.isArray(captured.context_refs)
          ? captured.context_refs as JsonRecord[]
          : [];
        const workshopId = typeof captured.workshop_id === "string"
          ? captured.workshop_id
          : contextRefs.some((ref) => ref.type === "decision_event")
            ? TRADING_CONSULT_WORKSHOP_ID
            : JOURNAL_WORKSHOP_ID;
        return json(route, {
          data: {
            workshop_id: workshopId,
            context_refs: captured.context_refs ?? [],
            context_digest: "sha256:pint-010-journal",
            environment: captured.environment ?? "paper",
            verified: true,
            resolved_at: NOW,
          },
        });
      }
      if (method === "POST" && path === "/bff/agora/interactions/participants:eligible") {
        const captured = state.requests.at(-1)?.body as JsonRecord;
        const challenge = captured.mode === "challenge";
        const consult = captured.mode === "consult";
        const quant = {
          persona_id: "per_quant",
          display_name: "Quant Architect",
          eligible: true,
          reasons: [],
          recommended: challenge || consult,
          capability_snapshot_id: "snap-quant-pint-010",
        };
        const macro = {
          persona_id: "per_macro",
          display_name: "Macro Strategist",
          eligible: true,
          reasons: [],
          recommended: consult,
          capability_snapshot_id: "snap-macro-pint-010",
        };
        const risk = {
          persona_id: "per_risk",
          display_name: "Risk Officer Bot",
          eligible: true,
          reasons: [],
          recommended: consult,
          capability_snapshot_id: "snap-risk-pint-010",
        };
        const redTeam = {
          persona_id: "per_red",
          display_name: "Red Team Adversary",
          eligible: true,
          reasons: [],
          recommended: challenge,
          capability_snapshot_id: "snap-red-pint-010",
        };
        return json(route, {
          data: {
            included: challenge
              ? [redTeam, quant, macro, risk]
              : [quant, macro, risk, redTeam],
            excluded: [],
          },
        });
      }
      if (method === "POST" && path === "/bff/agora/interactions") {
        const captured = state.requests.at(-1)?.body as JsonRecord;
        return json(
          route,
          {
            data: {
              interaction_id: "interaction-journal-pint-010",
              workshop_id: captured.workshop_id,
              mode: captured.mode,
              topic: captured.topic,
              participants: captured.participant_persona_ids,
              context_refs: captured.context_refs,
              status: "queued",
              execution_authority: "none",
              no_capital_authority_proof:
                "persona_interaction_event_no_capital_or_order_authority",
              submitted_at: NOW,
            },
          },
          { status: 202 },
        );
      }

      state.unexpected.push({ method, path });
      return json(
        route,
        {
          data: { items: [] },
          meta: { fixture: "unexpected-read", liveCapitalSideEffects: false },
        },
        { status: method === "GET" ? 200 : 501 },
      );
    },
  );

  return state;
}

function mutationRequests(state: FixtureState, path: string): CapturedRequest[] {
  return state.requests.filter((request) => request.path === path);
}

function collectForbiddenKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectForbiddenKeys(entry, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;

  const forbidden = new Set([
    "order",
    "order_id",
    "broker",
    "broker_order",
    "broker_order_id",
    "capital",
    "capital_binding",
    "capital_pool",
    "runtime_binding",
    "memory",
    "memory_update",
    "self_approve",
    "self_approval",
    "approve_self",
    "approval_decision",
    "execution_authority",
  ]);
  for (const [key, nested] of Object.entries(value as JsonRecord)) {
    if (forbidden.has(key.toLowerCase())) found.push(key);
    collectForbiddenKeys(nested, found);
  }
  return found;
}

function expectAuthorityNegative(state: FixtureState): void {
  const forbiddenRoute =
    /\/(?:orders?|brokers?|broker-orders?|capital-bindings?|runtime-bindings?|memory)(?:\/|$)/i;
  expect(
    state.requests.filter((request) => forbiddenRoute.test(request.path)),
    "the UI must not call direct order, broker, capital-binding, runtime-binding, or memory routes",
  ).toEqual([]);
  for (const request of state.requests) {
    expect(
      collectForbiddenKeys(request.body),
      `${request.method} ${request.path} must remain authority-negative`,
    ).toEqual([]);
  }
}

async function selectOption(page: Page, testId: string, name: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name, exact: true }).click();
}

test("one named Persona ask and red-team challenge render a visible disagreement", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const state = await installFixture(page);

  await page.goto(`/agora/strategy-workshop/${WORKSHOP_ID}`);
  await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible({ timeout: 30_000 });

  await selectOption(page, "participant-picker", "Named Personas (Select)");
  const namedPanel = page.getByTestId("named-checkbox-panel");
  await expect(namedPanel.getByRole("checkbox", { name: "Quant Architect" })).toBeChecked();
  await namedPanel.getByRole("checkbox", { name: "Macro Strategist" }).uncheck();
  await namedPanel.getByRole("checkbox", { name: "Risk Officer Bot" }).uncheck();
  await expect(namedPanel.locator("input:checked")).toHaveCount(1);

  await page.getByTestId("servant-composer-input").fill("Explain the liquidity assumption.");
  await page.getByTestId("servant-composer-submit").click();
  await expect(page.getByTestId("workshop-card-card-named-opinion")).toContainText(
    "Named Quant Architect requires fresher liquidity evidence.",
  );

  const firstMessage = mutationRequests(state, "/bff/agora/interactions")[0];
  expect(firstMessage?.body).toEqual({
    workshop_id: WORKSHOP_ID,
    mode: "ask",
    environment: "paper",
    required_capability: "persona_opinion",
    topic: "Explain the liquidity assumption.",
    participant_persona_ids: ["per_quant"],
    context_refs: [{ type: "persona", id: "per_quant" }],
  });

  await selectOption(page, "mode-selector", "Challenge (Attack assumptions)");
  await selectOption(page, "participant-picker", "First Eligible Persona");
  await expect(page.getByTestId("eligibility-explanation")).toContainText(
    "First Eligible Persona — 1 selected in canonical eligibility order.",
  );
  await page
    .getByTestId("servant-composer-input")
    .fill("Attack the closing-auction liquidity assumption.");
  await page.getByTestId("servant-composer-submit").click();

  const redConsult = page.getByTestId("workshop-card-card-red-consult");
  await expect(redConsult).toBeVisible();
  await expect(redConsult).toContainText("Disagreements");
  await expect(redConsult).toContainText(
    "Red Team rejects the liquidity assumption; Quant retains it.",
  );

  const messages = mutationRequests(state, "/bff/agora/interactions");
  expect(messages).toHaveLength(2);
  expect(messages[1].body).toEqual({
    workshop_id: WORKSHOP_ID,
    mode: "challenge",
    environment: "paper",
    required_capability: "persona_opinion",
    topic: "Attack the closing-auction liquidity assumption.",
    participant_persona_ids: ["per_red"],
    context_refs: [{ type: "persona", id: "per_red" }],
  });
  expect(state.unexpected).toEqual([]);
  expectAuthorityNegative(state);
});

test("governed proposal revision and paper validation stay review-only", async ({ page }) => {
  const state = await installFixture(page);
  const proposalPath = `/bff/agora/proposals/${GOVERNED_PROPOSAL_ID}/actions`;

  await page.goto(
    `/agora/strategy-workshop/${WORKSHOP_ID}?governedProposalId=${GOVERNED_PROPOSAL_ID}`,
  );
  const proposalCard = page.getByTestId(`governed-proposal-${GOVERNED_PROPOSAL_ID}`);
  await expect(proposalCard).toContainText("revision 1");
  await expect(proposalCard).toContainText("Human gate: required");
  await expect(proposalCard).toContainText("paper");
  await expect(proposalCard.getByRole("button", { name: "approve" })).toBeDisabled();

  await proposalCard
    .getByLabel("Decision reason")
    .fill("Apply the red-team liquidity limit before paper validation.");
  await proposalCard.getByRole("button", { name: "Modify" }).click();
  await proposalCard.getByLabel("Proposed value").fill('{"liquidity_limit":2}');
  await proposalCard.getByRole("button", { name: "Save new revision" }).click();
  await expect(proposalCard).toContainText("revision 2");

  const modification = mutationRequests(state, proposalPath)[0];
  expect(modification?.body).toEqual({
    action: "modify",
    reason: "Apply the red-team liquidity limit before paper validation.",
    proposed_value: { liquidity_limit: 2 },
  });
  expect(modification?.headers["if-match"]).toBe('"proposal-v1"');
  expect(modification?.headers.authorization).toMatch(/^Bearer /);
  expect(modification?.headers["x-tenant-id"]).toBe("pantheon-dev");
  expect(modification?.headers["idempotency-key"]).toMatch(/^idk_/);

  const validationBody = {
    action: "validate",
    reason: "Paper checks passed with no execution authority.",
    validation_result: {
      status: "passed",
      environment: "paper",
      execution_attempted: false,
    },
  };
  const validationStatus = await page.evaluate(
    async ({ body, proposalId }) => {
      const token = window.sessionStorage.getItem("pantheon.bff.bearerToken") ?? "";
      const tenantId = window.sessionStorage.getItem("pantheon.bff.tenantId") ?? "";
      const response = await window.fetch(`/bff/agora/proposals/${proposalId}/actions`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "pint-010-paper-validation",
          "If-Match": '"proposal-v2"',
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify(body),
      });
      return response.status;
    },
    { body: validationBody, proposalId: GOVERNED_PROPOSAL_ID },
  );
  expect(validationStatus).toBe(200);
  expect(mutationRequests(state, proposalPath)[1]?.body).toEqual(validationBody);

  await page.reload();
  const validatedCard = page.getByTestId(`governed-proposal-${GOVERNED_PROPOSAL_ID}`);
  await expect(validatedCard).toContainText("revision 3");
  await expect(validatedCard.getByLabel("Validation result")).toContainText("Passed");
  await expect(validatedCard).toContainText("This handoff has no execution authority.");
  await expect(validatedCard.getByRole("button", { name: "approve" })).toBeDisabled();

  const auditReadback = await page.evaluate(async (proposalId) => {
    const token = window.sessionStorage.getItem("pantheon.bff.bearerToken") ?? "";
    const tenantId = window.sessionStorage.getItem("pantheon.bff.tenantId") ?? "";
    const response = await window.fetch(`/bff/agora/proposals/${proposalId}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Tenant-Id": tenantId,
      },
    });
    const payload = (await response.json()) as {
      data?: { audit?: Array<{ action?: string }> };
    };
    return {
      actions: payload.data?.audit?.map((entry) => entry.action) ?? [],
      etag: response.headers.get("etag"),
      status: response.status,
    };
  }, GOVERNED_PROPOSAL_ID);
  expect(auditReadback).toEqual({
    actions: ["create", "modify", "validate"],
    etag: '"proposal-v3"',
    status: 200,
  });

  expect(state.unexpected).toEqual([]);
  expectAuthorityNegative(state);
});

test("viewer proposal mutation fails closed without changing the revision", async ({ page }) => {
  const state = await installFixture(page, { roles: ["viewer"] });

  await page.goto(
    `/agora/strategy-workshop/${WORKSHOP_ID}?governedProposalId=${GOVERNED_PROPOSAL_ID}`,
  );
  const proposalCard = page.getByTestId(`governed-proposal-${GOVERNED_PROPOSAL_ID}`);
  await expect(proposalCard).toContainText("revision 1");
  const modifyButton = proposalCard.getByRole("button", { name: "Modify" });
  await expect(modifyButton).toBeDisabled();
  await expect(modifyButton).toHaveAttribute("title", /require an operator/i);
  expect(state.proposal.revision).toBe(1);
  expect(
    mutationRequests(state, `/bff/agora/proposals/${GOVERNED_PROPOSAL_ID}/actions`),
  ).toEqual([]);
  expect(state.unexpected).toEqual([]);
  expectAuthorityNegative(state);
});

test("Trading Room Ask Personas preserves context and modify preserves proposal linkage", async ({
  page,
}) => {
  const state = await installFixture(page);
  const tradingRoomUrl =
    `/agora/trading-room/${STRATEGY_ID}` +
    `?strategyVersion=${STRATEGY_VERSION}&readinessGate=trading_room`;

  await page.goto(tradingRoomUrl);
  await page.getByTestId(`event-row-${DECISION_EVENT_ID}`).click();
  await expect(page.getByTestId("detail-no-order-route")).toHaveText(
    "agora_decision_support_only",
  );

  await page.getByTestId(`ask-personas-${DECISION_EVENT_ID}`).click();
  const consultPanel = page.getByTestId(`consult-panel-${DECISION_EVENT_ID}`);
  await expect(consultPanel).toContainText(DECISION_EVENT_ID);
  await expect(consultPanel).toContainText(STRATEGY_VERSION);
  await expect(consultPanel).toContainText("canonical eligibility service");
  await consultPanel
    .getByPlaceholder("Ask your question to the selected personas...")
    .fill("Compare the paper liquidity risk before modifying this proposal.");
  await page.getByTestId(`consult-panel-submit-${DECISION_EVENT_ID}`).click();
  await expect(page).toHaveURL(
    new RegExp(`/agora/strategy-workshop/${TRADING_CONSULT_WORKSHOP_ID}(?:\\?|$)`),
  );

  const contextRefs = [
    { type: "strategy", id: STRATEGY_ID, version_id: STRATEGY_VERSION },
    { type: "decision_event", id: DECISION_EVENT_ID },
  ];
  expect(mutationRequests(state, "/bff/agora/interactions/context:resolve")[0]?.body).toEqual({
    context_refs: contextRefs,
    environment: "paper",
  });
  expect(
    mutationRequests(state, "/bff/agora/interactions/participants:eligible")[0]?.body,
  ).toEqual({
    workshop_id: TRADING_CONSULT_WORKSHOP_ID,
    mode: "consult",
    environment: "paper",
    required_capability: "persona_opinion",
  });
  expect(mutationRequests(state, "/bff/agora/interactions")[0]?.body).toEqual({
    workshop_id: TRADING_CONSULT_WORKSHOP_ID,
    mode: "consult",
    environment: "paper",
    required_capability: "persona_opinion",
    topic: "Compare the paper liquidity risk before modifying this proposal.",
    participant_persona_ids: ["per_quant", "per_macro", "per_risk"],
    context_refs: contextRefs,
  });

  await page.goto(tradingRoomUrl);
  await page.getByTestId(`event-row-${DECISION_EVENT_ID}`).click();
  await page.getByTestId(`decide-modify-${DECISION_EVENT_ID}`).click();
  await expect(page.getByTestId(`modify-linkage-panel-${DECISION_EVENT_ID}`)).toBeVisible();
  await page.getByTestId(`modify-proposal-id-${DECISION_EVENT_ID}`).fill("proposal-pint-010");
  await page.getByTestId(`modify-proposal-revision-${DECISION_EVENT_ID}`).fill("2");
  await page
    .getByTestId(`modify-workshop-id-${DECISION_EVENT_ID}`)
    .fill(TRADING_CONSULT_WORKSHOP_ID);
  await page
    .getByTestId(`modify-rationale-${DECISION_EVENT_ID}`)
    .fill("Reduce paper size until the red-team liquidity concern is resolved.");
  await page.getByTestId(`modify-linkage-submit-${DECISION_EVENT_ID}`).click();
  await expect(page.getByTestId("detail-decision-confirmed")).toHaveText(
    "Decision recorded: modify",
  );

  const decisionRequest = mutationRequests(
    state,
    `/bff/agora/trading-room/decision-events/${DECISION_EVENT_ID}/decisions`,
  )[0];
  expect(decisionRequest?.body).toEqual({
    decision: "modify",
    rationale: "Reduce paper size until the red-team liquidity concern is resolved.",
    modifications: {
      proposal_id: "proposal-pint-010",
      proposal_revision: 2,
      consultation_workshop_id: TRADING_CONSULT_WORKSHOP_ID,
    },
  });
  expect(decisionRequest?.headers["if-match"]).toBe(EVENT_ETAG);
  expect(decisionRequest?.headers["idempotency-key"]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/i,
  );
  expect(decisionRequest?.headers["x-request-id"]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/i,
  );
  expect(decisionRequest?.headers.authorization).toMatch(/^Bearer /);
  expect(state.unexpected).toEqual([]);
  expectAuthorityNegative(state);
});

test("Persona Trade Journal starts an authority-negative original-Persona reflection", async ({
  page,
}) => {
  const state = await installFixture(page);

  await page.goto(`/management/personas/${PERSONA_ID}`);
  await page.getByRole("tab", { name: "Trade Journal", exact: true }).click();
  await page.getByRole("row", { name: new RegExp(EPISODE_ID) }).click();

  await expect(page.getByText("Strong execution under volatility.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Reflect with Personas (Strategy Workshop)" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Challenge Persona Review" })).toBeEnabled();
  await page.getByRole("button", { name: "Original Persona Review" }).click();
  await expect(page).toHaveURL(new RegExp(`/agora/strategy-workshop/${JOURNAL_WORKSHOP_ID}$`));

  expect(
    mutationRequests(state, "/bff/agora/interactions/context:resolve")[0]?.body,
  ).toEqual({
    context_refs: [{ type: "journal_entry", id: EPISODE_ID }],
    environment: "paper",
  });
  expect(
    mutationRequests(state, "/bff/agora/interactions/participants:eligible")[0]?.body,
  ).toEqual({
    workshop_id: JOURNAL_WORKSHOP_ID,
    mode: "challenge",
    environment: "paper",
  });
  expect(mutationRequests(state, "/bff/agora/interactions")[0]?.body).toEqual({
    workshop_id: JOURNAL_WORKSHOP_ID,
    mode: "reflect",
    environment: "paper",
    topic: `Reflection and review for episode ${EPISODE_ID} by Persona ${PERSONA_ID}`,
    participant_persona_ids: [PERSONA_ID],
    context_refs: [
      { type: "journal_entry", id: EPISODE_ID },
      { type: "persona", id: PERSONA_ID },
    ],
  });
  expect(state.unexpected).toEqual([]);
  expectAuthorityNegative(state);
});
