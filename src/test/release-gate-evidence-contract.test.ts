import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MANAGEMENT_ACCEPTANCE_PROFILE,
  MANAGEMENT_ACCEPTANCE_SCHEMA_VERSION,
  RELEASE_GATE_ASSERTION_DEFINITIONS,
  RELEASE_GATE_NUMBERS,
  RELEASE_GATE_PROVENANCE_PROFILE,
  RELEASE_GATE_PROVENANCE_SCHEMA_VERSION,
  RELEASE_GATE_QUALIFICATION_PROFILE,
  RELEASE_GATE_SCHEMA,
  RELEASE_GATE_SCHEMA_VERSION,
  RELEASE_GATE_STEP_EVIDENCE_PATHS,
  RELEASE_GATE_STEP_EVIDENCE_PROFILE,
  RELEASE_GATE_STEP_EVIDENCE_SCHEMA_VERSION,
  RELEASE_GATE_STEP_OUTCOME_KEYS,
  assertionDefinitionsForStep,
  deriveReleaseGateResult,
  inspectReleaseGateStepOutcomes,
  releaseGateDefinition,
} from "../../scripts/release-gate-contract/schema.mjs";
import {
  MAX_RELEASE_GATE_EVIDENCE_BYTES,
  RELEASE_GATE_CRITICAL_ARTIFACT_PATHS,
  RELEASE_GATE_MANAGEMENT_BINDING_PROFILE,
  RELEASE_GATE_MANAGEMENT_BINDING_SCHEMA_VERSION,
  createManagementAcceptanceBinding,
  createManagementAcceptanceResult,
  createStepOutcomeBinding,
  parseExactJsonBytes,
  readBoundedRegularFile,
  validateReleaseQualificationEvidence,
  validateReleaseQualificationEvidenceFromArtifactRoot,
} from "../../scripts/release-gate-contract/evidence-contract.mjs";

interface ReleaseIdentity {
  frontendSha: string;
  backendSha: string;
  feBaseUrl: string;
  bffBaseUrl: string;
  runUrl: string;
  leaseId: string;
}

interface ProvenanceCore {
  schemaVersion: number;
  profile: string;
  repository: string;
  workflowPath: string;
  workflowSha: string;
  controllerSha: string;
  runId: string;
  runAttempt: string;
}

interface Descriptor {
  path: string;
  sha256: string;
  size: number;
}

interface Assertion {
  id: string;
  verifier: string;
  observed: unknown;
}

interface GateCheck {
  id: string;
  label: string;
  status: string;
  note: string;
}

interface StepOutcome {
  outcome: string;
  evidence: Descriptor;
}

interface ExpectedProvenance extends ProvenanceCore {
  artifactId: string;
  artifactDigestSha256: string;
  artifacts: {
    summary: Descriptor;
    stepOutcomes: Descriptor;
    managementAcceptance: Descriptor;
  };
}

interface QualificationFixture {
  root: string;
  identity: ReleaseIdentity;
  provenanceCore: ProvenanceCore;
  expectedProvenance: ExpectedProvenance;
  stepOutcomes: Record<string, StepOutcome>;
  management: Record<string, unknown>;
  managementBytes: Buffer;
  rawStepOutcomeBytes: Buffer;
  summary: Record<string, unknown> & {
    stepOutcomes: Record<string, unknown>;
    managementAcceptance: Record<string, unknown>;
    gates: Record<string, GateCheck[]>;
  };
  summaryBytes: Buffer;
}

interface FixtureOptions {
  assertionOverrides?: Record<string, unknown>;
  omitAssertion?: string;
  stepOutcomeOverrides?: Record<string, string>;
}

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

