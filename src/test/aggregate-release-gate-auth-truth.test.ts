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

describe("success, missing-auth and permitted-skip regressions", () => {
  const hostedRe = [/route-load/, /load gate/, /acceptance step/, /desktop Playwright/, /F12 hosted/];

  it("genuine required success: every required hosted probe passes, none is advisory, no hosted probe blocks admission", () => {
    const { summary } = run({ steps: allPass, desktop: f12("expected"), hardGate: "false" });
    for (const re of hostedRe) expect(labelOf(summary, re)?.status).toBe("pass");
    const hostedBlockers = summary.gates["8"].filter(
      (c) => hostedRe.some((re) => re.test(c.label)) && c.status !== "pass",
    );
    expect(hostedBlockers).toEqual([]);
    expect(summary.advisoryFailures.some((a) => hostedRe.some((re) => re.test(a.label)))).toBe(false);
  });

  it("missing short-lived auth (acceptance step skipped/failed) blocks and exits non-zero, never pass", () => {
    for (const outcome of ["skipped", "failure", "cancelled"]) {
      const { summary, status } = run({
        steps: { ...allPass, mgmt_hosted_accept: outcome },
        desktop: f12("expected"),
        hardGate: "false",
      });
      expect(labelOf(summary, /acceptance step/)?.status).not.toBe("pass");
      expect(["fail", "missing"]).toContain(labelOf(summary, /acceptance step/)?.status);
      expect(status).toBe(1);
      expect(summary.releaseReadiness).toBe("blocked");
    }
  });

  it("unrequested write/Loops/provider proof steps being skipped never affect required hosted probe verdicts", () => {
    const { summary } = run({
      steps: { ...allPass, pint_hosted_e2e: "skipped", mgmt_persona_3000: "skipped", mgmt_live_deep: "skipped" },
      desktop: f12("expected"),
      hardGate: "false",
    });
    for (const re of hostedRe) expect(labelOf(summary, re)?.status).toBe("pass");
  });
});

// Workflow wiring regressions (read-only auth path in integration-gate).

const wiringWorkflow = readFileSync(resolve(process.cwd(), ".github/workflows/pantheon-integration-gate.yml"), "utf8");
const gate = wiringWorkflow.slice(wiringWorkflow.indexOf("\n  integration-gate:"), wiringWorkflow.indexOf("\n  authorized-write-proof:"));
const step = (id: string) => {
  const start = gate.indexOf(`        id: ${id}\n`);
  expect(start, id).toBeGreaterThan(-1);
  return gate.slice(start, gate.indexOf("\n      - name:", start));
};

describe("integration-gate stays on the secretless boundary", () => {
  it("references no secrets and provisions no probe credential in the ordinary job", () => {
    expect(gate).not.toContain("secrets.");
    expect(gate).not.toMatch(/BFF_AUTH_TOKEN|DEV_LOGIN|ro_auth/);
  });
  it("write-proof steps stay in the authorized job", () => {
    expect(step("pint_hosted_e2e")).not.toContain("BFF_AUTH_TOKEN");
  });
});

// Behavior regressions for the pinned credential target + storage-free bearer.
describe("pinned BFF bearer helper", () => {
  const load = () => import("../../scripts/lib/pinned-bff-bearer.mjs");
  it("accepts maintained dev origins and local candidate preview only", async () => {
    const { pinnedTargetProblem } = await load();
    const bff = "https://api.dev.mvl-cap.tw";
    expect(pinnedTargetProblem({ feBase: "https://app.dev.mvl-cap.tw", bffBase: bff, env: {} })).toBe("");
    expect(pinnedTargetProblem({ feBase: "http://127.0.0.1:4173", bffBase: bff + "/", env: {} })).toBe("");
    expect(pinnedTargetProblem({ feBase: "https://evil.example", bffBase: bff, env: {} })).toMatch(/FE origin/);
    expect(pinnedTargetProblem({ feBase: "http://127.0.0.1:4173", bffBase: "https://evil.example", env: {} })).toMatch(/BFF origin/);
    expect(pinnedTargetProblem({ feBase: "http://127.0.0.1:4173", bffBase: "http://api.dev.mvl-cap.tw", env: {} })).toMatch(/BFF origin/);
  });
  it("refuses to install the bearer on an unpinned target and scopes it to the BFF origin", async () => {
    const { installPinnedBffBearer } = await load();
    const routes: Array<{ pattern: string; handler: (r: unknown) => unknown }> = [];
    const ctx = { route: async (pattern: string, handler: (r: unknown) => unknown) => { routes.push({ pattern, handler }); } };
    await expect(installPinnedBffBearer(ctx, { token: "t", feBase: "https://evil.example", bffBase: "https://api.dev.mvl-cap.tw", env: {} })).rejects.toThrow(/Refusing/);
    expect(routes).toHaveLength(0);
    await installPinnedBffBearer(ctx, { token: "tok", feBase: "http://127.0.0.1:4173", bffBase: "https://api.dev.mvl-cap.tw", env: {} });
    expect(routes[0].pattern).toBe("https://api.dev.mvl-cap.tw/**");
    const cont: unknown[] = [];
    const mk = (url: string) => ({ request: () => ({ url: () => url, headers: () => ({ accept: "x" }) }), continue: (o?: unknown) => cont.push(o ?? "plain") });
    routes[0].handler(mk("https://api.dev.mvl-cap.tw/bff/me"));
    routes[0].handler(mk("https://api.dev.mvl-cap.tw.evil.example/bff/me"));
    expect(cont[0]).toEqual({ headers: { accept: "x", authorization: "Bearer tok" } });
    expect(cont[1]).toBe("plain");
  });
  it("probe scripts no longer write the bearer into retired browser storage", () => {
    for (const f of ["scripts/probe-route-load-baseline.mjs", "scripts/accept-management-hosted-production.mjs"]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/pantheon_operator_token|pantheon\.bff\.bearerToken|[sS]torage\.setItem|target\.setItem/);
      expect(src).toContain("installPinnedBffBearer");
    }
  });
});
