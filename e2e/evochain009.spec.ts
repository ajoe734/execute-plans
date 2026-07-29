import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { installOidcDevLogin, authHeaders } from "./helpers/auth";
import { installQuietEventSource } from "./helpers/sse";

const FE_BASE = process.env.PANTHEON_FE_BASE_URL?.replace(/\/$/, "") ?? "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io";
const BFF_BASE = process.env.PANTHEON_BFF_BASE_URL?.replace(/\/$/, "") ?? "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io";

type FleetPersona = {
  id?: string;
  persona_id?: string;
  personaId?: string;
  name?: string;
  personaName?: string;
  persona_name?: string;
};

type EvolutionJournalItem = {
  id?: string;
  target?: { id?: string };
  route?: string;
};

type FleetResponseBody = { data?: { items?: FleetPersona[] } };

type JournalEnvelope = {
  data?: {
    id?: string;
    items?: EvolutionJournalItem[];
  };
  page_info?: {
    next_page_token?: string | null;
    total?: number;
    page_size?: number;
  };
  meta?: Record<string, unknown>;
};

type JournalResponseBody = JournalEnvelope | EvolutionJournalItem[];

// Fetches and parses a BFF JSON endpoint with bounded retry: hosted-run flakiness
// (cold-start 5xx, transiently empty/malformed bodies) previously surfaced as an
// opaque JSON.parse crash instead of a diagnosable failure, especially on the
// mobile-chromium project.
async function fetchJsonWithRetry<T>(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
  label: string,
  { retries = 3, delayMs = 2000, validate }: { retries?: number; delayMs?: number; validate?: (data: T) => boolean } = {},
): Promise<T> {
  let lastError = "unknown error";

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await request.get(url, { headers });
      const status = response.status();
      const bodyText = await response.text();

      if (!response.ok()) {
        lastError = `${label} returned HTTP ${status}: ${bodyText.slice(0, 500)}`;
      } else {
        try {
          const parsed = JSON.parse(bodyText) as T;
          if (validate && !validate(parsed)) {
            lastError = `${label} returned HTTP ${status} but validation failed: ${bodyText.slice(0, 500)}`;
          } else {
            return parsed;
          }
        } catch (parseError) {
          lastError = `${label} returned HTTP ${status} but body failed to parse as JSON (${(parseError as Error).message}): ${bodyText.slice(0, 500)}`;
        }
      }
    } catch (requestError) {
      lastError = `${label} request threw: ${(requestError as Error).message}`;
    }

    console.log(`[BFF Retry ${attempt}/${retries}] ${lastError}`);
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`${label} failed after ${retries} attempts. Last error: ${lastError}`);
}

// Navigates and waits for the target region, retrying the navigation itself
// within a 60s total budget.
async function gotoWithRegionRetry(
  page: Page,
  url: string,
  region: Locator,
  { attempts = 3, timeoutMs = 20000 }: { attempts?: number; timeoutMs?: number } = {},
): Promise<void> {
  const startTime = Date.now();
  const totalBudget = 60000;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= totalBudget) {
      throw new Error(`Navigation failed: 60s budget exceeded.`);
    }

    const remainingBudget = totalBudget - elapsed;
    const gotoTimeout = Math.min(20000, remainingBudget);

    try {
      console.log(`[Navigation Attempt ${attempt}/${attempts}] Navigating to ${url} with timeout ${gotoTimeout}ms`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: gotoTimeout });

      const expectTimeout = Math.min(timeoutMs, totalBudget - (Date.now() - startTime));
      if (expectTimeout <= 0) {
        throw new Error(`Navigation failed: 60s budget exceeded before checking visibility.`);
      }

      await expect(region).toBeVisible({ timeout: expectTimeout });
      return;
    } catch (err) {
      console.log(`[Navigation Retry ${attempt}/${attempts}] failed: ${(err as Error).message}`);
      if (attempt === attempts) {
        throw err;
      }
      await page.waitForTimeout(2000);
    }
  }
}

