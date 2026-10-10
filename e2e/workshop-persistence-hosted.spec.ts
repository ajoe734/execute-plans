/**
 * FE-WORKSHOP-PERSISTENCE-JOURNEY-001 — real workshop persistence proof.
 *
 * Proves, on one served FE/BFF version pair, that a workshop created through
 * a real UI account/password login survives a real UI sign-out and a fresh
 * UI login in a brand-new browser context. This is deliberately narrower
 * than e2e/agora-product-journey.spec.ts: it does not run the servant
 * message/consult pipeline, research runs, or the Trading Room handoff.
 *
 * This is HOSTED ACCEPTANCE evidence, not local validation. It requires a
 * live Pantheon dev deployment and real credentials; it is opt-in and is not
 * part of the default local `npm test` / CI unit suite. Local, deterministic
 * source-contract coverage for this spec lives in
 * src/test/workshop-persistence-hosted-policy.test.ts, which validates this
 * file's guardrails without a network connection.
 *
 * Identity is established exclusively through the real "Account"/"Password"
 * dev-login form rendered by src/pages/Auth.tsx on the Pantheon dev host
 * (isDevLoginHost()). No bearer token is ever pre-injected into page or
 * browser state, and no prior session is reused across the sign-out
 * boundary.
 *
 * Required environment:
 *   WORKSHOP_PERSISTENCE_HOSTED_E2E=1
 *   PANTHEON_FE_BASE_URL / PANTHEON_BROWSER_BFF_BASE_URL
 *   EXPECTED_FE_SHA / EXPECTED_BFF_SHA
 *   DEV_LOGIN_CLIENT_ID / DEV_LOGIN_CLIENT_SECRET
 */

import { expect, test, type Page, type Response } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TASK_ID =
  process.env.TASK_ID ||
  (process.env.GOVERNANCE_CASE_ID
    ? "FE-GOVERNANCE-PAPER-CASE-READONLY-HARNESS-20261010"
    : process.env.EXISTING_WORKSHOP_ID
      ? "FE-WORKSHOP-SAME-RESOURCE-RESUME-20261010"
      : "FE-WORKSHOP-PERSISTENCE-JOURNEY-001");
const ENABLED = process.env.WORKSHOP_PERSISTENCE_HOSTED_E2E === "1";

const FE_BASE_URL = trimTrailingSlash(
  process.env.PANTHEON_FE_BASE_URL ||
  process.env.FRONTEND_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "",
);
const BFF_BASE_URL = trimTrailingSlash(
  process.env.PANTHEON_BROWSER_BFF_BASE_URL ||
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "",
);
const TENANT_ID =
  process.env.PANTHEON_BFF_TENANT_ID ??
  process.env.PANTHEON_TENANT_ID ??
  "tenant-dev";
const DEV_ACCOUNT = process.env.DEV_LOGIN_CLIENT_ID ?? "";
const DEV_PASSWORD = process.env.DEV_LOGIN_CLIENT_SECRET ?? "";
const EXPECTED_FE_SHA = String(process.env.EXPECTED_FE_SHA ?? "").trim().toLowerCase();
const EXPECTED_BFF_SHA = String(process.env.EXPECTED_BFF_SHA ?? "").trim().toLowerCase();
const EXISTING_WORKSHOP_ID = (process.env.EXISTING_WORKSHOP_ID ?? "").trim();
const EXISTING_WORKSHOP_TITLE_SHA256 = (
  process.env.EXISTING_WORKSHOP_TITLE_SHA256 ?? ""
).trim().toLowerCase();
const RESUME_EXISTING = process.env.WORKSHOP_RESUME_EXISTING === "1";
const GOVERNANCE_CASE_ID = (process.env.GOVERNANCE_CASE_ID ?? "").trim();
const GOVERNANCE_CASE_EXPECTED_VERSION = (
  process.env.GOVERNANCE_CASE_EXPECTED_VERSION ?? ""
).trim();
const GOVERNANCE_CASE_TARGET_DIGEST = (
  process.env.GOVERNANCE_CASE_TARGET_DIGEST ??
  process.env.GOVERNANCE_CASE_TARGET_ID ??
  process.env.GOVERNANCE_CASE_TARGET_DIGEST_OR_ID ??
  ""
).trim();
const EVIDENCE_DIR =
  process.env.PANTHEON_AUDIT_OUT_DIR ?? "/tmp/workshop-persistence-hosted";
const DEV_FE_HOST = "app.dev.mvl-cap.tw";
const DEV_BFF_HOST = "api.dev.mvl-cap.tw";
const CANONICAL_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;
const CANONICAL_IDENTIFIER_REGEX = /^[a-zA-Z0-9_.:-]+$/;

