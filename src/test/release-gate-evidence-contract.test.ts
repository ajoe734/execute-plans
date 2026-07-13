import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MANAGEMENT_ACCEPTANCE_PROFILE,
  MANAGEMENT_ACCEPTANCE_SCHEMA_VERSION,
  RELEASE_GATE_NUMBERS,
  RELEASE_GATE_QUALIFICATION_PROFILE,
  RELEASE_GATE_SCHEMA,
  RELEASE_GATE_SCHEMA_VERSION,
  RELEASE_GATE_STEP_OUTCOME_KEYS,
  createGateChecks,
  deriveReleaseGateResult,
} from "../../scripts/release-gate-contract/schema.mjs";
import {
  MAX_RELEASE_GATE_EVIDENCE_BYTES,
  createManagementAcceptanceResult,
  createStepOutcomeBinding,
  deriveManagementAcceptanceGate,
  deriveReleaseDecisionGate,
  readBoundedRegularFile,
  validateReleaseQualificationEvidence,
  validateReleaseQualificationEvidenceFromFile,
} from "../../scripts/release-gate-contract/evidence-contract.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

function releaseIdentity() {
  return {
    frontendSha: "a".repeat(40),
    backendSha: "b".repeat(40),
    feBaseUrl: "https://pantheon-dev-fe.example.invalid",
    bffBaseUrl: "https://pantheon-dev-bff.example.invalid",
    runUrl: "https://github.com/ajoe734/execute-plans/actions/runs/987654",
    leaseId: "qualification-lease-987654",
  };
}

function rawStepOutcomes(outcome = "success") {
  return Object.fromEntries(RELEASE_GATE_STEP_OUTCOME_KEYS.map((key) => [
    key,
    { outcome, evidence: `.lovable/audits/${key}.log` },
  ]));
}

function rawBytes(outcomes = rawStepOutcomes()) {
  return Buffer.from(`${JSON.stringify(outcomes, null, 2)}\n`);
}

function allPassManagementAcceptance(identity = releaseIdentity()) {
  const checks = createGateChecks(8, "pass", "fixture evidence passed");
  return {
    schemaVersion: MANAGEMENT_ACCEPTANCE_SCHEMA_VERSION,
    profile: MANAGEMENT_ACCEPTANCE_PROFILE,
    releaseGateSchemaVersion: RELEASE_GATE_SCHEMA_VERSION,
    qualificationProfile: RELEASE_GATE_QUALIFICATION_PROFILE,
    identity: { ...identity },
    checks,
    result: createManagementAcceptanceResult(checks),
  };
}

function qualificationFixture() {
  const identity = releaseIdentity();
  const outcomesBytes = rawBytes();
  const managementAcceptance = allPassManagementAcceptance(identity);
  const gates: Record<string, Array<Record<string, unknown>>> = {};
  for (const gate of RELEASE_GATE_NUMBERS) {
    if (gate === 7 || gate === 8) continue;
    gates[String(gate)] = createGateChecks(gate, "pass", "fixture evidence passed");
  }
  gates["8"] = deriveManagementAcceptanceGate(managementAcceptance, identity);
  gates["7"] = deriveReleaseDecisionGate(gates, identity, true);
  const summary = {
    schemaVersion: RELEASE_GATE_SCHEMA_VERSION,
    qualificationProfile: RELEASE_GATE_QUALIFICATION_PROFILE,
    releaseQualification: true,
    overall: "pass",
    identity: { ...identity },
    auditEvidencePresent: true,
    stepOutcomes: createStepOutcomeBinding(outcomesBytes),
    gates,
  };
  return { identity, outcomesBytes, managementAcceptance, summary };
}

type QualificationFixture = ReturnType<typeof qualificationFixture>;

function recomputeDecision(fixture: QualificationFixture) {
  fixture.summary.gates["8"] = deriveManagementAcceptanceGate(
    fixture.managementAcceptance,
    fixture.identity,
  );
  fixture.summary.gates["7"] = deriveReleaseDecisionGate(
    fixture.summary.gates,
    fixture.identity,
    fixture.summary.auditEvidencePresent,
  );
  fixture.summary.overall = Object.values(fixture.summary.gates)
    .flat()
    .every((check) => check.status === "pass")
    ? "pass"
    : "fail";
}