function doesJournalItemReferencePersona(item: EvolutionJournalItem, personaId: string): boolean {
  const targetId = item.target?.id;
  if (targetId && (targetId === personaId || targetId.includes(personaId))) {
    return true;
  }
  if (item.route && item.route.includes(personaId)) {
    return true;
  }
  try {
    const serialized = JSON.stringify(item);
    if (serialized.includes(personaId)) {
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

test("capture evolution journal fallback-state hosted evidence", async ({ page, request }) => {
  page.on("console", (msg) => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[Browser PageError] ${err.message}`);
  });

  const projectName = test.info().project.name ? test.info().project.name.toLowerCase() : "";
  const isMobile = projectName.includes("mobile") || (page.viewportSize()?.width ? page.viewportSize()!.width < 768 : false);
  if (!isMobile) {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  await installOidcDevLogin(page, { tenantId: "pantheon-dev", goto: false });
  await installQuietEventSource(page);

  // Fetch live fleet personas and evolution journal entries with bounded retry
  const headers = authHeaders({ tenantId: "pantheon-dev" });
  const fleetData = await fetchJsonWithRetry<FleetResponseBody>(
    request,
    `${BFF_BASE}/bff/management/persona-fleet?page_size=100`,
    headers,
    "persona-fleet fetch",
    {
      validate: (data) => data && typeof data === "object" && data.data && Array.isArray(data.data.items) && data.data.items.length > 0,
    },
  );
  const fleetItems: FleetPersona[] = fleetData.data?.items ?? [];

  // Fetch all pages of the evolution journal (to inspect all pages)
  const journalItems: EvolutionJournalItem[] = [];
  let nextPageToken: string | null | undefined = undefined;

  do {
    const url = `${BFF_BASE}/bff/management/evolution-journal` +
      (nextPageToken ? `?page_token=${encodeURIComponent(nextPageToken)}` : "");

    const journalPage = await fetchJsonWithRetry<JournalResponseBody>(
      request,
      url,
      headers,
      "evolution-journal fetch",
      {
        validate: (data) => {
          if (!data) return false;
          if (Array.isArray(data)) return true;
          return typeof data === "object" && (!data.data || Array.isArray(data.data.items));
        },
      }
    );

    if (Array.isArray(journalPage)) {
      journalItems.push(...journalPage);
      nextPageToken = null;
    } else {
      const items = journalPage?.data?.items ?? [];
      journalItems.push(...items);
      nextPageToken = journalPage?.page_info?.next_page_token;
    }
  } while (nextPageToken);

  // Find a persona ID in the fleet that does not have any evolution journal entry (otherwise fail with diagnostics)
  let targetPersona: FleetPersona | undefined = undefined;

  for (const item of fleetItems) {
    const id = item.id ?? item.persona_id ?? item.personaId;
    if (!id) continue;

    // Substring matching of the persona ID against the journal items
    const hasJournalEntry = journalItems.some(jItem => doesJournalItemReferencePersona(jItem, id));
    if (!hasJournalEntry) {
      // Query candidate persona filter on the BFF to confirm it's truly empty (double check/fail closed)
      try {
        const filterUrl = `${BFF_BASE}/bff/management/evolution-journal?persona=${encodeURIComponent(id)}`;
        const filterData = await fetchJsonWithRetry<JournalResponseBody>(
          request,
          filterUrl,
          headers,
          `evolution-journal filtered fetch for ${id}`,
          {
            validate: (data) => {
              if (!data) return false;
              if (Array.isArray(data)) return true;
              return typeof data === "object" && (!data.data || Array.isArray(data.data.items));
            },
          }
        );
        const filteredItems = Array.isArray(filterData) ? filterData : (filterData?.data?.items ?? []);
        if (filteredItems.length === 0) {
          targetPersona = item;
          break;
        } else {
          console.log(`BFF query returned ${filteredItems.length} items for persona ${id} despite not being matched in all-pages fetch.`);
        }
      } catch (err) {
        console.log(`Failed to verify filter for persona ${id}: ${(err as Error).message}`);
      }
    }
  }

  if (!targetPersona) {
    throw new Error(
      `No persona found without journal entries (failed closed). ` +
      `Tested ${fleetItems.length} fleet personas against ${journalItems.length} journal items.`
    );
  }

  const personaId = targetPersona.id ?? targetPersona.persona_id ?? targetPersona.personaId;
  const personaName = targetPersona.name ?? targetPersona.personaName ?? targetPersona.persona_name;

  console.log(`Using target persona ID: ${personaId} (${personaName})`);

  // Navigate to the evolution journal with the persona parameter, retrying the
  // navigation (not just the assertion) if the region fails to render.
  const region = page.getByRole('region', { name: /演化日誌|Evolution Journal/i });
  await gotoWithRegionRetry(
    page,
    `${FE_BASE}/management/evolution-journal?persona=${encodeURIComponent(personaId)}`,
    region,
  );

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
  const suffix = projectName.includes("mobile") ? "_mobile" : "";
  const screenshotPath = `/tmp/pantheon-worker-worktrees/pantheon/evochain-009/docs/bff/execution-tasks/2026-07-13-evolution-journal-producer-gap/evolution_journal_hosted_evidence_fallback${suffix}.png`;
  await page.screenshot({
    path: screenshotPath,
    fullPage: true
  });

  console.log(`Fallback-state screenshot captured at: ${screenshotPath}`);
});