export function validateExistingWorkshopInputs(
  id: string,
  titleSha: string,
): { valid: true; id: string; titleSha: string } | { valid: false; reason: string } {
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
  if (!CANONICAL_UUID_REGEX.test(trimmedId)) {
    return {
      valid: false,
      reason: `malformed existing workshop id "${trimmedId}"; must be a canonical UUID`,
    };
  }
  if (!SHA256_HEX_REGEX.test(trimmedSha)) {
    return {
      valid: false,
      reason: `malformed existing workshop title SHA256 "${trimmedSha}"; must be 64 hex characters`,
    };
  }
  return { valid: true, id: trimmedId, titleSha: trimmedSha };
}

export function validateGovernanceCaseInputs(
  id: string,
  expectedVersionStr: string,
  targetDigestOrId: string,
):
  | { valid: true; id: string; expectedVersion: number; targetDigestOrId: string }
  | { valid: false; reason: string } {
  const trimmedId = id.trim();
  const trimmedVersion = expectedVersionStr.trim();
  const trimmedDigest = targetDigestOrId.trim();

  if (!trimmedId && !trimmedVersion && !trimmedDigest) {
    return { valid: false, reason: "governance case id, expected version, and target digest/id are all missing" };
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
  if (!CANONICAL_IDENTIFIER_REGEX.test(trimmedId)) {
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
  if (!CANONICAL_IDENTIFIER_REGEX.test(trimmedDigest)) {
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
}

const hasExistingInputs = Boolean(EXISTING_WORKSHOP_ID || EXISTING_WORKSHOP_TITLE_SHA256);
const hasGovernanceInputs = Boolean(
  GOVERNANCE_CASE_ID ||
  GOVERNANCE_CASE_EXPECTED_VERSION ||
  GOVERNANCE_CASE_TARGET_DIGEST,
);

if (
  ENABLED &&
  (!FE_BASE_URL ||
    !BFF_BASE_URL ||
    !DEV_ACCOUNT ||
    !DEV_PASSWORD ||
    !EXPECTED_FE_SHA ||
    !EXPECTED_BFF_SHA)
) {
  throw new Error(
    `${TASK_ID} requires Pantheon FE/BFF URLs, DEV_LOGIN_CLIENT_ID/SECRET, and the expected exact FE/BFF SHA pair.`,
  );
}

if (ENABLED && (hasExistingInputs || RESUME_EXISTING)) {
  const validation = validateExistingWorkshopInputs(
    EXISTING_WORKSHOP_ID,
    EXISTING_WORKSHOP_TITLE_SHA256,
  );
  if (!validation.valid) {
    throw new Error(
      `${TASK_ID} existing workshop mode requires valid canonical UUID and 64-hex title SHA256: ${validation.reason}`,
    );
  }
}

if (ENABLED && hasGovernanceInputs) {
  const govValidation = validateGovernanceCaseInputs(
    GOVERNANCE_CASE_ID,
    GOVERNANCE_CASE_EXPECTED_VERSION,
    GOVERNANCE_CASE_TARGET_DIGEST,
  );
  if (!govValidation.valid) {
    throw new Error(
      `${TASK_ID} governance case mode requires valid case id, positive integer version, and target digest/id: ${govValidation.reason}`,
    );
  }
}

type JsonRecord = Record<string, unknown>;

export function canonicalJsonString(obj: unknown): string {
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
}

export function computeContentHash(data: JsonRecord): string {
  return sha256Hex(canonicalJsonString(data));
}

type StepResult = {
  id: string;
  status: "passed" | "failed";
  response_status?: number;
};

type VersionPairEvidence = {
  fe_sha: string;
  bff_sha: string;
  captured_at: string;
};

type SanitizedEvidence = {
  schema_version: "pantheon.workshop-persistence.hosted-evidence.v1";
  task_id: string;
  operation_id: string;
  mode: "new_workshop_creation" | "existing_workshop_resume";
  started_at: string;
  completed_at: string;
  status: "passed" | "failed";
  version_pair: {
    expected: { fe_sha: string; bff_sha: string };
    before: VersionPairEvidence;
    after: VersionPairEvidence | null;
    matched: boolean;
  };
  workshop: {
    id: string;
    title: string;
    title_sha256: string;
    content_sha256?: string;
  };
  governance_case?: {
    id: string;
    expected_version: number;
    target_digest: string;
    observed_version?: number;
    state?: string;
    content_sha256?: string;
  };
  steps: StepResult[];
  failure?: {
    message: string;
    step_id: string | null;
  };
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function responsePath(response: Response): string {
  return new URL(response.url()).pathname;
}

function waitForResponse(
  page: Page,
  method: "GET" | "POST" | "PATCH",
  path: string,
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method && responsePath(response) === path,
  );
}

async function jsonBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null) as Promise<unknown>;
}

function writeEvidence(payload: SanitizedEvidence): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const target = join(EVIDENCE_DIR, "workshop-persistence-hosted-evidence.json");
  writeFileSync(target, JSON.stringify(payload, null, 2), "utf-8");
  return target;
}

