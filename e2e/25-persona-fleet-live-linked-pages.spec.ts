import { expect, test, type Page } from "@playwright/test";
import { authHeaders, installOidcDevLogin, roleTokenFromEnv } from "./helpers/auth";

const FE_BASE = process.env.PANTHEON_FE_BASE_URL?.replace(/\/$/, "") ?? "";
const BFF_BASE = process.env.PANTHEON_BFF_BASE_URL?.replace(/\/$/, "") ?? "";
const VIEWER_TOKEN = roleTokenFromEnv("viewer", ["PANTHEON_PERSONA_INTERACTION_VIEWER_TOKEN"]);
const EXPLICIT_PERSONA_ID = process.env.PANTHEON_PERSONA_FLEET_AUDIT_ID?.trim() || undefined;

function fleetPersonaId(row: Record<string, unknown>): string {
  return String(row.id ?? row.persona_id ?? row.personaId ?? "").trim();
}

function qualifyingFleetRow(row: Record<string, unknown>): boolean {
  const id = fleetPersonaId(row);
  const ooda = String(row.ooda ?? "").toLowerCase();
  const capitalMode = String(row.capital_mode ?? row.capitalMode ?? "").toLowerCase();
  return Boolean(id)
    && ["observe", "orient", "decide", "act"].includes(ooda)
    && capitalMode === "paper"
    && Array.isArray(row.data_sources)
    && Array.isArray(row.mutation_diagnostics);
}

function selectLiveFleetRow(rows: Record<string, unknown>[]): Record<string, unknown> | undefined {
  if (EXPLICIT_PERSONA_ID) return rows.find((row) => fleetPersonaId(row) === EXPLICIT_PERSONA_ID);
  return rows.filter(qualifyingFleetRow).sort((left, right) => {
    const score = (row: Record<string, unknown>) => {
      const rank = row.league_rank ?? row.leagueRank;
      const hasRank = typeof rank === "number" && Number.isFinite(rank) && rank > 0;
      const hasMutation = row.last_mutation_kind && row.last_mutation_kind !== "unavailable";
      return Number(hasRank) * 4 + Number(hasMutation) * 2 + Number((row.data_sources as unknown[]).length > 0);
    };
    return score(right) - score(left) || fleetPersonaId(left).localeCompare(fleetPersonaId(right));
  })[0];
}

async function openFocusedFleetRow(page: Page, personaId: string) {
  const fleetRead = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/bff/management/persona-fleet"
      && response.request().method() === "GET"
      && response.status() === 200;
  });
  await page.goto(`${FE_BASE}/management/persona-fleet?persona=${encodeURIComponent(personaId)}`, {
    waitUntil: "domcontentloaded",
  });
  await fleetRead;
  const nonProductionScope = page.getByRole("radio", { name: /非正式資料|Non-production data/i });
  await expect(nonProductionScope).toBeVisible({ timeout: 30_000 });
  await nonProductionScope.click();
  const row = page.locator("tr").filter({ hasText: personaId }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
}

