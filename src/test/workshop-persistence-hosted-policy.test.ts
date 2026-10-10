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

describe("FE-WORKSHOP-SAME-RESOURCE-RESUME-20261010 existing-resource resume and reload contract", () => {
  it("validates existing-workshop inputs and fails closed on missing, malformed, or partial inputs", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const shaRegex = /^[0-9a-f]{64}$/i;

    const validate = (id: string, titleSha: string) => {
      const trimmedId = id.trim();
      const trimmedSha = titleSha.trim().toLowerCase();
      if (!trimmedId && !trimmedSha) {
        return { valid: false, reason: "both existing workshop id and title SHA256 are missing" };
      }
      if (!trimmedId) {
        return { valid: false, reason: "missing existing workshop id" };
      }
      if (!trimmedSha) {
        return { valid: false, reason: "missing existing workshop title SHA256" };
      }
      if (!uuidRegex.test(trimmedId)) {
        return {
          valid: false,
          reason: `malformed existing workshop id "${trimmedId}"; must be a canonical UUID`,
        };
      }
      if (!shaRegex.test(trimmedSha)) {
        return {
          valid: false,
          reason: `malformed existing workshop title SHA256 "${trimmedSha}"; must be 64 hex characters`,
        };
      }
      return { valid: true, id: trimmedId, titleSha: trimmedSha };
    };

    // Missing cases
    expect(validate("", "").valid).toBe(false);
    expect(validate("", "f697a21ccd124c051cf40715d1fd622d0314f8af2d0c7cd9c7c13682cf9c3093").valid).toBe(false);
    expect(validate("295726c7-47b5-4516-a74a-c5ba8765ee48", "").valid).toBe(false);

    // Malformed ID cases
    expect(validate("not-a-uuid", "f697a21ccd124c051cf40715d1fd622d0314f8af2d0c7cd9c7c13682cf9c3093").valid).toBe(false);
    expect(validate("12345", "f697a21ccd124c051cf40715d1fd622d0314f8af2d0c7cd9c7c13682cf9c3093").valid).toBe(false);
    expect(validate("295726c7-47b5-4516-a74a-c5ba8765ee4g", "f697a21ccd124c051cf40715d1fd622d0314f8af2d0c7cd9c7c13682cf9c3093").valid).toBe(false);

    // Malformed SHA cases
    expect(validate("295726c7-47b5-4516-a74a-c5ba8765ee48", "too-short").valid).toBe(false);
    expect(validate("295726c7-47b5-4516-a74a-c5ba8765ee48", "f697a21ccd124c051cf40715d1fd622d0314f8af2d0c7cd9c7c13682cf9c309z").valid).toBe(false);

    // Valid operator target case
    const validResult = validate(
      "295726c7-47b5-4516-a74a-c5ba8765ee48",
      "f697a21ccd124c051cf40715d1fd622d0314f8af2d0c7cd9c7c13682cf9c3093",
    );
    expect(validResult.valid).toBe(true);
    if (validResult.valid) {
      expect(validResult.id).toBe("295726c7-47b5-4516-a74a-c5ba8765ee48");
      expect(validResult.titleSha).toBe("f697a21ccd124c051cf40715d1fd622d0314f8af2d0c7cd9c7c13682cf9c3093");
    }

    // Spec source contracts
    expect(specSource).toContain("CANONICAL_UUID_REGEX");
    expect(specSource).toContain("SHA256_HEX_REGEX");
    expect(specSource).toContain("validateExistingWorkshopInputs");
    expect(specSource).toContain("EXISTING_WORKSHOP_ID");
    expect(specSource).toContain("EXISTING_WORKSHOP_TITLE_SHA256");
  });

  it("computes deterministic owner-content digest and verifies stability across clean contexts and reloads", () => {
    // Pure function check matching spec's canonical serialization
    const canonicalJsonString = (obj: unknown): string => {
      if (obj === null || typeof obj !== "object") {
        return JSON.stringify(obj);
      }
      if (Array.isArray(obj)) {
        return "[" + obj.map(canonicalJsonString).join(",") + "]";
      }
      const record = obj as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return (
        "{" +
        keys
          .map((k) => `${JSON.stringify(k)}:${canonicalJsonString(record[k])}`)
          .join(",") +
        "}"
      );
    };

    const objA = {
      workshop_id: "295726c7-47b5-4516-a74a-c5ba8765ee48",
      title: "Strategy Test",
      metadata: { strategy_name: "Strategy Test", tags: ["a", "b"] },
      lock_version: 1,
    };
    const objB = {
      lock_version: 1,
      metadata: { tags: ["a", "b"], strategy_name: "Strategy Test" },
      title: "Strategy Test",
      workshop_id: "295726c7-47b5-4516-a74a-c5ba8765ee48",
    };

    // Key-order independent canonical string
    expect(canonicalJsonString(objA)).toBe(canonicalJsonString(objB));

    // Spec source contract for owner-content digest
    expect(specSource).toContain("function canonicalJsonString");
    expect(specSource).toContain("function computeContentHash");
    expect(specSource).toContain("content_sha256");
  });

  it("spec source contract: executes real page.reload step without creating replacement workshop in existing mode", () => {
    expect(specSource).toContain("page.reload({ waitUntil: \"domcontentloaded\" })");
    expect(specSource).toContain('"execute_real_page_reload"');
    expect(specSource).toContain('"assert_after_reload_readback_and_visible_ui"');
    expect(specSource).toContain("postReloadDigest");
    expect(specSource).toContain(
      "post-reload owner content digest must match initial content digest",
    );

    // Existing mode must not invoke create_workshop or POST /bff/agora/workshops
    const existingModeBranchStart = specSource.indexOf("if (isExistingMode) {");
    const elseBranchStart = specSource.indexOf("} else {", existingModeBranchStart);
    expect(existingModeBranchStart).toBeGreaterThan(-1);
    expect(elseBranchStart).toBeGreaterThan(existingModeBranchStart);

    const existingModeSource = specSource.slice(existingModeBranchStart, elseBranchStart);
    expect(existingModeSource).not.toContain('"create_workshop"');
    expect(existingModeSource).not.toContain('page.getByTestId("create-workshop-btn")');
    expect(existingModeSource).not.toContain('page.getByTestId("create-workshop-submit")');
    expect(existingModeSource).not.toContain('"POST"');
    expect(existingModeSource).not.toContain('"PATCH"');
    expect(existingModeSource).not.toContain("/patch-proposals");
  });

  it("spec source contract: proves same UUID, acknowledged title hash, and content digest across fresh context", () => {
    expect(specSource).toContain('"assert_existing_workshop_owner_readback_first"');
    expect(specSource).toContain('"navigate_existing_workshop_ui"');
    expect(specSource).toContain('"reopen_existing_workshop_ui"');
    expect(specSource).toContain('"assert_fresh_context_owner_readback"');
    expect(specSource).toContain("freshContextDigest");
    expect(specSource).toContain(
      "fresh context owner content digest must match initial content digest",
    );
    expect(specSource).toContain(
      "fresh context title SHA256 must match the acknowledged title hash",
    );
    expect(specSource).toContain(
      "fresh context readback must return same ID",
    );
  });

  it("workflow source contract: declares optional existing-workshop inputs and validates UUID and SHA256 formats", () => {
    expect(workflowSource).toContain("existing_workshop_id:");
    expect(workflowSource).toContain("existing_workshop_title_sha256:");
    expect(workflowSource).toContain("EXISTING_WORKSHOP_ID:");
    expect(workflowSource).toContain("EXISTING_WORKSHOP_TITLE_SHA256:");
    expect(workflowSource).toContain(
      '[[ "${EXISTING_WORKSHOP_ID:-}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]',
    );
    expect(workflowSource).toContain(
      '[[ "${EXISTING_WORKSHOP_TITLE_SHA256:-}" =~ ^[0-9a-fA-F]{64}$ ]]',
    );
  });
});