function jsonBytes(value: unknown) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function digest(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function descriptor(artifactPath: string, bytes: Buffer): Descriptor {
  return { path: artifactPath, sha256: digest(bytes), size: bytes.length };
}

function releaseIdentity(): ReleaseIdentity {
  return {
    frontendSha: "a".repeat(40),
    backendSha: "b".repeat(40),
    feBaseUrl: "https://pantheon-dev-fe.example.invalid",
    bffBaseUrl: "https://pantheon-dev-bff.example.invalid",
    runUrl: "https://github.com/ajoe734/execute-plans/actions/runs/987654",
    leaseId: "qualification-lease-987654",
  };
}

function provenanceCore(identity: ReleaseIdentity): ProvenanceCore {
  return {
    schemaVersion: RELEASE_GATE_PROVENANCE_SCHEMA_VERSION,
    profile: RELEASE_GATE_PROVENANCE_PROFILE,
    repository: "ajoe734/execute-plans",
    workflowPath: ".github/workflows/pantheon-integration-gate.yml",
    workflowSha: identity.frontendSha,
    controllerSha: "d".repeat(40),
    runId: "987654",
    runAttempt: "2",
  };
}

function expectedObserved(verifier: string, identity: ReleaseIdentity): unknown {
  if (verifier === "boolean-true") return true;
  if (verifier === "zero") return 0;
  if (verifier === "identity-frontend-sha") return identity.frontendSha;
  if (verifier === "identity-backend-sha") return identity.backendSha;
  if (verifier === "identity-fe-base-url") return identity.feBaseUrl;
  if (verifier === "identity-bff-base-url") return identity.bffBaseUrl;
  throw new Error(`unknown fixture verifier: ${verifier}`);
}

function checkContract(id: string) {
  for (const gate of RELEASE_GATE_NUMBERS) {
    const check = releaseGateDefinition(gate).checks.find((candidate) => candidate.id === id);
    if (check) return check;
  }
  throw new Error(`unknown fixture check: ${id}`);
}

function assertionCheck(
  assertion: Assertion,
  step: string,
  identity: ReleaseIdentity,
): GateCheck {
  const contract = checkContract(assertion.id);
  const pass = Object.is(assertion.observed, expectedObserved(assertion.verifier, identity));
  return {
    ...contract,
    status: pass ? "pass" : "fail",
    note: pass
      ? `machine assertion ${assertion.verifier} verified from ${step}`
      : `machine assertion ${assertion.verifier} failed from ${step}`,
  };
}

function assertionsForStep(
  step: string,
  identity: ReleaseIdentity,
  options: FixtureOptions,
  { clean = false } = {},
): Assertion[] {
  return assertionDefinitionsForStep(step)
    .filter(({ id }) => clean || id !== options.omitAssertion)
    .map(({ id, verifier }) => ({
      id,
      verifier,
      observed: !clean && Object.hasOwn(options.assertionOverrides || {}, id)
        ? options.assertionOverrides![id]
        : expectedObserved(verifier, identity),
    }));
}

function cleanPassingGates(identity: ReleaseIdentity): Record<string, GateCheck[]> {
  const checks = new Map<string, GateCheck>();
  for (const step of RELEASE_GATE_STEP_OUTCOME_KEYS) {
    for (const assertion of assertionsForStep(step, identity, {}, { clean: true })) {
      checks.set(assertion.id, assertionCheck(assertion, step, identity));
    }
  }
  const gates: Record<string, GateCheck[]> = {};
  for (const gate of RELEASE_GATE_NUMBERS.filter((value) => value !== 7)) {
    gates[String(gate)] = releaseGateDefinition(gate).checks.map(({ id }) => checks.get(id)!);
  }
  const gate7 = releaseGateDefinition(7).checks;
  gates["7"] = [
    { ...gate7[0], status: "pass", note: "0 non-pass check(s)" },
    { ...gate7[1], status: "pass", note: "no qualification exception is needed" },
    {
      ...gate7[2],
      status: "pass",
      note: "19/19 step evidence files and 3/3 critical manifests verified",
    },
    {
      ...gate7[3],
      status: "pass",
      note: "exact frontend/backend/run-attempt/artifact/lease identifiers verified",
    },
  ];
  return gates;
}

function writeArtifact(root: string, artifactPath: string, bytes: Buffer) {
  const target = path.join(root, ...artifactPath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}

function qualificationFixture(options: FixtureOptions = {}): QualificationFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-contract-v2-"));
  temporaryRoots.push(root);
  const identity = releaseIdentity();
  const core = provenanceCore(identity);
  const stepOutcomes: Record<string, StepOutcome> = {};

  for (const step of RELEASE_GATE_STEP_OUTCOME_KEYS.filter(
    (value) => value !== "mgmt_hosted_accept",
  )) {
    const envelope = {
      schemaVersion: RELEASE_GATE_STEP_EVIDENCE_SCHEMA_VERSION,
      profile: RELEASE_GATE_STEP_EVIDENCE_PROFILE,
      provenance: { ...core },
      identity: { ...identity },
      step,
      assertions: assertionsForStep(step, identity, options),
    };
    const bytes = jsonBytes(envelope);
    const evidence = descriptor(RELEASE_GATE_STEP_EVIDENCE_PATHS[step], bytes);
    writeArtifact(root, evidence.path, bytes);
    stepOutcomes[step] = {
      outcome: options.stepOutcomeOverrides?.[step] || "success",
      evidence,
    };
  }

  const managementAssertions = assertionsForStep("mgmt_hosted_accept", identity, options);
  const coherentManagementAssertions = managementAssertions.length ===
      assertionDefinitionsForStep("mgmt_hosted_accept").length
    ? managementAssertions
    : assertionsForStep("mgmt_hosted_accept", identity, {}, { clean: true });
  const managementChecks = coherentManagementAssertions.map((assertion) =>
    assertionCheck(assertion, "mgmt_hosted_accept", identity));
  const management: Record<string, unknown> = {
    schemaVersion: MANAGEMENT_ACCEPTANCE_SCHEMA_VERSION,
    profile: MANAGEMENT_ACCEPTANCE_PROFILE,
    releaseGateSchemaVersion: RELEASE_GATE_SCHEMA_VERSION,
    qualificationProfile: RELEASE_GATE_QUALIFICATION_PROFILE,
    provenance: { ...core },
    identity: { ...identity },
    step: "mgmt_hosted_accept",
    assertions: managementAssertions,
    checks: managementChecks,
    result: createManagementAcceptanceResult(managementChecks),
  };
  const managementBytes = jsonBytes(management);
  const managementDescriptor = descriptor(
    RELEASE_GATE_STEP_EVIDENCE_PATHS.mgmt_hosted_accept,
    managementBytes,
  );
  writeArtifact(root, managementDescriptor.path, managementBytes);
  stepOutcomes.mgmt_hosted_accept = {
    outcome: options.stepOutcomeOverrides?.mgmt_hosted_accept || "success",
    evidence: managementDescriptor,
  };

  // Re-establish the exact canonical key order after mgmt_hosted_accept was
  // materialized separately from the other step evidence envelopes.
  const orderedStepOutcomes = Object.fromEntries(
    RELEASE_GATE_STEP_OUTCOME_KEYS.map((step) => [step, stepOutcomes[step]]),
  ) as Record<string, StepOutcome>;
  const rawStepOutcomeBytes = jsonBytes(orderedStepOutcomes);
  const gates = cleanPassingGates(identity);
  const summary = {
    schemaVersion: RELEASE_GATE_SCHEMA_VERSION,
    qualificationProfile: RELEASE_GATE_QUALIFICATION_PROFILE,
    releaseQualification: true,
    identity: { ...identity },
    provenance: { ...core },
    stepOutcomes: createStepOutcomeBinding(rawStepOutcomeBytes),
    managementAcceptance: createManagementAcceptanceBinding(managementBytes),
    gates,
    overall: "pass",
  };
  const summaryBytes = jsonBytes(summary);
  const expectedProvenance: ExpectedProvenance = {
    ...core,
    artifactId: "7654321",
    artifactDigestSha256: "c".repeat(64),
    artifacts: {
      summary: descriptor(RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.summary, summaryBytes),
      stepOutcomes: descriptor(
        RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.stepOutcomes,
        rawStepOutcomeBytes,
      ),
      managementAcceptance: descriptor(
        RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.managementAcceptance,
        managementBytes,
      ),
    },
  };
  writeArtifact(root, RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.summary, summaryBytes);
  writeArtifact(root, RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.stepOutcomes, rawStepOutcomeBytes);

  return {
    root,
    identity,
    provenanceCore: core,
    expectedProvenance,
    stepOutcomes: orderedStepOutcomes,
    management,
    managementBytes,
    rawStepOutcomeBytes,
    summary,
    summaryBytes,
  };
}

function refreshSummary(fixture: QualificationFixture, bytes = jsonBytes(fixture.summary)) {
  fixture.summaryBytes = bytes;
  fixture.expectedProvenance.artifacts.summary = descriptor(
    RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.summary,
    bytes,
  );
  writeArtifact(fixture.root, RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.summary, bytes);
}

function refreshOutcomes(fixture: QualificationFixture, rawBytes = jsonBytes(fixture.stepOutcomes)) {
  fixture.rawStepOutcomeBytes = rawBytes;
  fixture.expectedProvenance.artifacts.stepOutcomes = descriptor(
    RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.stepOutcomes,
    rawBytes,
  );
  fixture.summary.stepOutcomes = createStepOutcomeBinding(rawBytes);
  writeArtifact(fixture.root, RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.stepOutcomes, rawBytes);
  refreshSummary(fixture);
}

function unsafeManagementBinding(bytes: Buffer) {
  return {
    schemaVersion: RELEASE_GATE_MANAGEMENT_BINDING_SCHEMA_VERSION,
    profile: RELEASE_GATE_MANAGEMENT_BINDING_PROFILE,
    artifactPath: RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.managementAcceptance,
    sha256: digest(bytes),
    size: bytes.length,
  };
}

function replaceStepEvidenceBytes(
  fixture: QualificationFixture,
  step: string,
  bytes: Buffer,
) {
  const evidence = descriptor(RELEASE_GATE_STEP_EVIDENCE_PATHS[step], bytes);
  fixture.stepOutcomes[step].evidence = evidence;
  writeArtifact(fixture.root, evidence.path, bytes);
  if (step === "mgmt_hosted_accept") {
    fixture.managementBytes = bytes;
    fixture.expectedProvenance.artifacts.managementAcceptance = descriptor(
      RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.managementAcceptance,
      bytes,
    );
    fixture.summary.managementAcceptance = unsafeManagementBinding(bytes);
  }
  refreshOutcomes(fixture);
}

function validate(fixture = qualificationFixture()) {
  return validateReleaseQualificationEvidence({
    summaryBytes: fixture.summaryBytes,
    rawStepOutcomeBytes: fixture.rawStepOutcomeBytes,
    managementAcceptanceBytes: fixture.managementBytes,
    expectedIdentity: fixture.identity,
    expectedProvenance: fixture.expectedProvenance,
    trustedArtifactRoot: fixture.root,
  });
}

describe("dormant release-gate evidence contract v2", () => {
  it("defines exactly 79 checks, 75 allowlisted assertions, and 19 outcomes", () => {
    expect(RELEASE_GATE_NUMBERS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(RELEASE_GATE_NUMBERS.map((gate) => RELEASE_GATE_SCHEMA.gates[String(gate)].checks.length))
      .toEqual([7, 7, 6, 15, 9, 16, 5, 4, 10]);
    expect(RELEASE_GATE_NUMBERS.flatMap((gate) => RELEASE_GATE_SCHEMA.gates[String(gate)].checks))
      .toHaveLength(79);
    expect(Object.keys(RELEASE_GATE_ASSERTION_DEFINITIONS)).toHaveLength(75);
    expect(RELEASE_GATE_STEP_OUTCOME_KEYS).toHaveLength(19);
    expect(RELEASE_GATE_STEP_OUTCOME_KEYS[0]).toBe("release_identity");
  });

  it("accepts a fully byte-bound, machine-verified offline qualification", () => {
    expect(validate()).toEqual({
      status: "valid",
      frontendSha: "a".repeat(40),
      backendSha: "b".repeat(40),
      runUrl: "https://github.com/ajoe734/execute-plans/actions/runs/987654",
      runAttempt: "2",
      artifactId: "7654321",
      artifactDigestSha256: "c".repeat(64),
      controllerSha: "d".repeat(40),
      leaseId: "qualification-lease-987654",
      gateCount: 9,
      checkCount: 79,
      stepOutcomeCount: 19,
      verifiedEvidenceCount: 19,
    });
  });

  it("accepts the same evidence only after safe reads from its trusted artifact root", () => {
    const fixture = qualificationFixture();
    expect(validateReleaseQualificationEvidenceFromArtifactRoot({
      trustedArtifactRoot: fixture.root,
      expectedIdentity: fixture.identity,
      expectedProvenance: fixture.expectedProvenance,
    }).status).toBe("valid");
  });

  it.each(["warn", "skip", "missing", "fail"])(
    "treats a %s gate result as non-passing",
    (status) => {
      expect(deriveReleaseGateResult([{ status }])).toEqual({ overall: status, pass: false });
    },
  );

  it("forbids the old parsed-object admission API", () => {
    const fixture = qualificationFixture();
    expect(() => validateReleaseQualificationEvidence({
      summary: fixture.summary,
      managementAcceptance: fixture.management,
      rawStepOutcomeBytes: fixture.rawStepOutcomeBytes,
      expectedIdentity: fixture.identity,
      expectedProvenance: fixture.expectedProvenance,
      trustedArtifactRoot: fixture.root,
    })).toThrow("parsed summary/management objects are forbidden");
  });

  it("rejects the former all-pass self-assertion exploit", () => {
    const fixture = qualificationFixture({
      assertionOverrides: { "G4-NO-FAILED-BFF": 1 },
    });
    expect(() => validate(fixture)).toThrow("release gates does not match its recomputed value");
  });

  it("fails closed when any check lacks a machine-verifiable assertion", () => {
    const fixture = qualificationFixture({ omitAssertion: "G3-LIVE-RBAC" });
    expect(() => validate(fixture)).toThrow(
      "mgmt_live_deep machine assertions must contain exactly",
    );
  });

  it("rejects a verifier substitution even when its observed value would pass", () => {
    const fixture = qualificationFixture();
    const artifactPath = RELEASE_GATE_STEP_EVIDENCE_PATHS.route_probe;
    const envelope = JSON.parse(fs.readFileSync(path.join(fixture.root, artifactPath), "utf8"));
    envelope.assertions[0].verifier = "zero";
    envelope.assertions[0].observed = 0;
    replaceStepEvidenceBytes(fixture, "route_probe", jsonBytes(envelope));
    expect(() => validate(fixture)).toThrow("does not match the allowlisted verifier binding");
  });

  it("rejects a claimed evidence path outside the trusted artifact schema", () => {
    const fixture = qualificationFixture();
    fixture.stepOutcomes.install.evidence.path = "/tmp/forged.log";
    refreshOutcomes(fixture);
    expect(() => validate(fixture)).toThrow("exact ordered 19-outcome v2 contract");
  });

  it("rejects a missing machine-evidence file instead of trusting its path", () => {
    const fixture = qualificationFixture();
    fs.rmSync(path.join(fixture.root, RELEASE_GATE_STEP_EVIDENCE_PATHS.browser_probe));
    expect(() => validate(fixture)).toThrow("browser_probe evidence is missing");
  });

  it("rejects machine-evidence bytes that do not match their SHA-256", () => {
    const fixture = qualificationFixture();
    fs.appendFileSync(
      path.join(fixture.root, RELEASE_GATE_STEP_EVIDENCE_PATHS.browser_probe),
      "tampered",
    );
    expect(() => validate(fixture)).toThrow(/size binding mismatch|changed while it was read/);
  });

  it("rejects a final evidence symlink even when the target bytes match", () => {
    const fixture = qualificationFixture();
    const evidencePath = path.join(fixture.root, RELEASE_GATE_STEP_EVIDENCE_PATHS.install);
    const target = `${evidencePath}.target`;
    fs.renameSync(evidencePath, target);
    fs.symlinkSync(target, evidencePath);
    expect(() => validate(fixture)).toThrow("regular, non-symlink file");
  });

  it("rejects a symlink in the trusted evidence parent chain", () => {
    const fixture = qualificationFixture();
    const evidenceRoot = path.join(fixture.root, "step-evidence");
    const target = `${evidenceRoot}-target`;
    fs.renameSync(evidenceRoot, target);
    fs.symlinkSync(target, evidenceRoot);
    expect(() => validate(fixture)).toThrow("artifact parent must be a real, non-symlink directory");
  });

  it("rejects duplicate summary keys before object semantics can erase them", () => {
    const fixture = qualificationFixture();
    const malicious = Buffer.from(
      fixture.summaryBytes.toString("utf8").replace(
        '"overall": "pass"',
        '"overall": "fail",\n  "overall": "pass"',
      ),
    );
    refreshSummary(fixture, malicious);
    expect(() => validate(fixture)).toThrow("duplicate object key");
  });

  it("rejects duplicate management keys before result recomputation", () => {
    const fixture = qualificationFixture();
    const malicious = Buffer.from(
      fixture.managementBytes.toString("utf8").replace(
        '"step": "mgmt_hosted_accept"',
        '"step": "forged",\n  "step": "mgmt_hosted_accept"',
      ),
    );
    replaceStepEvidenceBytes(fixture, "mgmt_hosted_accept", malicious);
    expect(() => validate(fixture)).toThrow("duplicate object key");
  });

  it("rejects duplicate raw-outcome keys before digest/shape admission", () => {
    const fixture = qualificationFixture();
    const malicious = Buffer.from(
      fixture.rawStepOutcomeBytes.toString("utf8").replace(
        "{\n",
        `${JSON.stringify({ release_identity: fixture.stepOutcomes.release_identity }).slice(0, -1)},\n`,
      ),
    );
    fixture.rawStepOutcomeBytes = malicious;
    fixture.expectedProvenance.artifacts.stepOutcomes = descriptor(
      RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.stepOutcomes,
      malicious,
    );
    writeArtifact(fixture.root, RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.stepOutcomes, malicious);
    expect(() => validate(fixture)).toThrow("duplicate object key");
  });

  it("rejects duplicate keys inside byte-bound step evidence", () => {
    const fixture = qualificationFixture();
    const artifactPath = RELEASE_GATE_STEP_EVIDENCE_PATHS.route_probe;
    const original = fs.readFileSync(path.join(fixture.root, artifactPath));
    const malicious = Buffer.from(
      original.toString("utf8").replace(
        '"step": "route_probe"',
        '"step": "forged",\n  "step": "route_probe"',
      ),
    );
    replaceStepEvidenceBytes(fixture, "route_probe", malicious);
    expect(() => validate(fixture)).toThrow("duplicate object key");
  });

  it("rejects invalid UTF-8 instead of replacing bytes with U+FFFD", () => {
    const valid = Buffer.from('{"evidence":"x"}');
    const invalid = Buffer.concat([valid.subarray(0, 13), Buffer.from([0xff]), valid.subarray(14)]);
    expect(() => parseExactJsonBytes(invalid, "fixture JSON")).toThrow("not valid UTF-8");
  });

  it("rejects a UTF-8 BOM as non-exact JSON", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{}")]);
    expect(() => parseExactJsonBytes(bytes, "fixture JSON")).toThrow("must not contain a UTF-8 BOM");
  });

  it("rejects the dormant v1 18-key shape that omitted release_identity", () => {
    const fixture = qualificationFixture();
    const legacy = Object.fromEntries(
      RELEASE_GATE_STEP_OUTCOME_KEYS.slice(1).map((step) => [step, fixture.stepOutcomes[step]]),
    );
    const inspection = inspectReleaseGateStepOutcomes(legacy);
    expect(inspection.exact).toBe(false);
    expect(inspection.missingKeys).toEqual(["release_identity"]);
  });

  it("rejects the current producer's string-only evidence until explicit v2 migration", () => {
    const currentProducerShape = Object.fromEntries(RELEASE_GATE_STEP_OUTCOME_KEYS.map((step) => [
      step,
      { outcome: "success", evidence: `.lovable/audits/${step}.log` },
    ]));
    const inspection = inspectReleaseGateStepOutcomes(currentProducerShape);
    expect(inspection.exact).toBe(false);
    expect(inspection.invalidEntries).toContain("release_identity:evidence-not-object");
  });

  it.each(["failure", "cancelled", "skipped"])(
    "rejects a trusted raw outcome whose value is %s",
    (outcome) => {
      const fixture = qualificationFixture({ stepOutcomeOverrides: { install: outcome } });
      expect(() => validate(fixture)).toThrow("non-success step outcomes: install");
    },
  );

  it("rejects reordered or unknown raw-outcome keys", () => {
    const fixture = qualificationFixture();
    fixture.stepOutcomes = Object.fromEntries(
      Object.entries(fixture.stepOutcomes).reverse(),
    );
    fixture.stepOutcomes.injected = fixture.stepOutcomes.install;
    refreshOutcomes(fixture);
    expect(() => validate(fixture)).toThrow("exact ordered 19-outcome v2 contract");
  });

  it("binds every step envelope to the exact release identity", () => {
    const fixture = qualificationFixture();
    const artifactPath = RELEASE_GATE_STEP_EVIDENCE_PATHS.auth_smoke;
    const envelope = JSON.parse(fs.readFileSync(path.join(fixture.root, artifactPath), "utf8"));
    envelope.identity.backendSha = "d".repeat(40);
    replaceStepEvidenceBytes(fixture, "auth_smoke", jsonBytes(envelope));
    expect(() => validate(fixture)).toThrow("auth_smoke evidence identity does not match");
  });

  it("binds every step envelope to exact run-attempt provenance", () => {
    const fixture = qualificationFixture();
    const artifactPath = RELEASE_GATE_STEP_EVIDENCE_PATHS.route_load;
    const envelope = JSON.parse(fs.readFileSync(path.join(fixture.root, artifactPath), "utf8"));
    envelope.provenance.runAttempt = "1";
    replaceStepEvidenceBytes(fixture, "route_load", jsonBytes(envelope));
    expect(() => validate(fixture)).toThrow("route_load evidence provenance does not match");
  });

  it("recomputes and rejects a forged management result", () => {
    const fixture = qualificationFixture();
    const forged = JSON.parse(fixture.managementBytes.toString("utf8"));
    forged.result.pass = false;
    replaceStepEvidenceBytes(fixture, "mgmt_hosted_accept", jsonBytes(forged));
    expect(() => validate(fixture)).toThrow("management acceptance result does not match");
  });

  it("recomputes Gate 7 without an auditEvidencePresent boolean", () => {
    const fixture = qualificationFixture();
    fixture.summary.gates["7"][2].note = "self-asserted audit evidence";
    refreshSummary(fixture);
    expect(() => validate(fixture)).toThrow("release gates does not match its recomputed value");
  });

  it("rejects reintroducing the removed auditEvidencePresent field", () => {
    const fixture = qualificationFixture();
    fixture.summary.auditEvidencePresent = true;
    refreshSummary(fixture);
    expect(() => validate(fixture)).toThrow("release summary fields are not exact");
  });

  it("requires trusted external byte provenance for every critical manifest", () => {
    const fixture = qualificationFixture();
    fixture.expectedProvenance.artifacts.summary.sha256 = "d".repeat(64);
    expect(() => validate(fixture)).toThrow(
      "summary critical evidence digest does not match trusted provenance",
    );
  });

  it("binds the summary to a full 40-character workflow/candidate SHA", () => {
    const fixture = qualificationFixture();
    fixture.identity.frontendSha = "abc123";
    expect(() => validate(fixture)).toThrow("must be a full 40-character Git SHA");
  });

  it("binds the summary run URL to the provenance run ID", () => {
    const fixture = qualificationFixture();
    fixture.expectedProvenance.runId = "123";
    expect(() => validate(fixture)).toThrow(
      "trusted provenance does not match the expected release identity",
    );
  });

  it("rejects the circular candidate-as-controller trust pattern", () => {
    const fixture = qualificationFixture();
    fixture.expectedProvenance.controllerSha = fixture.identity.frontendSha;
    expect(() => validate(fixture)).toThrow(
      "trusted controller SHA must be independent from the frontend candidate SHA",
    );
  });

  it("rejects a critical summary symlink in artifact-root mode", () => {
    const fixture = qualificationFixture();
    const summaryPath = path.join(fixture.root, RELEASE_GATE_CRITICAL_ARTIFACT_PATHS.summary);
    const target = `${summaryPath}.target`;
    fs.renameSync(summaryPath, target);
    fs.symlinkSync(target, summaryPath);
    expect(() => validateReleaseQualificationEvidenceFromArtifactRoot({
      trustedArtifactRoot: fixture.root,
      expectedIdentity: fixture.identity,
      expectedProvenance: fixture.expectedProvenance,
    })).toThrow("regular, non-symlink file");
  });

  it("detects an inode swap between lstat and open", () => {
    const initial = {
      dev: 1,
      ino: 10,
      mode: 0o100644,
      size: 10,
      mtimeMs: 100,
      ctimeMs: 100,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    let closed = false;
    const fsImpl = {
      constants: fs.constants,
      lstatSync: () => initial,
      openSync: () => 9,
      fstatSync: () => ({ ...initial, ino: 11 }),
      readFileSync: () => Buffer.alloc(10),
      closeSync: () => { closed = true; },
    };
    expect(() => readBoundedRegularFile("/tmp/fake-evidence.json", { fsImpl }))
      .toThrow("changed identity between lstat and open");
    expect(closed).toBe(true);
  });

  it("detects same-inode evidence mutation during the read", () => {
    const initial = {
      dev: 1,
      ino: 10,
      mode: 0o100644,
      size: 10,
      mtimeMs: 100,
      ctimeMs: 100,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    let fstatCalls = 0;
    const fsImpl = {
      constants: fs.constants,
      lstatSync: () => initial,
      openSync: () => 9,
      fstatSync: () => {
        fstatCalls += 1;
        return fstatCalls === 1 ? initial : { ...initial, ctimeMs: 101 };
      },
      readFileSync: () => Buffer.alloc(10),
      closeSync: () => {},
    };
    expect(() => readBoundedRegularFile("/tmp/fake-evidence.json", { fsImpl }))
      .toThrow("changed while it was read");
  });

  it("rejects evidence above its byte bound before reading", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-bound-"));
    temporaryRoots.push(root);
    const evidence = path.join(root, "oversized.json");
    fs.writeFileSync(evidence, "x");
    fs.truncateSync(evidence, MAX_RELEASE_GATE_EVIDENCE_BYTES + 1);
    expect(() => readBoundedRegularFile(evidence)).toThrow("exceeds its");
  });

  it("keeps the contract dormant and free of workflow/runtime imports", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const workflow = fs.readFileSync(
      path.join(repoRoot, ".github/workflows/pantheon-integration-gate.yml"),
      "utf8",
    );
    expect(workflow).not.toContain("release-gate-contract");
    expect(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"))
      .not.toContain("validateReleaseQualificationEvidence");
  });
});
