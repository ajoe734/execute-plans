import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { installContainedLoopbackAuth, installContainedLoopbackAuthAuthority, targetsExternalE2eEnvironment } from "./helpers/auth";

// Contract-boundary fixtures on the original product routes. No backend writes or hosted proof.
const meetingId = "mtg-followthrough";
const ticketId = "tkt-followthrough";
const inboxId = `meeting_action:${ticketId}`;
const meetingPath = `/management/meetings/${meetingId}?action=${ticketId}`;
const detailPath = `/management/human-inbox/${encodeURIComponent(inboxId)}`;
// The supplied kind previously caused Inbox to wrap this existing path in a second URL.
const evidenceHref = "/management/artifacts/artifact-shared";
const evidenceRefs = [{ kind: "research_artifact", artifact_id: evidenceHref }];

function ticket(submitted = false) {
  return {
    ticket_id: ticketId, title: "Confirm licensed observations", status: submitted ? "submitted" : "open",
    revision: submitted ? 3 : 2, owner_kind: "human", owner_id: "operator", owner_display_name: "Operator",
    meeting_action: { meeting_id: meetingId, owner_kind: "human", owner_id: "operator", deliverable: "Licensed observations" },
    deliverable: "Licensed observations", acceptance_criterion: "Attach signed vendor terms",
    due_at: "2026-11-30T00:00:00Z", next_review: "MT-1", required_actor: submitted ? "chair-reviewer" : "operator",
    evidence_refs: evidenceRefs,
    evidence_notes: submitted ? [{ note_id: "note-signed", title: "Signed terms", body: "Vendor permits paper research." }] : [],
  };
}

function inbox(canRespond: boolean) {
  return {
    ...ticket(), id: inboxId, item_id: ticketId, inbox_id: inboxId, kind: "meeting_action", inbox_type: "meeting",
    source_type: "meeting_action", source_id: ticketId, meeting_id: meetingId,
    human_requirement: "Only the license holder can confirm scope.", reason: "Attach signed vendor terms",
    requested_material: "Licensed observations", response_action: "submit", can_respond: canRespond,
    resumes_with: "Chair review", can_decide: false, can_proceed: false, status: "open",
    summary: "Confirm licensed observations for the same ticket.",
    links: { meeting: meetingPath, ticket: `/api/v1/research/tickets/${ticketId}`, manageHref: meetingPath },
  };
}

function meeting(degraded = false) {
  return {
    meeting_id: meetingId, meeting_type: "MT-1", topic: "Weekly pool evolution review", status: "closed",
    outcome: "ACTIONS_ADOPTED", decision_kind: "adopt_actions", anonymised_labels_revealed: false,
    label_reveal: { "#1": "persona-secret" }, participants: [],
    prior_actions: degraded ? [] : [{ ...ticket(true), ticket_id: "tkt-prior", title: "Verify prior observations", owner_kind: "persona", owner_id: "persona-secret", owner_display_name: "SECRET_OWNER" }],
    action_read: { status: degraded ? "degraded" : "ok", reason: degraded ? "research_owner_timeout" : null },
    adopted_actions: [ticket()], participant_action_capabilities: [{ label: "#1", persona_id: "persona-secret", persona_display_name: "SECRET_OWNER", status: "restricted_data" }],
    rounds: [{ round: 1, positions: [{ label: "#1", stance: "Review observations", changed: false }] }],
    synthesis: { outcome: "ACTIONS_ADOPTED", proposals: [] }, proposals: [], writebacks: [],
  };
}

async function json(route: Route, body: unknown, status = 200) {
  const origin = route.request().headers().origin ?? "*";
  await route.fulfill({ status, contentType: "application/json", headers: {
    "access-control-allow-origin": origin, "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,OPTIONS,PATCH", "access-control-allow-headers": "*",
  }, body: JSON.stringify(body) });
}

