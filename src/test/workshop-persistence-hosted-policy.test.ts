import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// This file is LOCAL, deterministic, source-contract validation. It does not
// dial a live Pantheon dev deployment and is safe to run in the default unit
// suite. It never invokes the Playwright browser test itself; the actual
// hosted browser journey requires a real deployment and is exercised only by
// .github/workflows/pfg-agora-journey-e2e-hosted-acceptance.yml (HOSTED
// ACCEPTANCE, not local validation).

const specSource = readFileSync(
  resolve(process.cwd(), "e2e/workshop-persistence-hosted.spec.ts"),
  "utf8",
);
const workflowSource = readFileSync(
  resolve(
    process.cwd(),
    ".github/workflows/pfg-agora-journey-e2e-hosted-acceptance.yml",
  ),
  "utf8",
);

describe("FE-WORKSHOP-PERSISTENCE-JOURNEY-001 hosted spec source contract", () => {
  it("logs in through the real Account/Password UI form, not injected bearer state", () => {
    expect(specSource).toContain('page.locator("#dev-account")');
    expect(specSource).toContain('page.locator("#dev-password")');
    expect(specSource).toContain(
      'page.getByRole("button", { exact: true, name: "Sign in" })',
    );
    expect(specSource).not.toContain("addInitScript");
    expect(specSource).not.toContain("storageState");
    expect(specSource).not.toContain("page.route(");
    expect(specSource).not.toContain("bearerToken");
    expect(specSource).not.toContain("Authorization: `Bearer");
  });

  it("derives dev-login credentials only from the governed DEV_LOGIN_CLIENT_ID/SECRET env binding", () => {
    expect(specSource).toContain("process.env.DEV_LOGIN_CLIENT_ID");
    expect(specSource).toContain("process.env.DEV_LOGIN_CLIENT_SECRET");
  });

  it("creates exactly one uniquely named workshop and asserts saved title/content via server readback and UI", () => {
    expect(specSource).toContain('"create_workshop"');
    expect(specSource).toContain("/bff/agora/workshops");
    expect(specSource).toContain('"assert_saved_title_ui"');
    expect(specSource).toContain('"assert_saved_title_server_readback"');
    expect(specSource).toContain(
      "server readback must return the exact saved title",
    );
    expect(specSource).not.toContain("reconstruction");
    expect(specSource).not.toContain("trading-room");
    expect(specSource).not.toContain("/interactions");
  });

  it("performs a real UI sign-out and asserts the server-side session is invalidated", () => {
    expect(specSource).toContain("async function realUiSignOut");
    expect(specSource).toContain(
      'page.getByRole("button", { name: "Sign out" })',
    );
    expect(specSource).toContain("/bff/logout");
    expect(specSource).toContain("async function assertSessionInvalidated");
    expect(specSource).toContain('"assert_session_invalidated"');
    expect(specSource).toContain(
      "the BFF session must reject /bff/me after real sign-out",
    );
    expect(specSource).toContain("toBe(401)");
  });

  it("closes the first context, opens a clean context, and performs a second real UI login before readback", () => {
    expect(specSource).toContain("await page.context().close()");
    expect(specSource).toContain("await browser.newContext()");
    expect(specSource).toContain('"assert_fresh_context_anonymous"');
    expect(specSource).toContain('"real_ui_login_second"');
    expect(specSource).toContain('"reopen_workshop_and_read_exact_title"');
    const firstLoginIndex = specSource.indexOf('"real_ui_login_first"');
    const secondLoginIndex = specSource.indexOf('"real_ui_login_second"');
    const contextCloseIndex = specSource.indexOf("await page.context().close()");
    expect(firstLoginIndex).toBeGreaterThan(-1);
    expect(contextCloseIndex).toBeGreaterThan(firstLoginIndex);
    expect(secondLoginIndex).toBeGreaterThan(contextCloseIndex);
  });

  it("compares the exact expected FE/BFF SHA pair before and after the journey and fails closed on mismatch", () => {
    expect(specSource).toContain("async function captureVersionPair");
    expect(specSource).toContain("EXPECTED_FE_SHA");
    expect(specSource).toContain("EXPECTED_BFF_SHA");
    expect(specSource).toContain('"capture_version_pair_before"');
    expect(specSource).toContain('"capture_version_pair_after"');
    expect(specSource).toContain(
      "the exact FE/BFF SHA pair must match before and after the journey",
    );
    expect(specSource).not.toContain("matched: true,");
  });

  it("writes only allowlisted sanitized evidence and never credentials, cookies, headers, or login screenshots", () => {
    expect(specSource).toContain("SanitizedEvidence");
    expect(specSource).toContain("title_sha256");
    expect(specSource).toContain("operation_id");
    expect(specSource).not.toContain("page.screenshot(");
    expect(specSource).not.toContain("cookies(");
    expect(specSource).not.toContain("request().headers()");
    expect(specSource).not.toContain(".password");
    expect(specSource).not.toContain("DEV_PASSWORD}");
    expect(specSource).not.toMatch(/writeFileSync\([^)]*devPassword/i);
  });

  it("does not mint or reuse viewer/operator bearer tokens for the focused persistence journey", () => {
    expect(specSource).not.toContain("/bff/auth/dev-login");
    expect(specSource).not.toContain("grant_type");
    expect(specSource).not.toContain("client_credentials");
    expect(specSource).not.toContain("roleTokenFromEnv");
  });
});