test.describe("Persona Fleet live linked-page contract", () => {
  test.skip(!FE_BASE || !BFF_BASE, "requires hosted FE and BFF URLs");
  test.skip(!VIEWER_TOKEN, "requires an explicit or RBAC-matrix viewer token");

  test.beforeEach(async ({ page }) => {
    await installOidcDevLogin(page, {
      goto: false,
      roles: ["viewer"],
      tenantId: "pantheon-dev",
      token: VIEWER_TOKEN,
    });
  });

  test("uses the live BFF contract and keeps every focused target semantically scoped", async ({ page, request }) => {
    test.setTimeout(180_000);
    const headers = authHeaders({
      tenantId: "pantheon-dev",
      token: VIEWER_TOKEN,
    });
    const fleetResponse = await request.get(`${BFF_BASE}/bff/management/persona-fleet?page_size=100`, { headers });
    expect(fleetResponse.ok()).toBe(true);
    const fleetPayload = await fleetResponse.json();
    const fleetRows = fleetPayload?.data?.items ?? [];
    const fleetRow = selectLiveFleetRow(fleetRows);
    expect(fleetRow, EXPLICIT_PERSONA_ID
      ? `missing explicit live Fleet row ${EXPLICIT_PERSONA_ID}`
      : "no live Fleet row satisfies the linked-page contract prerequisites").toBeTruthy();
    if (!fleetRow) throw new Error("Persona Fleet target discovery failed");
    const personaId = fleetPersonaId(fleetRow);

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
        (row.persona_id ?? row.personaId ?? row.id) === personaId,
      );
      expect(rankingRow, `missing Paper ranking row ${personaId}`).toBeTruthy();
      expect(fleetRow.league_rank).toBe(rankingRow.rank);
      expect(fleetRow.league_score).toBe(rankingRow.score);
    }

    const fleetTableRow = await openFocusedFleetRow(page, personaId);

    const personaName = String(fleetRow.name ?? fleetRow.persona_name ?? fleetRow.personaName ?? personaId);
    await fleetTableRow.getByRole("link", { name: personaName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/management/personas/${personaId}`));
    await expect(page.getByRole("heading", { name: personaName, level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText(personaId);

    const oodaFleetRow = await openFocusedFleetRow(page, personaId);
    const oodaLink = oodaFleetRow.locator(`[aria-label="${personaId} OODA ${fleetRow.ooda} stage" i]`);
    await expect(oodaLink).toHaveAttribute("href", /\/management\/(data-sources|experiments|research-loop|human-inbox|runtimes|evolution-journal)/);
    await oodaLink.click();
    if (String(fleetRow.ooda).toLowerCase() === "act") {
      await expect(page).toHaveURL(new RegExp(`/management/runtimes\\?persona=${personaId}`));
      await expect(page.getByRole("heading", { name: /執行環境|Runtimes/i })).toBeVisible();
      const runtimeTable = page.getByRole("table").first();
      await expect(runtimeTable.locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
      await expect(runtimeTable).toContainText(personaId);
    }

    const rankRow = await openFocusedFleetRow(page, personaId);
    const rankCell = rankRow.locator("td").nth(5);
    const rankLink = rankCell.locator(`[aria-label="${personaId} persona league ranking"]`);
    if (hasRankingTarget) {
      const rankingTab = capitalMode === "paper" ? "quarterly" : "rolling";
      const rankingPath = capitalMode === "paper"
        ? "/bff/management/quarterly-ranking"
        : "/bff/management/persona-league";
      await expect(rankLink).toHaveAttribute(
        "href",
        new RegExp(`/management/rankings\\?tab=${rankingTab}&persona=${personaId}`),
      );
      const rankingRead = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === rankingPath
          && response.request().method() === "GET"
          && response.status() === 200;
      }, { timeout: 30_000 });
      await rankLink.click();
      const rankingResponse = await rankingRead;
      await rankingResponse.finished();
      const rankingTable = page.getByRole("table").first();
      await expect(rankingTable.locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
      await expect(rankingTable).toContainText(personaName, { timeout: 30_000 });
    } else {
      await expect(rankLink).toHaveCount(0);
      await expect(rankCell).toHaveText("—");
    }

    const focusedFleetRow = await openFocusedFleetRow(page, personaId);
    const capitalLink = focusedFleetRow.locator(`[aria-label="Open capital for ${personaId}"]`);
    await expect(capitalLink).toHaveAttribute(
      "href",
      new RegExp(
        `/management/performance\\?tab=overview&persona_id=${personaId}&capital_pool_id=paper-ledger-${personaId}`,
      ),
    );
    await capitalLink.click();
    // PPL-ALLOC-007: capital identity belongs to Performance Center, while
    // Rankings remains a readiness/diagnostic destination.
    await expect(page).toHaveURL(new RegExp(`/management/performance\\?tab=overview&persona_id=${personaId}`));
    await expect(page.getByRole("tab", { name: /Overview|總覽/i })).toHaveAttribute("aria-selected", "true");

    const firstSource = fleetRow.data_sources?.[0];
    const providerKey = firstSource?.provider_key ?? firstSource?.providerKey;
    if (providerKey) {
      const sourceFleetRow = await openFocusedFleetRow(page, personaId);
      const sourceLink = sourceFleetRow.locator(`[aria-label="${personaId} data source ${providerKey}"]`);
      await sourceLink.click();
      await expect(page).toHaveURL(new RegExp(`persona=${personaId}.*source=${providerKey}`));
      const sourceTable = page.getByRole("table").first();
      await expect(sourceTable.locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
      await expect(sourceTable).toContainText(String(providerKey));
    }

    await (await openFocusedFleetRow(page, personaId)).getByRole("link", { name: /查看研究執行|View research run/i }).click();
    const researchFocus = page.getByText(new RegExp(`Persona.*${personaId}`, "i")).first();
    await expect(researchFocus).toBeVisible();
    await expect(researchFocus).not.toContainText(/project\s*[：:]\s*nan/i);

    await (await openFocusedFleetRow(page, personaId)).locator(`[aria-label="${personaId} performance attribution"]`).click();
    await expect(page.getByRole("heading", { name: /績效歸因|Performance Attribution/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/正在核對 .* 的正式歸因與來源狀態|Checking formal attribution and source state for /i)).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: /績效來源明細|Performance source detail/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/產生依據|Basis/i).first()).toBeVisible({ timeout: 30_000 });

    const mutationFleetRow = await openFocusedFleetRow(page, personaId);
    const mutationLink = mutationFleetRow.locator(`[aria-label="${personaId} mutation history"]`);
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

    const humanGateFleetRow = await openFocusedFleetRow(page, personaId);
    const humanGateLink = humanGateFleetRow.locator(`[aria-label="${personaId} human gate"]`);
    if (await humanGateLink.count()) {
      await humanGateLink.click();
      await expect(page.getByRole("heading", { name: /人類收件匣|Human Inbox/i })).toBeVisible();
      await expect(page.locator("body")).toContainText(personaId);
    }
  });
});
