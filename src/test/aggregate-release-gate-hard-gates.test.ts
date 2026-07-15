import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const aggregateScript = resolve(
  process.cwd(),
  "scripts/aggregate-release-gate.mjs",
);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

type GateCheck = {
  label: string;
  status: string;
  note: string;
  evidence: string;
};

const hardGateKeys = [
  "release_identity",
  "deploy_controller",
  "candidate",
  "release_identity_final",
] as const;

const gate1Keys = [
  "install",
  "release_identity",
  "lint",
  "test",
  "deploy_controller",
  "build",
  "candidate",
  "bundle_budget",
  "contract",
  "mgmt_persona_3000",
  "release_identity_final",
] as const;

const hardGateLabels = {
  release_identity: "Release identity was captured before validation.",
  deploy_controller:
    "`npm run test:deploy-release` passes (deployment controller regression).",
  candidate: "Immutable release candidate was prepared.",
  release_identity_final:
    "BFF release identity was revalidated after validation.",
} as const;
const candidateFinalLabel =
  "Immutable release candidate passed final verification.";

function gate1For(
  overrides: Record<string, { outcome: string } | undefined> = {},
  envOverrides: Record<string, string> = {},
) {
  const auditDir = mkdtempSync(join(tmpdir(), "pantheon-gate1-hard-gates-"));
  tempDirs.push(auditDir);
  const jsonOut = join(auditDir, "summary.json");
  const outcomes: Record<string, { outcome: string; evidence?: string }> =
    Object.fromEntries(
      gate1Keys.map((key) => [
        key,
        { outcome: "success", evidence: join(auditDir, `${key}.json`) },
      ]),
    );

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete outcomes[key];
    else outcomes[key] = value;
  }

  writeFileSync(
    join(auditDir, "release-gate-step-outcomes.json"),
    `${JSON.stringify(outcomes)}\n`,
  );
  const result = spawnSync(
    "node",
    [aggregateScript, "--audit-dir", auditDir, "--json-out", jsonOut],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REF: "refs/pull/1/merge",
        PANTHEON_HOSTED_FE_HARD_GATE: "true",
        ...envOverrides,
      },
    },
  );

  expect(result.error).toBeUndefined();
  return (
    JSON.parse(readFileSync(jsonOut, "utf8")) as {
      gates: Record<string, GateCheck[]>;
    }
  ).gates["1"];
}

describe("release Gate 1 deployment hard gates", () => {
  it("records all available candidate and identity hard gates", () => {
    const gate = gate1For();

    for (const key of hardGateKeys) {
      expect(
        gate.find((check) => check.label === hardGateLabels[key])?.status,
      ).toBe("pass");
    }
    expect(
      gate.filter((check) =>
        hardGateKeys.some((key) => check.evidence.endsWith(`${key}.json`)),
      ),
    ).toHaveLength(hardGateKeys.length);
  });

  it.each(hardGateKeys)("fails closed when %s fails", (key) => {
    const gate = gate1For({ [key]: { outcome: "failure" } });

    expect(
      gate.find((check) => check.label === hardGateLabels[key])?.status,
    ).toBe("fail");
  });

  it.each(hardGateKeys)("fails closed when %s is absent", (key) => {
    const gate = gate1For({ [key]: undefined });
    expect(
      gate.find((check) => check.label === hardGateLabels[key]),
    ).toMatchObject({
      status: "missing",
      note: "step outcome missing",
    });
  });

  it.each(hardGateKeys)("fails closed when %s is skipped", (key) => {
    const gate = gate1For({ [key]: { outcome: "skipped" } });
    expect(
      gate.find((check) => check.label === hardGateLabels[key]),
    ).toMatchObject({
      status: "fail",
      note: "outcome: skipped; required hard gate cannot be skipped",
    });
  });

  it("requires successful final candidate verification on a dev push", () => {
    const gate = gate1For(
      { candidate_final: { outcome: "success" } },
      { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/dev" },
    );

    expect(
      gate.find((check) => check.label === candidateFinalLabel)?.status,
    ).toBe("pass");
  });

  it("fails a dev push when final candidate verification fails", () => {
    const gate = gate1For(
      { candidate_final: { outcome: "failure" } },
      { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/dev" },
    );

    expect(
      gate.find((check) => check.label === candidateFinalLabel)?.status,
    ).toBe("fail");
  });

  it("fails closed when final candidate verification is missing on a dev push", () => {
    const gate = gate1For(
      {},
      { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/dev" },
    );

    expect(
      gate.find((check) => check.label === candidateFinalLabel),
    ).toMatchObject({
      status: "missing",
      note: "step outcome missing",
    });
  });

  it.each([
    ["pull_request", "refs/pull/1/merge"],
    ["workflow_dispatch", "refs/heads/dev"],
    ["push", "refs/heads/feature/test"],
  ])(
    "does not require final candidate verification for %s at %s",
    (eventName, ref) => {
      const gate = gate1For(
        {},
        { GITHUB_EVENT_NAME: eventName, GITHUB_REF: ref },
      );

      expect(gate.some((check) => check.label === candidateFinalLabel)).toBe(
        false,
      );
    },
  );
});
