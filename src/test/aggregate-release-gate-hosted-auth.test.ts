import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const aggregateScript = resolve(process.cwd(), "scripts/aggregate-release-gate.mjs");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function gate4For(summaryLines: string[]) {
  const auditDir = mkdtempSync(join(tmpdir(), "pantheon-gate4-auth-"));
  tempDirs.push(auditDir);
  const jsonOut = join(auditDir, "summary.json");
  writeFileSync(
    join(auditDir, "hosted-browser-bff-probe-2026-07-14.md"),
    `# Frontend Browser BFF Probe\n\n## Summary\n\n${summaryLines.map((line) => `- ${line}`).join("\n")}\n`,
  );
  writeFileSync(
    join(auditDir, "release-gate-step-outcomes.json"),
    `${JSON.stringify({ browser_probe: { outcome: "success", evidence: "hosted-browser-bff-probe.log" } })}\n`,
  );

  spawnSync("node", [aggregateScript, "--audit-dir", auditDir, "--json-out", jsonOut], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PANTHEON_HOSTED_FE_HARD_GATE: "true" },
  });
  return (JSON.parse(readFileSync(jsonOut, "utf8")) as {
    gates: Record<string, Array<{ label: string; note: string; status: string }>>;
  }).gates["4"];
}

const safeUnauthenticatedSummary = [
  "contains intended BFF URL: true",
  "required core BFF responses complete: true",
  "persona fleet row count: 0",
  "persona fleet has NaN: false",
  "persona fleet has auth-required state: true",
  "persona fleet has non-production rows: false",
  "persona fleet seed fallback armed: false",
  "browser BFF write-method request count: 0",
  "request count: 5",
  "response count: 5",
  "failed count: 0",
  "old BFF URL hit count: 0",
  "contains old BFF URL: false",
  "pass: true",
];

describe("release Gate 4 unauthenticated Persona Fleet contract", () => {
  it("passes only the explicit fail-closed state with no unsafe content", () => {
    const checks = gate4For(safeUnauthenticatedSummary);
    const personaChecks = checks.filter((check) => check.label.includes("Persona Fleet") || check.label.includes("live banner"));

    expect(personaChecks).toHaveLength(2);
    expect(personaChecks.every((check) => check.status === "pass")).toBe(true);
    expect(
      checks.find((check) => check.label === "Browser receives required BFF responses.")
        ?.note,
    ).toContain("responses 5/5");
  });

  it("fails when the unauthenticated state contains NaN", () => {
    const checks = gate4For(
      safeUnauthenticatedSummary.map((line) => line === "persona fleet has NaN: false" ? "persona fleet has NaN: true" : line),
    );
    const personaCheck = checks.find((check) => check.label.includes("Persona Fleet"));

    expect(personaCheck?.status).toBe("fail");
  });

  it("passes the probe's explicit safe informational live-empty state", () => {
    const checks = gate4For([
      ...safeUnauthenticatedSummary.map((line) => line === "persona fleet has auth-required state: true" ? "persona fleet has auth-required state: false" : line),
      "persona fleet rows valid (informational while unauthenticated): true",
      "persona fleet live banner valid (informational while unauthenticated): true",
    ]);
    const personaChecks = checks.filter((check) => check.label.includes("Persona Fleet") || check.label.includes("live banner"));

    expect(personaChecks.every((check) => check.status === "pass")).toBe(true);
  });

  it.each([
    ["persona fleet has auth-required state: true", "persona fleet has auth-required state: false"],
    ["persona fleet has non-production rows: false", "persona fleet has non-production rows: true"],
    ["persona fleet seed fallback armed: false", "persona fleet seed fallback armed: true"],
  ])("fails when the fail-closed invariant changes from %s to %s", (safeLine, unsafeLine) => {
    const checks = gate4For(
      safeUnauthenticatedSummary.map((line) => line === safeLine ? unsafeLine : line),
    );
    const personaChecks = checks.filter((check) => check.label.includes("Persona Fleet") || check.label.includes("live banner"));

    expect(personaChecks.some((check) => check.status === "fail")).toBe(true);
  });

  it("fails the page-load check when the probe reports pass false", () => {
    const checks = gate4For(
      safeUnauthenticatedSummary.map((line) => line === "pass: true" ? "pass: false" : line),
    );

    expect(checks.find((check) => check.label === "Frontend page loads.")?.status).toBe("fail");
  });
});
