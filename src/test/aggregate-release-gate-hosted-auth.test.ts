import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
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

function gate8For(hardGate: "true" | "false") {
  const auditDir = mkdtempSync(join(tmpdir(), "pantheon-gate8-hosted-"));
  tempDirs.push(auditDir);
  const jsonOut = join(auditDir, "summary.json");
  writeFileSync(
    join(auditDir, "release-gate-step-outcomes.json"),
    `${JSON.stringify({ mgmt_hosted_accept: { outcome: "success", evidence: "management-hosted-acceptance.log" } })}\n`,
  );
  writeFileSync(
    join(auditDir, "management-hosted-acceptance-2026-07-15.json"),
    `${JSON.stringify({
      result: { pass: false },
      gateChecks: [
        {
          label: "No detail route shows raw undefined/NaN/Invalid Date.",
          status: "fail",
          note: "count:1",
        },
      ],
    })}\n`,
  );

  spawnSync("node", [aggregateScript, "--audit-dir", auditDir, "--json-out", jsonOut], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PANTHEON_HOSTED_FE_HARD_GATE: hardGate },
  });
  return (JSON.parse(readFileSync(jsonOut, "utf8")) as {
    gates: Record<string, Array<{ label: string; note: string; status: string }>>;
  }).gates["8"];
}

const safeUnauthenticatedSummary = [
  "frontend shell status: 200",
  "application root rendered: true",
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

  it("keeps page-load evidence independent from another strict probe failure", () => {
    const checks = gate4For(
      safeUnauthenticatedSummary.map((line) => line === "pass: true" ? "pass: false" : line),
    );

    expect(checks.find((check) => check.label === "Frontend page loads.")?.status).toBe("pass");
  });

  it("fails page-load evidence when the application root is not rendered", () => {
    const checks = gate4For(
      safeUnauthenticatedSummary.map((line) =>
        line === "application root rendered: true"
          ? "application root rendered: false"
          : line,
      ),
    );

    expect(checks.find((check) => check.label === "Frontend page loads.")?.status).toBe("fail");
  });

  it("does not accept matching totals in place of required core response evidence", () => {
    const checks = gate4For(
      safeUnauthenticatedSummary.map((line) =>
        line === "required core BFF responses complete: true"
          ? "required core BFF responses complete: false"
          : line,
      ),
    );

    expect(
      checks.find((check) => check.label === "Browser receives required BFF responses.")
        ?.status,
    ).toBe("fail");
  });
});

describe("release Gate 8 hosted management acceptance posture", () => {
  it("downgrades hosted management readback failures when the hosted gate is advisory", () => {
    const checks = gate8For("false");

    expect(checks[0]).toMatchObject({
      status: "advisory_fail",
      note: "count:1; advisory on pull_request",
    });
  });

  it("keeps hosted management readback failures hard when the hosted gate is enabled", () => {
    const checks = gate8For("true");

    expect(checks[0]).toMatchObject({
      status: "fail",
      note: "count:1",
    });
  });
});

describe("hosted acceptance uses the same tenant for Node and browser reads", () => {
  const source = readFileSync(resolve("scripts/accept-management-hosted-production.mjs"), "utf8");
  const bearerSource = readFileSync(resolve("scripts/lib/bearer-token.mjs"), "utf8");
  const transportSource = readFileSync(resolve("scripts/lib/pinned-browser-bff-bearer.mjs"), "utf8");

  it.each([
    [undefined, undefined],
    ["   ", undefined],
    [" pantheon-dev ", "pantheon-dev"],
    ["tenant-dev", "tenant-dev"],
  ])("follows authenticated default or explicit selection %s", async (override, expectedHeader) => {
    const token = "offline-operator-token";
    const apiReads: Array<{ url: string; headers: Headers; tenant: string }> = [];
    // Evaluate the maintained script without its CLI entry point. All I/O is
    // synthetic: no hosted requests, credentials, owner data or business writes.
    const harness = runInNewContext(
      `${bearerSource.replace(/^export /gm, "")}\n${transportSource.replace(/^import[^\n]*\n/gm, "").replace(/^export /gm, "")}\n${source
        .replace(/^#![^\n]*\n/, "")
        .replace(/^import[\s\S]*?from "[^"]+";\n/gm, "")
        .replace(/\nmain\(\);\s*$/, "")}\n({ TENANT_ID, installPinnedBffBearer, sessionRbacCheck, resolveLiveIdRoutes });`,
      {
        process: { env: { BFF_AUTH_TOKEN: token, PANTHEON_TENANT_ID: override }, argv: ["node", "offline"] },
        URL, http: {}, https: {}, AbortSignal: { timeout: () => undefined },
        BASELINE_ROUTES: [{ path: "/management/strategies/fixture-id", entity: "strategy" }],
        ENTITY_LIST_ENDPOINTS: { strategy: "/bff/strategies" },
        fetch: async (url: string, options: { headers: Record<string, string> }) => {
          const headers = new Headers(options.headers);
          const tenant = headers.get("x-tenant-id") || "authenticated-tenant";
          apiReads.push({ url, headers, tenant });
          return {
            status: headers.get("authorization") === `Bearer ${token}` ? 200 : 401,
            text: async () => JSON.stringify({ tenant: { id: tenant }, items: [{ id: `strategy-${tenant}` }] }),
          };
        },
      },
    );
    expect((await harness.sessionRbacCheck()).overall).toBe("pass");
    const liveRoutes = await harness.resolveLiveIdRoutes();
    expect(apiReads.map(({ url }) => new URL(url).pathname)).toEqual([
      "/bff/me", "/bff/me", "/bff/management/shell-summary", "/bff/strategies",
    ]);
    for (const { headers } of apiReads) {
      expect(headers.get("x-tenant-id")).toBe(expectedHeader ?? null);
    }
    const selectedTenant = expectedHeader || "authenticated-tenant";
    expect(liveRoutes[0].liveId).toBe(`strategy-${selectedTenant}`);

    let handler!: (route: unknown) => Promise<unknown>;
    await harness.installPinnedBffBearer(
      { route: async (_pattern: string, callback: typeof handler) => { handler = callback; } },
      { token, feBase: "http://127.0.0.1:4173", bffBase: "https://api.dev.mvl-cap.tw", tenantId: harness.TENANT_ID },
    );
    for (const endpoint of ["/bff/me", "/bff/management/shell-summary", "/bff/strategies"]) {
      let fetched = false;
      await handler({
        request: () => ({
          url: () => `https://api.dev.mvl-cap.tw${endpoint}`,
          method: () => "GET",
          headers: () => ({ "X-Tenant-Id": "stale-frontend-tenant", "x-tenant-id": "another-stale-tenant", accept: "application/json" }),
        }),
        fetch: async (options: { headers: Record<string, string>; maxRedirects: number }) => {
          fetched = true;
          const headers = new Headers(options.headers);
          expect(headers.get("x-tenant-id")).toBe(expectedHeader ?? null);
          expect(headers.get("authorization")).toBe(`Bearer ${token}`);
          expect(headers.get("accept")).toBe("application/json");
          expect(headers.get("x-tenant-id") || "authenticated-tenant").toBe(selectedTenant);
          expect(options.maxRedirects).toBe(0);
          return {};
        },
        fulfill: async () => {},
        continue: async () => { throw new Error("pinned BFF request bypassed interception"); },
      });
      expect(fetched).toBe(true);
    }
  });

  it("passes the configured selection to the browser in the CLI flow", () => {
    expect(source).toMatch(/await installPinnedBffBearer\(context, \{[^\n]*tenantId: TENANT_ID \}\)/);
  });
});
