import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { bearerHeader, installOidcDevLogin } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const HOSTED = process.env.PANTHEON_HOSTED_E2E === "1";
const BFF_BASE = process.env.PANTHEON_BFF_BASE_URL ?? "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io";
const AUTH_TOKEN = process.env.BFF_AUTH_TOKEN
  ?? process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN
  ?? "";

type Holding = {
  holding_id: string;
  persona_id?: string;
  runtime_id?: string;
  deployment_stage?: string;
  source_status?: string;
  risk_state?: string;
  links: Record<string, string | null>;
};

type HoldingsEnvelope = {
  data: {
    items: Holding[];
    summary: Record<string, unknown>;
  };
  meta?: { incidents?: unknown[] };
};

async function captureFailures(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/bff/")) failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return { consoleErrors, failedRequests, failedResponses };
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, { body: Buffer.from(JSON.stringify(value, null, 2)), contentType: "application/json" });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`hosted Portfolio Book workflow preserves live context on ${viewport.name}`, async ({ page, request }, testInfo) => {
    test.skip(!HOSTED, "Set PANTHEON_HOSTED_E2E=1 to run against hosted dev.");
    expect(
      AUTH_TOKEN,
      "Hosted Portfolio E2E requires an explicit short-lived BFF_AUTH_TOKEN",
    ).not.toBe("");
    await page.setViewportSize(viewport);
    await installOidcDevLogin(page, {
      tenantId: "pantheon-dev",
      goto: false,
      token: AUTH_TOKEN,
    });
    await installQuietEventSource(page);
    const failures = await captureFailures(page);

    const apiResponse = await request.get(`${BFF_BASE}/bff/management/portfolio-book/holdings`, {
      headers: {
        Authorization: bearerHeader(AUTH_TOKEN),
        "X-Tenant-Id": "pantheon-dev",
      },
    });
    expect(apiResponse.ok()).toBeTruthy();
    const captured = (await apiResponse.json()) as HoldingsEnvelope;
    expect(captured.data.items.length).toBeGreaterThan(0);

    const uiResponse = page.waitForResponse((response) => response.url().includes("/bff/management/portfolio-book/holdings") && response.status() === 200);
    await page.goto("/management/performance?tab=overview", { waitUntil: "domcontentloaded" });
    let url = new URL(page.url());
    expect(url.pathname).toBe("/management/performance");
    expect(url.searchParams.get("tab")).toBe("overview");

    const browserCaptured = (await (await uiResponse).json()) as HoldingsEnvelope;
    const summary = browserCaptured.data.summary;
    const holdings = browserCaptured.data.items;
    expect(holdings.length).toBe(Number(summary.returned_holding_count ?? summary.holding_count));
    expect(holdings.map((row) => row.holding_id)).toEqual(captured.data.items.map((row) => row.holding_id));

    await expect(page.getByRole("heading", { name: /Performance Center|績效中心/ }).first()).toBeVisible();
    await expect(page.getByTestId("portfolio-holding")).toHaveCount(holdings.length);
    await expect(page.getByTestId("portfolio-incident")).toHaveCount(Number(summary.incident_count));
    await expect(page.getByText("Holdings").locator("..").getByText(String(summary.holding_count), { exact: true })).toBeVisible();
    await expect(page.getByText("Missing bindings").locator("..").getByText(String(summary.missing_binding_count), { exact: true })).toBeVisible();

    const selected = holdings.find((row) => row.source_status !== "ok" && row.links.human_review && row.links.persona_fleet && row.links.performance_attribution);
    expect(selected, "a degraded row with all governed workflow links").toBeTruthy();
    const row = page.getByTestId("portfolio-holding").filter({ hasText: selected!.holding_id });
    await expect(row).toContainText(selected!.deployment_stage || "unknown");
    await expect(row).toContainText(selected!.source_status || "unknown");
    await expect(row).toContainText(selected!.risk_state || "unknown");

    for (const [label, href] of [["Persona Fleet", selected!.links.persona_fleet], ["Attribution", selected!.links.performance_attribution], ["Human Review", selected!.links.human_review]] as const) {
      const link = row.getByRole("link", { name: label, exact: true });
      await expect(link).toHaveAttribute("href", href!);
    }

    await row.getByRole("link", { name: "Persona Fleet", exact: true }).click();
    url = new URL(page.url());
    expect(url.pathname).toBe("/management/persona-fleet");
    expect(url.searchParams.get("persona_id")).toBe(selected!.persona_id);
    await expect(page.getByText(new RegExp(`(Focused persona|已聚焦 Persona).+${escapeRegExp(selected!.persona_id!)}`))).toBeVisible();
    await page.goBack({ waitUntil: "domcontentloaded" });

    await row.getByRole("link", { name: "Attribution", exact: true }).click();
    await page.waitForURL(/\/management\/performance\?/);
    url = new URL(page.url());
    expect(url.pathname).toBe("/management/performance");
    expect(url.searchParams.get("tab")).toBe("attribution");
    expect(url.searchParams.get("persona_id")).toBe(selected!.persona_id);
    expect(url.searchParams.get("runtime_id")).toBe(selected!.runtime_id);
    await expect(page.locator("body")).not.toContainText(/formal attribution/i);
    await page.goBack({ waitUntil: "domcontentloaded" });

    const inboxResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/bff/management/human-inbox") &&
      response.request().method() === "GET",
    );
    await row.getByRole("link", { name: "Human Review", exact: true }).click();
    const inboxResponse = await inboxResponsePromise;
    expect(inboxResponse.status(), "Human Inbox required live request status").toBe(200);
    const inboxPayload = await inboxResponse.json();
    url = new URL(page.url());
    expect(url.pathname).toBe("/management/human-inbox");
    expect(url.searchParams.get("target_id")).toBe(selected!.holding_id);
    expect(url.searchParams.get("persona_id")).toBe(selected!.persona_id);
    expect(url.searchParams.get("runtime_id")).toBe(selected!.runtime_id);
    await expect(page.getByText(selected!.holding_id)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/serving mock|seed fallback/i);

    await page.screenshot({ path: testInfo.outputPath(`portfolio-human-review-${viewport.name}.png`), fullPage: true });
    await attachJson(testInfo, `live-holdings-${viewport.name}`, browserCaptured);
    await attachJson(testInfo, `live-human-inbox-${viewport.name}`, inboxPayload);
    await attachJson(testInfo, `browser-failures-${viewport.name}`, failures);
    expect(failures.consoleErrors).toEqual([]);
    expect(failures.failedRequests).toEqual([]);
    expect(failures.failedResponses).toEqual([]);
  });
}
