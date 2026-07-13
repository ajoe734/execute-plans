// Dormant release-evidence contract foundation.
//
// No workflow or deployment script imports this module. It is intentionally a
// pure, versioned contract that can be promoted separately after review.

export const RELEASE_GATE_SCHEMA_VERSION = 1;
export const RELEASE_GATE_QUALIFICATION_PROFILE =
  "pantheon-dev-fe-release-evidence-foundation/v1";

export const RELEASE_GATE_STEP_OUTCOME_SCHEMA_VERSION = 1;
export const RELEASE_GATE_STEP_OUTCOME_PROFILE =
  "pantheon-dev-fe-release-step-outcomes/v1";

export const MANAGEMENT_ACCEPTANCE_SCHEMA_VERSION = 1;
export const MANAGEMENT_ACCEPTANCE_PROFILE =
  "pantheon-dev-fe-management-acceptance/v1";

export const RELEASE_GATE_STEP_OUTCOME_KEYS = Object.freeze([
  "install",
  "lint",
  "test",
  "build",
  "bundle_budget",
  "contract",
  "mgmt_persona_3000",
  "route_probe",
  "auth_smoke",
  "write_probe",
  "mgmt_live_deep",
  "install_playwright",
  "browser_probe",
  "route_load",
  "mgmt_load_gate",
  "mgmt_hosted_accept",
  "pr_preview",
  "e2e",
]);

const gateDefinitions = [
  {
    gate: 0,
    title: "Preconditions",
    checks: [
      ["G0-CANDIDATE-SHA", "Frontend candidate is bound to an exact full Git SHA."],
      ["G0-BACKEND-RUNTIME-SHA", "Backend runtime is bound to an exact full Git SHA."],
      ["G0-LEASED-BFF-STABILITY", "Qualification uses one stable, exclusively leased BFF."],
      ["G0-FRONTEND-TARGET", "Frontend target URL is recorded."],
      ["G0-BFF-TARGET", "BFF target URL is recorded."],
      ["G0-NO-OBSOLETE-BFF", "No obsolete BFF target is admitted."],
      ["G0-AUTH-INPUT", "Required read-only authentication input is available."],
    ],
  },
  {
    gate: 1,
    title: "Static / Build / Unit",
    checks: [
      ["G1-NPM-CI", "Dependency installation succeeds."],
      ["G1-LINT", "Lint succeeds."],
      ["G1-TEST", "Unit and integration tests succeed."],
      ["G1-BUILD", "Production build succeeds."],
      ["G1-BUNDLE-BUDGET", "Bundle budget succeeds."],
      ["G1-CONTRACT", "Contract validation succeeds."],
      ["G1-MGMT-PERSONA-3000", "Management persona validation succeeds."],
    ],
  },
  {
    gate: 2,
    title: "Contract Drift",
    checks: [
      ["G2-CANONICAL-PATHS", "Canonical paths match OpenAPI."],
      ["G2-ACTION-COMMAND-STATUS", "Action command status schema matches."],
      ["G2-ERROR-CODES", "Error code catalog matches."],
      ["G2-SSE-CHANNELS", "SSE channels match AsyncAPI."],
      ["G2-EVIDENCE-KINDS", "Evidence kinds match the capability catalog."],
      ["G2-CORRELATION-ID", "Correlation identifiers remain required."],
    ],
  },
  {
    gate: 3,
    title: "BFF Route Probes",
    checks: [
      ["G3-ANON-HEALTH", "Anonymous health probe passes."],
      ["G3-ANON-OPENAPI", "Anonymous OpenAPI probe passes."],
      ["G3-ANON-SSE", "Anonymous SSE probe passes."],
      ["G3-ANON-PROTECTED", "Protected routes enforce the expected auth posture."],
      ["G3-ANON-NO-404", "Canonical routes do not return 404."],
      ["G3-AUTH-ME", "Authenticated identity response is typed."],
      ["G3-AUTH-ENTITY-LISTS", "Authenticated entity lists are typed."],
      ["G3-AUTH-V5-ENVELOPES", "Authenticated v5 envelopes are typed."],
      ["G3-AUTH-WRITE-PRECONDITIONS", "Write preconditions return typed errors."],
      ["G3-DRY-RUN-TYPED", "Dry-run writes return typed responses."],
      ["G3-DRY-RUN-NO-SIDE-EFFECTS", "Dry-run writes have no side effects."],
      ["G3-DRY-RUN-CREATE-COVERAGE", "Create dry-run routes are covered."],
      ["G3-LIVE-RBAC", "Live RBAC matrix passes."],
      ["G3-LIVE-TWO-MAN-RACE", "Two-operator race behavior passes."],
      ["G3-LIVE-SSE-RECONNECT", "SSE reconnect behavior passes."],
    ],
  },
  {
    gate: 4,
    title: "Browser Frontend E2E",
    checks: [
      ["G4-PAGE-LOAD", "Frontend page loads."],
      ["G4-BFF-TARGET", "Frontend uses the intended BFF."],
      ["G4-PERSONA-FLEET-HONESTY", "Persona Fleet renders honest live state."],
      ["G4-NO-SEED-FALLBACK-BANNER", "No seed fallback is claimed."],
      ["G4-NO-OBSOLETE-BFF", "Bundle excludes obsolete BFF targets."],
      ["G4-CORS-PREFLIGHT", "CORS preflight passes."],
      ["G4-BFF-RESPONSES", "Required BFF responses are received."],
      ["G4-NO-FAILED-BFF", "No required BFF request fails."],
      ["G4-NO-CORS-CONSOLE", "No CORS console error occurs."],
    ],
  },
  {
    gate: 5,
    title: "Playwright User Flows",
    checks: Array.from({ length: 16 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return [`G5-F${number}`, `F${number} product flow passes.`];
    }),
  },
  {
    gate: 6,
    title: "A11y / Perf",
    checks: [
      ["G6-AXE", "Critical and serious accessibility findings are zero."],
      ["G6-FOCUS", "Overlay focus handling passes."],
      ["G6-REDUCED-MOTION", "Reduced motion is respected."],
      ["G6-PERFORMANCE-BUDGET", "Performance budget passes."],
      ["G6-SSE-RERENDER", "SSE rendering remains bounded."],
    ],
  },
  {
    gate: 7,
    title: "Release Decision",
    checks: [
      ["G7-CRITICAL-GATES", "Every other release check passes."],
      ["G7-EXCEPTIONS", "No qualification exception masks a non-pass check."],
      ["G7-AUDIT-EVIDENCE", "Audit evidence is present."],
      ["G7-RELEASE-IDENTIFIERS", "Exact release identifiers are recorded."],
    ],
  },
  {
    gate: 8,
    title: "Management Production Acceptance",
    checks: [
      ["G8-ROUTE-RENDER", "No management route crashes or renders blank."],
      ["G8-CANONICAL-REDIRECTS", "Aliases redirect to canonical routes."],
      ["G8-DETAIL-HONESTY", "Detail routes render honest values."],
      ["G8-NO-SEED-FALLBACK", "No route claims seed fallback."],
      ["G8-NO-MOCK-SUCCESS", "No route claims mock success as production truth."],
      ["G8-NO-CORS", "No hosted-origin CORS error occurs."],
      ["G8-NO-RENDER-CRASH", "No render-crash console error occurs."],
      ["G8-SESSION-RBAC", "Session and RBAC acceptance passes."],
      ["G8-LOAD-GATE", "Release load gate passes."],
      ["G8-WRITE-CTA-GOVERNANCE", "Write CTAs are backed by governed receipts."],
    ],
  },
];

