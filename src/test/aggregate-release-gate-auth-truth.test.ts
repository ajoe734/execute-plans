import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const aggregateScript = resolve(process.cwd(), "scripts/aggregate-release-gate.mjs");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Check = { label: string; status: string; note: string };
type Summary = {
  overall: string;
  releaseReadiness: string;
  advisoryFailures: Array<{ label: string }>;
  gates: Record<string, Check[]>;
};

function run(opts: {
  steps: Record<string, string>;
  desktop?: unknown;
  hardGate: "true" | "false";
}) {
  const dir = mkdtempSync(join(tmpdir(), "pantheon-auth-truth-"));
  dirs.push(dir);
  const jsonOut = join(dir, "summary.json");
  writeFileSync(
    join(dir, "release-gate-step-outcomes.json"),
    JSON.stringify(Object.fromEntries(Object.entries(opts.steps).map(([k, v]) => [k, { outcome: v }]))),
  );
  if (opts.desktop) writeFileSync(join(dir, "playwright-desktop-results.json"), JSON.stringify(opts.desktop));
  const res = spawnSync("node", [aggregateScript, "--audit-dir", dir, "--json-out", jsonOut], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PANTHEON_HOSTED_FE_HARD_GATE: opts.hardGate },
  });
  return { summary: JSON.parse(readFileSync(jsonOut, "utf8")) as Summary, status: res.status };
}

const f12 = (status: string) => ({
  suites: [
    {
      file: "12-approvals.spec.ts",
      title: "12-approvals.spec.ts",
      specs: [
        {
          title: "F12 authenticated approval owner readback",
          file: "12-approvals.spec.ts",
          tests: [{ status, results: [{ status: status === "expected" ? "passed" : status === "skipped" ? "skipped" : "failed" }] }],
        },
      ],
    },
  ],
});

const realFailures = { route_load: "failure", mgmt_load_gate: "failure", mgmt_hosted_accept: "failure", e2e: "failure" };
const allPass = { route_load: "success", mgmt_load_gate: "success", mgmt_hosted_accept: "success", e2e: "success" };
const labelOf = (s: Summary, re: RegExp) => s.gates["8"].find((c) => re.test(c.label));

describe("hosted probe truth (failed real probes are never PASS)", () => {
  it("hard gate: failed route-load, load-gate, acceptance, desktop E2E and F12 all fail", () => {
    const { summary, status } = run({ steps: realFailures, desktop: f12("unexpected"), hardGate: "true" });
    for (const re of [/route-load/, /load gate/, /acceptance step/, /desktop Playwright/, /F12 hosted/]) {
      expect(labelOf(summary, re)?.status).toBe("fail");
    }
    expect(status).toBe(1);
    expect(summary.releaseReadiness).toBe("blocked");
  });

  it("advisory pre-switch mode does NOT soften required authenticated probes: failures fail Gate 7 and exit 1", () => {
    const { summary, status } = run({ steps: realFailures, desktop: f12("unexpected"), hardGate: "false" });
    for (const re of [/route-load/, /load gate/, /acceptance step/, /desktop Playwright/, /F12 hosted/]) {
      expect(labelOf(summary, re)?.status).toBe("fail");
    }
    expect(summary.gates["7"][0].status).toBe("fail");
    expect(summary.releaseReadiness).toBe("blocked");
    expect(status).toBe(1);
  });

  it("absent hosted F12 results in advisory mode is missing and blocks", () => {
    const { summary, status } = run({ steps: allPass, hardGate: "false" });
    expect(labelOf(summary, /F12 hosted/)?.status).toBe("missing");
    expect(status).toBe(1);
  });

  it("missing desktop results or a skipped F12 owner readback is not a pass", () => {
    const missing = run({ steps: allPass, hardGate: "true" }).summary;
    expect(labelOf(missing, /F12 hosted/)?.status).toBe("missing");
    const skipped = run({ steps: allPass, desktop: f12("skipped"), hardGate: "true" }).summary;
    expect(labelOf(skipped, /F12 hosted/)?.status).toBe("fail");
  });

  it("genuine hosted success passes the new checks", () => {
    const { summary } = run({ steps: allPass, desktop: f12("expected"), hardGate: "true" });
    for (const re of [/route-load/, /load gate/, /acceptance step/, /desktop Playwright/, /F12 hosted/]) {
      expect(labelOf(summary, re)?.status).toBe("pass");
    }
  });

  it("local @approval-local fixture results never satisfy hosted F12", () => {
    const dir = mkdtempSync(join(tmpdir(), "pantheon-auth-truth-"));
    dirs.push(dir);
    const jsonOut = join(dir, "summary.json");
    writeFileSync(join(dir, "release-gate-step-outcomes.json"), JSON.stringify({}));
    writeFileSync(join(dir, "playwright-results.json"), JSON.stringify(f12("expected")));
    spawnSync("node", [aggregateScript, "--audit-dir", dir, "--json-out", jsonOut], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, PANTHEON_HOSTED_FE_HARD_GATE: "true" },
    });
    const s = JSON.parse(readFileSync(jsonOut, "utf8")) as Summary;
    expect(labelOf(s, /F12 hosted/)?.status).toBe("missing");
  });
});
