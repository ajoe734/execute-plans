import { expect, test } from "@playwright/test";
import { installOidcDevLogin, authHeaders } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_BASE = process.env.PANTHEON_FE_BASE_URL?.replace(/\/$/, "") ?? "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io";
const BFF_BASE = process.env.PANTHEON_BFF_BASE_URL?.replace(/\/$/, "") ?? "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io";

test("capture evolution journal fallback-state hosted evidence", async ({ page, request }) => {
  page.on("console", (msg) => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[Browser PageError] ${err.message}`);
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await installOidcDevLogin(page, { tenantId: "pantheon-dev", goto: false });
  await installQuietEventSource(page);

  // Fetch live fleet personas and evolution journal entries
  const headers = authHeaders({ tenantId: "pantheon-dev" });
  const fleetResponse = await request.get(`${BFF_BASE}/bff/management/persona-fleet?page_size=100`, { headers });
  const fleetData = await fleetResponse.json();
  const fleetItems = fleetData.data?.items ?? [];

  const journalResponse = await request.get(`${BFF_BASE}/bff/management/evolution-journal`, { headers });
  const journalData = await journalResponse.json();
  const journalItems = journalData.data?.items ?? journalData ?? [];

  // Find a persona ID in the fleet that does not have any evolution journal entry (or fallback to any persona in the fleet)
  const journalPersonaIds = new Set(
    journalItems
      .map((item: any) => item.target?.id)
      .filter(Boolean)
  );

  let targetPersona = fleetItems.find((item: any) => {
    const id = item.id ?? item.persona_id ?? item.personaId;
    return id && !journalPersonaIds.has(id);
  });

  if (!targetPersona && fleetItems.length > 0) {
    targetPersona = fleetItems[0];
  }

  const personaId = targetPersona
    ? (targetPersona.id ?? targetPersona.persona_id ?? targetPersona.personaId)
    : "persona-20260528-04688755";
  const personaName = targetPersona
    ? (targetPersona.name ?? targetPersona.personaName ?? targetPersona.persona_name)
    : "Test Persona";

  console.log(`Using target persona ID: ${personaId} (${personaName})`);

  // Navigate to the evolution journal with the persona parameter
  await page.goto(`${FE_BASE}/management/evolution-journal?persona=${encodeURIComponent(personaId)}`);

  // Wait for the region to render
  const region = page.getByRole('region', { name: /演化日誌|Evolution Journal/i });
  await expect(region).toBeVisible({ timeout: 20000 });

  // Wait for the loading placeholder to clear (bounds the positive assertions
  // below to the actually-loaded fallback card, instead of a blind timeout
  // that would pass equally on an empty/loading page).
  const loadingPlaceholder = region.getByText(/Loading\.\.\.|載入中/i);
  await expect(loadingPlaceholder).not.toBeVisible({ timeout: 30000 });

  // Positive assertion: the persona-fleet-summary fallback card itself is
  // rendered (fallbackEvolutionEntryFromFleet in _core.tsx), not just an
  // empty/loading region. Its headline and target fields are deterministic
  // and hardcoded (not i18n-translated), so they are stable to assert on.
  const fallbackHeadline = page.getByText(/Persona Fleet status summary/i);
  await expect(fallbackHeadline).toBeVisible({ timeout: 20000 });

  const fallbackFocusBanner = page.getByText(/fleet summary fallback/i);
  await expect(fallbackFocusBanner).toBeVisible();

  const fallbackTarget = page.getByText(new RegExp(`Persona:${personaId}`, "i"));
  await expect(fallbackTarget).toBeVisible();

  // Assertions to verify:
  // - No Fixture badge is present
  // - No Approval status/field is present
  // - No NaN values are present on the page
  // - No raw i18n keys (like mgmt.evolution.*) are displayed
  const pageText = await page.innerText("body");

  // Make sure raw i18n keys are not shown
  expect(pageText).not.toContain("mgmt.evolution.");
  expect(pageText).not.toContain("common.");

  // Make sure no NaN is present
  expect(pageText).not.toContain("NaN");

  // Since it's a fallback card, it should not render Fixture badge or Approval status field
  const fixtureBadge = page.getByText(/Fixture|測試數據/i);
  await expect(fixtureBadge).not.toBeVisible();

  const approvalStatus = page.getByText(/Approval status|審批狀態|審核狀態/i);
  await expect(approvalStatus).not.toBeVisible();

  // Take screenshot of the entire page and save to the documented fallback-state evidence path
  // in the pantheon repo. This is deliberately a DISTINCT file from the formal-state evidence
  // (evolution_journal_hosted_evidence.png) so this fallback capture never clobbers it.
  const screenshotPath = "/tmp/pantheon-worker-worktrees/pantheon/evochain-009/docs/bff/execution-tasks/2026-07-13-evolution-journal-producer-gap/evolution_journal_hosted_evidence_fallback.png";
  await page.screenshot({
    path: screenshotPath,
    fullPage: true
  });

  console.log(`Fallback-state screenshot captured at: ${screenshotPath}`);
});