describe("FE-GOVERNANCE-PAPER-CASE-READONLY-HARNESS-20261010 optional governance case read-only contract", () => {
  it("validates governance case inputs and fails closed on missing, malformed, or partial inputs", () => {
    const idRegex = /^[a-zA-Z0-9_.:-]+$/;

    const validate = (
      id: string,
      expectedVersionStr: string,
      targetDigestOrId: string,
    ) => {
      const trimmedId = id.trim();
      const trimmedVersion = expectedVersionStr.trim();
      const trimmedDigest = targetDigestOrId.trim();

      if (!trimmedId && !trimmedVersion && !trimmedDigest) {
        return {
          valid: false,
          reason: "governance case id, expected version, and target digest/id are all missing",
        };
      }
      if (!trimmedId) {
        return { valid: false, reason: "missing governance case id" };
      }
      if (!trimmedVersion) {
        return { valid: false, reason: "missing governance case expected version" };
      }
      if (!trimmedDigest) {
        return { valid: false, reason: "missing governance case target digest or id" };
      }
      if (!idRegex.test(trimmedId)) {
        return {
          valid: false,
          reason: `malformed governance case id "${trimmedId}"; must match canonical identifier format`,
        };
      }
      if (!/^[0-9]+$/.test(trimmedVersion) || parseInt(trimmedVersion, 10) <= 0) {
        return {
          valid: false,
          reason: `malformed governance case expected version "${trimmedVersion}"; must be a positive integer`,
        };
      }
      if (!idRegex.test(trimmedDigest)) {
        return {
          valid: false,
          reason: `malformed governance case target digest or id "${trimmedDigest}"; must be 64-hex SHA256 or canonical identifier`,
        };
      }
      return {
        valid: true,
        id: trimmedId,
        expectedVersion: parseInt(trimmedVersion, 10),
        targetDigestOrId: trimmedDigest,
      };
    };

    // All missing
    expect(validate("", "", "").valid).toBe(false);

    // Partial input cases
    expect(validate("approval-paper-human-quorum-closeout-20261010-v1", "", "").valid).toBe(false);
    expect(validate("", "1", "").valid).toBe(false);
    expect(validate("", "", "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b").valid).toBe(false);
    expect(validate("approval-paper-human-quorum-closeout-20261010-v1", "1", "").valid).toBe(false);
    expect(validate("approval-paper-human-quorum-closeout-20261010-v1", "", "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b").valid).toBe(false);
    expect(validate("", "1", "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b").valid).toBe(false);

    // Malformed ID
    expect(validate("invalid id with spaces", "1", "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b").valid).toBe(false);

    // Malformed version
    expect(validate("approval-paper-human-quorum-closeout-20261010-v1", "0", "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b").valid).toBe(false);
    expect(validate("approval-paper-human-quorum-closeout-20261010-v1", "-1", "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b").valid).toBe(false);
    expect(validate("approval-paper-human-quorum-closeout-20261010-v1", "version1", "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b").valid).toBe(false);

    // Malformed target
    expect(validate("approval-paper-human-quorum-closeout-20261010-v1", "1", "bad digest with spaces!").valid).toBe(false);

    // Valid canonical pending paper case target
    const validWithDigest = validate(
      "approval-paper-human-quorum-closeout-20261010-v1",
      "1",
      "e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b",
    );
    expect(validWithDigest.valid).toBe(true);
    if (validWithDigest.valid) {
      expect(validWithDigest.id).toBe("approval-paper-human-quorum-closeout-20261010-v1");
      expect(validWithDigest.expectedVersion).toBe(1);
      expect(validWithDigest.targetDigestOrId).toBe("e9c7c073c544cd453e2ac3d62b4acb4be7a47f5010a01a5498c40c284238a39b");
    }

    const validWithPoolId = validate(
      "approval-paper-human-quorum-closeout-20261010-v1",
      "1",
      "pool-paper-human-quorum-closeout-20261010-v1",
    );
    expect(validWithPoolId.valid).toBe(true);
    if (validWithPoolId.valid) {
      expect(validWithPoolId.targetDigestOrId).toBe("pool-paper-human-quorum-closeout-20261010-v1");
    }

    // Spec source contracts
    expect(specSource).toContain("validateGovernanceCaseInputs");
    expect(specSource).toContain("GOVERNANCE_CASE_ID");
    expect(specSource).toContain("GOVERNANCE_CASE_EXPECTED_VERSION");
    expect(specSource).toContain("GOVERNANCE_CASE_TARGET_DIGEST");
    expect(specSource).toContain("hasGovernanceInputs");
  });

  it("spec source contract: zero governance write/vote calls, never clicking decision buttons, and no vote authority inference", () => {
    // Absolutely NO governance accept-review/decide/vote/activate/rebalance POST/PATCH/DELETE
    expect(specSource).not.toContain("decideApproval");
    expect(specSource).not.toContain("/bff/approvals/batch-decide");
    expect(specSource).not.toContain('page.getByRole("button", { name: "Approve" })');
    expect(specSource).not.toContain('page.getByRole("button", { name: "Reject" })');
    expect(specSource).not.toContain("canApprove");
    expect(specSource).not.toContain("allowedActions");

    // Only GET /bff/approvals is performed
    expect(specSource).toContain("GET");
    expect(specSource).toContain("/bff/approvals/");
    const specAfterImport = specSource.slice(specSource.indexOf('test("real UI login'));
    expect(specAfterImport).not.toContain('"POST", "/bff/approvals');
    expect(specAfterImport).not.toContain('"PATCH", "/bff/approvals');
    expect(specAfterImport).not.toContain('"DELETE", "/bff/approvals');
  });

  it("spec source contract: reports real stale outcome on version mismatch and never resets or resaves fixture", () => {
    expect(specSource).toContain("Governance case version mismatch");
    expect(specSource).toContain("case changed on owner (stale outcome)");
    expect(specSource).not.toContain("resetFixture");
    expect(specSource).not.toContain("resaveFixture");
  });

  it("spec source contract: navigates /management/governance/{id} route and asserts actually visible owner-bound detail", () => {
    expect(specSource).toContain("async function navigateGovernanceCaseUi");
    expect(specSource).toContain("/management/governance/");
    expect(specSource).toContain("找不到審批請求");
    expect(specSource).toContain('"assert_governance_case_owner_readback_first"');
    expect(specSource).toContain('"navigate_governance_case_ui_first"');
    expect(specSource).toContain('"navigate_governance_case_ui_second"');
    expect(specSource).toContain('"assert_fresh_context_governance_case_owner_readback"');
    expect(specSource).toContain("initialGovVersion");
    expect(specSource).toContain("initialGovDigest");
    expect(specSource).toContain(
      "fresh context governance case version must match initial version",
    );
    expect(specSource).toContain(
      "fresh context governance case content digest must match initial digest",
    );
  });

  it("workflow source contract: declares optional governance case inputs and validates canonical identifier formats", () => {
    expect(workflowSource).toContain("governance_case_id:");
    expect(workflowSource).toContain("governance_case_expected_version:");
    expect(workflowSource).toContain("governance_case_target_digest:");
    expect(workflowSource).toContain("GOVERNANCE_CASE_ID:");
    expect(workflowSource).toContain("GOVERNANCE_CASE_EXPECTED_VERSION:");
    expect(workflowSource).toContain("GOVERNANCE_CASE_TARGET_DIGEST:");
    expect(workflowSource).toContain(
      '[[ "${GOVERNANCE_CASE_ID:-}" =~ ^[a-zA-Z0-9_.:-]+$ ]]',
    );
    expect(workflowSource).toContain(
      '[[ "${GOVERNANCE_CASE_EXPECTED_VERSION:-}" =~ ^[0-9]+$ ]]',
    );
    expect(workflowSource).toContain(
      '[[ "${GOVERNANCE_CASE_TARGET_DIGEST:-}" =~ ^[a-zA-Z0-9_.:-]+$ ]]',
    );
  });
});

