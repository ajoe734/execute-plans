/**
 * PFG-AGORA-JOURNEY-E2E-20260820 — strict-live, browser-owned Agora journey.
 *
 * This is deliberately an opt-in proof because it creates durable paper-mode
 * records. It never installs a route handler, imports a fixture, or accepts a
 * prebuilt workshop/candidate ID. Every identity used after the first screen is
 * observed from a browser BFF response generated during this run.
 *
 * Required environment:
 *   PFG_AGORA_JOURNEY_E2E=1
 *   PANTHEON_FE_BASE_URL=<Pantheon dev FE>
 *   PANTHEON_BFF_BASE_URL=<Pantheon dev BFF>
 *   PFG_AGORA_JOURNEY_E2E_GCP_EMAIL=<verified operator account>
 *   PFG_AGORA_JOURNEY_E2E_GCP_PASSWORD=<operator password>
 *   PFG_AGORA_JOURNEY_E2E_GCP_TOTP_SECRET=<enrolled TOTP secret>
 */

import { expect, test, type Page, type Request, type Response } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";

const TASK_ID = "PFG-AGORA-JOURNEY-E2E-20260820";
const ENABLED = process.env.PFG_AGORA_JOURNEY_E2E === "1";
const FE_BASE_URL = trimTrailingSlash(process.env.PANTHEON_FE_BASE_URL ?? "");
const BFF_BASE_URL = trimTrailingSlash(
  process.env.PANTHEON_BFF_BASE_URL ?? process.env.VITE_BFF_BASE_URL ?? "",
);
const TENANT_ID =
  process.env.PANTHEON_BFF_TENANT_ID ??
  process.env.PANTHEON_TENANT_ID ??
  "pantheon-dev";
const GCP_IDENTITY_EMAIL = process.env.PFG_AGORA_JOURNEY_E2E_GCP_EMAIL ?? "";
const GCP_IDENTITY_PASSWORD =
  process.env.PFG_AGORA_JOURNEY_E2E_GCP_PASSWORD ?? "";
const GCP_IDENTITY_TOTP_SECRET =
  process.env.PFG_AGORA_JOURNEY_E2E_GCP_TOTP_SECRET ?? "";
const EVIDENCE_DIR =
  process.env.PANTHEON_AUDIT_OUT_DIR ?? "/tmp/pfg-agora-product-journey";
const DEV_FE_HOST = "pantheon-lupin-dev-fe.35.201.204.12.sslip.io";
const DEV_BFF_HOST = "pantheon-lupin-dev-bff.35.201.204.12.sslip.io";
const MESSAGE_EVENT_PROJECTION_TIMEOUT_MS = 12_000;

if (
  ENABLED &&
  (!FE_BASE_URL ||
    !BFF_BASE_URL ||
    !GCP_IDENTITY_EMAIL ||
    !GCP_IDENTITY_PASSWORD ||
    !GCP_IDENTITY_TOTP_SECRET)
) {
  throw new Error(
    `${TASK_ID} requires Pantheon FE/BFF URLs plus a verified, TOTP-enrolled GCP Identity operator account.`,
  );
}

type JsonRecord = Record<string, unknown>;

type MutationEvidence = {
  id: string;
  method: "POST" | "PATCH";
  path: string;
  status: number;
};

type ObservedRequest = {
  authorization: boolean;
  method: string;
  origin: string;
  path: string;
  status?: number;
};

type OrderedResponse = {
  response: Response;
  sequence: number;
};

type MessageEventProjectionEvidence = {
  event: JsonRecord;
  event_id: string;
  readback_attempts: number;
  timeout_ms: number;
};

const observedTrafficByPage = new WeakMap<Page, ObservedRequest[]>();

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function base32Bytes(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/gu, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", base32Bytes(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    1_000_000;
  return String(code).padStart(6, "0");
}

function rolesFromMe(value: unknown): string[] {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const roles = data.roles ?? root.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === "string")
    : [];
}

