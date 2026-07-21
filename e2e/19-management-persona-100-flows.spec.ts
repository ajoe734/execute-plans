/**
 * MGMT-PERSONA-FE-BFF-100-FLOWS
 *
 * Broad management-console validation for the current multi-persona trading
 * system. The test intentionally mixes rendered UI pages with browser-side BFF
 * calls so the gate covers display, monitoring, adjustment, and feedback
 * loops without enabling real writes or live-capital side effects.
 */

import { expect, test, type Page, type Route } from "@playwright/test";
import {
  LOCAL_FIXTURE_AUTH_TOKEN,
  installOidcDevLogin,
  mutationAuthHeaders,
  targetsExternalE2eEnvironment,
} from "./helpers/auth";

const SNAPSHOT_AT = "2026-06-13T00:00:00Z";
const PERSONA_ID = "persona-mgmt100-risk";
const PERSONA_NAME = "MGMT100 Risk Steward";
const RUNTIME_ID = "runtime-mgmt100-paper";
const INTERVENTION_ID = "intervention-mgmt100-risk";
const FINDING_ID = "finding-mgmt100-risk";
const LOOP_ID = "loop-mgmt100-execution";
const STRATEGY_ID = "strategy-mgmt100-momentum";
const CAPITAL_POOL_ID = "pool-mgmt100-core";
const APPROVAL_ID = "approval-mgmt100-route";
const ALERT_ID = "alert-mgmt100-risk";
const INCIDENT_ID = "incident-mgmt100-risk";
const SIGNAL_ID = "signal-mgmt100-alpha";

const CRASH_TEXT =
  /application error|cannot read properties|undefined is not|uncaught|traceback|typeerror|referenceerror|strict typed error/i;

type JsonRecord = Record<string, unknown>;

type UiFlow = {
  category: "display" | "monitor";
  endpoint: string;
  id: string;
  path: string;
  text?: string;
  type: "ui";
};

type FetchFlow = {
  body?: JsonRecord;
  category: "display" | "monitor" | "adjust" | "feedback";
  id: string;
  method: "GET" | "PATCH" | "POST";
  path: string;
  type: "fetch";
};

type Flow = UiFlow | FetchFlow;

type BffHit = {
  body?: unknown;
  idempotencyKey?: string;
  method: string;
  path: string;
};

const oodaPhases = ["Observe", "Orient", "Decide", "Act", "Learn"] as const;

function frontendUrl(path = "/"): string {
  const base =
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.PANTHEON_FE_BASE_URL ||
    "http://127.0.0.1:5173";
  return `${base.replace(/\/$/, "")}${path}`;
}

function pathWithQuery(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()["origin"] || "*";
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "accept,authorization,content-type,idempotency-key,if-match,x-bff-api-version,x-correlation-id,x-locale,x-request-id,x-tenant-id,x-trace-id",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "x-bff-api-version,x-correlation-id,x-request-id",
  };
}

async function readJson(route: Route): Promise<unknown> {
  const raw = route.request().postData();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    headers: corsHeaders(route),
    status,
  });
}

function envelope(data: unknown, route: string, extra: JsonRecord = {}): JsonRecord {
  return {
    data,
    items: Array.isArray(data) ? data : undefined,
    meta: {
      contract: "MGMT-PERSONA-FE-BFF-100-FLOWS",
      liveCapitalSideEffects: false,
      route,
      snapshot_at: SNAPSHOT_AT,
      surfaces: {
        management_persona_trading: { source: "playwright_bff_fixture", status: "ok" },
      },
      ...extra,
    },
    page_info: Array.isArray(data)
      ? { next_page_token: null, page_size: data.length, total: data.length, totalCountExact: true }
      : undefined,
  };
}

function commandResponse(command: string, targetId: string, path: string): JsonRecord {
  const commandId = `cmd-${command.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${targetId}`;
  return {
    status: "accepted",
    data: {
      action: command,
      command,
      commandId,
      command_id: commandId,
      receipt: {
        command: "ManagementPersonaFlow",
        command_id: commandId,
        status: "accepted",
        trackingUrl: `/management/jobs/${commandId}`,
      },
      receipt_id: commandId,
      status: "accepted",
      target: { id: targetId, type: "ManagementPersona" },
    },
    meta: {
      durable: true,
      liveCapitalSideEffects: false,
      route: path,
    },
  };
}

const persona = {
  id: PERSONA_ID,
  persona_id: PERSONA_ID,
  name: PERSONA_NAME,
  personaName: PERSONA_NAME,
  archetype: "risk-steward",
  state: "deployed",
  status: "active",
  lifecycle_state: "deployed",
  owner: "ops-risk",
  risk: "medium",
  routedStrategies: 3,
  successRate: 0.84,
  route_policy_id: "route-policy-mgmt100",
  consult_policy_id: "consult-policy-mgmt100",
  updatedAt: SNAPSHOT_AT,
  allowedActions: [
    { actionId: "restrict_tools", endpoint: `/bff/actions/persona/${PERSONA_ID}/restrict_tools` },
    { actionId: "run_eval", endpoint: `/bff/actions/persona/${PERSONA_ID}/run_eval` },
  ],
};

