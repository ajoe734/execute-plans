import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SENTINEL = "SENTINEL-secret-token-abc123";

describe("credential redaction before artifact upload", () => {
  it("scrubs bearer/literal secrets from Playwright JSON and logs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redact-"));
    fs.writeFileSync(path.join(dir, "r.json"), JSON.stringify({ error: { message: `Authorization: Bearer ${SENTINEL}`, stack: `tok=${SENTINEL}` } }));
    fs.writeFileSync(path.join(dir, "e2e.log"), `x Bearer ${SENTINEL}\n`);
    execFileSync("node", ["scripts/lib/redact-credentials.mjs", dir], { env: { ...process.env, BFF_AUTH_TOKEN: SENTINEL } });
    for (const f of ["r.json", "e2e.log"]) expect(fs.readFileSync(path.join(dir, f), "utf8")).not.toContain(SENTINEL);
  });
  it("workflow redacts before the evidence upload", () => {
    const wf = fs.readFileSync(".github/workflows/pantheon-integration-gate.yml", "utf8");
    const r = wf.indexOf("redact-credentials.mjs");
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(wf.indexOf("name: Prepare evidence artifact paths"));
  });
});

describe("route-load probe auth truth", () => {
  it("never passes without a token or on 401", () => {
    const src = fs.readFileSync("scripts/probe-route-load-baseline.mjs", "utf8");
    expect(src).toMatch(/authenticatedPrimaryOk/);
    expect(src).toMatch(/&& authenticatedPrimaryOk/);
    expect(src).toMatch(/primaryApiStatus < 300/);
    expect(spawnSync("node", ["--check", "scripts/probe-route-load-baseline.mjs"]).status).toBe(0);
  });
});