function freezeGateDefinition(definition) {
  return Object.freeze({
    gate: definition.gate,
    title: definition.title,
    checks: Object.freeze(definition.checks.map(([id, label]) => Object.freeze({ id, label }))),
  });
}

const frozenGateDefinitions = Object.freeze(gateDefinitions.map(freezeGateDefinition));

export const RELEASE_GATE_NUMBERS = Object.freeze(
  frozenGateDefinitions.map(({ gate }) => gate),
);

export const RELEASE_GATE_SCHEMA = Object.freeze({
  schemaVersion: RELEASE_GATE_SCHEMA_VERSION,
  qualificationProfile: RELEASE_GATE_QUALIFICATION_PROFILE,
  gates: Object.freeze(Object.fromEntries(
    frozenGateDefinitions.map((definition) => [String(definition.gate), definition]),
  )),
});

export const RELEASE_GATE_CHECK_FIELDS = Object.freeze(["id", "label", "status", "note"]);

const VALID_CHECK_STATUSES = new Set(["pass", "warn", "skip", "missing", "fail"]);
const VALID_STEP_OUTCOMES = new Set(["success", "failure", "cancelled", "skipped"]);

export function assertExactObjectFields(value, expectedFields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const observed = Object.keys(value);
  const missing = expectedFields.filter((field) => !observed.includes(field));
  const unknown = observed.filter((field) => !expectedFields.includes(field));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `${label} fields are not exact; missing=${missing.join(",") || "none"}; unknown=${unknown.join(",") || "none"}`,
    );
  }
  return true;
}

export function releaseGateDefinition(gate) {
  const definition = RELEASE_GATE_SCHEMA.gates[String(gate)];
  if (!definition) throw new Error(`release gate schema has no gate ${gate}`);
  return definition;
}