const fleetRows = [
  {
    personaId: PERSONA_ID,
    persona_id: PERSONA_ID,
    id: PERSONA_ID,
    personaName: PERSONA_NAME,
    name: PERSONA_NAME,
    owner: "ops-risk",
    ooda: "Decide",
    autonomy: "supervised",
    perfDelta: 0.071,
    humanNeeded: true,
    lastMutation: "2026-06-13",
    state: "paper_running",
    marketScope: ["US", "TW"],
    currentWork: "MGMT100 paper risk route review",
    dataSourceStatus: {
      state: "quote_readback_ok",
      providerStatuses: { ibkr: "read_ok", shioaji: "read_ok" },
      readbackRefs: ["support/evidence/mgmt100/readback.json"],
      unavailableRefs: [],
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
      liveIngestionEnabled: false,
    },
    dataSources: [
      {
        providerKey: "ibkr",
        provider: "IBKR market data",
        status: "read_ok",
        sourceClass: "broker_execution",
        orderCapableProvider: true,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
    ],
    researchStatus: {
      stage: "decide",
      frameworks: ["qlib", "vectorbt", "statsmodels"],
      strategyId: STRATEGY_ID,
      artifactId: "artifact-mgmt100-v1",
      deploymentStage: "paper",
      canDeploy: false,
      summary: "Governed paper review only",
    },
  },
  {
    personaId: "persona-mgmt100-latency",
    persona_id: "persona-mgmt100-latency",
    id: "persona-mgmt100-latency",
    personaName: "MGMT100 Latency Arbiter",
    name: "MGMT100 Latency Arbiter",
    owner: "ops-latency",
    ooda: "Orient",
    autonomy: "manual",
    perfDelta: -0.018,
    humanNeeded: false,
    lastMutation: "2026-06-12",
    state: "researching",
  },
];

const leagueRows = [
  {
    personaId: PERSONA_ID,
    personaName: PERSONA_NAME,
    currentRank: 1,
    previousRank: 2,
    rankDelta: 1,
    tier: "S",
    score: 94.2,
    scoreBreakdown: {
      pnlScore: 88,
      sharpeScore: 90,
      drawdownControlScore: 93,
      executionQualityScore: 91,
      riskComplianceScore: 97,
      improvementScore: 86,
      interventionPenalty: 1,
      hardPenalty: 0,
    },
    pnlToday: 12000,
    pnl7d: 62000,
    pnl30d: 210000,
    pnlQuarter: 620000,
    pnlYtd: 990000,
    sharpe: 2.1,
    maxDrawdown: -0.022,
    winRate: 0.63,
    turnover: 1.4,
    slippageBps: 2.8,
    fillRatio: 0.98,
    orderRejectRate: 0.002,
    riskPolicyViolations: 0,
    humanInterventions: 1,
    sentinelFindings: 1,
    mutationCount: 4,
    improvedMutations: 3,
    degradedMutations: 1,
    status: "active",
    recommendedAction: "promote_to_canary_candidate",
    links: { manageHref: `/management/personas/${PERSONA_ID}`, evidenceHref: "/management/evidence/ev-mgmt100" },
  },
];

const intentRows = [
  {
    id: "trace-mgmt100-001",
    ringPersonaId: `persona:${PERSONA_ID}`,
    ringBearerId: "ringbearer:ops-risk",
    userIntentSummary: "Review risk route adjustment for paper runtime.",
    personaInterpretation: "Keep review in paper and request approval before route mutation.",
    proposedAction: "submit governed route adjustment",
    toolsUsed: ["risk.var-projection"],
    consultedPersonas: ["persona:latency"],
    visibility: "summary",
    redaction: { status: "not_required" },
    evidenceRefs: ["ev-mgmt100-risk"],
    riskFlags: ["paper-only"],
    policyViolations: [],
    createdAt: SNAPSHOT_AT,
  },
];

const humanInbox = [
  {
    id: "human-mgmt100-approval",
    kind: "approval",
    title: "Approve MGMT100 persona route policy change",
    requiredRole: "approver",
    consequenceIfApproved: "Paper route policy is updated",
    consequenceIfRejected: "Persona remains on current route",
    consequenceIfIgnored: "Change expires",
    canDecide: true,
    canProceed: true,
    detailHref: "/management/human-inbox/human-mgmt100-approval",
    ttlSec: 3600,
    links: { manageHref: `/management/personas/${PERSONA_ID}`, evidenceHref: "/management/evidence/ev-mgmt100-risk" },
  },
];

const pulseRows = [
  {
    surface: "paper",
    current: 1.42,
    baselineKind: "previous_artifact",
    baselineValue: 1.31,
    rollbackReady: true,
    killSwitchReady: true,
  },
  {
    surface: "canary",
    current: 1.18,
    baselineKind: "7d_rolling",
    baselineValue: 1.2,
    rollbackReady: true,
    killSwitchReady: true,
  },
  {
    surface: "live",
    current: 1.03,
    baselineKind: "last_review",
    baselineValue: 1.02,
    rollbackReady: true,
    killSwitchReady: true,
  },
];

const portfolioSummary = {
  activeCapitalPools: 1,
  activePersonas: 1,
  activeRuntimes: 1,
  activeStrategies: 1,
  asOf: SNAPSHOT_AT,
  baseCurrency: "USD",
  cvar95: 34_000,
  grossExposure: 620_000,
  highestRiskPoolId: CAPITAL_POOL_ID,
  largestExposurePct: 0.055,
  largestExposureSymbol: "SPY",
  leverage: 0.62,
  netExposure: 180_000,
  pnl7d: 62_000,
  pnl30d: 210_000,
  pnlToday: 12_000,
  realizedPnl: 4_000,
  totalCash: 380_000,
  totalNav: 1_000_000,
  unrealizedPnl: 28_000,
  var95: 21_000,
};

const portfolioPools = [
  {
    activePersonas: 1,
    activeRuntimes: 1,
    activeStrategies: 1,
    capitalPoolId: CAPITAL_POOL_ID,
    capitalPoolName: "MGMT100 Core Pool",
    cash: 380_000,
    currency: "USD",
    drawdown: -0.018,
    grossExposure: 620_000,
    leverage: 0.62,
    links: { manageHref: `/management/capital/${CAPITAL_POOL_ID}` },
    nav: 1_000_000,
    netExposure: 180_000,
    pnl7d: 62_000,
    pnl30d: 210_000,
    pnlToday: 12_000,
    riskBudgetPct: 0.42,
    status: "ok",
    utilizationPct: 0.41,
  },
];

const portfolioHoldings = [
  {
    assetClass: "fund",
    avgPrice: 545,
    capitalPoolId: CAPITAL_POOL_ID,
    currency: "USD",
    exposurePct: 0.055,
    holdingId: "holding-mgmt100-spy",
    links: { manageHref: `/management/capital/${CAPITAL_POOL_ID}` },
    markPrice: 550,
    marketValue: 55_000,
    notional: 55_000,
    personaId: PERSONA_ID,
    pnlPct: 0.009,
    quantity: 100,
    realizedPnl: 0,
    runtimeId: RUNTIME_ID,
    side: "long",
    strategyId: STRATEGY_ID,
    symbol: "SPY",
    unrealizedPnl: 500,
    updatedAt: SNAPSHOT_AT,
    weightPct: 0.055,
  },
];

const rankingBlocks = [
  {
    kind: "persona",
    label: "Persona",
    rows: [
      {
        subjectId: PERSONA_ID,
        subjectLabel: PERSONA_NAME,
        metric: "sharpe",
        metricValue: "2.10",
        links: { manageHref: `/management/personas/${PERSONA_ID}` },
      },
    ],
  },
];

const quarterlyFormula = {
  activeFrom: "2026-04-01",
  formulaId: "formula-mgmt100",
  hardPenalties: {
    capitalBreach: 15,
    missingEvidence: 3,
    riskPolicyViolation: 5,
    unresolvedCriticalIncident: 10,
  },
  minDataRequirements: {
    minCanaryDays: 10,
    minPaperDays: 10,
    minTrades: 200,
    minTradingDays: 45,
  },
  version: "1.0.0",
  weights: {
    drawdownControl: 0.15,
    executionQuality: 0.15,
    humanInterventionPenalty: 0.05,
    improvement: 0.05,
    pnl: 0.25,
    riskCompliance: 0.15,
    sharpe: 0.2,
  },
};

const quarterlyRows = [
  {
    currentRank: 1,
    eligibility: "eligible",
    evidenceRefs: ["ev-q2-mgmt100-risk"],
    executionQualityScore: 91,
    humanInterventionPenalty: 1,
    links: { evidenceHref: "/management/evidence/ev-q2-mgmt100-risk", manageHref: `/management/personas/${PERSONA_ID}` },
    maxDrawdownQuarter: -0.022,
    personaId: PERSONA_ID,
    personaName: PERSONA_NAME,
    pnlQuarter: 620_000,
    previousQuarterRank: 2,
    quarter: "2026-Q2",
    rankDelta: 1,
    recommendation: "promote_to_canary_candidate",
    riskComplianceScore: 97,
    score: 94.2,
    scoreBreakdown: {
      drawdownControlScore: 93,
      executionQualityScore: 91,
      hardPenalty: 0,
      humanInterventionPenalty: 1,
      improvementScore: 86,
      pnlScore: 88,
      riskComplianceScore: 97,
      sharpeScore: 90,
    },
    sharpeQuarter: 2.1,
    tier: "S",
  },
];

const performanceRows = [
  {
    dimension: "persona",
    drawdownContributionPct: 0.18,
    evidenceRefs: ["ev-attr-mgmt100-risk"],
    key: PERSONA_ID,
    label: PERSONA_NAME,
    links: { manageHref: `/management/personas/${PERSONA_ID}` },
    pnlContribution: 210_000,
    pnlContributionPct: 0.42,
    riskContributionPct: 0.24,
    slippageContributionBps: 1.4,
    turnoverContributionPct: 0.12,
  },
  {
    dimension: "strategy",
    drawdownContributionPct: 0.12,
    evidenceRefs: ["ev-attr-mgmt100-strategy"],
    key: STRATEGY_ID,
    label: "MGMT100 Momentum",
    links: { manageHref: `/management/strategies/${STRATEGY_ID}` },
    pnlContribution: 124_000,
    pnlContributionPct: 0.25,
    riskContributionPct: 0.16,
    slippageContributionBps: 1.1,
    turnoverContributionPct: 0.1,
  },
];

const loopRecord = {
  id: LOOP_ID,
  loop_run_id: LOOP_ID,
  title: "MGMT100 execution loop",
  loop_family: "execution",
  status: "running",
  severity: "warning",
  runtime_id: RUNTIME_ID,
  binding_id: "binding-mgmt100",
  capital_pool_id: CAPITAL_POOL_ID,
  started_at: SNAPSHOT_AT,
};

const sentinelFinding = {
  id: FINDING_ID,
  finding_id: FINDING_ID,
  title: "MGMT100 persona risk drift",
  summary: "Risk score drifted below paper guardrail.",
  status: "open",
  severity: "warning",
  runtime_id: RUNTIME_ID,
  persona_ids: [PERSONA_ID],
  evidence_refs: [{ ref_id: "ev-mgmt100-risk", redacted: true }],
};

const intervention = {
  id: INTERVENTION_ID,
  intervention_id: INTERVENTION_ID,
  kind: "risk_breach",
  target_type: "persona",
  target_id: PERSONA_ID,
  title: "MGMT100 pause route review",
  status: "pending_approval",
  severity: "warning",
  finding_id: FINDING_ID,
  risk_level: "high",
  requested_by: "ops-risk",
  remediation_skeleton: {
    two_man_rule_enforced: true,
    remediation_actions_available: ["restrict_tools", "run_eval"],
  },
};

const runtimeRow = {
  cpu: 0.32,
  env: "paper",
  id: RUNTIME_ID,
  kind: "executor",
  latencyP95Ms: 84,
  memory: 0.46,
  name: "mgmt100-paper-runtime",
  persona_id: PERSONA_ID,
  region: "us-east-1",
  runtime_id: RUNTIME_ID,
  status: "running",
  updatedAt: SNAPSHOT_AT,
  uptimePct: 99.95,
};

const readiness = {
  blockers: [
    {
      id: "blocker-mgmt100-operator",
      linkedEvidence: ["packet-mgmt100-readback"],
      nextAction: "Open Human Gate",
      reason: "Operator review remains pending for live transition.",
      requiredRole: "operator",
      severity: "medium",
    },
  ],
  checklist: [
    {
      blocking: true,
      description: "Readback fixture is available for the management/persona flow gate.",
      evidenceAttached: true,
      evidenceRequired: true,
      id: "readback",
      label: "Readback present",
      ownerRole: "operator",
      status: "pass",
    },
    {
      blocking: true,
      description: "Fixture asserts dry-run only and no live-capital side effects.",
      evidenceAttached: true,
      evidenceRequired: true,
      id: "side-effects",
      label: "Live side effects disabled",
      ownerRole: "risk-owner",
      status: "pass",
    },
    {
      blocking: true,
      description: "Operator review is deliberately visible as a pending management action.",
      evidenceAttached: false,
      evidenceRequired: true,
      id: "operator-review",
      label: "Operator review recorded",
      ownerRole: "operator",
      status: "pending",
    },
  ],
  header: {
    canProceed: false,
    environment: "paper",
    lastUpdated: SNAPSHOT_AT,
    primaryBlocker: "Operator review remains pending for live transition.",
    score: 67,
    status: "pending",
    title: "MGMT100 readiness",
  },
  packets: [
    {
      createdAt: SNAPSHOT_AT,
      hash: "0xmgmt100readback",
      href: "/management/evidence/packet-mgmt100-readback",
      id: "packet-mgmt100-readback",
      linkedObject: `persona:${PERSONA_ID}`,
      packetType: "ManagementPersonaFlowReadback",
      status: "verified",
    },
  ],
};

function managementFleetEnvelope(path: string): JsonRecord {
  return {
    data: {
      execution_boundary: {
        approved_artifacts_only: true,
        human_gate_required_for_capital_changes: true,
        live_capital_side_effects: false,
      },
      items: fleetRows,
      persona_fleet: fleetRows,
    },
    items: fleetRows,
    meta: envelope(fleetRows, path).meta,
    summary: { total_personas: fleetRows.length, healthy_personas: 1 },
  };
}

function managementDataSourcesEnvelope(path: string): JsonRecord {
  const rows = [
    {
      connector_id: "ibkr",
      provider: "IBKR market data",
      kind: "broker_execution",
      health: "read_ok",
      universe: ["US", "TW"],
      last_heartbeat_at: SNAPSHOT_AT,
      credential_state: "configured",
      read_only: true,
      live_ingestion_enabled: false,
      order_capable_provider: true,
      order_side_effects_allowed: false,
      capital_side_effects_allowed: false,
      consumer_persona_ids: [PERSONA_ID],
      consumer_persona_names: [PERSONA_NAME],
      evidence_refs: ["support/evidence/mgmt100/readback.json"],
    },
  ];
  return {
    data: { items: rows },
    items: rows,
    meta: envelope(rows, path, {
      surfaces: {
        data_sources: { source: "playwright_bff_fixture", status: "ok" },
      },
    }).meta,
    page_info: { page_size: rows.length, total: rows.length, totalCountExact: true },
  };
}

function cockpitModel(): JsonRecord {
  return {
    anomalies: [],
    loopFlow: {
      edges: [
        { from: "research-observe", to: "research-orient", severity: "ok" },
        { from: "research-orient", to: "research-decide", severity: "ok" },
        { from: "research-decide", to: "execution-act", severity: "warn" },
        { from: "execution-act", to: "execution-learn", severity: "ok" },
      ],
      nodes: [
        { id: "research-observe", label: "Research Observe", loop: "research", severity: "ok", href: "/management/persona-intent" },
        { id: "research-orient", label: "Research Orient", loop: "research", severity: "ok", href: "/management/persona-fleet" },
        { id: "research-decide", label: "Research Decide", loop: "research", severity: "warn", href: "/management/human-inbox" },
        { id: "execution-act", label: "Execution Act", loop: "execution", severity: "warn", href: "/management/control-room" },
        { id: "execution-learn", label: "Execution Learn", loop: "execution", severity: "ok", href: "/management/evolution-journal" },
      ],
    },
    matrix: {
      cells: oodaPhases.map((phase) => ({
        href: phase === "Decide" ? `/management/personas/${PERSONA_ID}` : null,
        personaId: PERSONA_ID,
        phase,
        state: phase === "Decide" ? "active" : "idle",
      })),
      personas: [PERSONA_ID],
      phases: oodaPhases,
    },
    strip: {
      fields: [
        { key: "autonomy", label: "Autonomy", value: "supervised", tone: "ok", href: "/management/governance" },
        { key: "humanPending", label: "Human pending", value: 1, tone: "warn", href: "/management/human-inbox" },
        { key: "critical", label: "Critical findings", value: 0, tone: "ok", href: "/management/sentinel" },
        { key: "owners", label: "Persona owners", value: 2, href: "/management/personas" },
        { key: "personas", label: "Personas", value: fleetRows.length, href: "/management/persona-fleet" },
        { key: "broker", label: "Broker live", value: "ready", tone: "ok", href: "/management/readiness/broker-live" },
        { key: "capital", label: "Capital bound", value: "paper", tone: "warn", href: "/management/readiness/capital-binding-live" },
        { key: "strict", label: "Strict publish", value: "ok", tone: "ok", href: "/management/readiness/strict-publish" },
        { key: "bffHa", label: "BFF HA", value: "ok", tone: "ok", href: "/management/readiness/bff-ha" },
      ],
    },
  };
}

function responseFor(method: string, path: string, body: unknown): { body: unknown; status: number } {
  const pathname = path.split("?")[0];

  if (pathname === "/bff/events/stream") {
    return { status: 200, body: ": connected\n\n" };
  }
  if (pathname === "/health" || pathname === "/bff/health" || pathname === "/api/health") {
    return { status: 200, body: envelope({ status: "ok" }, path) };
  }
  if (pathname === "/bff/me") {
    return {
      status: 200,
      body: envelope({
        user: {
          id: "op-mgmt100",
          displayName: "MGMT100 Operator",
          email: "op-mgmt100@pantheon.local",
        },
        tenant: {
          id: "tenant-mgmt100",
          name: "MGMT100 Tenant",
          tz: "UTC",
          locale: "zh-TW",
          baseCurrency: "USD",
        },
        roles: ["ops", "viewer"],
        capabilities: ["persona.view", "persona.manage", "risk.read"],
        env: "dev",
        featureFlags: { managementPersona100: true },
        serverTime: SNAPSHOT_AT,
        sessionExpiresAt: "2026-05-13T22:10:00Z",
        permissionsVersion: "mgmt100-v1",
        environment: { name: "playwright", strict_auth: false },
        permissions: ["persona.view", "persona.manage", "risk.read"],
        tenant_id: "tenant-mgmt100",
        current_user: { id: "op-mgmt100", roles: ["operator", "reviewer", "approver"] },
      }, path),
    };
  }
  if (pathname === "/bff/management/cockpit") {
    return {
      status: 200,
      body: envelope(cockpitModel(), path),
    };
  }
  if (pathname === "/bff/management/persona-fleet") {
    return { status: 200, body: managementFleetEnvelope(path) };
  }
  if (pathname === "/bff/management/data-sources") {
    return { status: 200, body: managementDataSourcesEnvelope(path) };
  }
  if (pathname === "/bff/management/human-inbox") {
    return { status: 200, body: envelope(humanInbox, path) };
  }
  if (pathname.startsWith("/bff/management/human-inbox/")) {
    return { status: 200, body: envelope({ ...humanInbox[0], body: "Human gate detail" }, path) };
  }
  if (pathname === "/bff/management/trading-pulse") {
    return { status: 200, body: envelope(pulseRows, path) };
  }
  if (pathname === "/bff/management/trading-pulse/rankings") {
    return { status: 200, body: envelope(rankingBlocks, path) };
  }
  if (pathname === "/bff/management/evolution-journal") {
    return {
      status: 200,
      body: envelope([
        { id: "ev-mgmt100", mutation: "Restrict route tools", before: 1.1, after: 1.2, verdict: "improved", landedAt: "2026-06-13" },
      ], path),
    };
  }
  if (pathname === "/bff/management/evidence") {
    return {
      status: 200,
      body: envelope([
        { id: "ev-mgmt100-risk", title: "MGMT100 redacted risk evidence", kind: "metric", redacted: true },
      ], path),
    };
  }
  if (pathname === "/bff/management/persona-intent") {
    return { status: 200, body: envelope(intentRows, path) };
  }
  if (pathname === "/bff/management/portfolio-book") {
    return {
      status: 200,
      body: envelope(portfolioSummary, path),
    };
  }
  if (pathname === "/bff/management/portfolio-book/pools") {
    return {
      status: 200,
      body: envelope(portfolioPools, path),
    };
  }
  if (pathname === "/bff/management/portfolio-book/holdings") {
    return {
      status: 200,
      body: envelope(portfolioHoldings, path),
    };
  }
  if (pathname === "/bff/management/persona-league" || pathname === "/bff/persona-league" || pathname === "/bff/management/persona-league/rankings") {
    return { status: 200, body: envelope(leagueRows, path) };
  }
  if (pathname === "/bff/management/persona-league/tiers") {
    return { status: 200, body: envelope({ S: 1, A: 0, B: 0, C: 0, D: 0, watch: 0, suspended: 0 }, path) };
  }
  if (pathname.startsWith("/bff/management/persona-league/") || pathname.startsWith("/bff/persona-league/")) {
    return { status: 200, body: envelope(leagueRows[0], path) };
  }
  if (pathname === "/bff/management/quarterly-ranking" || pathname === "/bff/management/quarterly-ranking/recommendations") {
    return {
      status: 200,
      body: envelope(quarterlyRows, path),
    };
  }
  if (pathname === "/bff/management/quarterly-ranking/formula") {
    return { status: 200, body: envelope(quarterlyFormula, path) };
  }
  if (pathname === "/bff/management/performance-attribution") {
    return {
      status: 200,
      body: envelope(performanceRows, path),
    };
  }
  if (pathname.startsWith("/bff/management/readiness/")) {
    return { status: 200, body: envelope(readiness, path) };
  }
  if (pathname === "/bff/v5/control-room") {
    return {
      status: 200,
      body: {
        data: {
          interventions: { items: [intervention], meta: { snapshot_at: SNAPSHOT_AT } },
          kpis: { active_loops: 1, open_findings: 1, pending_interventions: 1 },
          loops: { items: [loopRecord], meta: { snapshot_at: SNAPSHOT_AT } },
          sentinel: { items: [sentinelFinding], meta: { snapshot_at: SNAPSHOT_AT } },
        },
        meta: envelope({}, path).meta,
      },
    };
  }
  if (pathname === "/bff/v5/execution/persona-health") {
    return {
      status: 200,
      body: envelope([
        {
          persona_id: PERSONA_ID,
          personaId: PERSONA_ID,
          name: PERSONA_NAME,
          mode: "paper",
          status: "degraded",
          health: "degraded",
          score: 72,
          routedStrategies: 3,
          openFindings: 1,
          sentinel_finding_id: FINDING_ID,
        },
      ], path),
    };
  }
  if (pathname === "/bff/v5/execution/strategy-health") {
    return { status: 200, body: envelope([{ strategyId: STRATEGY_ID, health: "healthy", score: 88 }], path) };
  }
  if (pathname === "/bff/v5/loop-runs") {
    return { status: 200, body: envelope([loopRecord], path) };
  }
  if (pathname === `/bff/v5/loop-runs/${LOOP_ID}`) {
    return { status: 200, body: envelope(loopRecord, path) };
  }
  if (pathname === "/bff/v5/sentinel/findings") {
    return { status: 200, body: envelope([sentinelFinding], path) };
  }
  if (pathname === `/bff/v5/sentinel/findings/${FINDING_ID}`) {
    return { status: 200, body: envelope(sentinelFinding, path) };
  }
  if (pathname === "/bff/v5/interventions") {
    return { status: 200, body: envelope([intervention], path) };
  }
  if (pathname === `/bff/v5/interventions/${INTERVENTION_ID}`) {
    return { status: 200, body: envelope(intervention, path) };
  }
  if (pathname === "/bff/personas") {
    if (method === "POST") {
      return { status: 201, body: envelope({ ...persona, ...(body as JsonRecord | undefined) }, path) };
    }
    return { status: 200, body: envelope([persona], path) };
  }
  if (pathname === `/bff/personas/${PERSONA_ID}`) {
    if (method === "PATCH") {
      return { status: 200, body: envelope({ ...persona, ...(body as JsonRecord | undefined) }, path) };
    }
    return { status: 200, body: envelope(persona, path) };
  }
  if (pathname === `/bff/personas/${PERSONA_ID}/memory`) {
    return { status: 200, body: envelope([{ id: "mem-mgmt100", persona_id: PERSONA_ID, summary: "feedback writeback" }], path) };
  }
  if (pathname === `/bff/personas/${PERSONA_ID}/evaluations`) {
    return { status: 200, body: envelope([{ id: "eval-mgmt100", persona_id: PERSONA_ID, score: 0.84 }], path) };
  }
  if (pathname === `/bff/personas/${PERSONA_ID}/route-policy`) {
    return { status: 200, body: envelope({ persona_id: PERSONA_ID, policy_id: "route-policy-mgmt100" }, path) };
  }
  if (pathname === `/bff/personas/${PERSONA_ID}/activity` || pathname === `/bff/personas/${PERSONA_ID}/audit`) {
    return { status: 200, body: envelope([{ id: "audit-mgmt100", action: "persona.view", target: PERSONA_ID }], path) };
  }
  if (pathname === `/bff/personas/${PERSONA_ID}/test-prompt`) {
    return { status: 202, body: envelope({ persona_id: PERSONA_ID, prompt: (body as JsonRecord | undefined)?.prompt ?? "" }, path) };
  }
  if (pathname === "/bff/capital-pools") {
    return {
      status: 200,
      body: envelope([{
        id: CAPITAL_POOL_ID,
        name: "MGMT100 Core Pool",
        owner: "operator-mgmt100",
        risk: "medium",
        state: "deployed",
        status: "active",
        updatedAt: SNAPSHOT_AT,
        allocated: 1_000_000,
        currency: "USD",
        riskBudget: 0.04,
        utilized: 420_000,
      }], path),
    };
  }
  if (pathname === "/bff/rebalances") {
    return {
      status: 200,
      body: envelope([{
        id: "rebalance-mgmt100-q2",
        name: "MGMT100 Q2 Rebalance",
        owner: "operator-mgmt100",
        quarter: "2026-Q2",
        risk: "medium",
        state: "review",
        targetPoolId: CAPITAL_POOL_ID,
        proposedDelta: 0.06,
        updatedAt: SNAPSHOT_AT,
      }], path),
    };
  }
  if (pathname === "/bff/ranking-formulas") {
    return {
      status: 200,
      body: envelope([{
        id: quarterlyFormula.formulaId,
        name: "MGMT100 Ranking Formula",
        owner: "operator-mgmt100",
        risk: "low",
        state: "deployed",
        updatedAt: SNAPSHOT_AT,
        expression: "0.25*pnl + 0.15*drawdown + 0.15*execution",
        appliedTo: 2,
      }], path),
    };
  }
  if (pathname === "/bff/runtimes") {
    return { status: 200, body: envelope([runtimeRow], path) };
  }
  if (pathname === `/bff/runtimes/${RUNTIME_ID}`) {
    return { status: 200, body: envelope(runtimeRow, path) };
  }
  if (pathname === "/bff/alerts") {
    return { status: 200, body: envelope([{ id: ALERT_ID, title: "MGMT100 risk alert", severity: "warning" }], path) };
  }
  if (pathname === "/bff/approvals") {
    return { status: 200, body: envelope([{ id: APPROVAL_ID, status: "pending", target_id: PERSONA_ID }], path) };
  }
  if (pathname === "/bff/audit") {
    return { status: 200, body: envelope([{ id: "audit-mgmt100", action: "persona.feedback", target_ref: PERSONA_ID }], path) };
  }
  if (pathname === "/bff/agora/signals") {
    return { status: 200, body: envelope([{ id: SIGNAL_ID, title: "MGMT100 signal", persona_id: PERSONA_ID }], path) };
  }
  if (pathname === `/bff/agora/signals/${SIGNAL_ID}/feedback`) {
    return {
      status: 202,
      body: envelope({
        auditEntry: { action: "signal.feedback", targetRef: SIGNAL_ID },
        decision: (body as JsonRecord | undefined)?.decision ?? "agree",
        feedbackId: "feedback-mgmt100",
        signalId: SIGNAL_ID,
      }, path),
    };
  }
  if (pathname === "/bff/agora/feedback") {
    return { status: 202, body: envelope({ feedbackId: "agora-feedback-mgmt100", target: PERSONA_ID }, path) };
  }
  if (pathname === "/bff/agora/journal") {
    return { status: 201, body: envelope({ id: "journal-mgmt100", title: "MGMT100 journal" }, path) };
  }
  if (pathname === "/bff/management/nl/ask") {
    return {
      status: 200,
      body: envelope({
        answer: "MGMT100 management answer",
        durable: true,
        provider: "fixture",
        summary: `Read-only answer for ${PERSONA_NAME}`,
        trace_id: "trace-mgmt100-nl",
      }, path),
    };
  }
  if (pathname.startsWith("/bff/assistant/tools/")) {
    return { status: pathname.endsWith("/execute") ? 201 : 200, body: commandResponse("AssistantToolContract", PERSONA_ID, path) };
  }
  if (pathname.startsWith("/bff/actions/persona/")) {
    const action = pathname.split("/").pop() ?? "persona_action";
    return { status: 202, body: commandResponse(action, PERSONA_ID, path) };
  }
  if (pathname.startsWith(`/bff/v5/interventions/${INTERVENTION_ID}/`)) {
    const action = pathname.split("/").pop() ?? "intervention_action";
    return { status: 202, body: commandResponse(action, INTERVENTION_ID, path) };
  }
  if (pathname === "/bff/v5/interventions/batch-decide") {
    return { status: 202, body: commandResponse("batch_decide", INTERVENTION_ID, path) };
  }
  if (pathname === `/bff/approvals/${APPROVAL_ID}/decide` || pathname === "/bff/approvals/batch-decide") {
    return { status: 202, body: commandResponse("approval_decide", APPROVAL_ID, path) };
  }
  if (pathname === `/bff/alerts/${ALERT_ID}/acknowledge` || pathname === `/bff/alerts/${ALERT_ID}/escalate-incident`) {
    return { status: 202, body: commandResponse("alert_action", ALERT_ID, path) };
  }
  if (pathname.startsWith(`/bff/incidents/${INCIDENT_ID}/`)) {
    return { status: 202, body: commandResponse("incident_action", INCIDENT_ID, path) };
  }

  return { status: method === "GET" ? 200 : 202, body: envelope({ ok: true, path }, path) };
}

async function installBffFixture(page: Page, hits: BffHit[]): Promise<void> {
  await page.route(/^https?:\/\/[^/]+\/(?:(?:bff|api)\/|health(?:\?|$))/, async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = pathWithQuery(url);

    if (method === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders(route), status: 204 });
      return;
    }

    const body = await readJson(route);
    hits.push({
      body,
      idempotencyKey: request.headers()["idempotency-key"],
      method,
      path,
    });

    if (url.pathname === "/bff/events/stream") {
      await route.fulfill({
        body: ": connected\n\n",
        contentType: "text/event-stream",
        headers: corsHeaders(route),
        status: 200,
      });
      return;
    }

    const response = responseFor(method, path, body);
    await fulfillJson(route, response.status, response.body);
  });
}