/**
 * Both FE and BFF must report the same exact expected pair. A mismatch here
 * must fail the test outright, not be softened into a warning or relabeled.
 */
async function captureVersionPair(page: Page): Promise<VersionPairEvidence> {
  expect(
    new URL(FE_BASE_URL).hostname,
    "hosted persistence journey must target the Pantheon dev FE",
  ).toBe(DEV_FE_HOST);
  expect(
    new URL(BFF_BASE_URL).hostname,
    "hosted persistence journey must target the paired Pantheon dev BFF",
  ).toBe(DEV_BFF_HOST);

  const deploymentResponse = await page.request.get(
    `${FE_BASE_URL}/deployment.json?task=${TASK_ID}`,
  );
  expect(deploymentResponse.ok(), "deployment.json must be reachable").toBe(true);
  const deployment = asRecord(await deploymentResponse.json());
  const feSha = String(deployment.commit ?? "").trim().toLowerCase();
  const manifestBffSha = String(
    deployment.bffCommit ?? deployment.bffSourceCommitSha ?? "",
  )
    .trim()
    .toLowerCase();

  const versionResponse = await page.request.get(`${BFF_BASE_URL}/bff/version`);
  expect(versionResponse.ok(), "/bff/version must be reachable").toBe(true);
  const version = asRecord(await versionResponse.json());
  const bffSha = String(version.source_commit_sha ?? version.commit ?? "")
    .trim()
    .toLowerCase();
  const bffKnown = String(version.source_commit_known ?? "");

  expect(feSha, "live FE commit must match the expected exact FE SHA").toBe(EXPECTED_FE_SHA);
  expect(
    manifestBffSha,
    "deployment.json bffCommit/bffSourceCommitSha must match the expected exact BFF SHA",
  ).toBe(EXPECTED_BFF_SHA);
  expect(bffKnown, "live BFF /bff/version source_commit_known must be true").toBe("true");
  expect(bffSha, "live BFF commit must match the expected exact BFF SHA").toBe(EXPECTED_BFF_SHA);

  return {
    fe_sha: feSha,
    bff_sha: bffSha,
    captured_at: new Date().toISOString(),
  };
}

/**
 * Drives the real "Account"/"Password" dev-login form (src/pages/Auth.tsx),
 * asserting the resulting session comes from an authoritative BFF readback
 * of the browser's own HttpOnly cookie, never from injected state.
 */