async function installHostedOperatorSession(page: Page): Promise<void> {
  const fromRoute = "/agora/strategy-workshop";
  await page.goto(`${FE_BASE_URL}/auth?from=${encodeURIComponent(fromRoute)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByPlaceholder("Email").fill(GCP_IDENTITY_EMAIL);
  await page.getByPlaceholder("Password").fill(GCP_IDENTITY_PASSWORD);
  const meResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      responsePath(response) === "/bff/me",
  );
  await page.getByRole("button", { exact: true, name: "Sign in" }).click();

  const mfaHeading = page.getByText("Authenticator verification", {
    exact: true,
  });
  await Promise.race([
    page.waitForURL((url) => url.pathname === fromRoute),
    mfaHeading.waitFor({ state: "visible" }),
  ]);
  if (new URL(page.url()).pathname !== fromRoute) {
    await page
      .getByPlaceholder("123456")
      .fill(currentTotp(GCP_IDENTITY_TOTP_SECRET));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await page.waitForURL((url) => url.pathname === fromRoute);
  }

  const me = await meResponse;
  expect(me.ok(), `GCP browser session /bff/me returned ${me.status()}`).toBe(
    true,
  );
  expect(rolesFromMe(await jsonBody(me))).toContain("operator");
}

async function assertOperatorLiveCandidate(page: Page): Promise<void> {
  expect(
    new URL(FE_BASE_URL).hostname,
    "strict-live journey must use the Pantheon dev FE",
  ).toBe(DEV_FE_HOST);
  expect(
    new URL(BFF_BASE_URL).hostname,
    "strict-live journey must use the paired Pantheon dev BFF",
  ).toBe(DEV_BFF_HOST);
  const response = await page.request.get(
    `${FE_BASE_URL}/deployment.json?task=${TASK_ID}`,
  );
  expect(
    response.ok(),
    "deployment.json must be available before any product write",
  ).toBe(true);
  const deployment = asRecord(await response.json());
  const buildMode = asRecord(deployment.buildMode);
  const profile = deployment.deploymentProfile ?? deployment.profile;
  expect(["operator-live", "write-proof"]).toContain(profile);
  expect(buildMode.VITE_BFF_MODE).toBe("live");
  expect(buildMode.VITE_BFF_FALLBACK).toBe("strict");
  expect(buildMode.VITE_BFF_REAL_WRITES).toBe("true");
  expect(buildMode.VITE_BFF_EMBEDDED_BEARER_TOKEN).toBe("false");
}

function valueAtAliases(
  value: unknown,
  aliases: readonly string[],
  depth = 0,
): string | undefined {
  if (depth > 6 || !value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = valueAtAliases(item, aliases, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as JsonRecord;
  for (const alias of aliases) {
    const candidate = record[alias];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  for (const child of Object.values(record)) {
    const found = valueAtAliases(child, aliases, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function requiredId(
  value: unknown,
  label: string,
  aliases: readonly string[],
): string {
  const id = valueAtAliases(value, aliases);
  expect(
    id,
    `${label} must be returned by the browser-observed canonical BFF response`,
  ).toBeTruthy();
  return id as string;
}

function recordWithId(
  value: unknown,
  idField: string,
  id: string,
  depth = 0,
): JsonRecord | undefined {
  if (depth > 6 || !value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = recordWithId(item, idField, id, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as JsonRecord;
  if (record[idField] === id) return record;
  for (const child of Object.values(record)) {
    const found = recordWithId(child, idField, id, depth + 1);
    if (found) return found;
  }
  return undefined;
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

async function recordedMutation(
  response: Response,
  aliases: readonly string[],
  label: string,
): Promise<MutationEvidence> {
  expect(response.ok(), `${label} mutation failed at ${response.url()}`).toBe(
    true,
  );
  const body = await jsonBody(response);
  return {
    id: requiredId(body, label, aliases),
    method: response.request().method() as "POST" | "PATCH",
    path: responsePath(response),
    status: response.status(),
  };
}

async function recordedMutationForKnownTarget(
  response: Response,
  label: string,
  targetId: string,
): Promise<MutationEvidence> {
  expect(response.ok(), `${label} mutation failed at ${response.url()}`).toBe(
    true,
  );
  expect(
    await jsonBody(response),
    `${label} must return a canonical BFF response body`,
  ).toBeTruthy();
  return {
    id: targetId,
    method: response.request().method() as "POST" | "PATCH",
    path: responsePath(response),
    status: response.status(),
  };
}

/**
 * The hosted journey must tolerate an asynchronously materialized 202 receipt
 * without allowing reconstruction before its canonical event projection. The
 * timeout path is intentionally fail-closed: it reports a missing projection
 * and asserts no reconstruction request was made before the deadline.
 */
async function waitForDurableMessageEvent(
  page: Page,
  messageEventId: string,
  eventReadbacks: OrderedResponse[],
  reconstructionRequestSequences: number[],
): Promise<MessageEventProjectionEvidence> {
  const deadlineAt = Date.now() + MESSAGE_EVENT_PROJECTION_TIMEOUT_MS;
  let processedReadbacks = 0;

  while (Date.now() < deadlineAt) {
    while (processedReadbacks < eventReadbacks.length) {
      const readback = eventReadbacks[processedReadbacks];
      processedReadbacks += 1;
      const durableEvent = recordWithId(
        await jsonBody(readback.response),
        "event_id",
        messageEventId,
      );
      if (!durableEvent) continue;

      const prematureReconstruction = reconstructionRequestSequences.filter(
        (sequence) => sequence < readback.sequence,
      );
      expect(
        prematureReconstruction,
        "reconstruction must remain withheld until the receipt occurs in canonical event readback",
      ).toHaveLength(0);
      return {
        event: durableEvent,
        event_id: messageEventId,
        readback_attempts: processedReadbacks,
        timeout_ms: MESSAGE_EVENT_PROJECTION_TIMEOUT_MS,
      };
    }

    if (reconstructionRequestSequences.length > 0) {
      throw new Error(
        "Reconstruction started before the Workshop message receipt reached canonical event readback.",
      );
    }
    await page.waitForTimeout(Math.min(100, Math.max(1, deadlineAt - Date.now())));
  }

  expect(
    reconstructionRequestSequences,
    "a missing event projection must time out before reconstruction is requested",
  ).toHaveLength(0);
  throw new Error(
    `Workshop message receipt ${messageEventId} did not reach canonical event readback within ${MESSAGE_EVENT_PROJECTION_TIMEOUT_MS}ms; reconstruction remained withheld.`,
  );
}

function observeBffTraffic(page: Page): ObservedRequest[] {
  const requests: ObservedRequest[] = [];
  observedTrafficByPage.set(page, requests);
  const byRequest = new Map<object, ObservedRequest>();
  page.on("request", (request) => {
    const parsed = new URL(request.url());
    if (!parsed.pathname.startsWith("/bff/")) return;
    const event: ObservedRequest = {
      authorization: Boolean(request.headers().authorization),
      method: request.method(),
      origin: parsed.origin,
      path: parsed.pathname,
    };
    requests.push(event);
    byRequest.set(request, event);
  });
  page.on("response", (response) => {
    const prior = byRequest.get(response.request());
    if (prior) prior.status = response.status();
  });
  return requests;
}

function assertStrictLiveTraffic(requests: ObservedRequest[]): void {
  const permittedOrigins = new Set([
    new URL(FE_BASE_URL).origin,
    new URL(BFF_BASE_URL).origin,
  ]);
  const bffRequests = requests.filter((request) =>
    request.path.startsWith("/bff/agora/"),
  );
  expect(
    bffRequests.length,
    "journey must issue browser-owned Agora BFF traffic",
  ).toBeGreaterThan(0);
  for (const request of bffRequests) {
    expect(
      permittedOrigins.has(request.origin),
      `unexpected BFF origin for ${request.path}`,
    ).toBe(true);
    if (!request.path.endsWith("/stream")) {
      expect(
        request.authorization,
        `Agora request must carry the governed browser Authorization header: ${request.path}`,
      ).toBe(true);
    }
    if (request.status !== undefined && !request.path.endsWith("/stream")) {
      expect(
        request.status,
        `Agora response failed: ${request.method} ${request.path}`,
      ).toBeGreaterThanOrEqual(200);
      expect(
        request.status,
        `Agora response failed: ${request.method} ${request.path}`,
      ).toBeLessThan(300);
    }
    expect(
      request.path,
      `fixture/seed path is forbidden in the strict-live journey: ${request.path}`,
    ).not.toMatch(/fixture|mock|seed/i);
  }
}

function idFromTestId(
  page: Page,
  prefix: string,
  label: string,
): Promise<string> {
  return page
    .locator(`[data-testid^="${prefix}"]`)
    .first()
    .getAttribute("data-testid")
    .then((testId) => {
      const id = testId?.slice(prefix.length);
      expect(id, `${label} test id must carry its canonical id`).toBeTruthy();
      return id as string;
    });
}

test.describe(`${TASK_ID} strict-live browser journey`, () => {
  test.skip(
    !ENABLED,
    "Set PFG_AGORA_JOURNEY_E2E=1 only with a governed short-lived operator session and a disposable serialized live candidate.",
  );
  test.setTimeout(300_000);

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;

    const pageState = await page
      .evaluate(() => ({
        test_ids: Array.from(
          new Set(
            Array.from(document.querySelectorAll<HTMLElement>("[data-testid]"))
              .map((element) => element.dataset.testid ?? "")
              .filter(Boolean),
          ),
        ).slice(0, 200),
        title: document.title,
        url: window.location.href,
      }))
      .catch(() => ({ test_ids: [] as string[], title: "", url: page.url() }));
    const diagnosticPath = `${EVIDENCE_DIR}/${TASK_ID}-failure-${randomUUID()}.json`;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      diagnosticPath,
      JSON.stringify(
        {
          errors: testInfo.errors.map((error) => error.message.slice(0, 2_000)),
          observed_requests: (observedTrafficByPage.get(page) ?? []).map(
            ({ authorization, method, origin, path, status }) => ({
              authorization,
              method,
              origin,
              path,
              status,
            }),
          ),
          page: pageState,
          status: testInfo.status,
          task_id: TASK_ID,
        },
        null,
        2,
      ),
    );
    await testInfo.attach(`${TASK_ID}-failure-diagnostic`, {
      path: diagnosticPath,
      contentType: "application/json",
    });
  });

  test("creates and reads back the Workshop-to-Governance product journey without mocks", async ({
    page,
  }, testInfo) => {
    const observedRequests = observeBffTraffic(page);
    const mutations: MutationEvidence[] = [];
    const runMarker = randomUUID();
    const workshopTitle = `PFG Agora journey ${runMarker}`;
    let strategyId = "";
    let strategyVersion = "";
    let poolLookup: Promise<Response> | undefined;
    let messageEventProjection: MessageEventProjectionEvidence | undefined;

    await assertOperatorLiveCandidate(page);
    await installHostedOperatorSession(page);

    await test.step("create a fresh Workshop and derive its id from the POST response", async () => {
      await expect(page.getByTestId("strategy-workshop-page-list")).toBeVisible(
        { timeout: 30_000 },
      );
      await page.getByTestId("create-workshop-btn").click();
      await page.getByTestId("create-workshop-title-input").fill(workshopTitle);
      const created = waitForResponse(page, "POST", "/bff/agora/workshops");
      await page.getByTestId("create-workshop-submit").click();
      mutations.push(
        await recordedMutation(
          await created,
          ["workshop_id"],
          "Workshop create",
        ),
      );
      await expect(
        page.getByTestId(`workshop-item-${mutations[0].id}`),
      ).toBeVisible({ timeout: 30_000 });
    });

    const workshopId = mutations[0].id;

    await test.step("submit a real reconstruction input and read its authoritative identifiers", async () => {
      await expect(
        page.getByTestId("strategy-workshop-page-session"),
      ).toBeVisible({ timeout: 30_000 });
      const composer = page.getByTestId("servant-composer-input");
      await expect(composer).toBeEnabled({ timeout: 60_000 });
      await composer.fill(
        `Create a paper strategy definition with bounded risk controls for journey ${runMarker}.`,
      );

      const message = waitForResponse(
        page,
        "POST",
        `/bff/agora/workshops/${encodeURIComponent(workshopId)}/messages`,
      );
      const currentWorkshopReadback = waitForResponse(
        page,
        "GET",
        `/bff/agora/workshops/${encodeURIComponent(workshopId)}`,
      );
      const eventReadbackPath = `/bff/agora/workshops/${encodeURIComponent(workshopId)}/events`;
      const reconstructionPath = `/bff/agora/workshops/${encodeURIComponent(workshopId)}/reconstruct`;
      const eventReadbacks: OrderedResponse[] = [];
      const reconstructionRequestSequences: number[] = [];
      let networkSequence = 0;
      const observeRequest = (request: Request) => {
        if (request.method() === "POST" && new URL(request.url()).pathname === reconstructionPath) {
          reconstructionRequestSequences.push(++networkSequence);
        }
      };
      const observeResponse = (response: Response) => {
        if (response.request().method() === "GET" && responsePath(response) === eventReadbackPath) {
          eventReadbacks.push({ response, sequence: ++networkSequence });
        }
      };
      page.on("request", observeRequest);
      page.on("response", observeResponse);
      const reconstruction = waitForResponse(
        page,
        "POST",
        reconstructionPath,
      );
      const versions = waitForResponse(
        page,
        "GET",
        `/bff/agora/workshops/${encodeURIComponent(workshopId)}/versions`,
      );
      await page.getByTestId("servant-composer-submit").click();
      const messageResponse = await message;
      const currentWorkshopResponse = await currentWorkshopReadback;
      const currentWorkshopEtag = currentWorkshopResponse.headers()["etag"];
      expect(
        currentWorkshopEtag,
        "the fresh Workshop readback must expose the BFF-issued current ETag",
      ).toBeTruthy();
      expect(
        messageResponse.request().headers()["if-match"],
        "the Workshop message must forward that exact current ETag without rewriting it",
      ).toBe(currentWorkshopEtag);
      const messageReceipt = await jsonBody(messageResponse);
      const messageEventId = requiredId(
        messageReceipt,
        "Workshop message event receipt",
        ["event_id"],
      );
      try {
        messageEventProjection = await waitForDurableMessageEvent(
          page,
          messageEventId,
          eventReadbacks,
          reconstructionRequestSequences,
        );
      } finally {
        page.off("request", observeRequest);
        page.off("response", observeResponse);
      }
      if (!messageEventProjection) {
        throw new Error("Hosted message event projection assertion completed without evidence.");
      }
      expect(messageEventProjection.event.workshop_id).toBe(workshopId);
      expect(messageEventProjection.event.event_type).toBe("message");
      mutations.push({
        id: messageEventId,
        method: "POST",
        path: responsePath(messageResponse),
        status: messageResponse.status(),
      });
      const reconstructionResponse = await reconstruction;
      const versionsBody = await jsonBody(await versions);
      strategyId = requiredId(versionsBody, "reconstructed strategy", [
        "strategy_id",
      ]);
      strategyVersion = requiredId(
        versionsBody,
        "reconstructed strategy version",
        ["strategy_spec_registry_id", "registry_id"],
      );
      mutations.push(
        await recordedMutation(
          reconstructionResponse,
          ["reconstruction_id"],
          "Strategy reconstruction",
        ),
      );
      await expect(
        page.getByTestId("workshop-reconstruction-state"),
      ).toHaveAttribute("data-reconstruction-state", "completed", {
        timeout: 60_000,
      });
      await expect(
        page.getByTestId("workshop-reconstruction-state"),
      ).toHaveAttribute("data-reconstruction-id", mutations[mutations.length - 1].id);
      await expect(
        page.getByTestId("workshop-strategy-spec-identity"),
      ).toContainText(strategyId, { timeout: 60_000 });
      await expect(
        page.getByTestId("workshop-strategy-spec-identity"),
      ).toContainText(strategyVersion);
    });

    await test.step("dispatch research and wait for a real Trading Room handoff", async () => {
      const research = waitForResponse(
        page,
        "POST",
        `/bff/agora/workshops/${encodeURIComponent(workshopId)}/research-runs`,
      );
      await page.getByTestId("cmd-research-btn").click();
      mutations.push(
        await recordedMutation(
          await research,
          ["research_run_id", "run_id"],
          "Workshop research",
        ),
      );
      await expect(page.getByTestId("add-to-trading-room-btn")).toBeEnabled({
        timeout: 120_000,
      });
    });

    await test.step("create and accept the real Trading Room workspace", async () => {
      poolLookup = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          responsePath(response) === "/bff/agora/candidate-pools/lookup",
      );
      const proposalResponse = waitForResponse(
        page,
        "POST",
        `/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/proposals`,
      );
      await page.getByTestId("add-to-trading-room-btn").click();
      const proposal = await recordedMutation(
        await proposalResponse,
        ["proposal_id", "proposalId", "id"],
        "Trading Room workspace proposal",
      );
      mutations.push(proposal);
      await expect(page.getByTestId("workspace-proposal-preview")).toBeVisible({
        timeout: 60_000,
      });
      const accepted = waitForResponse(
        page,
        "POST",
        `/bff/agora/strategies/${encodeURIComponent(strategyId)}/trading-room/proposals/${encodeURIComponent(proposal.id)}/accept`,
      );
      await page.getByTestId("workspace-proposal-accept").click();
      mutations.push(
        await recordedMutation(
          await accepted,
          ["workspace_id", "workspaceId", "id"],
          "Trading Room workspace accept",
        ),
      );
      await expect(
        page.getByTestId("trading-room-workspace-shell"),
      ).toBeVisible({ timeout: 60_000 });
    });

    await test.step("record a canonical candidate decision and read it back through the shared drawer", async () => {
      if (!poolLookup)
        throw new Error(
          "Trading Room did not start the required candidate pool lookup.",
        );
      const poolId = requiredId(
        await jsonBody(await poolLookup),
        "candidate pool",
        ["pool_id"],
      );
      await expect(page.getByTestId("open-candidate-review")).toBeEnabled({
        timeout: 60_000,
      });
      const members = waitForResponse(
        page,
        "GET",
        `/bff/agora/candidate-pools/${encodeURIComponent(poolId)}/members`,
      );
      await page.getByTestId("open-candidate-review").click();
      const candidateId = requiredId(
        await jsonBody(await members),
        "candidate pool member",
        ["artifact_id", "candidate_id"],
      );
      await expect(
        page.getByTestId(`candidate-review-drawer-${poolId}`),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByTestId(
          `candidate-decide-approve_for_monitoring-${candidateId}`,
        ),
      ).toBeVisible({ timeout: 30_000 });
      await page
        .getByTestId(`candidate-decide-approve_for_monitoring-${candidateId}`)
        .click();
      const candidateDecision = waitForResponse(
        page,
        "POST",
        `/bff/agora/candidate-pools/${encodeURIComponent(poolId)}/members/${encodeURIComponent(candidateId)}/review`,
      );
      await page.getByTestId(`candidate-confirm-${candidateId}`).click();
      mutations.push(
        await recordedMutationForKnownTarget(
          await candidateDecision,
          "Candidate review",
          candidateId,
        ),
      );
      await expect(
        page.getByTestId(`candidate-decision-readback-${candidateId}`),
      ).toContainText(/canonical candidate pool/i, { timeout: 30_000 });
    });

    await test.step("take a governed Trading Room decision and launch its consultation", async () => {
      const decisionEventId = await idFromTestId(
        page,
        "event-row-",
        "decision event",
      );
      await page.getByTestId(`event-row-${decisionEventId}`).click();
      await expect(
        page.getByTestId(`trade-decision-card-${decisionEventId}`),
      ).toBeVisible({ timeout: 30_000 });
      const decision = waitForResponse(
        page,
        "POST",
        `/bff/agora/trading-room/decision-events/${encodeURIComponent(decisionEventId)}/decisions`,
      );
      await page.getByTestId(`decide-approve-${decisionEventId}`).click();
      mutations.push(
        await recordedMutationForKnownTarget(
          await decision,
          "Trading Room decision",
          decisionEventId,
        ),
      );
      await expect(page.getByTestId("detail-decision-confirmed")).toBeVisible({
        timeout: 30_000,
      });

      await page.getByTestId(`ask-personas-${decisionEventId}`).click();
      const consultPanel = page.getByTestId(`consult-panel-${decisionEventId}`);
      await consultPanel
        .locator("textarea")
        .fill(
          `Review the governed decision ${decisionEventId} for journey ${runMarker}.`,
        );
      const consultation = waitForResponse(
        page,
        "POST",
        "/bff/agora/interactions",
      );
      await page.getByTestId(`consult-panel-submit-${decisionEventId}`).click();
      mutations.push(
        await recordedMutation(
          await consultation,
          ["interaction_id", "consultation_id", "session_id"],
          "Decision consultation",
        ),
      );
      await expect(page).toHaveURL(
        new RegExp(`/agora/strategy-workshop/[^/]+\\?mode=consult`),
        { timeout: 60_000 },
      );
      await expect(
        page.getByTestId("consultation-context-banner"),
      ).toContainText(decisionEventId, { timeout: 60_000 });
    });

    await test.step("verify performance receipt persistence after reload", async () => {
      const attribution = waitForResponse(
        page,
        "GET",
        "/bff/agora/trading-room/performance-attribution/by-strategy",
      );
      await page.goto(`${FE_BASE_URL}/agora/strategy-performance`);
      await expect(page.getByTestId("strategy-performance-page")).toBeVisible({
        timeout: 60_000,
      });
      const attributionBody = await jsonBody(await attribution);
      const strategyRecord = recordWithId(
        attributionBody,
        "strategy_id",
        strategyId,
      );
      expect(
        strategyRecord,
        "the fresh strategy must appear in its authenticated performance attribution",
      ).toBeTruthy();
      const strategyTitle = requiredId(
        strategyRecord,
        "performance strategy title",
        ["title", "strategy_title", "display_name"],
      );
      const performance = waitForResponse(
        page,
        "GET",
        `/bff/agora/trading-room/strategies/${encodeURIComponent(strategyId)}/performance`,
      );
      await page
        .getByTestId("performance-strategy-pane")
        .getByRole("button", { name: strategyTitle, exact: true })
        .click();
      await expect(await performance).toBeOK();
      const selectedSuggestion = page
        .locator('[data-testid^="performance-suggestion-"]')
        .first();
      await expect(selectedSuggestion).toBeVisible({ timeout: 60_000 });
      const suggestionId = await idFromTestId(
        page,
        "performance-suggestion-",
        "performance suggestion",
      );
      const action = waitForResponse(
        page,
        "POST",
        `/bff/agora/trading-room/strategies/${encodeURIComponent(strategyId)}/performance/suggestions/${encodeURIComponent(suggestionId)}/actions`,
      );
      const receiptReadback = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          responsePath(response).startsWith(
            "/bff/agora/performance/action-receipts/",
          ),
      );
      await selectedSuggestion
        .getByRole("button", { name: /return to workshop|返回.*工坊/i })
        .click();
      const performanceAction = await recordedMutation(
        await action,
        ["receipt_id"],
        "Performance learning action",
      );
      mutations.push(performanceAction);
      const receiptId = requiredId(
        await jsonBody(await receiptReadback),
        "performance receipt readback",
        ["receipt_id"],
      );
      expect(
        receiptId,
        "performance POST and receipt GET must bind the same canonical receipt",
      ).toBe(performanceAction.id);
      await expect(
        page.getByTestId(`performance-receipt-${receiptId}`),
      ).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByTestId("strategy-performance-page")).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.getByTestId(`performance-suggestion-${suggestionId}`),
      ).not.toContainText(/proposed|提議中/i, { timeout: 60_000 });
    });

    const bodyText = await page.locator("body").innerText();
    expect(
      bodyText,
      "strict-live UI must not report a local fixture or seed fallback",
    ).not.toMatch(/fixture|mock data|seed fallback|資料來源：seed/i);
    assertStrictLiveTraffic(observedRequests);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evidencePath = `${EVIDENCE_DIR}/${TASK_ID}-${runMarker}.json`;
    writeFileSync(
      evidencePath,
      JSON.stringify(
        {
          bff_base_url: BFF_BASE_URL,
          fe_base_url: FE_BASE_URL,
          mutation_ids: mutations,
          workshop_message_event_readback: messageEventProjection,
          observed_requests: observedRequests.map(
            ({ authorization, method, origin, path, status }) => ({
              authorization,
              method,
              origin,
              path,
              status,
            }),
          ),
          run_marker: runMarker,
          task_id: TASK_ID,
          tenant_id: TENANT_ID,
        },
        null,
        2,
      ),
    );
    await testInfo.attach(`${TASK_ID}-runtime-evidence`, {
      path: evidencePath,
      contentType: "application/json",
    });
  });
});