const uiFlows: UiFlow[] = [
  { id: "ui-001-cockpit", type: "ui", category: "display", path: "/management/cockpit", endpoint: "/bff/management/cockpit" },
  { id: "ui-002-persona-fleet", type: "ui", category: "display", path: "/management/persona-fleet", endpoint: "/bff/management/persona-fleet", text: PERSONA_NAME },
  { id: "ui-003-data-sources", type: "ui", category: "monitor", path: "/management/data-sources", endpoint: "/bff/management/data-sources", text: "IBKR" },
  { id: "ui-004-human-inbox", type: "ui", category: "monitor", path: "/management/human-inbox", endpoint: "/bff/management/human-inbox", text: "MGMT100" },
  { id: "ui-005-trading-pulse", type: "ui", category: "monitor", path: "/management/trading-pulse", endpoint: "/bff/management/trading-pulse" },
  { id: "ui-006-evolution-journal", type: "ui", category: "monitor", path: "/management/evolution-journal", endpoint: "/bff/management/evolution-journal", text: "Restrict route tools" },
  { id: "ui-007-evidence", type: "ui", category: "display", path: "/management/evidence", endpoint: "/bff/management/evidence", text: "ev-mgmt100-risk" },
  { id: "ui-008-persona-intent", type: "ui", category: "display", path: "/management/persona-intent", endpoint: "/bff/management/persona-intent", text: "trace-mgmt100-001" },
  { id: "ui-009-persona-league", type: "ui", category: "display", path: "/management/persona-league", endpoint: "/bff/management/persona-league", text: PERSONA_NAME },
  { id: "ui-010-portfolio-book", type: "ui", category: "display", path: "/management/portfolio-book", endpoint: "/bff/management/portfolio-book" },
  { id: "ui-011-quarterly-ranking", type: "ui", category: "display", path: "/management/quarterly-ranking", endpoint: "/bff/management/quarterly-ranking" },
  { id: "ui-012-performance-attribution", type: "ui", category: "display", path: "/management/performance-attribution", endpoint: "/bff/management/performance-attribution" },
  { id: "ui-013-promotion-paper", type: "ui", category: "monitor", path: "/management/promotion-allocation?tab=paper-candidates", endpoint: "/bff/management/quarterly-ranking" },
  { id: "ui-014-promotion-real", type: "ui", category: "monitor", path: "/management/promotion-allocation?tab=real-ranking", endpoint: "/bff/management/persona-league", text: PERSONA_NAME },
  { id: "ui-015-quarterly-capital", type: "ui", category: "monitor", path: "/management/promotion-allocation?tab=quarterly-capital", endpoint: "/bff/capital-pools", text: "MGMT100 Core Pool" },
  { id: "ui-016-formula-policy", type: "ui", category: "monitor", path: "/management/promotion-allocation?tab=formula-policy", endpoint: "/bff/ranking-formulas", text: "MGMT100 Ranking Formula" },
  { id: "ui-017-formula-policy-detail", type: "ui", category: "monitor", path: `/management/promotion-allocation?tab=formula-policy&formula_id=${quarterlyFormula.formulaId}`, endpoint: "/bff/ranking-formulas", text: "MGMT100 Ranking Formula" },
  { id: "ui-018-deployment-alias", type: "ui", category: "monitor", path: "/management/deployment", endpoint: "/bff/deployments" },
  { id: "ui-019-execution-loop", type: "ui", category: "monitor", path: "/management/loops/execution", endpoint: "/bff/v5/loop-runs" },
  { id: "ui-020-sentinel", type: "ui", category: "monitor", path: "/management/sentinel", endpoint: "/bff/v5/sentinel/findings" },
  { id: "ui-021-interventions", type: "ui", category: "monitor", path: "/management/interventions", endpoint: "/bff/v5/interventions" },
  { id: "ui-022-personas-list", type: "ui", category: "display", path: "/management/personas", endpoint: "/bff/personas", text: PERSONA_NAME },
  { id: "ui-023-persona-detail", type: "ui", category: "display", path: `/management/personas/${PERSONA_ID}`, endpoint: `/bff/personas/${PERSONA_ID}`, text: PERSONA_NAME },
  { id: "ui-024-persona-onboarding", type: "ui", category: "adjust", path: `/management/personas/${PERSONA_ID}/onboarding`, endpoint: `/bff/personas/${PERSONA_ID}` },
  { id: "ui-025-runtimes", type: "ui", category: "monitor", path: "/management/runtimes", endpoint: "/bff/runtimes" },
];