async function realUiDevLogin(page: Page): Promise<void> {
  await page.goto(
    `${FE_BASE_URL}/agora/auth?from=${encodeURIComponent("/agora/strategy-workshop")}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.locator("#dev-account")).toBeVisible({ timeout: 15_000 });
  await page.locator("#dev-account").fill(DEV_ACCOUNT);
  await page.locator("#dev-password").fill(DEV_PASSWORD);

  const meResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" && responsePath(response) === "/bff/me",
  );
  const readinessResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      responsePath(response) === "/bff/auth/readiness",
  );
  await page.getByRole("button", { exact: true, name: "Sign in" }).click();

  const me = await meResponse;
  expect(me.ok(), `dev-login browser /bff/me returned ${me.status()}`).toBe(true);
  const meBody = asRecord(await jsonBody(me));
  const meData = asRecord(meBody.data ?? meBody);
  const roles = Array.isArray(meData.roles)
    ? (meData.roles as unknown[]).map((role) => String(role).toLowerCase())
    : [];
  expect(roles, "dev-login session must carry the operator role").toContain("operator");

  const readiness = await readinessResponse;
  expect(
    readiness.ok(),
    `dev-login browser /bff/auth/readiness returned ${readiness.status()}`,
  ).toBe(true);
  const readinessBody = asRecord(await jsonBody(readiness));
  const readinessData = asRecord(readinessBody.data ?? readinessBody);
  expect(readinessData.ready).toBe(true);
  expect(readinessData.authReady).toBe(true);

  await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 15_000 });
}

/** Real UI sign-out; must invalidate the server-side session, not just local state. */
async function realUiSignOut(page: Page): Promise<void> {
  const logout = waitForResponse(page, "POST", "/bff/logout");
  await page.getByRole("button", { name: "Sign out" }).click();
  const logoutResponse = await logout;
  expect(logoutResponse.ok(), `sign-out /bff/logout returned ${logoutResponse.status()}`).toBe(true);
  await page.waitForURL((url) => url.pathname.includes("/auth"), { timeout: 15_000 });
}

/** Confirms the session is genuinely invalidated server-side, not merely absent client-side. */
async function assertSessionInvalidated(page: Page): Promise<void> {
  const meAfterLogout = await page.request.get(`${BFF_BASE_URL}/bff/me`, {
    headers: { Accept: "application/json", "X-Tenant-Id": TENANT_ID },
  });
  expect(
    meAfterLogout.status(),
    "the BFF session must reject /bff/me after real sign-out",
  ).toBe(401);
}

/**
 * The workshop detail route (StrategyWorkshopPage with an id) renders
 * WorkshopSessionView, which does not expose a `workshop-item-{id}` locator;
 * that testid only exists on list rows in WorkshopListView. To read the
 * saved title with a real locator, navigate back to the list via the
 * existing detail backlink, assert the exact visible title there, then
 * click the same real item to reopen the matching detail route.
 */
async function assertSavedTitleViaListRoundTrip(
  page: Page,
  workshopId: string,
  title: string,
): Promise<void> {
  await expect(page).toHaveURL(
    `${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`,
    { timeout: 30_000 },
  );
  await page.getByRole("link", { name: "工坊列表" }).click();
  await expect(page).toHaveURL(`${FE_BASE_URL}/agora/strategy-workshop`, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("strategy-workshop-page-list")).toBeVisible({
    timeout: 30_000,
  });
  const item = page.getByTestId(`workshop-item-${workshopId}`);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item).toContainText(title);
  await item.click();
  await expect(page).toHaveURL(
    `${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`,
    { timeout: 30_000 },
  );
}

/**
 * Same list round trip, starting from the list route that the post-login
 * redirect lands on (rather than a detail URL that would 404 the backlink).
 */
async function reopenWorkshopFromListAndAssertTitle(
  page: Page,
  workshopId: string,
  title: string,
): Promise<void> {
  await expect(page).toHaveURL(`${FE_BASE_URL}/agora/strategy-workshop`, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("strategy-workshop-page-list")).toBeVisible({
    timeout: 30_000,
  });
  const item = page.getByTestId(`workshop-item-${workshopId}`);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item).toContainText(title);
  await item.click();
  await expect(page).toHaveURL(
    `${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`,
    { timeout: 30_000 },
  );
}

/** Confirms a brand-new browser context has no residual authenticated state. */
async function assertAnonymousContext(page: Page): Promise<void> {
  await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL((url) => url.pathname.includes("/auth"), { timeout: 15_000 });
  expect(page.url()).toContain("reason=auth-required");
}

/**
 * Reads the specified governance approval case directly from the owner BFF via
 * GET /bff/approvals/{id}, asserting valid case id, expected version match,
 * pending/proposed state, and binding to target pool id or digest.
 * Zero mutations, zero write calls.
 */
async function readGovernanceCaseOwnerReadback(
  page: Page,
  caseId: string,
  expectedVersion: number,
  targetDigestOrId: string,
): Promise<{
  data: JsonRecord;
  contentDigest: string;
  version: number;
  state: string;
  subject: string;
}> {
  const readback = await page.request.get(
    `${BFF_BASE_URL}/bff/approvals/${encodeURIComponent(caseId)}`,
    { headers: { Accept: "application/json", "X-Tenant-Id": TENANT_ID } },
  );
  expect(
    readback.ok(),
    `governance case owner GET returned ${readback.status()}`,
  ).toBe(true);
  const body = asRecord(await readback.json());
  const data = asRecord(body.data ?? body);
  const observedId = String(data.id ?? data.approval_id ?? "").trim();
  expect(observedId, "owner GET must return matching case ID").toBe(caseId);

  const observedVersion = Number(data.version ?? data.lock_version ?? 0);
  if (observedVersion !== expectedVersion) {
    throw new Error(
      `Governance case version mismatch: expected ${expectedVersion}, got ${observedVersion}; case changed on owner (stale outcome)`,
    );
  }

  const observedState = String(
    data.state ?? data.decision_state ?? "",
  ).toLowerCase();
  expect(
    ["pending", "proposed", "under_review"].includes(observedState),
    `governance case state must be pending or proposed, got "${observedState}"`,
  ).toBe(true);

  const targetLower = targetDigestOrId.toLowerCase();
  const serialized = canonicalJsonString(data).toLowerCase();
  const subject = String(data.subject ?? "");
  const diffSummary = String(data.diffSummary ?? "");
  const rationale = String(data.rationale ?? "");
  const target = String(data.target ?? "");
  const matchesTarget =
    target.toLowerCase().includes(targetLower) ||
    subject.toLowerCase().includes(targetLower) ||
    diffSummary.toLowerCase().includes(targetLower) ||
    rationale.toLowerCase().includes(targetLower) ||
    serialized.includes(targetLower);
  expect(
    matchesTarget,
    `owner GET response must bind to target digest or id "${targetDigestOrId}"`,
  ).toBe(true);

  const contentDigest = computeContentHash(data);
  expect(
    contentDigest,
    "governance case content digest must be non-empty",
  ).toBeTruthy();

  return {
    data,
    contentDigest,
    version: observedVersion,
    state: observedState,
    subject,
  };
}

/**
 * Navigates to the real /management/governance/{id} route and asserts that the
 * case is actually visible in the DOM with owner-bound detail.
 * Read-only navigation only: absolutely NEVER clicks any decision or write buttons.
 */
async function navigateGovernanceCaseUi(
  page: Page,
  caseId: string,
  expectedSubject?: string,
): Promise<void> {
  await page.goto(
    `${FE_BASE_URL}/management/governance/${encodeURIComponent(caseId)}`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page).toHaveURL(
    `${FE_BASE_URL}/management/governance/${encodeURIComponent(caseId)}`,
    { timeout: 30_000 },
  );
  await expect(page.getByText("找不到審批請求")).not.toBeVisible();
  await expect(page.locator("body")).toContainText(caseId, { timeout: 30_000 });
  if (expectedSubject) {
    await expect(page.locator("body")).toContainText(expectedSubject, {
      timeout: 30_000,
    });
  }
}

test.describe(`${TASK_ID} hosted workshop persistence`, () => {
  test.skip(
    !ENABLED,
    "Set WORKSHOP_PERSISTENCE_HOSTED_E2E=1 only with a governed dev-login account/password pair against a live Pantheon dev deployment.",
  );
  test.setTimeout(180_000);

  test("real UI login, workshop creation, sign-out, and fresh-login readback persist the exact saved title", async ({
    page,
    browser,
  }) => {
    const operationId = randomUUID();
    const startedAt = new Date().toISOString();
    const isExistingMode = Boolean(
      EXISTING_WORKSHOP_ID || EXISTING_WORKSHOP_TITLE_SHA256 || RESUME_EXISTING,
    );
    const mode = isExistingMode
      ? "existing_workshop_resume"
      : "new_workshop_creation";
    let workshopTitle = isExistingMode ? "" : `Workshop persistence journey ${operationId}`;
    let workshopId = "";
    let contentDigest = "";
    let initialGovDigest = "";
    let initialGovVersion = 0;
    let initialGovState = "";
    let govSubject = "";
    const steps: StepResult[] = [];
    let status: "passed" | "failed" = "failed";
    let failure: { message: string; step_id: string | null } | undefined;
    let before: VersionPairEvidence | undefined;
    let after: VersionPairEvidence | undefined;

    const runStep = async <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
      try {
        const result = await fn();
        steps.push({ id, status: "passed" });
        return result;
      } catch {
        // Intentionally do not persist the caught error's message/cause: form-fill
        // and request failures in this journey can carry the dev-login secret in
        // their text, and that must never reach sanitized JSON/reporter evidence.
        steps.push({ id, status: "failed" });
        failure = {
          message: `step "${id}" failed`,
          step_id: id,
        };
        throw new Error(`${TASK_ID} step "${id}" failed`);
      }
    };

    try {
      if (isExistingMode) {
        const validation = validateExistingWorkshopInputs(
          EXISTING_WORKSHOP_ID,
          EXISTING_WORKSHOP_TITLE_SHA256,
        );
        if (!validation.valid) {
          throw new Error(
            `${TASK_ID} invalid existing workshop inputs: ${validation.reason}`,
          );
        }
        workshopId = validation.id;
        const expectedTitleSha256 = validation.titleSha;

        before = await runStep("capture_version_pair_before", () =>
          captureVersionPair(page),
        );

        await runStep("real_ui_login_first", () => realUiDevLogin(page));

        let acknowledgedTitle = "";
        await runStep("assert_existing_workshop_owner_readback_first", async () => {
          const readback = await page.request.get(
            `${BFF_BASE_URL}/bff/agora/workshops/${encodeURIComponent(workshopId)}`,
            { headers: { Accept: "application/json", "X-Tenant-Id": TENANT_ID } },
          );
          expect(readback.ok(), `existing workshop initial readback returned ${readback.status()}`).toBe(true);
          const body = asRecord(await readback.json());
          const data = asRecord(body.data ?? body);
          expect(String(data.workshop_id ?? ""), "owner GET must return same workshop ID").toBe(workshopId);
          const metadata = asRecord(data.metadata);
          acknowledgedTitle =
            (typeof metadata.strategy_name === "string" && metadata.strategy_name) ||
            (typeof metadata.title === "string" && metadata.title) ||
            (typeof data.title === "string" && data.title) ||
            "";
          expect(acknowledgedTitle, "acknowledged workshop must have a non-empty title").toBeTruthy();
          expect(
            sha256Hex(acknowledgedTitle),
            "owner GET title SHA256 must match the acknowledged title hash",
          ).toBe(expectedTitleSha256);
          contentDigest = computeContentHash(data);
          expect(contentDigest, "owner content digest must be non-empty").toBeTruthy();
        });

        workshopTitle = acknowledgedTitle;

        await runStep("navigate_existing_workshop_ui", () =>
          reopenWorkshopFromListAndAssertTitle(page, workshopId, acknowledgedTitle),
        );

        await runStep("execute_real_page_reload", async () => {
          await page.reload({ waitUntil: "domcontentloaded" });
          await expect(page).toHaveURL(
            `${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`,
            { timeout: 30_000 },
          );
          await expect(page.getByTestId("strategy-workshop-runtime-header")).toBeVisible({
            timeout: 30_000,
          });
        });

        await runStep("assert_after_reload_readback_and_visible_ui", async () => {
          await expect(page).toHaveURL(
            `${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`,
            { timeout: 30_000 },
          );
          await expect(page.getByTestId("strategy-workshop-runtime-header")).toBeVisible({
            timeout: 30_000,
          });
          const readback = await page.request.get(
            `${BFF_BASE_URL}/bff/agora/workshops/${encodeURIComponent(workshopId)}`,
            { headers: { Accept: "application/json", "X-Tenant-Id": TENANT_ID } },
          );
          expect(readback.ok(), `post-reload readback returned ${readback.status()}`).toBe(true);
          const body = asRecord(await readback.json());
          const data = asRecord(body.data ?? body);
          expect(String(data.workshop_id ?? ""), "post-reload readback must return same ID").toBe(workshopId);
          const metadata = asRecord(data.metadata);
          const postReloadTitle =
            (typeof metadata.strategy_name === "string" && metadata.strategy_name) ||
            (typeof metadata.title === "string" && metadata.title) ||
            (typeof data.title === "string" && data.title) ||
            "";
          expect(
            sha256Hex(postReloadTitle),
            "post-reload title SHA256 must match the acknowledged title hash",
          ).toBe(expectedTitleSha256);
          const postReloadDigest = computeContentHash(data);
          expect(
            postReloadDigest,
            "post-reload owner content digest must match initial content digest",
          ).toBe(contentDigest);
        });

        if (hasGovernanceInputs) {
          const govVal = validateGovernanceCaseInputs(
            GOVERNANCE_CASE_ID,
            GOVERNANCE_CASE_EXPECTED_VERSION,
            GOVERNANCE_CASE_TARGET_DIGEST,
          );
          if (!govVal.valid) {
            throw new Error(`governance case inputs invalid: ${govVal.reason}`);
          }
          const govTarget = govVal.targetDigestOrId;
          const govCaseId = govVal.id;
          const govExpectedVer = govVal.expectedVersion;

          await runStep("assert_governance_case_owner_readback_first", async () => {
            const gov = await readGovernanceCaseOwnerReadback(
              page,
              govCaseId,
              govExpectedVer,
              govTarget,
            );
            initialGovDigest = gov.contentDigest;
            initialGovVersion = gov.version;
            initialGovState = gov.state;
            govSubject = gov.subject;
          });

          await runStep("navigate_governance_case_ui_first", () =>
            navigateGovernanceCaseUi(page, govCaseId, govSubject),
          );

          await page.goto(
            `${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`,
            { waitUntil: "domcontentloaded" },
          );
          await expect(
            page.getByRole("button", { name: "Sign out" }),
          ).toBeVisible({ timeout: 30_000 });
        }

        await runStep("real_ui_sign_out", () => realUiSignOut(page));
        await runStep("assert_session_invalidated", () => assertSessionInvalidated(page));

        await page.context().close();

        const freshContext = await browser.newContext();
        try {
          const freshPage = await freshContext.newPage();

          await runStep("assert_fresh_context_anonymous", () =>
            assertAnonymousContext(freshPage),
          );

          await runStep("real_ui_login_second", () => realUiDevLogin(freshPage));

          await runStep("reopen_existing_workshop_ui", () =>
            reopenWorkshopFromListAndAssertTitle(freshPage, workshopId, acknowledgedTitle),
          );

          await runStep("assert_fresh_context_owner_readback", async () => {
            const readback = await freshPage.request.get(
              `${BFF_BASE_URL}/bff/agora/workshops/${encodeURIComponent(workshopId)}`,
              { headers: { Accept: "application/json", "X-Tenant-Id": TENANT_ID } },
            );
            expect(readback.ok(), `fresh context readback returned ${readback.status()}`).toBe(true);
            const body = asRecord(await readback.json());
            const data = asRecord(body.data ?? body);
            expect(String(data.workshop_id ?? ""), "fresh context readback must return same ID").toBe(workshopId);
            const metadata = asRecord(data.metadata);
            const freshContextTitle =
              (typeof metadata.strategy_name === "string" && metadata.strategy_name) ||
              (typeof metadata.title === "string" && metadata.title) ||
              (typeof data.title === "string" && data.title) ||
              "";
            expect(
              sha256Hex(freshContextTitle),
              "fresh context title SHA256 must match the acknowledged title hash",
            ).toBe(expectedTitleSha256);
            const freshContextDigest = computeContentHash(data);
            expect(
              freshContextDigest,
              "fresh context owner content digest must match initial content digest",
            ).toBe(contentDigest);
          });

          if (hasGovernanceInputs) {
            const govVal = validateGovernanceCaseInputs(
              GOVERNANCE_CASE_ID,
              GOVERNANCE_CASE_EXPECTED_VERSION,
              GOVERNANCE_CASE_TARGET_DIGEST,
            );
            if (!govVal.valid) {
              throw new Error(`governance case inputs invalid: ${govVal.reason}`);
            }
            const govTarget = govVal.targetDigestOrId;
            const govCaseId = govVal.id;
            const govExpectedVer = govVal.expectedVersion;

            await runStep("navigate_governance_case_ui_second", () =>
              navigateGovernanceCaseUi(freshPage, govCaseId, govSubject),
            );

            await runStep(
              "assert_fresh_context_governance_case_owner_readback",
              async () => {
                const freshGov = await readGovernanceCaseOwnerReadback(
                  freshPage,
                  govCaseId,
                  govExpectedVer,
                  govTarget,
                );
                expect(
                  freshGov.version,
                  "fresh context governance case version must match initial version",
                ).toBe(initialGovVersion);
                expect(
                  freshGov.contentDigest,
                  "fresh context governance case content digest must match initial digest",
                ).toBe(initialGovDigest);
              },
            );
          }

          after = await runStep("capture_version_pair_after", () =>
            captureVersionPair(freshPage),
          );
        } finally {
          await freshContext.close();
        }

        status = "passed";
      } else {
        before = await runStep("capture_version_pair_before", () => captureVersionPair(page));

        await runStep("real_ui_login_first", () => realUiDevLogin(page));

        workshopId = await runStep("create_workshop", async () => {
          await expect(page.getByTestId("strategy-workshop-page-list")).toBeVisible({
            timeout: 30_000,
          });
          await page.getByTestId("create-workshop-btn").click();
          await page.getByTestId("create-workshop-title-input").fill(workshopTitle);
          const created = waitForResponse(page, "POST", "/bff/agora/workshops");
          await page.getByTestId("create-workshop-submit").click();
          const response = await created;
          expect(response.ok(), `workshop create returned ${response.status()}`).toBe(true);
          const body = asRecord(await jsonBody(response));
          const data = asRecord(body.data ?? body);
          const id = String(data.workshop_id ?? "").trim();
          expect(id, "workshop create must return a canonical workshop_id").toMatch(
            /^(?!.*unknown)[a-zA-Z0-9_.:-]+$/i,
          );
          return id;
        });

        await runStep("assert_saved_title_ui", () =>
          assertSavedTitleViaListRoundTrip(page, workshopId, workshopTitle),
        );

        await runStep("assert_saved_title_server_readback", async () => {
          const readback = await page.request.get(
            `${BFF_BASE_URL}/bff/agora/workshops/${encodeURIComponent(workshopId)}`,
            { headers: { Accept: "application/json", "X-Tenant-Id": TENANT_ID } },
          );
          expect(readback.ok(), `workshop readback returned ${readback.status()}`).toBe(true);
          const body = asRecord(await readback.json());
          const data = asRecord(body.data ?? body);
          expect(String(data.workshop_id ?? "")).toBe(workshopId);
          const metadata = asRecord(data.metadata);
          const savedTitle =
            (typeof metadata.strategy_name === "string" && metadata.strategy_name) ||
            (typeof metadata.title === "string" && metadata.title) ||
            "";
          expect(savedTitle, "server readback must return the exact saved title").toBe(
            workshopTitle,
          );
          contentDigest = computeContentHash(data);
        });

        if (hasGovernanceInputs) {
          const govVal = validateGovernanceCaseInputs(
            GOVERNANCE_CASE_ID,
            GOVERNANCE_CASE_EXPECTED_VERSION,
            GOVERNANCE_CASE_TARGET_DIGEST,
          );
          if (!govVal.valid) {
            throw new Error(`governance case inputs invalid: ${govVal.reason}`);
          }
          const govTarget = govVal.targetDigestOrId;
          const govCaseId = govVal.id;
          const govExpectedVer = govVal.expectedVersion;

          await runStep("assert_governance_case_owner_readback_first", async () => {
            const gov = await readGovernanceCaseOwnerReadback(
              page,
              govCaseId,
              govExpectedVer,
              govTarget,
            );
            initialGovDigest = gov.contentDigest;
            initialGovVersion = gov.version;
            initialGovState = gov.state;
            govSubject = gov.subject;
          });

          await runStep("navigate_governance_case_ui_first", () =>
            navigateGovernanceCaseUi(page, govCaseId, govSubject),
          );

          await page.goto(
            `${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`,
            { waitUntil: "domcontentloaded" },
          );
          await expect(
            page.getByRole("button", { name: "Sign out" }),
          ).toBeVisible({ timeout: 30_000 });
        }

        await runStep("real_ui_sign_out", () => realUiSignOut(page));
        await runStep("assert_session_invalidated", () => assertSessionInvalidated(page));

        await page.context().close();

        const freshContext = await browser.newContext();
        try {
          const freshPage = await freshContext.newPage();

          await runStep("assert_fresh_context_anonymous", () =>
            assertAnonymousContext(freshPage),
          );

          await runStep("real_ui_login_second", () => realUiDevLogin(freshPage));

          await runStep("reopen_workshop_and_read_exact_title", () =>
            reopenWorkshopFromListAndAssertTitle(freshPage, workshopId, workshopTitle),
          );

          if (hasGovernanceInputs) {
            const govVal = validateGovernanceCaseInputs(
              GOVERNANCE_CASE_ID,
              GOVERNANCE_CASE_EXPECTED_VERSION,
              GOVERNANCE_CASE_TARGET_DIGEST,
            );
            if (!govVal.valid) {
              throw new Error(`governance case inputs invalid: ${govVal.reason}`);
            }
            const govTarget = govVal.targetDigestOrId;
            const govCaseId = govVal.id;
            const govExpectedVer = govVal.expectedVersion;

            await runStep("navigate_governance_case_ui_second", () =>
              navigateGovernanceCaseUi(freshPage, govCaseId, govSubject),
            );

            await runStep(
              "assert_fresh_context_governance_case_owner_readback",
              async () => {
                const freshGov = await readGovernanceCaseOwnerReadback(
                  freshPage,
                  govCaseId,
                  govExpectedVer,
                  govTarget,
                );
                expect(
                  freshGov.version,
                  "fresh context governance case version must match initial version",
                ).toBe(initialGovVersion);
                expect(
                  freshGov.contentDigest,
                  "fresh context governance case content digest must match initial digest",
                ).toBe(initialGovDigest);
              },
            );
          }

          after = await runStep("capture_version_pair_after", () =>
            captureVersionPair(freshPage),
          );
        } finally {
          await freshContext.close();
        }

        status = "passed";
      }
    } finally {
      const matched = Boolean(
        before &&
        after &&
        before.fe_sha === after.fe_sha &&
        before.bff_sha === after.bff_sha &&
        before.fe_sha === EXPECTED_FE_SHA &&
        before.bff_sha === EXPECTED_BFF_SHA,
      );

      const resolvedTitleSha256 = workshopTitle
        ? sha256Hex(workshopTitle)
        : (EXISTING_WORKSHOP_TITLE_SHA256 || "");

      const evidence: SanitizedEvidence = {
        schema_version: "pantheon.workshop-persistence.hosted-evidence.v1",
        task_id: TASK_ID,
        operation_id: operationId,
        mode,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        status,
        version_pair: {
          expected: { fe_sha: EXPECTED_FE_SHA, bff_sha: EXPECTED_BFF_SHA },
          before: before ?? { fe_sha: "", bff_sha: "", captured_at: "" },
          after: after ?? null,
          matched,
        },
        workshop: {
          id: workshopId,
          title: workshopTitle,
          title_sha256: resolvedTitleSha256,
          ...(contentDigest ? { content_sha256: contentDigest } : {}),
        },
        ...(hasGovernanceInputs && GOVERNANCE_CASE_ID
          ? {
              governance_case: {
                id: GOVERNANCE_CASE_ID,
                expected_version: Number(GOVERNANCE_CASE_EXPECTED_VERSION) || 1,
                target_digest: GOVERNANCE_CASE_TARGET_DIGEST,
                ...(initialGovVersion ? { observed_version: initialGovVersion } : {}),
                ...(initialGovState ? { state: initialGovState } : {}),
                ...(initialGovDigest ? { content_sha256: initialGovDigest } : {}),
              },
            }
          : {}),
        steps,
        ...(failure ? { failure } : {}),
      };
      writeEvidence(evidence);

      if (status === "passed") {
        expect(matched, "the exact FE/BFF SHA pair must match before and after the journey").toBe(
          true,
        );
      }
    }
  });
});
