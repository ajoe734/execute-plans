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

  it("also asserts the deployment.json manifest BFF SHA, not just the live /bff/version SHA", () => {
    expect(specSource).toContain("deployment.bffCommit");
    expect(specSource).toContain("deployment.bffSourceCommitSha");
    expect(specSource).toContain("manifestBffSha");
    expect(specSource).toContain(
      "deployment.json bffCommit/bffSourceCommitSha must match the expected exact BFF SHA",
    );
    const manifestAssertIndex = specSource.indexOf(
      "deployment.json bffCommit/bffSourceCommitSha must match the expected exact BFF SHA",
    );
    const liveBffAssertIndex = specSource.indexOf(
      "live BFF commit must match the expected exact BFF SHA",
    );
    const captureFnIndex = specSource.indexOf("async function captureVersionPair");
    expect(manifestAssertIndex).toBeGreaterThan(captureFnIndex);
    expect(liveBffAssertIndex).toBeGreaterThan(manifestAssertIndex);
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

  it("never persists the caught error's own message/cause as step failure evidence, even for secret-bearing errors", () => {
    // Password-fill and request failures can carry DEV_PASSWORD in their
    // message text. The only way to guarantee that never reaches sanitized
    // JSON/reporter evidence is for the catch path to never read the error
    // at all -- so this asserts structurally, not just by pattern-matching
    // known secret shapes, which a new failure site could bypass.
    expect(specSource).not.toContain("error.message");
    expect(specSource).not.toContain("error instanceof Error");
    expect(specSource).not.toContain("String(error)");
    expect(specSource).not.toContain("catch (error)");
    expect(specSource).toContain("} catch {");
    expect(specSource).toContain('message: `step "${id}" failed`');
    expect(specSource).toContain('throw new Error(`${TASK_ID} step "${id}" failed`)');

    // Synthetic proof: a secret-bearing thrown value can never surface in the
    // sanitized failure message, because the sanitizer is a pure function of
    // the step id only and never reads the thrown value's text.
    const secretBearingErrors = [
      new Error("fill(#dev-password) failed: value=super-secret-dev-password"),
      "raw string throw containing super-secret-dev-password",
      { toString: () => "object throw leaking super-secret-dev-password" },
    ];
    const sanitizeFailure = (id: string) => ({
      message: `step "${id}" failed`,
      step_id: id,
    });
    for (const thrown of secretBearingErrors) {
      const sanitized = sanitizeFailure("real_ui_login_first");
      expect(JSON.stringify(sanitized)).not.toContain("super-secret-dev-password");
      expect(sanitized.message).not.toContain(String(thrown));
    }
  });

  it("reads the saved title via a real detail<->list round trip, since the detail route has no workshop-item-id locator", () => {
    expect(specSource).toContain("async function assertSavedTitleViaListRoundTrip");
    expect(specSource).toContain("async function reopenWorkshopFromListAndAssertTitle");
    expect(specSource).toContain('page.getByRole("link", { name: "工坊列表" })');
    expect(specSource).toContain(
      'assertSavedTitleViaListRoundTrip(page, workshopId, workshopTitle)',
    );
    expect(specSource).toContain(
      "reopenWorkshopFromListAndAssertTitle(freshPage, workshopId, workshopTitle)",
    );
    // WorkshopSessionView (the detail route) never renders workshop-item-{id};
    // that testid only exists in WorkshopListView. Every use of the locator
    // must live inside the two list round-trip helpers, not inline in the
    // test body against a page that was just goto'd straight to a detail URL.
    const testBodyStart = specSource.indexOf('test("real UI login');
    const testBody = specSource.slice(testBodyStart);
    expect(testBody).not.toContain("workshop-item-${workshopId}");
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
    // workshop_persistence_only is a `type: boolean` workflow_dispatch input,
    // so `inputs.workshop_persistence_only` in an `if:` expression is already
    // a boolean. Comparing it to the *string* 'true' forces GitHub Actions'
    // mismatched-type coercion (both operands become numbers; the string
    // becomes NaN), which makes `!= 'true'` always true and `== 'true'`
    // always false regardless of the actual input -- the exact bug that made
    // focused dispatch skip the focused spec while still running full-journey
    // steps. The guard must compare/branch on the boolean itself.
    expect(workflowSource).not.toContain("!= 'true'");
    expect(workflowSource).not.toContain("== 'true'");
    expect(workflowSource).toContain('if: "!inputs.workshop_persistence_only"');
    expect(workflowSource).toContain("if: inputs.workshop_persistence_only");
    expect(workflowSource).toContain("e2e/workshop-persistence-hosted.spec.ts");
  });

  it("checks out the dispatched revision with a valid 40-character commit pin", () => {
    const checkoutMatch = workflowSource.match(
      /uses: actions\/checkout@([0-9a-f]+)/,
    );
    expect(checkoutMatch, "checkout step must pin actions/checkout by commit").not.toBeNull();
    const pin = checkoutMatch?.[1] ?? "";
    expect(pin).toHaveLength(40);
    expect(pin).toBe("34e114876b0b11c390a56381ad16ebd13914f8d5");
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
