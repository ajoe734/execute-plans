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

const TASK_ID = "FE-WORKSHOP-PERSISTENCE-JOURNEY-001";
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
const EVIDENCE_DIR =
  process.env.PANTHEON_AUDIT_OUT_DIR ?? "/tmp/workshop-persistence-hosted";
const DEV_FE_HOST = "app.dev.mvl-cap.tw";
const DEV_BFF_HOST = "api.dev.mvl-cap.tw";

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

type JsonRecord = Record<string, unknown>;

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

  const versionResponse = await page.request.get(`${BFF_BASE_URL}/bff/version`);
  expect(versionResponse.ok(), "/bff/version must be reachable").toBe(true);
  const version = asRecord(await versionResponse.json());
  const bffSha = String(version.source_commit_sha ?? version.commit ?? "")
    .trim()
    .toLowerCase();
  const bffKnown = String(version.source_commit_known ?? "");

  expect(feSha, "live FE commit must match the expected exact FE SHA").toBe(EXPECTED_FE_SHA);
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

/** Confirms a brand-new browser context has no residual authenticated state. */
async function assertAnonymousContext(page: Page): Promise<void> {
  await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL((url) => url.pathname.includes("/auth"), { timeout: 15_000 });
  expect(page.url()).toContain("reason=auth-required");
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
    const workshopTitle = `Workshop persistence journey ${operationId}`;
    const steps: StepResult[] = [];
    let workshopId = "";
    let status: "passed" | "failed" = "failed";
    let failure: { message: string; step_id: string | null } | undefined;
    let before: VersionPairEvidence | undefined;
    let after: VersionPairEvidence | undefined;

    const runStep = async <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
      try {
        const result = await fn();
        steps.push({ id, status: "passed" });
        return result;
      } catch (error) {
        steps.push({ id, status: "failed" });
        failure = {
          message: error instanceof Error ? error.message : String(error),
          step_id: id,
        };
        throw error;
      }
    };

    try {
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

      await runStep("assert_saved_title_ui", async () => {
        await expect(page).toHaveURL(
          `${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`,
          { timeout: 30_000 },
        );
        await expect(page.getByTestId(`workshop-item-${workshopId}`)).toContainText(
          workshopTitle,
          { timeout: 30_000 },
        );
      });

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
      });

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

        await runStep("reopen_workshop_and_read_exact_title", async () => {
          await freshPage.goto(
            `${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`,
            { waitUntil: "domcontentloaded" },
          );
          await expect(
            freshPage.getByTestId(`workshop-item-${workshopId}`),
          ).toContainText(workshopTitle, { timeout: 30_000 });
        });

        after = await runStep("capture_version_pair_after", () =>
          captureVersionPair(freshPage),
        );
      } finally {
        await freshContext.close();
      }

      status = "passed";
    } finally {
      const matched = Boolean(
        before &&
        after &&
        before.fe_sha === after.fe_sha &&
        before.bff_sha === after.bff_sha &&
        before.fe_sha === EXPECTED_FE_SHA &&
        before.bff_sha === EXPECTED_BFF_SHA,
      );

      const evidence: SanitizedEvidence = {
        schema_version: "pantheon.workshop-persistence.hosted-evidence.v1",
        task_id: TASK_ID,
        operation_id: operationId,
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
          title_sha256: sha256Hex(workshopTitle),
        },
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
