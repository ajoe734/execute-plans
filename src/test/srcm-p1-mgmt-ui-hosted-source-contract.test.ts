import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const e2eSpec = readFileSync(
  resolve(process.cwd(), "e2e/30-management-data-source-control.spec.ts"),
  "utf8",
);

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/srcm-p1-mgmt-ui-hosted-acceptance.yml"),
  "utf8",
);

describe("SRCM-P1-MGMT-UI hosted acceptance source contract", () => {
  it("uses the established credentialed hosted browser auth/session harness without synthetic Firebase injection", () => {
    expect(e2eSpec).not.toContain("gcpIdentityStoredUser");
    expect(e2eSpec).not.toContain("gcpIdentityStorageKey");
    expect(e2eSpec).not.toContain("window.sessionStorage.setItem");
    expect(e2eSpec).toContain("installHostedSession");
    expect(e2eSpec).toContain("VITE_BFF_DEV_LOGIN_CLIENT_ID");
    expect(e2eSpec).toContain("VITE_BFF_DEV_LOGIN_CLIENT_SECRET");
    expect(e2eSpec).toContain("__PANTHEON_RUNTIME_CONFIG__");
    expect(e2eSpec).toContain("__PANTHEON_BFF_RUNTIME__");
  });

  it("binds deployment pair and exact /bff/version source commit sha in hosted test", () => {
    expect(e2eSpec).toContain("assertDeploymentPair");
    expect(e2eSpec).toContain("deployment.json");
    expect(e2eSpec).toContain("/bff/version");
    expect(e2eSpec).toContain("source_commit_known");
    expect(e2eSpec).toContain("source_commit_sha");
  });

  it("proves operator /bff/me and /bff/auth/readiness in hosted test", () => {
    expect(e2eSpec).toContain("assertStrictSession");
    expect(e2eSpec).toContain("/bff/me");
    expect(e2eSpec).toContain("/bff/auth/readiness");
    expect(e2eSpec).toContain("roles");
  });

  it("tracks network events and writes sanitized fail-closed evidence including data-sources HTTP 200", () => {
    expect(e2eSpec).toContain("setupNetworkTracker");
    expect(e2eSpec).toContain("PANTHEON_AUDIT_OUT_DIR");
    expect(e2eSpec).toContain("srcm-p1-mgmt-ui-pages.png");
    expect(e2eSpec).toContain("srcm-p1-mgmt-ui-network.json");
    expect(e2eSpec).toContain("srcm-p1-mgmt-ui-evidence.json");
    expect(e2eSpec).toContain("/management/data-sources");
  });

  it("strictly requires exact HTTP 200 data-source response status rather than generic 2xx range", () => {
    expect(e2eSpec).toContain("ev.status === 200 && ev.pathname.includes(\"/management/data-sources\")");
    expect(e2eSpec).not.toMatch(/ev\.status\s*>=\s*200\s*&&\s*ev\.status\s*<\s*300\s*&&\s*ev\.pathname\.includes\("\/management\/data-sources"\)/);
    expect(e2eSpec).toContain("Expected specific HTTP 200 BFF request for Data Sources");
  });

  it("isolates hosted acceptance workflow execution to unmocked hosted tests via --grep", () => {
    expect(workflow).toContain("--grep \"unmocked hosted\"");
  });

  it("gates mocked fixture tests from executing against external/hosted environments and cleanly skips them", () => {
    expect(e2eSpec).toContain("testInfo.title.includes(\"unmocked hosted\")");
    expect(e2eSpec).toContain("test.skip(");
    expect(e2eSpec).toContain("route-mocked fixture coverage is loopback-only; hosted candidates use live acceptance specs");
  });

  it("hosted acceptance workflow binds checkout SHA, live deployment, live /bff/version, and uploads fail-closed evidence", () => {
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("${PANTHEON_FE_BASE_URL}/deployment.json");
    expect(workflow).toContain("${PANTHEON_BROWSER_BFF_BASE_URL}/bff/version");
    expect(workflow).toContain("source_commit_known");
    expect(workflow).toContain("source_commit_sha");
    expect(workflow).toContain("${PANTHEON_BROWSER_BFF_BASE_URL}/bff/me");
    expect(workflow).toContain("${PANTHEON_BROWSER_BFF_BASE_URL}/bff/auth/readiness");
    expect(workflow).toContain("VITE_GCP_IDENTITY_API_KEY");
    expect(workflow).toContain("PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY");
    expect(workflow).toContain("if-no-files-found: error");
  });
});
