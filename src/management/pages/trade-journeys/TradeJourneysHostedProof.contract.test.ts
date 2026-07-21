import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const spec = readFileSync(resolve(root, "e2e/trade-journeys-cross-repo-hosted.spec.ts"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/pantheon-integration-gate.yml"), "utf8");

describe("TJ-E2E-012 hosted browser proof contract", () => {
  it("cannot intercept or synthesize BFF responses", () => {
    expect(spec).not.toMatch(/\b(?:page|context)\.route\s*\(/u);
    expect(spec).not.toContain("routeFromHAR");
    expect(spec).not.toContain("installOidcDevLogin");
    expect(spec).toContain("page.on(\"response\"");
    expect(spec).toContain("/bff/management/trade-journeys");
  });

  it("binds browser evidence to strict exact deployments and all source scenarios", () => {
    expect(spec).toContain("deployment.json");
    expect(spec).toContain("PANTHEON_FRONTEND_SHA");
    expect(spec).toContain("PANTHEON_BFF_SHA");
    expect(spec).toContain("auth_mode");
    expect(spec).toContain("auth_stub");
    expect(spec).toContain("completed_with_variance");
    expect(spec).toContain("tj-scenario-10");
    expect(spec).toContain("new AxeBuilder");
    for (let number = 1; number <= 12; number += 1) {
      expect(spec).toContain(`tj-scenario-${number}`);
    }
  });

  it("locates hosted scenarios with the real server-side q filter instead of first-page ordering", () => {
    expect(spec).toContain('url.searchParams.get("q") === input.query');
    expect(spec).toContain('environment: "paper", query: "tj-scenario-"');
    expect(spec).toContain('environment: "paper", query: "tj-scenario-7"');
    expect(spec).toContain('environment: "live", query: "tj-scenario-10"');
    expect(spec).not.toContain("const paper = await openPaperList(page)");
  });

  it("runs desktop, viewer-RBAC, and mobile proof inside the existing authorized window", () => {
    expect(workflow).toContain("e2e/trade-journeys-cross-repo-hosted.spec.ts");
    expect(workflow).toContain("secrets.PANTHEON_BFF_OPERATOR_A_TOKEN");
    expect(workflow).toContain("secrets.PANTHEON_BFF_VIEWER_TOKEN");
    expect(workflow).toContain("PANTHEON_CREDENTIALED_PLAYWRIGHT_NO_ARTIFACTS=1");
    expect(workflow).toContain("--grep '@desktop-full'");
    expect(workflow).toContain("--grep '@mobile-basic'");
  });

  it("uses the canonical hosted data-plane tenant", () => {
    expect(spec).toContain('PANTHEON_TENANT_ID ?? "tenant-dev"');
    expect(workflow).toContain("PANTHEON_TENANT_ID: tenant-dev");
    expect(workflow).not.toContain("PANTHEON_TENANT_ID: pantheon-dev");
  });
});
