import { expect, test, type APIRequestContext, type APIResponse, type Locator, type Page, type Response as PageResponse } from "@playwright/test";
import { authHeaders, installOidcDevLogin } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_BASE = process.env.PANTHEON_FE_BASE_URL?.replace(/\/$/, "") ?? "";
const BFF_BASE = process.env.PANTHEON_BFF_BASE_URL?.replace(/\/$/, "") ?? "";
const PUBLIC_VIEWER_TOKEN = "pantheon-dev-browser:viewer";
const PERSONA_ID = process.env.PANTHEON_PERSONA_FLEET_AUDIT_ID ?? "persona-20260528-04688755";
const LIVE_READ_ATTEMPTS = 3;
const LIVE_RESPONSE_TIMEOUT_MS = 20_000;
const LIVE_RENDER_TIMEOUT_MS = 20_000;

type FocusedReadOptions = {
  additionalResponseMatches?: Array<(url: URL) => boolean>;
  description: string;
  focused: () => Locator;
  navigate: (attempt: number) => Promise<unknown>;
  responseMatches: (url: URL) => boolean;
};

type LiveFleetRow = Record<string, unknown> & {
  capital_mode?: unknown;
  data_sources?: Array<Record<string, unknown>>;
  last_mutation_kind?: unknown;
  league_rank?: unknown;
  league_score?: unknown;
  mutation_confidence?: unknown;
  mutation_diagnostics?: unknown;
  mutation_entry_id?: unknown;
  name?: unknown;
  ooda?: unknown;
  personaName?: unknown;
  persona_name?: unknown;
};

type LiveListPayload<T> = {
  data?: {
    items?: T[];
  };
};

function retryDelay(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, attempt * 500));
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getJsonWithRetry<T>(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
  description: string,
): Promise<T> {
  let lastTransportError: unknown;
  for (let attempt = 1; attempt <= LIVE_READ_ATTEMPTS; attempt += 1) {
    let response: APIResponse;
    try {
      response = await request.get(url, { headers, timeout: LIVE_RESPONSE_TIMEOUT_MS });
    } catch (error) {
      lastTransportError = error;
      if (attempt === LIVE_READ_ATTEMPTS) throw error;
      await retryDelay(attempt);
      continue;
    }

    if (response.ok()) return await response.json() as T;
    const status = response.status();
    await response.dispose();
    if (status < 500 || status > 599 || attempt === LIVE_READ_ATTEMPTS) {
      throw new Error(`${description} returned ${status}`);
    }
    await retryDelay(attempt);
  }
  throw lastTransportError instanceof Error
    ? lastTransportError
    : new Error(`${description} failed without a response`);
}

async function waitForFocusedRead(page: Page, options: FocusedReadOptions): Promise<Locator> {
  let lastStatus = "transport-timeout";
  const responseMatchers = [options.responseMatches, ...(options.additionalResponseMatches ?? [])];
  for (let attempt = 1; attempt <= LIVE_READ_ATTEMPTS; attempt += 1) {
    const responsePromises = responseMatchers.map((matches) => page.waitForResponse(
      (response) => response.request().method() === "GET" && matches(new URL(response.url())),
      { timeout: LIVE_RESPONSE_TIMEOUT_MS },
    ).catch(() => null));

    await options.navigate(attempt);
    const responses = await Promise.all(responsePromises);
    const receivedStatuses = responses
      .filter((response): response is PageResponse => response !== null)
      .map((response) => response.status());
    const nonRetryableStatus = receivedStatuses.find((status) =>
      (status < 200 || status >= 300) && (status < 500 || status > 599),
    );
    if (nonRetryableStatus !== undefined) {
      throw new Error(`${options.description} returned non-retryable status ${nonRetryableStatus}`);
    }
    if (responses.some((response) => response === null)) {
      lastStatus = "transport-timeout";
      if (attempt < LIVE_READ_ATTEMPTS) {
        await retryDelay(attempt);
        continue;
      }
      break;
    }

    const statuses = responses.map((response) => (response as PageResponse).status());
    lastStatus = statuses.join(",");
    if (statuses.some((status) => status >= 500 && status <= 599)) {
      if (attempt < LIVE_READ_ATTEMPTS) {
        await retryDelay(attempt);
        continue;
      }
      break;
    }

    const focused = options.focused();
    await expect(focused, options.description).toBeVisible({ timeout: LIVE_RENDER_TIMEOUT_MS });
    return focused;
  }
  throw new Error(`${options.description} did not become ready after ${LIVE_READ_ATTEMPTS} attempts (${lastStatus})`);
}

