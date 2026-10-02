import { spawn } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const dirs: string[] = [];
const retired = /\/bff\/agora\/(signals|inbox|feedback|skill-coaching)(?:[/?]|$)/;
const retained = ["/bff/agora/journal", "/bff/agora/postmortems"];
type Check = { label: string; status: string; note: string };
type Reply = { status: number; body: unknown };
type Override = (request: IncomingMessage) => Reply | undefined;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function auditDir() {
  const dir = mkdtempSync(join(tmpdir(), "agora-retired-probes-"));
  dirs.push(dir);
  return dir;
}

// Do not inherit hosted URLs, credentials, NODE_OPTIONS or release exceptions.
async function run(script: string, dir: string, base: string, args: string[] = [], extra = {}) {
  const child = spawn(process.execPath, [resolve(root, "scripts", script), ...args], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      PANTHEON_BFF_BASE_URL: base,
      PANTHEON_AUDIT_OUT_DIR: dir,
      PANTHEON_BFF_SMOKE_BEARER_TOKEN: "local-fixture-token",
      PANTHEON_BFF_ROUTE_PROBE_ATTEMPTS: "1",
      PANTHEON_BFF_SMOKE_READ_RETRIES: "1",
      PANTHEON_BFF_SMOKE_WRITE_RETRIES: "1",
      PANTHEON_WRITE_PROBE_ATTEMPTS: "1",
      PANTHEON_WRITE_PROBE_READBACK_ATTEMPTS: "1",
      PANTHEON_WRITE_PROBE_INCLUDE_CREATES: "true",
      PANTHEON_BFF_SMOKE_READINESS_TIMEOUT_MS: "1000",
      PANTHEON_BFF_SMOKE_READINESS_INTERVAL_MS: "250",
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/dev",
      PANTHEON_RELEASE_GATE_AUTH_MODE: "strict",
      PANTHEON_HOSTED_FE_HARD_GATE: "true",
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  const timer = setTimeout(() => child.kill("SIGKILL"), 12_000);
  try {
    return await new Promise<{ code: number | null; output: string }>((resolveRun, reject) => {
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (signal) reject(new Error(`Probe terminated: ${signal}\n${output}`));
        else resolveRun({ code, output });
      });
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fixture<T>(work: (base: string, calls: string[]) => Promise<T>, override?: Override) {
  const calls: string[] = [];
  const server = createServer((request, response) => {
    const route = request.url!.split("?")[0];
    calls.push(`${request.method} ${route}`);
    const publicRoute = ["/livez", "/openapi.json", "/bff/events/stream"].includes(route);
    const reply = override?.(request) ?? (
      retired.test(route) ? { status: 404, body: { detail: "Not Found" } } :
      !publicRoute && !request.headers.authorization ? { status: 401, body: { code: "unauthorized" } } :
      request.method !== "GET" ? { status: 422, body: { code: "validation_error" } } :
      { status: 200, body: route === "/bff/me"
        ? { data: { user: { id: "fixture" }, tenant: { id: "fixture" }, capabilities: [] } }
        : { items: [], page_info: { total: 0 } } }
    );
    request.resume();
    response.writeHead(reply.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address() as { port: number };
  try {
    return await work(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
}

function report(dir: string, prefix: string) {
  const file = readdirSync(dir).find((name) => name.startsWith(prefix));
  expect(file, prefix).toBeDefined();
  return join(dir, file!);
}

async function aggregate(dir: string, base: string) {
  const result = await run("aggregate-release-gate.mjs", dir, base, [
    "--playwright-report", join(dir, "playwright"), "--test-results", join(dir, "results"),
  ]);
  const summary = JSON.parse(readFileSync(join(dir, "release-gate-summary.json"), "utf8")) as {
    gates: Record<string, Check[]>;
  };
  return { ...result, ...summary };
}

function check(checks: Check[], label: string) {
  const result = checks.find((row) => row.label.includes(label));
  expect(result, label).toBeDefined();
  return result!;
}

describe("retired Agora probe inventories and release enforcement", () => {
  it("replays the original 37037994555 anonymous evidence into Gate 3 and Gate 7", async () => {
    const dir = auditDir();
    const original = readFileSync(resolve(root,
      "docs/deployment/evidence/FE-AGORA-RETIRED-PROBES-20261003/original-anonymous-probe.md"), "utf8");
    expect(original.match(/^\| 404 .*$/gm)).toEqual([
      "| 404 | GET | /bff/agora/signals | 187 | 1 |",
      "| 404 | GET | /bff/agora/inbox | 187 | 1 |",
    ]);
    writeFileSync(join(dir, "bff-route-probe-anonymous-original.md"), original);
    const result = await aggregate(dir, "http://127.0.0.1:1");
    expect(result.code).toBe(1);
    expect(check(result.gates["3"], "no canonical route")).toMatchObject({ status: "fail", note: "canonical 404 count: 2" });
    expect(check(result.gates["7"], "All critical gates").status).toBe("fail");
  });

  it("runs anonymous, authenticated and write probes without any retired requests; Gate 3 passes", async () => {
    await fixture(async (base, calls) => {
      const dir = auditDir();
      for (const [script, args] of [
        ["probe-bff-routes.mjs", ["--anonymous"]],
        ["probe-bff-routes.mjs", ["--authenticated"]],
        ["probe-bff-authenticated-live.mjs", []],
        ["probe-bff-write-paths.mjs", []],
      ] as const) {
        const start = calls.length;
        const result = await run(script, dir, base, [...args]);
        expect(result.code, result.output).toBe(0);
        const inventory = calls.slice(start);
        expect(inventory.some((call) => retired.test(call))).toBe(false);
        for (const route of retained) expect(inventory).toContain(`GET ${route}`);
        if (script === "probe-bff-write-paths.mjs") {
          for (const route of retained) expect(inventory).toContain(`POST ${route}`);
        }
      }
      writeFileSync(join(dir, "management-live-deep-validation-local.json"), JSON.stringify({
        rbac: { status: "pass", presentRoles: ["fixture"] }, sse: { status: "pass", durationMs: 1 },
      }));
      const result = await aggregate(dir, base);
      expect(result.gates["3"].every((row) => row.status === "pass"), JSON.stringify(result.gates["3"])).toBe(true);
      // Other release evidence is intentionally absent; a passing probe never grants release approval.
      expect(result.code).toBe(1);
      expect(check(result.gates["7"], "All critical gates").status).toBe("fail");

      // Remove every actual smoke row in turn: the aggregate must require each retained row.
      const file = report(dir, "bff-authenticated-live-smoke-");
      const text = readFileSync(file, "utf8");
      const rows = text.split("\n").filter((line) => line.startsWith("| ✅ pass |"));
      expect(rows).toHaveLength(26);
      for (const row of rows) {
        const route = row.split("|")[4].trim();
        writeFileSync(file, text.replace(row, ""));
        const missing = await aggregate(dir, base);
        const label = route === "/bff/me" ? "MeResponse" :
          route.startsWith("/bff/v5/") ? "v5 endpoints" :
          row.includes("| POST |") ? "write/precondition" : "entity list";
        expect(["fail", "missing"], route).toContain(check(missing.gates["3"], label).status);
      }
    });
  }, 15_000);

  it.each([404, 500, 503])("retained read status %s fails authenticated smoke and Gate 3", async (status) => {
    await fixture(async (base) => {
      const dir = auditDir();
      const smoke = await run("probe-bff-authenticated-live.mjs", dir, base);
      expect(smoke.code, smoke.output).toBe(1);
      const result = await aggregate(dir, base);
      expect(check(result.gates["3"], "entity list").status).toBe("fail");
      expect(check(result.gates["7"], "All critical gates").status).toBe("fail");
    }, (request) => request.url === retained[0] ? { status, body: { code: "failure" } } : undefined);
  });

  it.each([404, 500, 503])("retained anonymous status %s remains a hard aggregate failure", async (status) => {
    await fixture(async (base) => {
      const dir = auditDir();
      const probe = await run("probe-bff-routes.mjs", dir, base);
      // The inventory script enforces 404; strict auth status enforcement belongs to Gate 3.
      expect(probe.code).toBe(status === 404 ? 1 : 0);
      const result = await aggregate(dir, base);
      expect(check(result.gates["3"], "protected routes").status).toBe("fail");
    }, (request) => request.url === retained[1] ? { status, body: { code: "failure" } } : undefined);
  });

  it.each([404, 500, 503, 401, 403])("retained write failure %s is rejected by probe and aggregate", async (status) => {
    await fixture(async (base) => {
      const dir = auditDir();
      const probe = await run("probe-bff-write-paths.mjs", dir, base);
      expect(probe.code, probe.output).toBe(1);
      const result = await aggregate(dir, base);
      expect(check(result.gates["3"], "expanded live dry-run").status).toBe("fail");
    }, (request) => request.method === "POST" && request.url === retained[0]
      // Untyped auth errors must fail; documented typed role rejections remain expected preconditions.
      ? { status, body: status === 401 || status === 403 ? {} : { code: "failure" } } : undefined);
  });

  it("rejects an unauthorized successful write that leaks its marker into readback", async () => {
    let marker = "";
    await fixture(async (base) => {
      const dir = auditDir();
      const probe = await run("probe-bff-write-paths.mjs", dir, base);
      expect(probe.code, probe.output).toBe(1);
      expect(marker).toContain("dry-run-write-probe-");
      const result = await aggregate(dir, base);
      expect(check(result.gates["3"], "marker does not appear").status).toBe("fail");
    }, (request) => {
      if (request.url !== retained[0]) return;
      if (request.method === "POST") {
        let body = "";
        request.on("data", (chunk) => { body += chunk; });
        request.on("end", () => { marker = JSON.parse(body).probeMarker; });
        return { status: 201, body: { id: "unauthorized-side-effect" } };
      }
      return { status: 200, body: { items: [{ title: marker }] } };
    });
  });

  it("keeps readiness 503 and absent mandatory evidence blocking", async () => {
    await fixture(async (base) => {
      const dir = auditDir();
      expect((await run("probe-bff-routes.mjs", dir, base)).code).toBe(0);
      const smoke = await run("probe-bff-authenticated-live.mjs", dir, base);
      expect(smoke.output).toContain("Readiness: not ready");
      const result = await aggregate(dir, base);
      expect(check(result.gates["3"], "health/liveness").status).toBe("fail");
      expect(check(result.gates["3"], "openapi.json").status).toBe("fail");
      expect(check(result.gates["3"], "expanded live dry-run").status).toBe("missing");
      expect(check(result.gates["7"], "All critical gates").status).toBe("fail");
    }, (request) => ["/livez", "/openapi.json"].includes(request.url!)
      ? { status: 503, body: { code: "not_ready" } } : undefined);
  });

  it("runs all 3000 persona cases with local read requests and no retired case routes", async () => {
    await fixture(async (base, calls) => {
      const dir = auditDir();
      const result = await run("validate-management-persona-3000.mjs", dir, base, ["--live-readonly"]);
      expect(result.code, result.output).toBe(0);
      const evidence = JSON.parse(readFileSync(report(dir, "mgmt-persona-3000-validation-"), "utf8"));
      expect(evidence.summary).toMatchObject({ total: 3000, roundsPassed: 3000, uniqueFingerprints: 3000 });
      expect(evidence.cases.some((row: { route: string }) => retired.test(row.route))).toBe(false);
      expect(evidence.cases.some((row: { route: string }) => row.route === retained[0])).toBe(true);
      expect(calls).toHaveLength(300);
      expect(calls.every((call) => call.startsWith("GET ") && !retired.test(call))).toBe(true);
    });
  });

  it.each([404, 500, 503])("persona live-readonly rejects retained route failure %s", async (status) => {
    await fixture(async (base) => {
      const result = await run("validate-management-persona-3000.mjs", auditDir(), base, ["--live-readonly", "--no-evidence"]);
      expect(result.code, result.output).toBe(1);
      expect(result.output).toContain(`got ${status}`);
    }, () => ({ status, body: { code: "failure" } }));
  });
});
