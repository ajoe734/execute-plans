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
type AdvisoryFailure = {
  gate: string;
  check: string;
  name: string;
  label: string;
  status: string;
  owner: string;
  note: string;
  evidence: string;
};
type Summary = {
  overall: string;
  releaseReadiness: string;
  advisoryFailures: AdvisoryFailure[];
  advisoryFailureChecks: string[];
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
    cwd: dir,
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

  it("advisory pre-switch mode classifies failed hosted probes as advisory_fail and lists them by check name", () => {
    const { summary } = run({ steps: realFailures, desktop: f12("unexpected"), hardGate: "false" });
    for (const re of [/route-load/, /load gate/, /acceptance step/, /desktop Playwright/, /F12 hosted/]) {
      expect(labelOf(summary, re)?.status).toBe("advisory_fail");
    }
    for (const expectedCheck of [
      "Hosted route-load readiness baseline step passed.",
      "Release load gate manifest step passed.",
      "Hosted management acceptance step passed (needs genuine short-lived auth).",
      "Hosted desktop Playwright step passed.",
      "F12 hosted authenticated approval owner readback passed.",
    ]) {
      expect(summary.advisoryFailureChecks).toContain(expectedCheck);
      expect(summary.advisoryFailures).toContainEqual(
        expect.objectContaining({
          gate: "8",
          check: expectedCheck,
          name: expectedCheck,
          label: expectedCheck,
          status: "advisory_fail",
        }),
      );
    }
  });

  it("absent hosted F12 results in advisory_fail in advisory mode and missing in hard-gate mode", () => {
    const { summary } = run({ steps: allPass, hardGate: "false" });
    expect(labelOf(summary, /F12 hosted/)?.status).toBe("advisory_fail");
    expect(summary.advisoryFailureChecks).toContain(
      "F12 hosted authenticated approval owner readback passed.",
    );
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

  it("missing short-lived auth (acceptance step skipped/failed) is advisory_fail in dev mode and blocks in hard-gate mode, never pass", () => {
    for (const outcome of ["skipped", "failure", "cancelled"]) {
      const { summary: devSummary } = run({
        steps: { ...allPass, mgmt_hosted_accept: outcome },
        desktop: f12("expected"),
        hardGate: "false",
      });
      expect(labelOf(devSummary, /acceptance step/)?.status).toBe("advisory_fail");
      expect(devSummary.advisoryFailureChecks).toContain(
        "Hosted management acceptance step passed (needs genuine short-lived auth).",
      );

      const { summary: hardSummary, status: hardStatus } = run({
        steps: { ...allPass, mgmt_hosted_accept: outcome },
        desktop: f12("expected"),
        hardGate: "true",
      });
      expect(labelOf(hardSummary, /acceptance step/)?.status).toBe("fail");
      expect(hardStatus).toBe(1);
      expect(hardSummary.releaseReadiness).toBe("blocked");
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

function runFullReleaseGate(opts: {
  stepOverrides?: Record<string, string>;
  hardGate?: "true" | "false";
  eventName?: string;
  gitRef?: string;
}) {
  const dir = mkdtempSync(join(tmpdir(), "pantheon-full-gate-"));
  dirs.push(dir);
  const jsonOut = join(dir, "summary.json");

  const baseSteps: Record<string, string> = {
    install: "success",
    release_identity: "success",
    lint: "success",
    test: "success",
    deploy_controller: "success",
    build: "success",
    candidate: "success",
    bundle_budget: "success",
    contract: "success",
    mgmt_persona_3000: "success",
    fixture_e2e: "success",
    release_identity_final: "success",
    candidate_final: "success",
    route_probe: "success",
    auth_smoke: "skipped",
    write_probe: "skipped",
    mgmt_live_deep: "skipped",
    browser_probe: "failure",
    route_load: "failure",
    mgmt_load_gate: "failure",
    mgmt_hosted_accept: "failure",
    e2e: "failure",
    ...opts.stepOverrides,
  };

  writeFileSync(
    join(dir, "release-gate-step-outcomes.json"),
    JSON.stringify(Object.fromEntries(Object.entries(baseSteps).map(([k, v]) => [k, { outcome: v }]))),
  );

  // Passing Gate 3 anonymous route probe evidence
  writeFileSync(
    join(dir, "bff-route-probe-anonymous-2026-11-17.md"),
    [
      "# BFF Route Probe",
      "Canonical 404 count: 0",
      "Transport errors: 0",
      "| Status | Method | Path |",
      "|---|---|---|",
      "| 200 | GET | /livez |",
      "| 200 | GET | /openapi.json |",
      "| 200 | GET | /bff/events/stream |",
      "| 401 | GET | /bff/me |",
    ].join("\n"),
  );

  // Passing Gate 5 & Gate 6 loopback fixture Playwright evidence
  const fixtureSpecs = [
    ["01-startup-session.spec.ts", "F01 startup session"],
    ["02-control-room.spec.ts", "F02 control room"],
    ["03-execution-loop.spec.ts", "F03 execution loop"],
    ["04-optimization-loop.spec.ts", "F04 optimization loop"],
    ["06-entity-registry.spec.ts", "F07 entity registry"],
    ["08-create-intent.spec.ts", "F08 create write intent"],
    ["07-high-risk-confirm.spec.ts", "F09 high-risk confirm"],
    ["10-rollback-saga.spec.ts", "F10 rollback saga"],
    ["11-handoff-sla.spec.ts", "F11 handoff sla"],
    ["12-approvals.spec.ts", "F12 approval governance"],
    ["13-agora.spec.ts", "F13 agora"],
    ["08-sse-reconnect.spec.ts", "F14 sse reconnect"],
    ["09-strict-vs-hybrid.spec.ts", "F15 strict hybrid"],
    ["16-audit-correlation.spec.ts", "F16 audit correlation"],
    ["17-a11y-v5.spec.ts", "axe control room"],
    ["17-a11y-v5.spec.ts", "axe research loop"],
    ["17-a11y-v5.spec.ts", "axe execution loop"],
    ["17-a11y-v5.spec.ts", "axe optimization loop"],
    ["17-a11y-v5.spec.ts", "axe sentinel"],
    ["17-a11y-v5.spec.ts", "axe interventions"],
    ["17-a11y-v5.spec.ts", "drawer focus returns to trigger"],
    ["17-a11y-v5.spec.ts", "ESC focus restore"],
    ["17-a11y-v5.spec.ts", "reduced motion respected"],
    ["18-perf.spec.ts", "Cockpit load and SSE rerender budget"],
    ["18-perf.spec.ts", "entity registry first page budget"],
    ["18-perf.spec.ts", "Sentinel list load budget"],
    ["18-perf.spec.ts", "LineageGraph node budget"],
  ];
  writeFileSync(
    join(dir, "playwright-results.json"),
    JSON.stringify({
      suites: fixtureSpecs.map(([file, title]) => ({
        file,
        title: file,
        specs: [{ file, title, tests: [{ status: "expected", results: [{ status: "passed" }] }] }],
      })),
    }),
  );

  // Failing Gate 8 management 102-page crawl and hosted F12 desktop Playwright evidence
  writeFileSync(
    join(dir, "management-hosted-acceptance-2026-11-17.json"),
    JSON.stringify({
      result: { pass: false },
      gateChecks: [
        {
          label: "All crawled management routes render complete live data.",
          status: "fail",
          note: "2/102 routes timed out",
        },
      ],
    }),
  );
  writeFileSync(
    join(dir, "playwright-desktop-results.json"),
    JSON.stringify(f12("unexpected")),
  );

  const res = spawnSync("node", [aggregateScript, "--audit-dir", dir, "--json-out", jsonOut], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: opts.eventName ?? "workflow_dispatch",
      GITHUB_REF: opts.gitRef ?? "refs/heads/dev",
      PANTHEON_FRONTEND_SHA: "1432118cf0000000000000000000000000000000",
      PANTHEON_BFF_SHA: "ede3b80350000000000000000000000000000000",
      PANTHEON_FE_BASE_URL: "https://app.dev.mvl-cap.tw",
      PANTHEON_BFF_BASE_URL: "https://api.dev.mvl-cap.tw",
      PANTHEON_HOSTED_FE_HARD_GATE: opts.hardGate ?? "false",
      BFF_AUTH_TOKEN: "",
      PANTHEON_BFF_SMOKE_BEARER_TOKEN: "",
      PANTHEON_TEST_OIDC_PATH: "",
    },
  });

  return {
    summary: JSON.parse(readFileSync(jsonOut, "utf8")) as Summary,
    status: res.status,
  };
}

describe("dev release verdict: advisory-only accepted vs blocking failure rejected (RC1 step 6)", () => {
  it("accepts a run with only advisory hosted failures (exit 0) and lists every failed check name", () => {
    const { summary, status } = runFullReleaseGate({ hardGate: "false" });

    expect(status).toBe(0);
    expect(summary.overall).toBe("advisory_fail");
    expect(summary.releaseReadiness).toBe("limited");
    expect(
      summary.gates["7"].find((c) => c.label === "All critical gates pass.")?.status,
    ).toBe("pass");

    for (const checkName of [
      "Hosted acceptance: All crawled management routes render complete live data.",
      "Hosted route-load readiness baseline step passed.",
      "Release load gate manifest step passed.",
      "Hosted management acceptance step passed (needs genuine short-lived auth).",
      "Hosted desktop Playwright step passed.",
      "F12 hosted authenticated approval owner readback passed.",
    ]) {
      expect(summary.advisoryFailureChecks).toContain(checkName);
      expect(summary.advisoryFailures).toContainEqual(
        expect.objectContaining({
          check: checkName,
          name: checkName,
          label: checkName,
          status: "advisory_fail",
        }),
      );
    }
  });

  it.each([
    ["build", "workflow_dispatch"],
    ["candidate", "workflow_dispatch"],
    ["deploy_controller", "workflow_dispatch"],
    ["release_identity", "workflow_dispatch"],
    ["release_identity_final", "workflow_dispatch"],
    ["fixture_e2e", "workflow_dispatch"],
    ["contract", "workflow_dispatch"],
    ["candidate_final", "push"],
  ])("rejects a run when blocking check %s fails alongside advisory failures", (blockingKey, eventName) => {
    const { summary, status } = runFullReleaseGate({
      hardGate: "false",
      eventName,
      gitRef: "refs/heads/dev",
      stepOverrides: { [blockingKey]: "failure" },
    });

    expect(status).toBe(1);
    expect(summary.overall).toBe("fail");
    expect(summary.releaseReadiness).toBe("blocked");
    expect(
      summary.gates["7"].find((c) => c.label === "All critical gates pass.")?.status,
    ).toBe("fail");
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

describe("integration-gate credential boundary", () => {
  it("only the trusted exact-dev readonly step may reference a secret", () => {
    expect(gate.match(/secrets\.[A-Z0-9_]+/gu)).toEqual([
      "secrets.DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET",
    ]);
    const mint = step("readonly_auth");
    expect(mint).toContain("github.ref == 'refs/heads/dev'");
    expect(mint).toContain("github.event_name == 'workflow_dispatch'");
    expect(mint).toContain("continue-on-error: true");
    expect(mint).toContain("::add-mask::");
    expect(mint).not.toContain("browser_session");
  });
  it("authenticated e2e disables trace/HTML artifacts", () => {
    const e2e = step("e2e");
    expect(e2e).toContain("PANTHEON_CREDENTIALED_PLAYWRIGHT_NO_ARTIFACTS=1");
    expect(e2e).toContain("--reporter=list,json");
    expect(e2e).not.toContain("html");
  });
  it("write-proof steps stay in the authorized job", () => {
    expect(step("pint_hosted_e2e")).not.toContain("BFF_AUTH_TOKEN");
  });
});

// Behavior regressions for the pinned credential target + storage-free bearer.
describe("pinned BFF credential target in probe scripts", () => {
  const scripts = ["scripts/probe-route-load-baseline.mjs", "scripts/accept-management-hosted-production.mjs"];
  const runScript = (script: string, env: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "pantheon-pin-"));
    dirs.push(dir);
    return spawnSync("node", [resolve(process.cwd(), script), "--out-dir", dir], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, PANTHEON_LOAD_BASELINE_OUT_DIR: dir, BFF_AUTH_TOKEN: "a.b.c", ...env },
    });
  };
  for (const script of scripts) {
    it(`${script} refuses to use the credential for an arbitrary BFF origin before any request`, () => {
      const res = runScript(script, { PANTHEON_BFF_BASE_URL: "https://evil.example", PANTHEON_FE_BASE_URL: "http://127.0.0.1:4173" });
      expect(res.status).not.toBe(0);
      expect(`${res.stdout}${res.stderr}`).toContain("Refusing to release BFF credential: BFF origin");
    });
    it(`${script} refuses an arbitrary FE origin and plain-http BFF`, () => {
      const fe = runScript(script, { PANTHEON_BFF_BASE_URL: "https://api.dev.mvl-cap.tw", PANTHEON_FE_BASE_URL: "https://evil.example" });
      expect(`${fe.stdout}${fe.stderr}`).toContain("Refusing to release BFF credential: FE origin");
      const http = runScript(script, { PANTHEON_BFF_BASE_URL: "http://api.dev.mvl-cap.tw", PANTHEON_FE_BASE_URL: "http://127.0.0.1:4173" });
      expect(`${http.stdout}${http.stderr}`).toContain("Refusing to release BFF credential: BFF origin");
    });
    it(`${script} no longer writes the bearer into retired browser storage`, () => {
      const src = readFileSync(resolve(process.cwd(), script), "utf8");
      expect(src).not.toMatch(/pantheon_operator_token|pantheon\.bff\.bearerToken|[sS]torage\.setItem|target\.setItem|addInitScript/);
      expect(src).toContain("installPinnedBffBearer");
    });
    it(`${script} does not carry the bearer across a redirect to an unpinned origin`, async () => {
      const src = readFileSync(resolve(process.cwd(), script), "utf8");
      expect(src).toContain('from "./lib/pinned-browser-bff-bearer.mjs"');
      expect(src).not.toMatch(/function installPinnedBffBearer|route\.fetch/);
      const { installPinnedBffBearer: install } = (await import("../../scripts/lib/pinned-browser-bff-bearer.mjs")) as {
        installPinnedBffBearer: (ctx: unknown, o: Record<string, string>) => Promise<void>;
      };
      let handler!: (event: unknown) => void;
      const calls: Array<{ requestId: string; headers: Array<{ name: string; value: string }> }> = [];
      const page = { on: () => {}, isClosed: () => false };
      const ctx = { on: () => {}, pages: () => [page], newCDPSession: async () => ({
        on: (_name: string, h: typeof handler) => { handler = h; },
        send: async (name: string, arg: any) => { if (name === "Fetch.continueRequest") calls.push(arg); },
      }) };
      await install(ctx, { token: "tok", feBase: "http://127.0.0.1:4173", bffBase: "https://api.dev.mvl-cap.tw" });
      handler({ requestId: "pinned", request: { url: "https://api.dev.mvl-cap.tw/api/me", headers: { accept: "*/*" } } });
      handler({ requestId: "foreign", request: { url: "https://unpinned.example/x", headers: { authorization: "Bearer tok" } } });
      expect(calls[0].headers).toContainEqual({ name: "authorization", value: "Bearer tok" });
      expect(calls[1].headers).not.toContainEqual({ name: "authorization", value: "Bearer tok" });
    });
  }
});

describe("credential redaction and route-load auth truth", () => {
  const SENTINEL = "SENTINEL-secret-token-abc123";
  it("scrubs bearer/literal secrets from Playwright JSON and logs", () => {
    const dir = mkdtempSync(join(tmpdir(), "redact-"));
    writeFileSync(join(dir, "r.json"), JSON.stringify({ error: { message: `Authorization: Bearer ${SENTINEL}`, stack: `tok=${SENTINEL}` } }));
    writeFileSync(join(dir, "e2e.log"), `x Bearer ${SENTINEL}\n`);
    spawnSync("node", ["scripts/lib/pinned-bff-bearer.mjs", dir], { env: { ...process.env, BFF_AUTH_TOKEN: SENTINEL } });
    for (const f of ["r.json", "e2e.log"]) expect(readFileSync(join(dir, f), "utf8")).not.toContain(SENTINEL);
    rmSync(dir, { recursive: true, force: true });
  });
  it("workflow redacts before the evidence upload", () => {
    const wf = readFileSync(".github/workflows/pantheon-integration-gate.yml", "utf8");
    const r = wf.indexOf("pinned-bff-bearer.mjs");
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(wf.indexOf("name: Prepare evidence artifact paths"));
  });
  it("route-load probe passes only with token and 2xx primary (static)", () => {
    const src = readFileSync("scripts/probe-route-load-baseline.mjs", "utf8");
    expect(src).toMatch(/&& authenticatedPrimaryOk/);
    expect(src).toMatch(/primaryApiStatus < 300/);
  });
});