async function openFocusedFleetRow(page: Page): Promise<Locator> {
  return waitForFocusedRead(page, {
    description: `focused Persona Fleet row ${PERSONA_ID}`,
    focused: () => page.locator("tr").filter({ hasText: PERSONA_ID }).first(),
    navigate: async () => {
      await page.goto(`${FE_BASE}/management/persona-fleet?persona=${encodeURIComponent(PERSONA_ID)}`, {
        waitUntil: "domcontentloaded",
      });
      const nonProductionTab = page.getByRole("tab", { name: /非正式資料|Non-production data/i });
      await expect(nonProductionTab).toBeVisible({ timeout: LIVE_RENDER_TIMEOUT_MS });
      await nonProductionTab.click();
    },
    responseMatches: (url) =>
      url.pathname === "/bff/management/persona-fleet"
      && url.searchParams.get("q") === PERSONA_ID
      && url.searchParams.get("page_size") === "100",
  });
}

test.describe("Persona Fleet live linked-page contract", () => {
  test.skip(!FE_BASE || !BFF_BASE, "requires hosted FE and BFF URLs");

  test.beforeEach(async ({ page }) => {
    await installOidcDevLogin(page, {
      goto: false,
      roles: ["viewer"],
      tenantId: "pantheon-dev",
      token: PUBLIC_VIEWER_TOKEN,
    });
    await installQuietEventSource(page);
  });

  test("uses the live BFF contract and keeps every focused target semantically scoped", async ({ page, request }) => {
    test.setTimeout(180_000);
    const headers = authHeaders({
      tenantId: "pantheon-dev",
      token: PUBLIC_VIEWER_TOKEN,
    });
    const fleetPayload = await getJsonWithRetry<LiveListPayload<LiveFleetRow>>(
      request,
      `${BFF_BASE}/bff/management/persona-fleet?page_size=100`,
      headers,
      "live Persona Fleet read",
    );
    const fleetRows = fleetPayload.data?.items ?? [];
    const fleetRow = fleetRows.find((row) =>
      (row.id ?? row.persona_id ?? row.personaId) === PERSONA_ID,
    );
    expect(fleetRow, `missing live Fleet row ${PERSONA_ID}`).toBeTruthy();

    const serializedFleetRow = JSON.stringify(fleetRow);
    expect(serializedFleetRow).not.toMatch(/"(?:mutation_entry_id|evolution_entry_id)":"(?:nan|undefined|null|\d{4}-\d{2}-\d{2})"/i);
    expect(["formal_mutation", "fleet_summary", "unavailable"]).toContain(fleetRow.last_mutation_kind);
    expect(["formal", "fallback", "unavailable"]).toContain(fleetRow.mutation_confidence);
    expect(Array.isArray(fleetRow.mutation_diagnostics)).toBe(true);

    if (fleetRow.capital_mode === "paper") {
      const rankingPayload = await getJsonWithRetry<LiveListPayload<Record<string, unknown>>>(
        request,
        `${BFF_BASE}/bff/management/quarterly-ranking?page_size=200`,
        headers,
        "live quarterly ranking read",
      );
      const rankingRow = (rankingPayload.data?.items ?? []).find((row) =>
        (row.persona_id ?? row.personaId ?? row.id) === PERSONA_ID,
      );
      expect(rankingRow, `missing Paper ranking row ${PERSONA_ID}`).toBeTruthy();
      expect(fleetRow.league_rank).toBe(rankingRow.rank);
      expect(fleetRow.league_score).toBe(rankingRow.score);
    }

    const fleetTableRow = await openFocusedFleetRow(page);

    const personaName = String(fleetRow.name ?? fleetRow.persona_name ?? fleetRow.personaName ?? PERSONA_ID);
    const personaLink = fleetTableRow.getByRole("link", { name: personaName, exact: true });
    await waitForFocusedRead(page, {
      description: `Persona detail ${PERSONA_ID}`,
      focused: () => page.getByRole("link", { name: `${PERSONA_ID} trade journeys`, exact: true }),
      navigate: (attempt) => attempt === 1
        ? personaLink.click()
        : page.reload({ waitUntil: "domcontentloaded" }),
      responseMatches: (url) => url.pathname === `/bff/personas/${PERSONA_ID}`,
    });
    await expect(page).toHaveURL(new RegExp(`/management/personas/${PERSONA_ID}`));
    await expect(page.locator("body")).toContainText(PERSONA_ID);

    const oodaLink = (await openFocusedFleetRow(page))
      .locator(`[aria-label="${PERSONA_ID} OODA ${fleetRow.ooda} stage" i]`);
    await expect(oodaLink).toHaveAttribute("href", /\/management\/(data-sources|experiments|research-loop|human-inbox|runtimes|evolution-journal)/);
    if (String(fleetRow.ooda).toLowerCase() === "act") {
      const runtimeTable = page.getByRole("table").first();
      const focusedRuntimeRow = await waitForFocusedRead(page, {
        additionalResponseMatches: [
          (url) => url.pathname === "/bff/management/persona-fleet" && url.search === "",
        ],
        description: `focused runtime row ${PERSONA_ID}`,
        focused: () => runtimeTable.locator("tbody tr").filter({ hasText: PERSONA_ID }).first(),
        navigate: (attempt) => attempt === 1
          ? oodaLink.click()
          : page.reload({ waitUntil: "domcontentloaded" }),
        responseMatches: (url) => url.pathname === "/bff/runtimes",
      });
      await expect(page).toHaveURL(new RegExp(`/management/runtimes\\?persona=${PERSONA_ID}`));
      await expect(page.getByRole("heading", { name: /執行環境|Runtimes/i })).toBeVisible();
      await expect(focusedRuntimeRow).toContainText(PERSONA_ID);
    } else {
      await oodaLink.click();
      await expect(page).toHaveURL(/\/management\/(data-sources|experiments|research-loop|human-inbox|evolution-journal)/);
    }

    const rankRow = await openFocusedFleetRow(page);
    const rankLink = rankRow.locator(`[aria-label="${PERSONA_ID} persona league ranking"]`);
    await expect(rankLink).toHaveAttribute(
      "href",
      new RegExp(`/management/rankings\\?tab=quarterly&persona=${PERSONA_ID}`),
    );
    const rankingTable = page.getByRole("table").first();
    const focusedRankingRow = await waitForFocusedRead(page, {
      description: `focused quarterly ranking row ${PERSONA_ID}`,
      focused: () => rankingTable.locator("tbody tr").filter({
        has: page.locator(`[aria-label="${PERSONA_ID} trade journeys"]`),
      }).first(),
      navigate: (attempt) => attempt === 1
        ? rankLink.click()
        : page.reload({ waitUntil: "domcontentloaded" }),
      responseMatches: (url) =>
        url.pathname === "/bff/management/quarterly-ranking"
        && url.searchParams.get("persona") === PERSONA_ID
        && Boolean(url.searchParams.get("quarter")),
    });
    await expect(focusedRankingRow).toContainText(personaName);

    const focusedFleetRow = await openFocusedFleetRow(page);
    const capitalLink = focusedFleetRow.locator(`[aria-label="Open capital for ${PERSONA_ID}"]`);
    await expect(capitalLink).toHaveAttribute(
      "href",
      new RegExp(
        `/management/performance\\?tab=overview&persona_id=${PERSONA_ID}&capital_pool_id=paper-ledger-${PERSONA_ID}`,
      ),
    );
    const focusedHolding = page.getByTestId("portfolio-holding").filter({
      hasText: `paper-ledger-${PERSONA_ID}`,
    }).first();
    const focusedHoldingEmpty = page.getByText("No holdings match the current filters.", { exact: true });
    await waitForFocusedRead(page, {
      description: `focused capital context ${PERSONA_ID}`,
      focused: () => focusedHolding.or(focusedHoldingEmpty).first(),
      navigate: (attempt) => attempt === 1
        ? capitalLink.click()
        : page.reload({ waitUntil: "domcontentloaded" }),
      responseMatches: (url) =>
        url.pathname === "/bff/management/portfolio-book/holdings"
        && url.searchParams.get("persona_id") === PERSONA_ID
        && url.searchParams.get("capital_pool_id") === `paper-ledger-${PERSONA_ID}`,
    });
    // PPL-ALLOC-007: capital identity belongs to Performance Center, while
    // Rankings remains a readiness/diagnostic destination.
    await expect(page).toHaveURL(new RegExp(
      `/management/performance\\?tab=overview&persona_id=${PERSONA_ID}&capital_pool_id=paper-ledger-${PERSONA_ID}`,
    ));
    await expect(page.getByRole("tab", { name: /Overview|總覽/i })).toHaveAttribute("aria-selected", "true");

    const firstSource = fleetRow.data_sources?.[0];
    const providerKey = firstSource?.provider_key ?? firstSource?.providerKey;
    if (providerKey) {
      const sourceLink = (await openFocusedFleetRow(page))
        .locator(`[aria-label="${PERSONA_ID} data source ${providerKey}"]`);
      const sourceTable = page.getByRole("table").first();
      const focusedSourceRow = await waitForFocusedRead(page, {
        description: `focused data source ${String(providerKey)} for ${PERSONA_ID}`,
        focused: () => sourceTable.locator("tbody tr").filter({ hasText: String(providerKey) }).first(),
        navigate: (attempt) => attempt === 1
          ? sourceLink.click()
          : page.reload({ waitUntil: "domcontentloaded" }),
        responseMatches: (url) =>
          url.pathname === "/bff/management/persona-fleet" && !url.searchParams.has("q"),
      });
      await expect(page).toHaveURL(new RegExp(`persona=${PERSONA_ID}.*source=${providerKey}`));
      await expect(focusedSourceRow).toContainText(String(providerKey));
    }

    const researchLink = (await openFocusedFleetRow(page))
      .getByRole("link", { name: /查看研究執行|View research run/i });
    const researchTable = page.getByRole("table").first();
    const researchFocus = researchTable.locator("tbody tr").filter({ hasText: PERSONA_ID }).first();
    await waitForFocusedRead(page, {
      additionalResponseMatches: [
        (url) => url.pathname === "/bff/management/persona-fleet" && url.search === "",
      ],
      description: `focused research run ${PERSONA_ID}`,
      focused: () => researchFocus,
      navigate: (attempt) => attempt === 1
        ? researchLink.click()
        : page.reload({ waitUntil: "domcontentloaded" }),
      responseMatches: (url) =>
        url.pathname === "/bff/v5/loop-runs" && url.searchParams.get("kind") === "research",
    });
    await expect(researchFocus).not.toContainText(/project\s*[：:]\s*nan/i);

    const attributionLink = (await openFocusedFleetRow(page))
      .locator(`[aria-label="${PERSONA_ID} performance attribution"]`);
    await waitForFocusedRead(page, {
      description: `focused performance attribution ${PERSONA_ID}`,
      focused: () => page.getByRole("table").first().locator("tbody tr").filter({
        hasText: new RegExp(`${escapeForRegExp(PERSONA_ID)}|${escapeForRegExp(personaName)}`),
      }).first(),
      navigate: (attempt) => attempt === 1
        ? attributionLink.click()
        : page.reload({ waitUntil: "domcontentloaded" }),
      responseMatches: (url) =>
        url.pathname === `/bff/management/operations-read-model/${PERSONA_ID}`
        && url.searchParams.get("period") === "30d",
    });
    await expect(page.getByRole("heading", { name: /績效歸因|Performance Attribution/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /績效來源明細|Performance source details/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/產生依據|Basis/i).first()).toBeVisible();

    const mutationLink = (await openFocusedFleetRow(page))
      .locator(`[aria-label="${PERSONA_ID} mutation history"]`);
    if (fleetRow.last_mutation_kind === "unavailable") {
      await expect(mutationLink).toHaveCount(0);
    } else {
      const body = page.locator("body");
      const mutationFocus = fleetRow.last_mutation_kind === "fleet_summary"
        ? page.getByText(new RegExp(`^persona-fleet-summary:${escapeForRegExp(PERSONA_ID)}:`)).first()
        : page.getByText(String(fleetRow.mutation_entry_id), { exact: true }).first();
      await waitForFocusedRead(page, {
        additionalResponseMatches: [
          (url) => url.pathname === "/bff/management/persona-fleet" && url.search === "",
        ],
        description: `focused mutation history ${PERSONA_ID}`,
        focused: () => mutationFocus,
        navigate: (attempt) => attempt === 1
          ? mutationLink.click()
          : page.reload({ waitUntil: "domcontentloaded" }),
        responseMatches: (url) => url.pathname === "/bff/management/evolution-journal",
      });
      await expect(body).not.toContainText(/mutation\s*[：:]\s*nan/i);
      await expect(body).not.toContainText(/Action\s+\d{4}-\d{2}-\d{2}/i);
      if (fleetRow.last_mutation_kind === "fleet_summary") {
        await expect(body).toContainText("fleet summary fallback");
        await expect(body).toContainText(/無正式 mutation id|no formal mutation id/i);
      } else {
        await expect(body).toContainText(String(fleetRow.mutation_entry_id));
      }
    }

    const humanGateLink = (await openFocusedFleetRow(page))
      .locator(`[aria-label="${PERSONA_ID} human gate"]`);
    if (await humanGateLink.count()) {
      const humanGateHref = await humanGateLink.getAttribute("href");
      expect(humanGateHref, "Human Inbox link must retain the Persona focus").toContain(PERSONA_ID);
      const focusedInboxItem = page.getByRole("link", { name: PERSONA_ID, exact: true })
        .or(page.getByRole("link", { name: `${PERSONA_ID} trade journeys`, exact: true }));
      const focusedInboxEmpty = page.getByText(
        new RegExp(
          `^(?:No live inbox items are available for ${escapeForRegExp(PERSONA_ID)}\\.`
          + `|No Human Inbox items currently require review for ${escapeForRegExp(PERSONA_ID)}\\.`
          + `|${escapeForRegExp(PERSONA_ID)} 目前沒有 live 收件匣項目。`
          + `|${escapeForRegExp(PERSONA_ID)} 目前沒有需要審查的人類收件匣項目。)$`,
        ),
      );
      const focusedInboxIncomplete = page.getByText(new RegExp(
        `^(?:Inbox status is incomplete for ${escapeForRegExp(PERSONA_ID)}; absence cannot be confirmed\\.`
        + `|${escapeForRegExp(PERSONA_ID)} 的收件匣狀態不完整，無法確認沒有待處理項目。)$`,
      ));
      const incompleteAlertTitle = page.getByText(
        /^(?:Human Inbox is incomplete|人類收件匣資料不完整)$/,
      );
      const incompleteAlertBody = /^(?:Some live sources are unavailable or timed out\. Showing the items that were confirmed\.|部分 live 來源無法使用或已逾時；目前只顯示已確認的項目。)$/;
      const unavailableAlertTitle = page.getByText(
        /^(?:Human Inbox status unavailable|無法取得人類收件匣狀態)$/,
      );
      const focusedInboxMissing = page.getByText(new RegExp(
        `^(?:No inbox item found for ${escapeForRegExp(PERSONA_ID)}\\.`
        + `|找不到 ${escapeForRegExp(PERSONA_ID)} 的收件匣項目。)$`,
      ));
      await waitForFocusedRead(page, {
        description: `focused Human Inbox ${PERSONA_ID}`,
        focused: () => focusedInboxItem.or(focusedInboxEmpty).or(focusedInboxIncomplete).first(),
        navigate: (attempt) => attempt === 1
          ? humanGateLink.click()
          : page.reload({ waitUntil: "domcontentloaded" }),
        responseMatches: (url) => url.pathname === "/bff/management/human-inbox",
      });
      if (await focusedInboxIncomplete.isVisible()) {
        const incompleteAlert = page.getByRole("alert").filter({ has: incompleteAlertTitle });
        await expect(incompleteAlert).toBeVisible();
        await expect(incompleteAlert.getByText(incompleteAlertBody)).toBeVisible();
        await expect(incompleteAlert.getByRole("button", { name: /^(?:Retry|重試)$/ })).toBeVisible();
        await expect(unavailableAlertTitle).toHaveCount(0);
        await expect(focusedInboxMissing).toHaveCount(0);
        await expect(focusedInboxEmpty).toHaveCount(0);
        await expect(page.getByRole("link", { name: /^(?:Back to Persona Detail|返回 Persona 詳情)$/ }))
          .toHaveAttribute("href", `/management/personas/${encodeURIComponent(PERSONA_ID)}`);
      }
      await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`)
        .toBe(humanGateHref);
      await expect(page.getByRole("heading", { name: /人類收件匣|Human Inbox/i })).toBeVisible();
      await expect(page.locator("body")).toContainText(PERSONA_ID);
    }
  });
});
