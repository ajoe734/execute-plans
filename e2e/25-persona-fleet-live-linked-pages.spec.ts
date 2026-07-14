import { expect, test, type Page } from "@playwright/test";
import { authHeaders, installOidcDevLogin } from "./helpers/auth";

const FE_BASE = process.env.PANTHEON_FE_BASE_URL?.replace(/\/$/, "") ?? "";
const BFF_BASE = process.env.PANTHEON_BFF_BASE_URL?.replace(/\/$/, "") ?? "";
const PUBLIC_VIEWER_TOKEN = "pantheon-dev-browser:viewer";
const PERSONA_ID = process.env.PANTHEON_PERSONA_FLEET_AUDIT_ID ?? "persona-20260528-04688755";

async function openFocusedFleetRow(page: Page) {
  const fleetRead = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/bff/management/persona-fleet"
      && response.request().method() === "GET"
      && response.status() === 200;
  });
  await page.goto(`${FE_BASE}/management/persona-fleet?persona=${encodeURIComponent(PERSONA_ID)}`, {
    waitUntil: "domcontentloaded",
  });
  await fleetRead;
  const nonProductionTab = page.getByRole("tab", { name: /非正式資料|Non-production data/i });
  await expect(nonProductionTab).toBeVisible({ timeout: 30_000 });
  await nonProductionTab.click();
  const row = page.locator("tr").filter({ hasText: PERSONA_ID }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
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
  });

  test("uses the live BFF contract and keeps every focused target semantically scoped", async ({ page, request }) => {
    test.setTimeout(180_000);
    const headers = authHeaders({
      tenantId: "pantheon-dev",
      token: PUBLIC_VIEWER_TOKEN,
    });
    const fleetResponse = await request.get(`${BFF_BASE}/bff/management/persona-fleet?page_size=100`, { headers });
    expect(fleetResponse.ok()).toBe(true);
    const fleetPayload = await fleetResponse.json();
    const fleetRows = fleetPayload?.data?.items ?? [];
    const fleetRow = fleetRows.find((row: Record<string, unknown>) =>
      (row.id ?? row.persona_id ?? row.personaId) === PERSONA_ID,
    );
    expect(fleetRow, `missing live Fleet row ${PERSONA_ID}`).toBeTruthy();

    const serializedFleetRow = JSON.stringify(fleetRow);
    expect(serializedFleetRow).not.toMatch(/"(?:mutation_entry_id|evolution_entry_id)":"(?:nan|undefined|null|\d{4}-\d{2}-\d{2})"/i);
    expect(["formal_mutation", "fleet_summary", "unavailable"]).toContain(fleetRow.last_mutation_kind);
    expect(["formal", "fallback", "unavailable"]).toContain(fleetRow.mutation_confidence);
    expect(Array.isArray(fleetRow.mutation_diagnostics)).toBe(true);

    const capitalMode = String(fleetRow.capital_mode ?? fleetRow.capitalMode ?? "").toLowerCase();
    const leagueRank = fleetRow.league_rank ?? fleetRow.leagueRank ?? fleetRow.rank?.league_rank ?? fleetRow.rank?.leagueRank;
    const hasRankingTarget = typeof leagueRank === "number" && Number.isFinite(leagueRank) && leagueRank > 0;

    if (capitalMode === "paper" && hasRankingTarget) {
      const rankingResponse = await request.get(`${BFF_BASE}/bff/management/quarterly-ranking?page_size=200`, { headers });
      expect(rankingResponse.ok()).toBe(true);
      const rankingPayload = await rankingResponse.json();
      const rankingRow = (rankingPayload?.data?.items ?? []).find((row: Record<string, unknown>) =>
        (row.persona_id ?? row.personaId ?? row.id) === PERSONA_ID,
      );
      expect(rankingRow, `missing Paper ranking row ${PERSONA_ID}`).toBeTruthy();
      expect(fleetRow.league_rank).toBe(rankingRow.rank);
      expect(fleetRow.league_score).toBe(rankingRow.score);
    }

    const fleetTableRow = await openFocusedFleetRow(page);

    const personaName = String(fleetRow.name ?? fleetRow.persona_name ?? fleetRow.personaName ?? PERSONA_ID);
    await fleetTableRow.getByRole("link", { name: personaName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/management/personas/${PERSONA_ID}`));
    await expect(page.getByRole("heading", { name: personaName, level: 1 })).toBeAttached();
    await expect(page.locator("body")).toContainText(PERSONA_ID);

    const oodaFleetRow = await openFocusedFleetRow(page);
    const oodaLink = oodaFleetRow.locator(`[aria-label="${PERSONA_ID} OODA ${fleetRow.ooda} stage" i]`);
    await expect(oodaLink).toHaveAttribute("href", /\/management\/(data-sources|experiments|research-loop|human-inbox|runtimes|evolution-journal)/);
    await oodaLink.click();
    if (String(fleetRow.ooda).toLowerCase() === "act") {
      await expect(page).toHaveURL(new RegExp(`/management/runtimes\\?persona=${PERSONA_ID}`));
      await expect(page.getByRole("heading", { name: /執行環境|Runtimes/i })).toBeVisible();
      const runtimeTable = page.getByRole("table").first();
      await expect(runtimeTable.locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
      await expect(runtimeTable).toContainText(PERSONA_ID);
    }

    const rankRow = await openFocusedFleetRow(page);
    const rankCell = rankRow.locator("td").nth(5);
    const rankLink = rankCell.locator(`[aria-label="${PERSONA_ID} persona league ranking"]`);
    if (hasRankingTarget) {
      const rankingTab = capitalMode === "paper" ? "quarterly" : "rolling";
      await expect(rankLink).toHaveAttribute(
        "href",
        new RegExp(`/management/rankings\\?tab=${rankingTab}&persona=${PERSONA_ID}`),
      );
      await rankLink.click();
      const rankingTable = page.getByRole("table").first();
      await expect(rankingTable.locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
      await expect(rankingTable).toContainText(personaName);
    } else {
      await expect(rankLink).toHaveCount(0);
      await expect(rankCell).toHaveText("—");
    }

    const focusedFleetRow = await openFocusedFleetRow(page);
    const capitalLink = focusedFleetRow.locator(`[aria-label="Open capital for ${PERSONA_ID}"]`);
    await expect(capitalLink).toHaveAttribute(
      "href",
      new RegExp(
        `/management/performance\\?tab=overview&persona_id=${PERSONA_ID}&capital_pool_id=paper-ledger-${PERSONA_ID}`,
      ),
    );
    await capitalLink.click();
    // PPL-ALLOC-007: capital identity belongs to Performance Center, while
    // Rankings remains a readiness/diagnostic destination.
    await expect(page).toHaveURL(new RegExp(`/management/performance\\?tab=overview&persona_id=${PERSONA_ID}`));
    await expect(page.getByRole("tab", { name: /Overview|總覽/i })).toHaveAttribute("aria-selected", "true");

    const firstSource = fleetRow.data_sources?.[0];
    const providerKey = firstSource?.provider_key ?? firstSource?.providerKey;
    if (providerKey) {
      const sourceFleetRow = await openFocusedFleetRow(page);
      const sourceLink = sourceFleetRow.locator(`[aria-label="${PERSONA_ID} data source ${providerKey}"]`);
      await sourceLink.click();
      await expect(page).toHaveURL(new RegExp(`persona=${PERSONA_ID}.*source=${providerKey}`));
      const sourceTable = page.getByRole("table").first();
      await expect(sourceTable.locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
      await expect(sourceTable).toContainText(String(providerKey));
    }

    await (await openFocusedFleetRow(page)).getByRole("link", { name: /查看研究執行|View research run/i }).click();
    const researchFocus = page.getByText(new RegExp(`Persona.*${PERSONA_ID}`, "i")).first();
    await expect(researchFocus).toBeVisible();
    await expect(researchFocus).not.toContainText(/project\s*[：:]\s*nan/i);

    await (await openFocusedFleetRow(page)).locator(`[aria-label="${PERSONA_ID} performance attribution"]`).click();
    await expect(page.getByRole("heading", { name: /績效歸因|Performance Attribution/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /績效來源明細|Performance source details/i })).toBeVisible();
    await expect(page.getByText(/產生依據|Basis/i).first()).toBeVisible();

    const mutationFleetRow = await openFocusedFleetRow(page);
    const mutationLink = mutationFleetRow.locator(`[aria-label="${PERSONA_ID} mutation history"]`);
    if (fleetRow.last_mutation_kind === "unavailable") {
      await expect(mutationLink).toHaveCount(0);
    } else {
      await mutationLink.click();
      const body = page.locator("body");
      await expect(body).not.toContainText(/mutation\s*[：:]\s*nan/i);
      await expect(body).not.toContainText(/Action\s+\d{4}-\d{2}-\d{2}/i);
      if (fleetRow.last_mutation_kind === "fleet_summary") {
        await expect(body).toContainText("fleet summary fallback");
        await expect(body).toContainText(/無正式 mutation id|no formal mutation id/i);
      } else {
        await expect(body).toContainText(String(fleetRow.mutation_entry_id));
      }
    }

    const humanGateFleetRow = await openFocusedFleetRow(page);
    const humanGateLink = humanGateFleetRow.locator(`[aria-label="${PERSONA_ID} human gate"]`);
    if (await humanGateLink.count()) {
      await humanGateLink.click();
      await expect(page.getByRole("heading", { name: /人類收件匣|Human Inbox/i })).toBeVisible();
      await expect(page.locator("body")).toContainText(PERSONA_ID);
    }
  });
});
