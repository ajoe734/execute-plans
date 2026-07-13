/**
 * AG-DYNUI-LIVE-WORKSHOP-FE-013 - hosted live Strategy Workshop tab proof.
 *
 * This spec uses the deployed FE and live BFF. It must not intercept or
 * synthesize Agora workshop responses.
 */

import { expect, test, type APIRequestContext, type Page, type Request } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { installOidcDevLogin } from "./helpers/auth";

const FE_BASE_URL = trimTrailingSlash(
  process.env.AG_DYNUI_LIVE_WORKSHOP_FE_013_BASE_URL ||
    process.env.PANTHEON_FE_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    "",
);
const BFF_BASE_URL = trimTrailingSlash(
  process.env.AG_DYNUI_LIVE_WORKSHOP_FE_013_BFF_BASE_URL ||
    process.env.PANTHEON_BFF_BASE_URL ||
    process.env.VITE_BFF_BASE_URL ||
    "",
);
const AUTH_TOKEN =
  process.env.BFF_AUTH_TOKEN ||
  process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN ||
  "";
const TENANT_ID = process.env.PANTHEON_BFF_TENANT_ID || process.env.PANTHEON_TENANT_ID || "pantheon-dev";
const EVIDENCE_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || "/tmp/ag-dynui-live-tabs-013";
const RAW_UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const VIEWPORTS = [
  { name: "desktop", size: { width: 1440, height: 960 } },
  { name: "mobile", size: { width: 390, height: 844 } },
];

type JsonRecord = Record<string, unknown>;

type NetworkEvent = {
  auth: "absent" | "present";
  method: string;
  path: string;
  status?: number;
  url: string;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${AUTH_TOKEN}`,
    "X-Tenant-Id": TENANT_ID,
    "X-Request-Id": `ag-dynui-live-workshop-fe-013-${randomUUID()}`,
    ...extra,
  };
}

function recordFrom(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function dataFrom(value: unknown): unknown {
  const root = recordFrom(value);
  return root.data ?? value;
}

function arrayData(value: unknown): JsonRecord[] {
  const data = dataFrom(value);
  if (Array.isArray(data)) return data.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object");
  const record = recordFrom(data);
  for (const key of ["items", "cards", "events", "workshops", "results"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object");
    }
  }
  return [];
}

async function getJson(request: APIRequestContext, path: string): Promise<JsonRecord> {
  const res = await request.get(`${BFF_BASE_URL}${path}`, {
    headers: authHeaders(),
  });
  expect(res.ok(), `${path} returned ${res.status()}`).toBe(true);
  return (await res.json()) as JsonRecord;
}

async function discoverWorkshop(request: APIRequestContext): Promise<{
  cards: JsonRecord[];
  events: JsonRecord[];
  readiness: JsonRecord;
  workshop: JsonRecord;
}> {
  const workshopsBody = await getJson(request, "/bff/agora/workshops?limit=50");
  const workshops = arrayData(workshopsBody);
  const workshop = workshops.find((item) => typeof item.workshop_id === "string");
  expect(workshop, "live BFF must return at least one workshop").toBeTruthy();
  const workshopId = String(workshop?.workshop_id);

  const [detailBody, cardsBody, readinessBody, eventsBody] = await Promise.all([
    getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}`),
    getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}/cards`),
    getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}/readiness`),
    getJson(request, `/bff/agora/workshops/${encodeURIComponent(workshopId)}/events`),
  ]);

  return {
    cards: arrayData(cardsBody),
    events: arrayData(eventsBody),
    readiness: recordFrom(dataFrom(readinessBody)),
    workshop: recordFrom(dataFrom(detailBody)),
  };
}

function collectNetwork(page: Page): NetworkEvent[] {
  const events: NetworkEvent[] = [];
  page.on("request", (req: Request) => {
    const url = req.url();
    if (!url.includes("/bff/")) return;
    const parsed = new URL(url);
    const headers = req.headers();
    events.push({
      auth: headers.authorization ? "present" : "absent",
      method: req.method(),
      path: parsed.pathname,
      url,
    });
  });
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/bff/")) return;
    const parsed = new URL(url);
    const prior = [...events].reverse().find((event) => event.url === url && event.status === undefined);
    if (prior) prior.status = res.status();
    else {
      events.push({
        auth: "absent",
        method: res.request().method(),
        path: parsed.pathname,
        status: res.status(),
        url,
      });
    }
  });
  return events;
}