function replaceRawOutcomes(fixture: QualificationFixture, outcomes: object) {
  fixture.outcomesBytes = rawBytes(outcomes);
  fixture.summary.stepOutcomes = createStepOutcomeBinding(fixture.outcomesBytes);
}

function validate(fixture = qualificationFixture()) {
  return validateReleaseQualificationEvidence({
    summary: fixture.summary,
    rawStepOutcomeBytes: fixture.outcomesBytes,
    managementAcceptance: fixture.managementAcceptance,
    expectedIdentity: fixture.identity,
  });
}

describe("dormant release-gate evidence contract", () => {
  it("defines one exact 79-check Gate 0..8 schema", () => {
    expect(RELEASE_GATE_NUMBERS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(RELEASE_GATE_NUMBERS.map((gate) => RELEASE_GATE_SCHEMA.gates[String(gate)].checks.length))
      .toEqual([7, 7, 6, 15, 9, 16, 5, 4, 10]);
    expect(RELEASE_GATE_NUMBERS.flatMap((gate) => RELEASE_GATE_SCHEMA.gates[String(gate)].checks))
      .toHaveLength(79);
    expect(new Set(
      RELEASE_GATE_NUMBERS.flatMap((gate) =>
        RELEASE_GATE_SCHEMA.gates[String(gate)].checks.map((check) => check.id)),
    ).size).toBe(79);
  });

  it("accepts a fully bound, exact, all-pass offline qualification", () => {
    expect(validate()).toEqual({
      status: "valid",
      frontendSha: "a".repeat(40),
      backendSha: "b".repeat(40),
      runUrl: "https://github.com/ajoe734/execute-plans/actions/runs/987654",
      leaseId: "qualification-lease-987654",
      gateCount: 9,
      checkCount: 79,
      stepOutcomeCount: 18,
    });
  });

  it.each(["warn", "skip", "missing", "fail"])(
    "treats a %s result as non-passing",
    (status) => {
      expect(deriveReleaseGateResult([{ status }])).toEqual({ overall: status, pass: false });
    },
  );

  it.each(["warn", "skip", "missing", "fail"])(
    "requires 79/79 pass and rejects a coherent Gate 8 %s",
    (status) => {
      const fixture = qualificationFixture();
      fixture.managementAcceptance.checks[0].status = status;
      fixture.managementAcceptance.result = createManagementAcceptanceResult(
        fixture.managementAcceptance.checks,
      );
      recomputeDecision(fixture);

      expect(() => validate(fixture)).toThrow("exactly 79 passing checks");
      expect(fixture.summary.gates["7"][0].status).toBe("fail");
    },
  );

  it("recomputes Gate 7 and rejects a forged release decision", () => {
    const fixture = qualificationFixture();
    fixture.summary.gates["7"][0].note = "forged decision";

    expect(() => validate(fixture)).toThrow("Gate 7 does not match its recomputed value");
  });

  it("turns missing or malformed Gate 8 evidence into ten failures", () => {
    for (const malformed of [null, {}, { schemaVersion: 1 }]) {
      const checks = deriveManagementAcceptanceGate(malformed, releaseIdentity());
      expect(checks).toHaveLength(10);
      expect(checks.every((check) => check.status === "fail")).toBe(true);
    }
  });

  it("rejects an all-pass summary when Gate 8 evidence is malformed", () => {
    const fixture = qualificationFixture();
    fixture.managementAcceptance = null as unknown as QualificationFixture["managementAcceptance"];

    expect(() => validate(fixture)).toThrow("Gate 8 does not match its recomputed value");
  });

  it.each([
    "frontendSha",
    "backendSha",
    "feBaseUrl",
    "bffBaseUrl",
    "runUrl",
    "leaseId",
  ] as const)("binds Gate 8 to the exact %s", (field) => {
    const fixture = qualificationFixture();
    if (field.endsWith("Sha")) fixture.managementAcceptance.identity[field] = "c".repeat(40);
    else if (field.endsWith("Url")) fixture.managementAcceptance.identity[field] =
      field === "runUrl"
        ? "https://github.com/ajoe734/execute-plans/actions/runs/123"
        : "https://attacker.invalid";
    else fixture.managementAcceptance.identity[field] = "attacker-lease";

    expect(() => validate(fixture)).toThrow("Gate 8 does not match its recomputed value");
  });

  it.each(["pass", "overall"] as const)("recomputes Gate 8 result.%s", (field) => {
    const fixture = qualificationFixture();
    if (field === "pass") fixture.managementAcceptance.result.pass = false;
    else fixture.managementAcceptance.result.overall = "fail";

    expect(() => validate(fixture)).toThrow("Gate 8 does not match its recomputed value");
  });

  it("requires full 40-character frontend and backend SHAs", () => {
    for (const field of ["frontendSha", "backendSha"] as const) {
      const fixture = qualificationFixture();
      fixture.identity[field] = "abc123";
      expect(() => validate(fixture)).toThrow("must be a full 40-character Git SHA");
    }
  });

  it("rejects a summary identity that differs from the caller's expected identity", () => {
    const fixture = qualificationFixture();
    fixture.summary.identity.frontendSha = "c".repeat(40);

    expect(() => validate(fixture)).toThrow("release summary identity does not match");
  });

  it("binds the raw outcomes digest to exact bytes", () => {
    const fixture = qualificationFixture();
    fixture.outcomesBytes = Buffer.concat([fixture.outcomesBytes, Buffer.from(" \n")]);

    expect(() => validate(fixture)).toThrow("SHA-256 mismatch");
  });

  it("rejects a self-asserted fake raw outcomes digest", () => {
    const fixture = qualificationFixture();
    fixture.summary.stepOutcomes.sha256 = "d".repeat(64);

    expect(() => validate(fixture)).toThrow("SHA-256 mismatch");
  });

  it.each(["failure", "cancelled", "skipped"])(
    "rejects an exact raw outcome whose value is %s",
    (outcome) => {
      const fixture = qualificationFixture();
      const outcomes = rawStepOutcomes();
      outcomes.install.outcome = outcome;
      replaceRawOutcomes(fixture, outcomes);

      expect(() => validate(fixture)).toThrow("non-success step outcomes: install");
    },
  );

  it("rejects raw outcomes with reordered keys", () => {
    const fixture = qualificationFixture();
    const outcomes = Object.fromEntries(Object.entries(rawStepOutcomes()).reverse());
    replaceRawOutcomes(fixture, outcomes);

    expect(() => validate(fixture)).toThrow("exact ordered 18-outcome contract");
  });

  it("rejects raw outcomes with extra keys or entry fields", () => {
    const injectedKey = { ...rawStepOutcomes(), injected: { outcome: "success", evidence: "x.log" } };
    const injectedField = rawStepOutcomes();
    injectedField.install = { ...injectedField.install, attacker: true } as typeof injectedField.install;
    for (const outcomes of [injectedKey, injectedField]) {
      const fixture = qualificationFixture();
      replaceRawOutcomes(fixture, outcomes);
      expect(() => validate(fixture)).toThrow("exact ordered 18-outcome contract");
    }
  });

  it("rejects malformed raw outcomes JSON", () => {
    const fixture = qualificationFixture();
    fixture.outcomesBytes = Buffer.from('{"install":');

    expect(() => validate(fixture)).toThrow(/not (?:valid|exact) JSON/);
  });

  it("rejects duplicate top-level or entry JSON keys", () => {
    const canonical = rawBytes().toString("utf8");
    const duplicateTopLevel = canonical.replace(
      "{\n",
      '{\n  "install": { "outcome": "success", "evidence": "duplicate.log" },\n',
    );
    const duplicateEntryField = canonical.replace(
      '"outcome": "success",',
      '"outcome": "failure", "outcome": "success",',
    );
    for (const text of [duplicateTopLevel, duplicateEntryField]) {
      const fixture = qualificationFixture();
      fixture.outcomesBytes = Buffer.from(text);
      expect(() => validate(fixture)).toThrow("duplicate object key");
    }
  });

  it.each([
    {
      label: "summary",
      mutate: (fixture: QualificationFixture) => {
        (fixture.summary as typeof fixture.summary & { attacker?: boolean }).attacker = true;
      },
    },
    {
      label: "binding",
      mutate: (fixture: QualificationFixture) => {
        (fixture.summary.stepOutcomes as typeof fixture.summary.stepOutcomes & { attacker?: boolean }).attacker = true;
      },
    },
    {
      label: "check",
      mutate: (fixture: QualificationFixture) => {
        (fixture.summary.gates["0"][0] as Record<string, unknown>).attacker = true;
      },
    },
    {
      label: "management manifest",
      mutate: (fixture: QualificationFixture) => {
        (fixture.managementAcceptance as typeof fixture.managementAcceptance & { attacker?: boolean }).attacker = true;
      },
    },
  ])("rejects an extra $label field", ({ mutate }) => {
    const fixture = qualificationFixture();
    mutate(fixture);

    expect(() => validate(fixture)).toThrow(/fields are not exact|Gate 8 does not match/);
  });

  it("rejects missing or extra gates and checks", () => {
    const missingGate = qualificationFixture();
    delete missingGate.summary.gates["6"];
    expect(() => validate(missingGate)).toThrow("release gate keys are not exact");

    const extraCheck = qualificationFixture();
    extraCheck.summary.gates["1"].push({ ...extraCheck.summary.gates["1"][0] });
    expect(() => validate(extraCheck)).toThrow("check count mismatch");
  });

  it("rejects a raw evidence path that is a symlink", () => {
    const fixture = qualificationFixture();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-contract-"));
    temporaryRoots.push(root);
    const target = path.join(root, "target.json");
    const link = path.join(root, "release-gate-step-outcomes.json");
    fs.writeFileSync(target, fixture.outcomesBytes);
    fs.symlinkSync(target, link);

    expect(() => validateReleaseQualificationEvidenceFromFile({
      summary: fixture.summary,
      rawStepOutcomesPath: link,
      managementAcceptance: fixture.managementAcceptance,
      expectedIdentity: fixture.identity,
    })).toThrow("regular, non-symlink file");
  });

  it("detects an inode swap between lstat and open", () => {
    const fixture = qualificationFixture();
    const initial = {
      dev: 1,
      ino: 10,
      size: fixture.outcomesBytes.length,
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
      readFileSync: () => fixture.outcomesBytes,
      closeSync: () => { closed = true; },
    };

    expect(() => readBoundedRegularFile("/tmp/fake-evidence.json", { fsImpl }))
      .toThrow("changed identity between lstat and open");
    expect(closed).toBe(true);
  });

  it("detects same-inode evidence mutation during the read", () => {
    const fixture = qualificationFixture();
    const initial = {
      dev: 1,
      ino: 10,
      size: fixture.outcomesBytes.length,
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
        return fstatCalls === 1 ? initial : { ...initial, mtimeMs: 101, ctimeMs: 101 };
      },
      readFileSync: () => fixture.outcomesBytes,
      closeSync: () => {},
    };

    expect(() => readBoundedRegularFile("/tmp/fake-evidence.json", { fsImpl }))
      .toThrow("changed while it was read");
  });

  it("rejects raw evidence above the byte bound before reading it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-gate-contract-"));
    temporaryRoots.push(root);
    const evidence = path.join(root, "oversized.json");
    fs.writeFileSync(evidence, "x");
    fs.truncateSync(evidence, MAX_RELEASE_GATE_EVIDENCE_BYTES + 1);

    expect(() => readBoundedRegularFile(evidence)).toThrow("exceeds its");
  });

  it("uses a byte-level SHA-256 rather than a parsed-JSON digest", () => {
    const bytes = rawBytes();
    const binding = createStepOutcomeBinding(bytes);
    expect(binding.sha256).toBe(crypto.createHash("sha256").update(bytes).digest("hex"));
    expect(binding.sha256).not.toBe(
      crypto.createHash("sha256").update(JSON.stringify(JSON.parse(bytes.toString("utf8")))).digest("hex"),
    );
  });
});
