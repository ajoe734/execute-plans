/**
 * PFG-AGORA-JOURNEY-E2E-20260820 — governed browser-only Agora journey.
 *
 * This is deliberately opt-in: it creates durable dev records.  The run must
 * use the Pantheon operator-live candidate and a short-lived, real operator
 * session.  It contains no route interception, fixture data, prebuilt IDs, or
 * direct API writes; every mutation is initiated by the rendered browser UI.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page, type Response, type TestInfo } from "@playwright/test";
import {
  gcpIdentityStorageKey,
  gcpIdentityStoredUser,
  roleTokenFromEnv,
} from "./helpers/auth";

const TASK_ID = "PFG-AGORA-JOURNEY-E2E-20260820";
const FE_BASE_URL = String(process.env.PANTHEON_FE_BASE_URL ?? "").replace(/\/+$/, "");
const BFF_BASE_URL = String(process.env.PANTHEON_BFF_BASE_URL ?? "").replace(/\/+$/, "");
const TENANT_ID = String(process.env.PANTHEON_TENANT_ID ?? "tenant-dev").trim();
const GCP_IDENTITY_API_KEY = String(process.env.PANTHEON_PUBLIC_GCP_IDENTITY_API_KEY ?? "").trim();
const OPERATOR_TOKEN = roleTokenFromEnv("operator", ["PFG_AGORA_JOURNEY_E2E_OPERATOR_TOKEN"]);
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/pfg-agora-journey-e2e";
const RUN_REQUESTED = process.env.PFG_AGORA_JOURNEY_E2E === "1";
const DEV_FE_HOST = "pantheon-lupin-dev-fe.35.201.204.12.sslip.io";
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.204.12.sslip.io";

type JsonRecord = Record<string, unknown>;
type NetworkRecord = {
  host: string;
  method: string;
  path: string;
  status: number;
};
type DurableWrite = NetworkRecord & {
  action: string;
  canonicalIds: string[];
};

function recordFrom(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function dataFrom(value: unknown): unknown {
  return recordFrom(value).data ?? value;
}

function idValues(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => idValues(item, found));
    return found;
  }
  const item = recordFrom(value);
  for (const [key, child] of Object.entries(item)) {
    if (/(^|_)id$/i.test(key) && typeof child === "string" && child.trim()) found.add(child.trim());
    if (child && typeof child === "object") idValues(child, found);
  }
  return found;
}

function firstNamedId(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstNamedId(item, key);
      if (found) return found;
    }
    return undefined;
  }
  const item = recordFrom(value);
  const candidate = item[key];
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  for (const child of Object.values(item)) {
    if (child && typeof child === "object") {
      const found = firstNamedId(child, key);
      if (found) return found;
    }
  }
  return undefined;
}

function bearerClaims(token: string): JsonRecord {
  const parts = token.split(".");
  if (parts.length !== 3) return {};
  try {
    return recordFrom(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")));
  } catch {
    return {};
  }
}

function routeOf(response: Response): string {
  return new URL(response.url()).pathname;
}

function matchesPost(path: string): (response: Response) => boolean {
  return (response) => response.request().method() === "POST" && routeOf(response) === path;
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

async function installHostedOperatorSession(page: Page): Promise<void> {
  expect(GCP_IDENTITY_API_KEY, "operator-live run needs the public GCP Identity API key").toMatch(/^AIza[A-Za-z0-9_-]{35}$/u);
  const claims = bearerClaims(OPERATOR_TOKEN);
  const operatorId = String(claims.sub ?? "").trim();
  const expiresAt = Number(claims.exp ?? 0);
  expect(operatorId, "operator token must bind a subject").not.toBe("");
  expect(expiresAt, "operator token must remain valid for the browser journey").toBeGreaterThan(Math.floor(Date.now() / 1000) + 240);

  const storageKey = gcpIdentityStorageKey(GCP_IDENTITY_API_KEY);
  const storedSession = gcpIdentityStoredUser({
    apiKey: GCP_IDENTITY_API_KEY,
    email: typeof claims.email === "string" ? claims.email : `${operatorId}@pantheon-dev.invalid`,
    token: OPERATOR_TOKEN,
    uid: operatorId,
  });
  await page.addInitScript(
    ({ key, session }) => window.sessionStorage.setItem(key, JSON.stringify(session)),
    { key: storageKey, session: storedSession },
  );
}

async function assertOperatorLiveCandidate(page: Page): Promise<JsonRecord> {
  expect(new URL(FE_BASE_URL).hostname).toBe(DEV_FE_HOST);
  expect(new URL(BFF_BASE_URL).hostname).toBe(DEV_BFF_HOST);
  const response = await page.request.get(`${FE_BASE_URL}/deployment.json?${TASK_ID}=${Date.now()}`);
  expect(response.ok(), "deployment.json must be available").toBe(true);
  const deployment = recordFrom(await response.json());
  const buildMode = recordFrom(deployment.buildMode);

  expect(deployment.app).toBe("execute-plans");
  expect(deployment.sourceBranch).toBe("dev");
  expect(deployment.deploymentProfile ?? deployment.profile).toBe("operator-live");
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");
  expect(buildMode.VITE_BFF_REAL_WRITES).toBe("true");
  expect(buildMode.VITE_BFF_ALLOW_DEV_STUB_WRITES).toBe("false");
  expect(buildMode.VITE_BFF_EMBEDDED_BEARER_TOKEN).toBe("false");
  return deployment;
}

function observeBffTraffic(page: Page): NetworkRecord[] {
  const records: NetworkRecord[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/bff/")) return;
    records.push({
      host: url.hostname,
      method: response.request().method(),
      path: url.pathname,
      status: response.status(),
    });
  });
  return records;
}

async function recordWrite(
  action: string,
  response: Response,
  writes: DurableWrite[],
): Promise<string[]> {
  expect(response.ok(), `${action} returned ${response.status()}`).toBe(true);
  const canonicalIds = [...idValues(dataFrom(await responseJson(response)))].sort();
  expect(canonicalIds, `${action} response must expose a canonical durable identity`).not.toEqual([]);
  const url = new URL(response.url());
  writes.push({
    action,
    canonicalIds,
    host: url.hostname,
    method: response.request().method(),
    path: url.pathname,
    status: response.status(),
  });
  return canonicalIds;
}

function assertBrowserProvenance(network: NetworkRecord[], writes: DurableWrite[]): void {
  expect(writes.map((write) => write.action)).toEqual([
    "create_workshop",
    "post_workshop_message",
    "reconstruct_strategy",
    "record_persona_learning_interaction",
    "create_research_run",
    "create_version_patch",
    "open_consultation",
  ]);
  for (const row of network) {
    expect(row.host, `${row.method} ${row.path} did not reach the paired BFF`).toBe(DEV_BFF_HOST);
    expect(row.status, `${row.method} ${row.path} returned ${row.status}`).toBeGreaterThanOrEqual(200);
    expect(row.status, `${row.method} ${row.path} returned ${row.status}`).toBeLessThan(400);
  }
  for (const write of writes) {
    expect(write.host).toBe(DEV_BFF_HOST);
    expect(write.canonicalIds.length, `${write.action} must have a response identity`).toBeGreaterThan(0);
  }
  expect(network.some((row) => /fixture|seed|mock/i.test(row.path))).toBe(false);
}

async function writeEvidence(testInfo: TestInfo, payload: JsonRecord): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = `${EVIDENCE_DIR}/${TASK_ID}-${testInfo.project.name}.json`;
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await testInfo.attach(`${TASK_ID}-sanitized-readback`, { contentType: "application/json", path });
}

test.describe(`${TASK_ID} strict-live product journey`, () => {
  test.skip(!RUN_REQUESTED, "Set PFG_AGORA_JOURNEY_E2E=1 only for an approved operator-live dev candidate.");
  test.setTimeout(240_000);

  test("creates the journey in-browser and preserves readbacks across Trading Room and Performance", async ({ page }, testInfo) => {
    test.skip(
      !FE_BASE_URL || !BFF_BASE_URL || !OPERATOR_TOKEN || !GCP_IDENTITY_API_KEY,
      "requires Pantheon dev targets, a short-lived operator token, and public GCP Identity configuration",
    );

    const deployment = await assertOperatorLiveCandidate(page);
    await installHostedOperatorSession(page);
    const network = observeBffTraffic(page);
    const writes: DurableWrite[] = [];
    const title = `PFG Agora journey ${new Date().toISOString()} ${randomUUID().slice(0, 8)}`;

    await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("strategy-workshop-page-list")).toBeVisible({ timeout: 60_000 });

    const createResponse = page.waitForResponse(matchesPost("/bff/agora/workshops"));
    await page.getByTestId("create-workshop-btn").click();
    await page.getByTestId("create-workshop-title-input").fill(title);
    await page.getByTestId("create-workshop-submit").click();
    const createdWorkshop = await createResponse;
    await recordWrite("create_workshop", createdWorkshop, writes);
    const workshopId = firstNamedId(dataFrom(await responseJson(createdWorkshop)), "workshop_id");
    expect(workshopId, "create-workshop response must identify the newly created workshop").toBeTruthy();
    if (!workshopId) return;
    await expect(page.getByTestId(`workshop-item-${workshopId}`)).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId("servant-composer-submit")).toBeEnabled({ timeout: 90_000 });
    await page.getByTestId("servant-composer-input").fill("Create a governed research, decision, learning, and consultation journey.");
    const messageResponse = page.waitForResponse(matchesPost(`/bff/agora/workshops/${encodeURIComponent(workshopId)}/messages`));
    const reconstructionResponse = page.waitForResponse(matchesPost(`/bff/agora/workshops/${encodeURIComponent(workshopId)}/reconstruct`));
    const interactionResponse = page.waitForResponse(matchesPost("/bff/agora/interactions"));
    await page.getByTestId("servant-composer-submit").click();
    await recordWrite("post_workshop_message", await messageResponse, writes);
    await recordWrite("reconstruct_strategy", await reconstructionResponse, writes);
    await recordWrite("record_persona_learning_interaction", await interactionResponse, writes);

    const researchResponse = page.waitForResponse(matchesPost(`/bff/agora/workshops/${encodeURIComponent(workshopId)}/research-run`));
    await page.getByTestId("cmd-research-btn").click();
    await recordWrite("create_research_run", await researchResponse, writes);

    const versionResponse = page.waitForResponse(matchesPost(`/bff/agora/workshops/${encodeURIComponent(workshopId)}/versions`));
    await page.getByTestId("cmd-version-btn").click();
    await recordWrite("create_version_patch", await versionResponse, writes);

    const consultationResponse = page.waitForResponse(matchesPost(`/bff/agora/workshops/${encodeURIComponent(workshopId)}/consultation`));
    await page.getByTestId("cmd-consult-btn").click();
    await recordWrite("open_consultation", await consultationResponse, writes);

    await expect(page.getByTestId("message-receipt-state")).toHaveAttribute("data-message-receipt", "succeeded");
    await page.goto(`${FE_BASE_URL}/agora/strategy-workshop/${encodeURIComponent(workshopId)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("add-to-trading-room-btn")).toBeEnabled({ timeout: 120_000 });
    await page.getByTestId("add-to-trading-room-btn").click();
    await expect(page).toHaveURL(new RegExp(`/agora/trading-room/${workshopId}|/agora/trading-room/`));
    await expect(page.getByTestId("trading-room-page")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("trading-room-workspace-shell")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("trading-room-decision-surface")).toBeVisible();
    await expect(page.getByTestId("open-candidate-review")).toBeEnabled({ timeout: 60_000 });
    await page.getByTestId("open-candidate-review").click();
    await expect(page.locator('[data-testid^="candidate-review-drawer-"]')).toBeVisible({ timeout: 60_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("trading-room-workspace-shell")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("trading-room-decision-surface")).toBeVisible();

    await page.goto(`${FE_BASE_URL}/agora/strategy-performance`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("strategy-performance-page")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("performance-pane-grid")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("strategy-performance-page")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("performance-pane-grid")).toBeVisible();

    assertBrowserProvenance(network, writes);
    await writeEvidence(testInfo, {
      bffBaseUrl: BFF_BASE_URL,
      browserOnly: true,
      deployment: {
        bffCommit: deployment.bffCommit,
        commit: deployment.commit,
        deploymentProfile: deployment.deploymentProfile ?? deployment.profile,
      },
      fixtureOrSeedNetworkObserved: false,
      network,
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      writes,
    });
  });
});
