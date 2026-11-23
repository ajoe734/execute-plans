import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import {
  normalizeMeetingAction,
  normalizePriorActions,
  validateMeetingActionResponse,
} from "@/lib/bff-v1/meetings";
import type { HumanInboxMeetingAction } from "@/lib/v5/management/humanInbox";

const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/bff-v1/meetings", async (orig) => ({
  ...(await orig<typeof import("@/lib/bff-v1/meetings")>()),
  submitMeetingActionResponse: mocks.submit,
}));

import {
  AdoptedActionsSection,
  MeetingActionResponseCard,
  ParticipantCapabilities,
  PriorActionsSection,
} from "./MeetingActionCards";

const work = (over: Partial<HumanInboxMeetingAction> = {}): HumanInboxMeetingAction => ({
  ticketId: "rt-100",
  meetingId: "mtg-1",
  deliverable: "Cost sheet",
  missingInput: "Broker fee schedule",
  nextTransition: "submit",
  canRespond: true,
  ...over,
});

function wrap(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nextProvider>,
  );
}

describe("meeting action follow-through", () => {
  beforeEach(async () => {
    mocks.submit.mockReset();
    await i18n.changeLanguage("en-US");
  });
  afterEach(cleanup);

  it("normalizes: submitted is not accepted, missing signal is not executed", () => {
    const submitted = normalizeMeetingAction({ ticket_id: "rt-1", state: "submitted" })!;
    expect(submitted.executed).toBe(true);
    expect(submitted.state).toBe("submitted");
    const open = normalizeMeetingAction({ ticket_id: "rt-2", state: "open" })!;
    expect(open.executed).toBe(false);
    expect(normalizeMeetingAction({})).toBeNull();
  });

  it("keeps unavailable, forbidden and empty prior actions distinct", () => {
    expect(normalizePriorActions({ status: "unavailable", reason: "owner_down" })).toEqual({ state: "unavailable", reason: "owner_down" });
    expect(normalizePriorActions({ status: "forbidden" })?.state).toBe("forbidden");
    expect(normalizePriorActions([])).toEqual({ state: "ok", items: [] });
    expect(normalizePriorActions(undefined)).toBeUndefined();
  });

  it("never shows 'none' when prior actions are unavailable", () => {
    wrap(<PriorActionsSection read={{ state: "unavailable", reason: "x" }} />);
    expect(screen.getByTestId("meeting-prior-actions-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("meeting-prior-actions-empty")).toBeNull();
  });

  it("renders owner, deliverable, evidence link, review reason and submitted-vs-accepted", () => {
    const a = normalizeMeetingAction({
      ticket_id: "rt-9", state: "submitted", assignee_label: "Alice", deliverable: "Fee report",
      due_at: "2026-11-30T00:00:00Z", evidence_refs: ["/management/evidence/e1"], review_reason: "Needs sources",
    })!;
    wrap(<PriorActionsSection read={{ state: "ok", items: [a] }} />);
    expect(screen.getByTestId("meeting-action-owner")).toHaveTextContent("Alice");
    expect(screen.getByTestId("meeting-action-result")).toHaveTextContent(/not accepted yet/i);
    expect(screen.getByTestId("meeting-action-evidence").querySelector("a")).toHaveAttribute("href", "/management/evidence/e1");
    expect(screen.getByText("Needs sources")).toBeInTheDocument();
  });

  it("shows the chair's reason when no task was adopted, in zh-TW too", async () => {
    wrap(<AdoptedActionsSection actions={[]} noActionReason="Pool retained" />);
    expect(screen.getByTestId("meeting-adopted-actions-empty")).toHaveTextContent("Pool retained");
    cleanup();
    await i18n.changeLanguage("zh-TW");
    wrap(<AdoptedActionsSection actions={[]} />);
    expect(screen.getByTestId("meeting-adopted-actions-empty")).toHaveTextContent("沒有記錄採納的工作");
  });

  it("hides persona ids in anonymised rounds", () => {
    const items = [{ label: "Participant A", persona_id: "persona-secret", limits: ["No order access"] }];
    wrap(<ParticipantCapabilities items={items} revealed={false} />);
    expect(screen.getByTestId("meeting-capabilities")).not.toHaveTextContent("persona-secret");
    cleanup();
    wrap(<ParticipantCapabilities items={items} revealed />);
    expect(screen.getByTestId("meeting-capabilities")).toHaveTextContent("persona-secret");
  });

  it("validates fields before any write", async () => {
    expect(validateMeetingActionResponse({ ticketId: "t", transition: "submit", evidenceNote: { title: "", body: "" } })).toBe("note_required");
    expect(validateMeetingActionResponse({ ticketId: "t", transition: "nope", evidenceNote: { title: "a", body: "b" } })).toBe("transition");
    wrap(<MeetingActionResponseCard work={work()} meetingHref="/management/meetings/mtg-1" />);
    fireEvent.click(screen.getByTestId("inbox-meeting-action-submit"));
    expect(await screen.findByTestId("inbox-meeting-action-error")).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(screen.getByTestId("inbox-meeting-action-meeting-link")).toHaveAttribute("href", "/management/meetings/mtg-1");
  });

  it("keeps typed text on failure, retries with the same idempotency key, then confirms save", async () => {
    mocks.submit
      .mockResolvedValueOnce({ state: "unavailable", reason: "timeout" })
      .mockResolvedValueOnce({ state: "ok", action: null, replayed: false });
    const onSaved = vi.fn();
    wrap(<MeetingActionResponseCard work={work()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Evidence title"), { target: { value: "Fees" } });
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "Attached schedule" } });
    fireEvent.click(screen.getByTestId("inbox-meeting-action-submit"));
    expect(await screen.findByTestId("inbox-meeting-action-error")).toHaveTextContent(/timeout/);
    expect(screen.getByLabelText("Details")).toHaveValue("Attached schedule");
    fireEvent.click(screen.getByTestId("inbox-meeting-action-submit"));
    await waitFor(() => expect(screen.getByTestId("inbox-meeting-action-saved")).toBeInTheDocument());
    expect(mocks.submit).toHaveBeenCalledTimes(2);
    expect(mocks.submit.mock.calls[0][1]).toBe(mocks.submit.mock.calls[1][1]);
    expect(mocks.submit.mock.calls[1][0]).toMatchObject({ ticketId: "rt-100", transition: "submit" });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("uses provide_input for a Persona's missing input and shows who resumes", async () => {
    mocks.submit.mockResolvedValue({ state: "ok", action: null, replayed: false });
    wrap(<MeetingActionResponseCard work={work({ nextTransition: "provide_input", resumesLabel: "Persona Alpha" })} />);
    expect(screen.getByText("Persona Alpha")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Input title"), { target: { value: "Fee" } });
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "0.1%" } });
    fireEvent.click(screen.getByTestId("inbox-meeting-action-submit"));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    expect(mocks.submit.mock.calls[0][0].transition).toBe("provide_input");
  });

  it("renders view-only without a form when the source denies response", () => {
    wrap(<MeetingActionResponseCard work={work({ canRespond: false })} />);
    expect(screen.getByTestId("inbox-meeting-action-view-only")).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-meeting-action-form")).toBeNull();
  });
});