function assertRequiredNetwork(events: NetworkEvent[]): void {
  const paths = events.map((event) => event.path);
  for (const required of [
    "/bff/agora/workshops",
    "/cards",
    "/events",
    "/readiness",
  ]) {
    expect(paths.some((path) => path.includes(required)), `required live BFF path was not observed: ${required}`).toBe(true);
  }

  for (const event of events.filter((item) => item.path.includes("/bff/agora/"))) {
    if (!event.path.endsWith("/stream")) {
      expect(event.auth, `Agora BFF request must carry Authorization: ${event.url}`).toBe("present");
    }
    if (event.status !== undefined) {
      expect(event.status, `Agora BFF request failed: ${event.url}`).toBeLessThan(500);
      expect(event.status, `Agora BFF request was unauthorized: ${event.url}`).not.toBe(401);
      expect(event.status, `Agora BFF request was forbidden: ${event.url}`).not.toBe(403);
    }
  }
}

test.describe("AG-DYNUI-LIVE-WORKSHOP-FE-013 hosted Strategy Workshop tab", () => {
  test.skip(
    !FE_BASE_URL || !BFF_BASE_URL || !AUTH_TOKEN,
    "Set the hosted FE/BFF URLs and a short-lived BFF_AUTH_TOKEN; no privileged fallback token is tracked.",
  );
  test.setTimeout(120_000);

  for (const viewport of VIEWPORTS) {
    test(`renders live workshop runtime without raw UUID list on ${viewport.name}`, async ({
      page,
      request,
    }, testInfo) => {
      const evidence = await discoverWorkshop(request);
      const network = collectNetwork(page);

      await page.setViewportSize(viewport.size);
      await installOidcDevLogin(page, {
        goto: false,
        pageBaseUrl: FE_BASE_URL,
        tenantId: TENANT_ID,
        token: AUTH_TOKEN,
      });

      await page.goto(`${FE_BASE_URL}/agora/strategy-workshop`);
      await expect(page.getByTestId("strategy-workshop-live-tab")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("strategy-workshop-page-session")).toBeVisible();
      await expect(page.getByTestId("strategy-workshop-runtime-header")).toBeVisible();
      await expect(page.getByTestId("workshop-conversation")).toBeVisible();
      await expect(page.getByTestId("completeness-rail")).toBeVisible();
      await expect(page.getByTestId("servant-composer")).toBeVisible();
      await expect(page.getByTestId("workshop-card-summary")).toHaveText(/^(?:Cards: \d+|卡片：\d+)$/);
      await expect(page.getByTestId("workshop-event-summary")).toHaveText(/^(?:Events: \d+|事件：\d+)$/);
      await expect(page.getByTestId("workshop-readiness-summary")).toHaveText(/^(?:Readiness: .+|就緒度：.+)$/);

      const selectorTexts = await page.locator('[data-testid^="workshop-item-"]').allInnerTexts();
      expect(selectorTexts.length, "visible live workshop selector items").toBeGreaterThan(0);
      for (const text of selectorTexts) {
        expect(text, "selector text must not expose raw workshop UUID/debug output").not.toMatch(RAW_UUID_PATTERN);
      }
      assertRequiredNetwork(network);

      mkdirSync(EVIDENCE_DIR, { recursive: true });
      const screenshotPath = `${EVIDENCE_DIR}/ag-dynui-live-workshop-fe-013-${viewport.name}.png`;
      const readbackPath = `${EVIDENCE_DIR}/ag-dynui-live-workshop-fe-013-${viewport.name}.json`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      writeFileSync(
        readbackPath,
        JSON.stringify(
          {
            bffBaseUrl: BFF_BASE_URL,
            cards: evidence.cards.length,
            events: evidence.events.length,
            feBaseUrl: FE_BASE_URL,
            network,
            readiness: evidence.readiness,
            selectorTexts,
            viewport: viewport.name,
            workshop: evidence.workshop,
          },
          null,
          2,
        ),
      );
      await testInfo.attach(`ag-dynui-live-workshop-fe-013-${viewport.name}`, {
        path: screenshotPath,
        contentType: "image/png",
      });
      await testInfo.attach(`ag-dynui-live-workshop-fe-013-${viewport.name}-readback`, {
        path: readbackPath,
        contentType: "application/json",
      });
    });
  }
});