const fetchFlows: FetchFlow[] = [
  { id: "fetch-026-me", type: "fetch", category: "display", method: "GET", path: "/bff/me" },
  { id: "fetch-027-persona-fleet", type: "fetch", category: "display", method: "GET", path: "/bff/management/persona-fleet" },
  { id: "fetch-028-cockpit", type: "fetch", category: "display", method: "GET", path: "/bff/management/cockpit" },
  { id: "fetch-029-league", type: "fetch", category: "display", method: "GET", path: "/bff/management/persona-league" },
  { id: "fetch-030-league-alias", type: "fetch", category: "display", method: "GET", path: "/bff/persona-league" },
  { id: "fetch-031-persona-intent", type: "fetch", category: "display", method: "GET", path: "/bff/management/persona-intent" },
  { id: "fetch-032-trading-pulse", type: "fetch", category: "display", method: "GET", path: "/bff/management/trading-pulse" },
  { id: "fetch-033-human-inbox", type: "fetch", category: "display", method: "GET", path: "/bff/management/human-inbox" },
  { id: "fetch-034-evidence", type: "fetch", category: "display", method: "GET", path: "/bff/management/evidence" },
  { id: "fetch-035-evolution", type: "fetch", category: "display", method: "GET", path: "/bff/management/evolution-journal" },
  { id: "fetch-036-portfolio", type: "fetch", category: "display", method: "GET", path: "/bff/management/portfolio-book" },
  { id: "fetch-037-portfolio-pools", type: "fetch", category: "display", method: "GET", path: "/bff/management/portfolio-book/pools" },
  { id: "fetch-038-portfolio-holdings", type: "fetch", category: "display", method: "GET", path: "/bff/management/portfolio-book/holdings" },
  { id: "fetch-039-quarterly", type: "fetch", category: "display", method: "GET", path: "/bff/management/quarterly-ranking?quarter=2026Q2" },
  { id: "fetch-040-attribution", type: "fetch", category: "display", method: "GET", path: "/bff/management/performance-attribution?dimension=persona&period=30d" },
  { id: "fetch-041-control-room", type: "fetch", category: "monitor", method: "GET", path: "/bff/v5/control-room" },
  { id: "fetch-042-persona-health", type: "fetch", category: "monitor", method: "GET", path: "/bff/v5/execution/persona-health" },
  { id: "fetch-043-strategy-health", type: "fetch", category: "monitor", method: "GET", path: "/bff/v5/execution/strategy-health" },
  { id: "fetch-044-loop-runs", type: "fetch", category: "monitor", method: "GET", path: "/bff/v5/loop-runs" },
  { id: "fetch-045-sentinel", type: "fetch", category: "monitor", method: "GET", path: "/bff/v5/sentinel/findings" },
  { id: "fetch-046-interventions", type: "fetch", category: "monitor", method: "GET", path: "/bff/v5/interventions" },
  { id: "fetch-047-personas", type: "fetch", category: "display", method: "GET", path: "/bff/personas" },
  { id: "fetch-048-persona-detail", type: "fetch", category: "display", method: "GET", path: `/bff/personas/${PERSONA_ID}` },
  { id: "fetch-049-persona-memory", type: "fetch", category: "display", method: "GET", path: `/bff/personas/${PERSONA_ID}/memory` },
  { id: "fetch-050-persona-evaluations", type: "fetch", category: "display", method: "GET", path: `/bff/personas/${PERSONA_ID}/evaluations` },
  { id: "fetch-051-fleet-filter", type: "fetch", category: "monitor", method: "GET", path: "/bff/management/persona-fleet?health=degraded&page_size=1" },
  { id: "fetch-052-intent-filter", type: "fetch", category: "monitor", method: "GET", path: `/bff/management/persona-intent?persona_id=${PERSONA_ID}&status=active` },
  { id: "fetch-053-rankings", type: "fetch", category: "monitor", method: "GET", path: "/bff/management/trading-pulse/rankings" },
  { id: "fetch-054-league-rankings", type: "fetch", category: "monitor", method: "GET", path: "/bff/management/persona-league/rankings" },
  { id: "fetch-055-league-tiers", type: "fetch", category: "monitor", method: "GET", path: "/bff/management/persona-league/tiers" },
  { id: "fetch-056-ranking-formula", type: "fetch", category: "monitor", method: "GET", path: "/bff/management/quarterly-ranking/formula" },
  { id: "fetch-057-ranking-recommendations", type: "fetch", category: "monitor", method: "GET", path: "/bff/management/quarterly-ranking/recommendations?quarter=2026Q2" },
  { id: "fetch-058-intervention-detail", type: "fetch", category: "monitor", method: "GET", path: `/bff/v5/interventions/${INTERVENTION_ID}` },
  { id: "fetch-059-loop-detail", type: "fetch", category: "monitor", method: "GET", path: `/bff/v5/loop-runs/${LOOP_ID}` },
  { id: "fetch-060-finding-detail", type: "fetch", category: "monitor", method: "GET", path: `/bff/v5/sentinel/findings/${FINDING_ID}` },
  { id: "fetch-061-runtimes", type: "fetch", category: "monitor", method: "GET", path: "/bff/runtimes" },
  { id: "fetch-062-runtime-detail", type: "fetch", category: "monitor", method: "GET", path: `/bff/runtimes/${RUNTIME_ID}` },
  { id: "fetch-063-alerts", type: "fetch", category: "monitor", method: "GET", path: "/bff/alerts" },
  { id: "fetch-064-approvals", type: "fetch", category: "monitor", method: "GET", path: "/bff/approvals" },
  { id: "fetch-065-audit", type: "fetch", category: "monitor", method: "GET", path: `/bff/audit?target_ref=${PERSONA_ID}` },
  { id: "fetch-066-route-policy", type: "fetch", category: "display", method: "GET", path: `/bff/personas/${PERSONA_ID}/route-policy` },
  { id: "fetch-067-activity", type: "fetch", category: "monitor", method: "GET", path: `/bff/personas/${PERSONA_ID}/activity` },
  { id: "fetch-068-persona-audit", type: "fetch", category: "monitor", method: "GET", path: `/bff/personas/${PERSONA_ID}/audit` },
  { id: "fetch-069-capital-pools", type: "fetch", category: "display", method: "GET", path: "/bff/capital-pools" },
  { id: "fetch-070-agora-signals", type: "fetch", category: "display", method: "GET", path: "/bff/agora/signals" },
  { id: "fetch-071-restrict-tools", type: "fetch", category: "adjust", method: "POST", path: `/bff/actions/persona/${PERSONA_ID}/restrict_tools`, body: { memo: "100-flow restrict tools preview" } },
  { id: "fetch-072-suspend", type: "fetch", category: "adjust", method: "POST", path: `/bff/actions/persona/${PERSONA_ID}/suspend`, body: { memo: "100-flow suspend dry-run" } },
  { id: "fetch-073-run-eval", type: "fetch", category: "adjust", method: "POST", path: `/bff/actions/persona/${PERSONA_ID}/run_eval`, body: { memo: "100-flow eval" } },
  { id: "fetch-074-route-policy-mutate", type: "fetch", category: "adjust", method: "POST", path: `/bff/actions/persona/${PERSONA_ID}/mutate_persona_route_policy`, body: { policy_id: "route-policy-mgmt100-next" } },
  { id: "fetch-075-freeze", type: "fetch", category: "adjust", method: "POST", path: `/bff/actions/persona/${PERSONA_ID}/freeze`, body: { memo: "paper freeze review" } },
  { id: "fetch-076-test-prompt", type: "fetch", category: "feedback", method: "POST", path: `/bff/personas/${PERSONA_ID}/test-prompt`, body: { prompt: "Explain current paper risk drift." } },
  { id: "fetch-077-patch-persona", type: "fetch", category: "adjust", method: "PATCH", path: `/bff/personas/${PERSONA_ID}`, body: { description: "100-flow adjustment validation" } },
  { id: "fetch-078-claim-intervention", type: "fetch", category: "adjust", method: "POST", path: `/bff/v5/interventions/${INTERVENTION_ID}/claim`, body: { memo: "claim" } },
  { id: "fetch-079-release-intervention", type: "fetch", category: "adjust", method: "POST", path: `/bff/v5/interventions/${INTERVENTION_ID}/release`, body: { memo: "release" } },
  { id: "fetch-080-escalate-intervention", type: "fetch", category: "adjust", method: "POST", path: `/bff/v5/interventions/${INTERVENTION_ID}/escalate`, body: { to: "risk-owner" } },
  { id: "fetch-081-decide-intervention", type: "fetch", category: "adjust", method: "POST", path: `/bff/v5/interventions/${INTERVENTION_ID}/decide`, body: { decision: "approve", memo: "approve remediation" } },
  { id: "fetch-082-two-man", type: "fetch", category: "adjust", method: "POST", path: `/bff/v5/interventions/${INTERVENTION_ID}/two-man-sign`, body: { secondOperatorId: "op-mgmt100-2" } },
  { id: "fetch-083-batch-decide", type: "fetch", category: "adjust", method: "POST", path: "/bff/v5/interventions/batch-decide", body: { ids: [INTERVENTION_ID], decision: "approve" } },
  { id: "fetch-084-approval-decide", type: "fetch", category: "adjust", method: "POST", path: `/bff/approvals/${APPROVAL_ID}/decide`, body: { decision: "approve", reason: "100-flow" } },
  { id: "fetch-085-approval-batch", type: "fetch", category: "adjust", method: "POST", path: "/bff/approvals/batch-decide", body: { ids: [APPROVAL_ID], decision: "reject" } },
  { id: "fetch-086-alert-ack", type: "fetch", category: "adjust", method: "POST", path: `/bff/alerts/${ALERT_ID}/acknowledge`, body: { memo: "ack" } },
  { id: "fetch-087-alert-escalate", type: "fetch", category: "adjust", method: "POST", path: `/bff/alerts/${ALERT_ID}/escalate-incident`, body: { incidentId: INCIDENT_ID } },
  { id: "fetch-088-incident-mitigate", type: "fetch", category: "adjust", method: "POST", path: `/bff/incidents/${INCIDENT_ID}/start-mitigation`, body: { plan: "restrict persona tools" } },
  { id: "fetch-089-incident-resolve", type: "fetch", category: "adjust", method: "POST", path: `/bff/incidents/${INCIDENT_ID}/resolve`, body: { resolution: "paper only remediation complete" } },
  { id: "fetch-090-signal-agree", type: "fetch", category: "feedback", method: "POST", path: `/bff/agora/signals/${SIGNAL_ID}/feedback`, body: { decision: "agree", confidence: 0.9 } },
  { id: "fetch-091-signal-disagree", type: "fetch", category: "feedback", method: "POST", path: `/bff/agora/signals/${SIGNAL_ID}/feedback`, body: { decision: "disagree", confidence: 0.4 } },
  { id: "fetch-092-signal-flag", type: "fetch", category: "feedback", method: "POST", path: `/bff/agora/signals/${SIGNAL_ID}/feedback`, body: { decision: "flag_suspicious", confidence: 0.8 } },
  { id: "fetch-093-agora-feedback", type: "fetch", category: "feedback", method: "POST", path: "/bff/agora/feedback", body: { target: PERSONA_ID, text: "100-flow coaching note" } },
  { id: "fetch-094-nl-fleet", type: "fetch", category: "feedback", method: "POST", path: "/bff/management/nl/ask", body: { question: "Who needs operator review?", focus: "fleet" } },
  { id: "fetch-095-nl-pulse", type: "fetch", category: "feedback", method: "POST", path: "/bff/management/nl/ask", body: { question: "Summarize paper trading pulse.", focus: "trading_pulse" } },
  { id: "fetch-096-nl-persona", type: "fetch", category: "feedback", method: "POST", path: "/bff/management/nl/ask", body: { question: "Explain persona risk state.", persona_id: PERSONA_ID } },
  { id: "fetch-097-tool-preview", type: "fetch", category: "adjust", method: "POST", path: "/bff/assistant/tools/preview", body: { tool: "persona.route_policy.preview", params: { persona_id: PERSONA_ID } } },
  { id: "fetch-098-tool-validate", type: "fetch", category: "adjust", method: "POST", path: "/bff/assistant/tools/validate", body: { tool: "persona.route_policy.validate", params: { persona_id: PERSONA_ID } } },
  { id: "fetch-099-tool-execute", type: "fetch", category: "adjust", method: "POST", path: "/bff/assistant/tools/execute", body: { tool: "persona.route_policy.execute", params: { persona_id: PERSONA_ID, dry_run: true } } },
  { id: "fetch-100-journal", type: "fetch", category: "feedback", method: "POST", path: "/bff/agora/journal", body: { title: "MGMT100 feedback journal", body: "Persona loop validated." } },
];