export function assertExactGateCheckSequence(gate, checks) {
  const expected = releaseGateDefinition(gate).checks;
  if (!Array.isArray(checks)) throw new Error(`gate ${gate} checks must be an array`);
  if (checks.length !== expected.length) {
    throw new Error(`gate ${gate} check count mismatch: expected ${expected.length}, received ${checks.length}`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    const actual = checks[index];
    const contract = expected[index];
    assertExactObjectFields(actual, RELEASE_GATE_CHECK_FIELDS, `gate ${gate} check ${index}`);
    if (actual.id !== contract.id) {
      throw new Error(`gate ${gate} check ${index} ID mismatch: expected ${contract.id}`);
    }
    if (actual.label !== contract.label) {
      throw new Error(`gate ${gate} check ${contract.id} label mismatch`);
    }
    if (!VALID_CHECK_STATUSES.has(actual.status)) {
      throw new Error(`gate ${gate} check ${contract.id} has invalid status: ${actual.status}`);
    }
    if (typeof actual.note !== "string") {
      throw new Error(`gate ${gate} check ${contract.id} note must be a string`);
    }
  }
  return true;
}

export function assertExactReleaseGateShape(gates) {
  if (!gates || typeof gates !== "object" || Array.isArray(gates)) {
    throw new Error("release gate checks must be an object");
  }
  const expectedKeys = RELEASE_GATE_NUMBERS.map(String);
  const observedKeys = Object.keys(gates);
  const missing = expectedKeys.filter((gate) => !observedKeys.includes(gate));
  const unknown = observedKeys.filter((gate) => !expectedKeys.includes(gate));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `release gate keys are not exact; missing=${missing.join(",") || "none"}; unknown=${unknown.join(",") || "none"}`,
    );
  }
  for (const gate of RELEASE_GATE_NUMBERS) {
    assertExactGateCheckSequence(gate, gates[String(gate)]);
  }
  return true;
}

export function createGateChecks(gate, status, note) {
  if (!VALID_CHECK_STATUSES.has(status)) throw new Error(`invalid release check status: ${status}`);
  return releaseGateDefinition(gate).checks.map((check) => ({
    ...check,
    status,
    note: String(note),
  }));
}

export function deriveReleaseGateResult(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new Error("release gate result requires at least one check");
  }
  const statuses = checks.map((check) => String(check?.status || ""));
  const invalid = statuses.filter((status) => !VALID_CHECK_STATUSES.has(status));
  if (invalid.length > 0) {
    throw new Error(`release gate result has invalid statuses: ${[...new Set(invalid)].join(",")}`);
  }
  const overall = statuses.every((status) => status === "pass")
    ? "pass"
    : statuses.includes("fail")
      ? "fail"
      : statuses.includes("missing")
        ? "missing"
        : statuses.includes("warn")
          ? "warn"
          : "skip";
  return { overall, pass: overall === "pass" };
}

export function inspectReleaseGateStepOutcomes(stepOutcomes) {
  const observedKeys = stepOutcomes && typeof stepOutcomes === "object" && !Array.isArray(stepOutcomes)
    ? Object.keys(stepOutcomes)
    : [];
  const missingKeys = RELEASE_GATE_STEP_OUTCOME_KEYS.filter((key) => !observedKeys.includes(key));
  const unknownKeys = observedKeys.filter((key) => !RELEASE_GATE_STEP_OUTCOME_KEYS.includes(key));
  const orderedKeys = observedKeys.length === RELEASE_GATE_STEP_OUTCOME_KEYS.length &&
    observedKeys.every((key, index) => key === RELEASE_GATE_STEP_OUTCOME_KEYS[index]);
  const invalidEntries = [];

  for (const key of RELEASE_GATE_STEP_OUTCOME_KEYS) {
    const entry = stepOutcomes?.[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      invalidEntries.push(`${key}:not-object`);
      continue;
    }
    const entryKeys = Object.keys(entry);
    if (entryKeys.length !== 2 || entryKeys[0] !== "outcome" || entryKeys[1] !== "evidence") {
      invalidEntries.push(`${key}:fields`);
      continue;
    }
    if (!VALID_STEP_OUTCOMES.has(String(entry.outcome || ""))) {
      invalidEntries.push(`${key}:outcome`);
    }
    if (typeof entry.evidence !== "string" || !entry.evidence.trim()) {
      invalidEntries.push(`${key}:evidence`);
    }
  }

  return {
    exact: missingKeys.length === 0 && unknownKeys.length === 0 && orderedKeys && invalidEntries.length === 0,
    observedKeys,
    missingKeys,
    unknownKeys,
    orderedKeys,
    invalidEntries,
  };
}