describe("FE-WORKSHOP-PERSISTENCE-JOURNEY-001 hosted workflow source contract", () => {
  it("extends the existing hosted workflow with an optional, off-by-default focused scope", () => {
    expect(workflowSource).toContain("workshop_persistence_only");
    expect(workflowSource).toContain("default: false");
    expect(workflowSource).toContain("WORKSHOP_PERSISTENCE_HOSTED_E2E");
  });

  it("preserves the default full journey and its identity/safety guards", () => {
    expect(workflowSource).toContain("Reject unsafe target or incomplete proof inputs");
    expect(workflowSource).toContain("Bind expected identity to the live served deployment");
    expect(workflowSource).toContain("e2e/agora-product-journey.spec.ts");
    expect(workflowSource).toContain("DEV_BFF_DEV_LOGIN_OPERATOR_A_CLIENT_SECRET is not provisioned");
    expect(workflowSource).toContain("DEV_BFF_DEV_LOGIN_VIEWER_CLIENT_SECRET is not provisioned");
  });

  it("skips minting unused viewer/operator bearer tokens and the broad journey in focused mode", () => {
    const mintOperatorIndex = workflowSource.indexOf(
      "Mint a short-lived operator bearer token",
    );
    const mintViewerIndex = workflowSource.indexOf(
      "Mint a short-lived viewer bearer token",
    );
    const fullJourneyIndex = workflowSource.indexOf(
      "Run real Agora product journey hosted spec",
    );
    const focusedJourneyIndex = workflowSource.indexOf(
      "Run real workshop persistence hosted spec",
    );
    expect(mintOperatorIndex).toBeGreaterThan(-1);
    expect(mintViewerIndex).toBeGreaterThan(-1);
    expect(fullJourneyIndex).toBeGreaterThan(-1);
    expect(focusedJourneyIndex).toBeGreaterThan(-1);
    expect(workflowSource).toContain(
      "inputs.workshop_persistence_only != 'true'",
    );
    expect(workflowSource).toContain(
      "inputs.workshop_persistence_only == 'true'",
    );
    expect(workflowSource).toContain("e2e/workshop-persistence-hosted.spec.ts");
  });

  it("uses only the existing environment secret binding, no new credential flow", () => {
    expect(workflowSource).toContain("DEV_LOGIN_CLIENT_ID:");
    expect(workflowSource).toContain("DEV_LOGIN_CLIENT_SECRET:");
    expect(workflowSource).not.toContain("secrets.WORKSHOP_PERSISTENCE");
  });

  it("keeps credentialed Playwright evidence free of trace/video/screenshot artifacts", () => {
    expect(workflowSource).toContain(
      'PANTHEON_CREDENTIALED_PLAYWRIGHT_NO_ARTIFACTS: "1"',
    );
  });
});