const flows: Flow[] = [...uiFlows, ...fetchFlows];

test.setTimeout(180_000);

test("runs 100 management/persona/trading interaction flows", async ({ page }) => {
  test.skip(
    targetsExternalE2eEnvironment(),
    "route-mocked fixture coverage is loopback-only; hosted candidates use live acceptance specs",
  );
  expect(flows).toHaveLength(100);
  expect(new Set(flows.map((flow) => flow.id)).size).toBe(100);
  expect(new Set(flows.map((flow) => `${flow.type}:${flow.category}:${"path" in flow ? flow.path : ""}`)).size).toBeGreaterThan(90);

  const hits: BffHit[] = [];
  await installBffFixture(page, hits);
  await installOidcDevLogin(page, {
    goto: false,
    roles: ["operator", "reviewer", "approver"],
    token: LOCAL_FIXTURE_AUTH_TOKEN,
  });

  const results: Array<{ category: string; id: string; ok: boolean; path: string; status?: number; type: string }> = [];

  for (const flow of uiFlows) {
    const start = hits.length;
    await page.goto(frontendUrl(flow.path));
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    if (flow.text) {
      await expect(page.locator("body"), `${flow.id} should render ${flow.text}`).toContainText(flow.text);
    }
    const bodyText = await page.locator("body").textContent();
    expect(bodyText ?? "", `${flow.id} should not crash`).not.toMatch(CRASH_TEXT);
    const called = hits.slice(start).some((hit) => hit.path.startsWith(flow.endpoint));
    expect(called, `${flow.id} should call ${flow.endpoint}`).toBe(true);
    results.push({ category: flow.category, id: flow.id, ok: true, path: flow.path, type: flow.type });
  }

  const fetchResults = await page.evaluate(
    async ({ authHeaders, flows: browserFlows }) => {
      const out: Array<{ body: unknown; id: string; method: string; path: string; status: number }> = [];
      for (const flow of browserFlows) {
        const headers: Record<string, string> = {
          ...authHeaders,
          "X-Dry-Run": "1",
          "X-Request-Id": `req-${flow.id}`,
          "X-Correlation-Id": `corr-${flow.id}`,
        };
        if (flow.method !== "GET") {
          headers["Content-Type"] = "application/json";
          headers["Idempotency-Key"] = `idk-${flow.id}`;
        }
        const response = await fetch(flow.path, {
          body: flow.method === "GET" ? undefined : JSON.stringify(flow.body ?? {}),
          headers,
          method: flow.method,
        });
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        out.push({ body, id: flow.id, method: flow.method, path: flow.path, status: response.status });
      }
      return out;
    },
    {
      authHeaders: mutationAuthHeaders({ token: LOCAL_FIXTURE_AUTH_TOKEN }),
      flows: fetchFlows.map((flow) => ({
        body: flow.body,
        id: flow.id,
        method: flow.method,
        path: flow.path,
      })),
    },
  );

  for (const result of fetchResults) {
    const flow = fetchFlows.find((candidate) => candidate.id === result.id);
    expect(flow, `${result.id} should map back to a flow`).toBeTruthy();
    expect(result.status, `${result.id} ${result.method} ${result.path}`).toBeGreaterThanOrEqual(200);
    expect(result.status, `${result.id} ${result.method} ${result.path}`).toBeLessThan(300);
    const body = result.body as JsonRecord;
    const meta = body?.meta as JsonRecord | undefined;
    expect(meta?.liveCapitalSideEffects, `${result.id} must not enable live-capital side effects`).toBe(false);
    if (flow?.method !== "GET") {
      const matchingHits = hits.filter((hit) => hit.path === result.path && hit.method === flow.method);
      expect(
        matchingHits.some((hit) => hit.idempotencyKey === `idk-${result.id}`),
        `${result.id} mutation should send Idempotency-Key`,
      ).toBe(true);
    }
    results.push({
      category: flow?.category ?? "unknown",
      id: result.id,
      ok: true,
      path: result.path,
      status: result.status,
      type: "fetch",
    });
  }

  const counts = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.category] = (acc[result.category] ?? 0) + 1;
    return acc;
  }, {});

  expect(results).toHaveLength(100);
  expect(counts.display).toBeGreaterThanOrEqual(25);
  expect(counts.monitor).toBeGreaterThanOrEqual(25);
  expect(counts.adjust).toBeGreaterThanOrEqual(20);
  expect(counts.feedback).toBeGreaterThanOrEqual(8);
});