async function capture(page: Page, info: TestInfo, name: string) {
  const root = process.env.MEETING_ACTION_EVIDENCE_DIR;
  const file = `${info.title.replace(/[^a-zA-Z0-9-]/g, "-")}-${name}.png`;
  const target = root ? path.join(root, file) : info.outputPath(file);
  if (root) mkdirSync(root, { recursive: true });
  await page.screenshot({ path: target, fullPage: true });
  await info.attach(name, { path: target, contentType: "image/png" });
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test.describe("Meeting action follow-through normal routes", () => {
  test.skip(targetsExternalE2eEnvironment(), "Contained contract fixtures require loopback");
  for (const locale of ["en-US", "zh-TW"]) {
    for (const width of [1440, 390]) {
      test(`${locale}-${width}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript((language) => localStorage.setItem("pantheon.locale", language), locale);
        await installContainedLoopbackAuth(page);
        let canRespond = true;
        let submitted = false;
        let degraded = false;
        let patches = 0;
        const reads: Record<string, number> = {};
        await page.route("**/*", async (route) => {
          const url = new URL(route.request().url());
          const p = url.pathname;
          if (!p.startsWith("/bff/") && !p.startsWith("/api/")) return route.fallback();
          if (route.request().method() === "OPTIONS") return json(route, {});
          reads[p] = (reads[p] ?? 0) + 1;
          if (route.request().method() !== "GET") { patches++; return json(route, { error: { code: "WRITE_FORBIDDEN" } }, 403); }
          if (p === `/bff/management/meetings/${meetingId}`) return json(route, { status: "ok", owner: "consultation", data: meeting(degraded) });
          if (p === "/bff/management/human-inbox") return json(route, { data: { items: submitted ? [] : [inbox(canRespond)] } });
          if (decodeURIComponent(p) === `/bff/management/human-inbox/${inboxId}`) {
            return submitted ? json(route, { error: { code: "NOT_FOUND" } }, 404) : json(route, { data: inbox(canRespond) });
          }
          if (p === `/api/v1/research/tickets/${ticketId}`) return json(route, { status: "ok", owner: "research", data: ticket(submitted) });
          if (p === "/bff/events/stream") return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": connected\n\n" });
          return json(route, { data: { items: [] }, items: [] });
        });
        await installContainedLoopbackAuthAuthority(page);

        await page.goto(meetingPath);
        const prior = page.getByTestId("meeting-prior-actions");
        await expect(prior.getByTestId("meeting-action-owner")).toHaveText("#1");
        await expect(page.getByTestId(`meeting-action-${ticketId}`).getByTestId("meeting-action-owner")).toHaveText("Operator");
        await expect(prior).not.toContainText("SECRET_OWNER");
        await expect(prior.getByRole("link", { name: evidenceHref, exact: true })).toHaveAttribute("href", evidenceHref);
        expect(await prior.evaluate((el) => Boolean(el.compareDocumentPosition(document.querySelector('[data-testid="meeting-detail-rounds"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        await noHorizontalOverflow(page);
        await capture(page, info, "meeting");

        await page.getByTestId("meeting-detail-back-to-inbox").click();
        await expect(page).toHaveURL(/\/management\/human-inbox$/);
        const card = page.getByTestId("inbox-meeting-action-card");
        await expect(card.getByTestId("inbox-meeting-action-missing")).toContainText("Attach signed vendor terms");
        await expect(card.getByTestId("inbox-meeting-action-evidence").getByRole("link")).toHaveAttribute("href", evidenceHref);
        await expect(card.getByTestId("inbox-meeting-action-meeting-link")).toHaveAttribute("href", meetingPath);
        await noHorizontalOverflow(page);
        await capture(page, info, "inbox");
        // Existing form validation and read-only release gate; never enable real writes.
        await card.getByTestId("inbox-meeting-action-submit").click();
        await expect(card.getByTestId("inbox-meeting-action-error")).toBeVisible();
        await card.locator("input").fill("Signed terms");
        await card.locator("textarea").fill("Vendor permits paper research.");
        for (let retry = 0; retry < 2; retry++) {
          await card.getByTestId("inbox-meeting-action-submit").click();
          await expect(card.getByTestId("inbox-meeting-action-error")).toContainText("live_write_gate_closed");
          await expect(card.locator("textarea")).toHaveValue("Vendor permits paper research.");
        }
        expect(patches).toBe(0);

        // View-only principal as declared by the source, on the original detail URL.
        canRespond = false;
        await page.goto(detailPath);
        await expect(page.getByTestId("inbox-meeting-action-view-only")).toBeVisible();
        await expect(page.getByTestId("inbox-meeting-action-form")).toHaveCount(0);
        await expect(page.getByTestId("inbox-meeting-action-evidence").getByRole("link")).toHaveAttribute("href", evidenceHref);
        await noHorizontalOverflow(page);
        await capture(page, info, "detail-viewer");

        // Fixture owner state changes independently; reload must read the same canonical ticket
        // after it leaves the queue. This is readback coverage, not a successful browser write.
        submitted = true;
        await page.reload();
        await expect(page.getByTestId("inbox-meeting-action-ticket-id")).toHaveText(ticketId);
        await expect(page.getByTestId("inbox-meeting-action-notes")).toContainText("Vendor permits paper research.");
        expect(reads[`/api/v1/research/tickets/${ticketId}`]).toBeGreaterThan(0);
        await capture(page, info, "detail-readback");

        degraded = true;
        await page.goto(meetingPath);
        await expect(page.getByTestId("meeting-prior-actions-degraded")).toContainText("research_owner_timeout");
        await expect(page.getByTestId("meeting-prior-actions-empty")).toHaveCount(0);
        await capture(page, info, "degraded");
        const result = { locale, width, routes: [meetingPath, "/management/human-inbox", detailPath], patches, reads, outcome: "passed", backend: "intercepted contract fixtures", real_writes: false };
        const root = process.env.MEETING_ACTION_EVIDENCE_DIR;
        const resultPath = root ? path.join(root, `${locale}-${width}.json`) : info.outputPath("outcome.json");
        writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
        await info.attach("outcome", { path: resultPath, contentType: "application/json" });
      });
    }
  }
});
