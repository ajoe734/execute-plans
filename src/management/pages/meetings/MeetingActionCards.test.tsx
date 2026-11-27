import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import {
  normalizeMeetingAction,
  normalizePriorActions,
  resolveMeetingActionEvidenceHref,
  validateMeetingActionResponse,
} from "@/lib/bff-v1/meetings";
import { adaptHumanInboxList } from "@/lib/bff-v1/management";
import type { HumanInboxMeetingAction } from "@/lib/v5/management/humanInbox";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  getTicket: vi.fn(),
}));
vi.mock("@/lib/bff-v1/meetings", async (orig) => ({
  ...(await orig<typeof import("@/lib/bff-v1/meetings")>()),
  submitMeetingActionResponse: mocks.submit,
  getMeetingActionTicket: mocks.getTicket,
}));

import {
  AdoptedActionsSection,
  MeetingActionResponseCard,
  ParticipantCapabilities,
  PriorActionsSection,
} from "./MeetingActionCards";

const work = (over: Partial<HumanInboxMeetingAction> = {}): HumanInboxMeetingAction => ({
  ticketId: "rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  meetingId: "mtg-001",
  deliverable: "Licensed observations",
  requestedMaterial: "Licensed observations",
  acceptanceCriterion: "Readable owner artifact",
  missingInput: "Need licensed observations",
  reason: "Need licensed observations",
  responseAction: "submit",
  nextTransition: "submit",
  revision: 3,
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
    mocks.getTicket.mockReset();
    mocks.getTicket.mockResolvedValue({ state: "unavailable", reason: "not_mocked" });
    await i18n.changeLanguage("en-US");
  });
  afterEach(cleanup);

  it.each(["degraded", "partial", "unknown"])("does not claim an empty history for %s reads", (status) => {
    const read = normalizePriorActions([], { status, reason: "research_owner_timeout" });
    wrap(<PriorActionsSection read={read} />);
    expect(screen.getByTestId("meeting-prior-actions-degraded")).toHaveTextContent("research_owner_timeout");
    expect(screen.queryByTestId("meeting-prior-actions-empty")).toBeNull();
  });

  it("keeps empty partial pages and conflicting source statuses incomplete", () => {
    const read = normalizePriorActions([], { status: "ok" }, { status: "partial", has_more: true });
    wrap(<PriorActionsSection read={read} />);
    expect(screen.getByTestId("meeting-prior-actions-degraded")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-prior-actions-has-more")).toBeInTheDocument();
    expect(screen.queryByTestId("meeting-prior-actions-empty")).toBeNull();
  });

  it.each(["/management/artifacts/artifact-shared", "https://evidence.example.test/result"])(
    "uses the same evidence authority in meeting and inbox for %s", (href) => {
      const refs = [{ kind: "research_artifact", artifact_id: href }];
      const meeting = normalizeMeetingAction({ ticket_id: "tkt-shared", evidence_refs: refs })!;
      const inbox = adaptHumanInboxList({ items: [{ kind: "meeting_action", id: "meeting_action:tkt-shared", ticket_id: "tkt-shared", evidence_refs: refs }] })!;
      expect(meeting.evidence_items?.[0].href).toBe(href);
      expect(inbox[0].meetingAction?.evidenceRefs?.[0].href).toBe(href);
    },
  );

  it("normalizes canonical M/R/B action fields: waiting_for_input, typed evidence_refs, nested downstream, live_owner_status, and dispatch_pending without ticket_id", () => {
    const submitted = normalizeMeetingAction({
      ticket_id: "rt-action-1",
      action_id: "rt-action-1",
      action_state: "waiting_for_input",
      owner: "persona-alpha",
      meeting_action: {
        meeting_id: "mtg-001",
        assignee_kind: "persona",
        deliverable: "Licensed observations",
        acceptance_criterion: "Readable owner artifact",
        due_at: "2026-11-22T00:00:00Z",
        next_review: "W48-MT1",
      },
      evidence_refs: [
        { kind: "research_artifact", artifact_id: "artifact-real", checksum: "c1" },
        { kind: "research_note", artifact_id: "note-action-1", checksum: "c2" },
      ],
      review_decision: { decision: "return", reason: "Missing observation dates" },
      input_request: { reason: "Need licensed observations", human_actor_id: "op-inbox" },
      live_owner_status: { status: "ok", action_state: "submitted" },
      downstream: {
        target: "research_tickets",
        id: "rt-action-1",
        href: "/api/v1/research/tickets/rt-action-1",
      },
      revision: 3,
    })!;
    expect(submitted.state).toBe("waiting_for_input");
    expect(submitted.executed).toBe(true);
    expect(submitted.owner_label).toBe("persona-alpha");
    expect(submitted.deliverable).toBe("Licensed observations");
    expect(submitted.acceptance_criterion).toBe("Readable owner artifact");
    expect(submitted.review_reason).toBe("Missing observation dates");
    expect(submitted.missing_input).toBe("Need licensed observations");
    expect(submitted.live_owner_status?.state).toBe("submitted");
    expect(submitted.ticket_api_href).toBe("/api/v1/research/tickets/rt-action-1");
    expect(submitted.evidence_items).toEqual([
      {
        id: "artifact-real",
        kind: "research_artifact",
        checksum: "c1",
        href: "/management/artifacts/artifact-real",
      },
      {
        id: "note-action-1",
        kind: "research_note",
        checksum: "c2",
        href: null,
      },
    ]);

    const pending = normalizeMeetingAction({
      source_action_id: "chair-action-2",
      assignee: "operator",
      assignee_kind: "human",
      deliverable: "External license doc",
      acceptance_criterion: "Signed PDF",
      state: "dispatch_pending",
      dispatch_error: "research_owner_http_503",
    })!;
    expect(pending.action_id).toBe("chair-action-2");
    expect(pending.ticket_id).toBeNull();
    expect(pending.ticket_href).toBeNull();
    expect(pending.state).toBe("dispatch_pending");
    expect(pending.dispatch_error).toBe("research_owner_http_503");
    expect(pending.executed).toBe(false);
    expect(normalizeMeetingAction({})).toBeNull();
  });

  it("keeps unavailable, forbidden, partial/degraded, and empty prior actions distinct even when prior_actions is an empty array", () => {
    expect(
      normalizePriorActions([], { status: "unavailable", reason: "research_owner_unavailable" }),
    ).toEqual({
      state: "unavailable",
      reason: "research_owner_unavailable",
    });
    expect(
      normalizePriorActions([], undefined, {
        status: "unavailable",
        reason: "research_owner_http_503",
        pages: {},
      }),
    ).toEqual({
      state: "unavailable",
      reason: "research_owner_http_503",
    });
    expect(
      normalizePriorActions([], { status: "denied", reason: "research_owner_http_403" }),
    ).toEqual({
      state: "forbidden",
      reason: "research_owner_http_403",
    });
    expect(
      normalizePriorActions([], {
        status: "not_recorded",
        reason: "meeting_actions_not_recorded",
      }),
    ).toEqual({
      state: "ok",
      items: [],
    });
    expect(normalizePriorActions({ status: "unavailable", reason: "owner_down" })).toEqual({
      state: "unavailable",
      reason: "owner_down",
    });
    expect(normalizePriorActions({ status: "forbidden" })?.state).toBe("forbidden");
    expect(normalizePriorActions([])).toEqual({ state: "ok", items: [] });
    expect(normalizePriorActions(undefined)).toBeUndefined();
  });

  it("never shows 'none' when prior actions are unavailable", () => {
    wrap(<PriorActionsSection read={{ state: "unavailable", reason: "x" }} />);
    expect(screen.getByTestId("meeting-prior-actions-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("meeting-prior-actions-empty")).toBeNull();
  });

  it("renders owner, deliverable, typed evidence navigation links, review reason, live owner status, and dispatch_pending without fake ticket link", () => {
    const a = normalizeMeetingAction({
      ticket_id: "rt-9",
      state: "submitted",
      assignee_label: "Alice",
      deliverable: "Fee report",
      due_at: "2026-11-30T00:00:00Z",
      evidence_refs: [
        { kind: "research_artifact", artifact_id: "artifact-fee-1", checksum: "sha1" },
        { kind: "research_note", artifact_id: "note-action-fee-1", checksum: "sha2" },
      ],
      review_decision: { decision: "return", reason: "Needs sources" },
      live_owner_status: { status: "ok", action_state: "accepted" },
    })!;
    const pending = normalizeMeetingAction({
      source_action_id: "chair-pending-1",
      assignee: "operator",
      deliverable: "Pending dispatch work",
      state: "dispatch_pending",
      dispatch_error: "research_owner_http_503",
    })!;
    wrap(<PriorActionsSection read={{ state: "ok", items: [a, pending] }} />);
    expect(screen.getAllByTestId("meeting-action-owner")[0]).toHaveTextContent("Alice");
    expect(screen.getAllByTestId("meeting-action-result")[0]).toHaveTextContent(/not accepted yet/i);
    expect(screen.getAllByTestId("meeting-action-result")[1]).toHaveTextContent(/dispatch pending/i);
    const links = screen.getByTestId("meeting-action-evidence").querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/management/artifacts/artifact-fee-1");
    expect(screen.getByTestId("meeting-action-evidence")).toHaveTextContent("note-action-fee-1");
    expect(screen.getByText("Needs sources")).toBeInTheDocument();
    expect(screen.getByTestId("meeting-action-live-status")).toHaveTextContent("Accepted");
    expect(screen.getByTestId("meeting-action-dispatch-error")).toHaveTextContent(
      /research_owner_http_503/,
    );
    expect(
      screen.getByTestId("meeting-action-chair-pending-1").querySelector("a"),
    ).toBeNull();
  });

  it("shows the chair's reason when no task was adopted and distinguishes a decision to retain the pool in en-US and zh-TW", async () => {
    wrap(<AdoptedActionsSection actions={[]} noActionReason="Pool retained" />);
    expect(screen.getByTestId("meeting-adopted-actions-empty")).toHaveTextContent("Pool retained");
    cleanup();
    wrap(
      <AdoptedActionsSection
        actions={[]}
        decisionKind="retain_pool"
        noActionReason="Current pool Sharpe meets target"
      />,
    );
    expect(screen.getByTestId("meeting-retain-pool-decision")).toHaveTextContent(
      "Chair decision to retain current strategy pool: Current pool Sharpe meets target",
    );
    cleanup();
    await i18n.changeLanguage("zh-TW");
    wrap(<AdoptedActionsSection actions={[]} />);
    expect(screen.getByTestId("meeting-adopted-actions-empty")).toHaveTextContent("沒有記錄採納的工作");
  });

  it("translates real capability status rows (restricted_data, advisory_only, owner_unavailable, allowed) without leaking persona ids in anonymised rounds", async () => {
    const items = [
      {
        label: "P1",
        persona_id: "persona-secret-1",
        persona_display_name: "Alpha Secret",
        status: "restricted_data",
        reason: "deliverable_data_not_accessible",
        can_receive_persona_action: false,
        limits: [],
      },
      {
        label: "P2",
        persona_id: "persona-secret-2",
        status: "advisory_only",
        reason: "persona_not_enrolled_for_daily_execution",
        can_receive_persona_action: false,
        limits: [],
      },
      {
        label: "P3",
        persona_id: "persona-secret-3",
        status: "owner_unavailable",
        reason: "capability_owner_unavailable",
        can_receive_persona_action: false,
        limits: [],
      },
      {
        label: "P4",
        persona_id: "persona-secret-4",
        status: "allowed",
        reason: "owner_access_and_daily_workflow_verified",
        can_receive_persona_action: true,
        allowed_deliverables: ["research_note"],
        limits: [],
      },
    ];
    wrap(<ParticipantCapabilities items={items} revealed={false} />);
    const capSection = screen.getByTestId("meeting-capabilities");
    expect(capSection).not.toHaveTextContent("persona-secret-1");
    expect(capSection).not.toHaveTextContent("Alpha Secret");
    expect(capSection).not.toHaveTextContent("No limits recorded");
    expect(capSection).toHaveTextContent(/Restricted data/);
    expect(capSection).toHaveTextContent(/Advisory only/);
    expect(capSection).toHaveTextContent(/Capability owner unavailable/);
    expect(capSection).toHaveTextContent(/Can execute assigned research in the daily cycle/);
    expect(capSection).toHaveTextContent(/research_note/);
    cleanup();
    wrap(<ParticipantCapabilities items={items} revealed />);
    expect(screen.getByTestId("meeting-capabilities")).toHaveTextContent("persona-secret-1");
    expect(screen.getByTestId("meeting-capabilities")).toHaveTextContent("Alpha Secret");
  });

  it("validates fields before any write", async () => {
    expect(
      validateMeetingActionResponse({
        ticketId: "t",
        transition: "submit",
        evidenceNote: { title: "", body: "" },
      }),
    ).toBe("note_required");
    expect(
      validateMeetingActionResponse({
        ticketId: "t",
        transition: "nope",
        evidenceNote: { title: "a", body: "b" },
      }),
    ).toBe("transition");
    wrap(<MeetingActionResponseCard work={work()} meetingHref="/management/meetings/mtg-001" />);
    fireEvent.click(screen.getByTestId("inbox-meeting-action-submit"));
    expect(await screen.findByTestId("inbox-meeting-action-error")).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(screen.getByTestId("inbox-meeting-action-meeting-link")).toHaveAttribute(
      "href",
      "/management/meetings/mtg-001",
    );
  });

  it("keeps typed text on failure, retries with the same idempotency key, then reads canonical ticket GET with evidence_notes body", async () => {
    const ticketId = "rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    mocks.submit
      .mockResolvedValueOnce({ state: "unavailable", reason: "timeout" })
      .mockResolvedValueOnce({
        state: "ok",
        action: normalizeMeetingAction({
          ticket_id: ticketId,
          action_state: "submitted",
          revision: 4,
          required_actor: "chair-reviewer",
        }),
        replayed: false,
      });
    mocks.getTicket.mockResolvedValueOnce({
      state: "ok",
      data: normalizeMeetingAction({
        ticket_id: ticketId,
        action_state: "submitted",
        revision: 4,
        required_actor: "chair-reviewer",
        evidence_refs: [{ kind: "research_note", artifact_id: "note-action-owner-issued" }],
        evidence_notes: [
          {
            note_id: "note-action-owner-issued",
            title: "Fees",
            body: "Attached schedule from canonical GET readback",
            source_refs: [],
          },
        ],
      })!,
    });
    const onSaved = vi.fn();
    wrap(<MeetingActionResponseCard work={work()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Evidence title"), { target: { value: "Fees" } });
    fireEvent.change(screen.getByLabelText("Details"), {
      target: { value: "Attached schedule" },
    });
    fireEvent.click(screen.getByTestId("inbox-meeting-action-submit"));
    expect(await screen.findByTestId("inbox-meeting-action-error")).toHaveTextContent(/timeout/);
    expect(screen.getByLabelText("Details")).toHaveValue("Attached schedule");
    fireEvent.click(screen.getByTestId("inbox-meeting-action-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("inbox-meeting-action-saved")).toBeInTheDocument(),
    );
    expect(mocks.submit).toHaveBeenCalledTimes(2);
    expect(mocks.submit.mock.calls[0][1]).toBe(mocks.submit.mock.calls[1][1]);
    expect(mocks.submit.mock.calls[1][0]).toMatchObject({
      ticketId,
      transition: "submit",
      revision: 3,
    });
    expect(mocks.getTicket).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("inbox-meeting-action-continuation")).toHaveTextContent(ticketId);
    expect(screen.getByTestId("inbox-meeting-action-notes")).toHaveTextContent(
      "Attached schedule from canonical GET readback",
    );
    expect(screen.getByTestId("inbox-meeting-action-next-actor")).toHaveTextContent(
      "chair-reviewer",
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("consumes verbatim BFF _human_input_ticket_items fields (response_action, can_respond, resumes_with, human_requirement, requested_material) for both Persona provide_input and direct human submit", async () => {
    mocks.submit.mockResolvedValue({ state: "ok", action: null, replayed: false });
    const verbatimBffPayload = {
      data: {
        id: "human_inbox",
        items: [
          {
            id: "meeting_action:rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            inbox_id: "meeting_action:rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            item_id: "rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            kind: "meeting_action",
            inboxType: "meeting",
            inbox_type: "meeting",
            source_type: "meeting",
            source_dataset: "research_tickets",
            source_id: "rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            action_id: "rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            ticket_id: "rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            meeting_id: "mtg-001",
            title: "Supply scoped research result",
            summary: "Include observation dates",
            reason: "Include observation dates",
            human_requirement: "Only the account holder can supply licensed observations",
            requested_material: "Licensed observations",
            acceptance_criterion: "Readable owner artifact",
            owner: "op-inbox",
            assignee: "op-inbox",
            assignee_kind: "human",
            response_action: "submit",
            can_respond: true,
            resumes_with: "chair-reviewer",
            reviewer_id: "chair-reviewer",
            review_decision: { decision: "return", reason: "Include observation dates" },
            evidence_refs: [{ kind: "research_artifact", artifact_id: "old-result" }],
            required_actor: "op-inbox",
            input_request: {},
            status: "returned",
            action_state: "pending",
            owner_status: "in_progress",
            revision: 5,
            due_at: "2026-11-22T00:00:00Z",
            next_review: "W48-MT1",
            overdue: true,
            created_at: "2026-11-21T01:00:00Z",
            updated_at: "2026-11-23T01:00:00Z",
            priority: "medium",
            risk_level: "medium",
            can_decide: false,
            can_proceed: false,
            href: "/management/meetings/mtg-001?action=rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            route: "/management/meetings/mtg-001?action=rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            detail_href:
              "/management/meetings/mtg-001?action=rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            links: {
              meeting:
                "/management/meetings/mtg-001?action=rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              manageHref:
                "/management/meetings/mtg-001?action=rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              primaryObjectHref:
                "/management/meetings/mtg-001?action=rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              ticket: "/api/v1/research/tickets/rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
          },
        ],
      },
    };
    const adapted = adaptHumanInboxList(verbatimBffPayload)!;
    expect(adapted).toHaveLength(1);
    const ma = adapted[0].meetingAction!;
    expect(ma.responseAction).toBe("submit");
    expect(ma.canRespond).toBe(true);
    expect(ma.resumesWith).toBe("chair-reviewer");
    expect(ma.humanRequirement).toBe(
      "Only the account holder can supply licensed observations",
    );
    expect(ma.reason).toBe("Include observation dates");
    expect(ma.requestedMaterial).toBe("Licensed observations");
    expect(ma.revision).toBe(5);

    wrap(<MeetingActionResponseCard work={ma} />);
    expect(screen.getByTestId("inbox-meeting-action-missing")).toHaveTextContent(
      "Include observation dates",
    );
    expect(screen.getByTestId("inbox-meeting-action-human-requirement")).toHaveTextContent(
      "Only the account holder can supply licensed observations",
    );
    expect(screen.getByTestId("inbox-meeting-action-deliverable")).toHaveTextContent(
      "Licensed observations",
    );
    expect(screen.getByTestId("inbox-meeting-action-resumes")).toHaveTextContent("chair-reviewer");
    expect(
      screen.getByTestId("inbox-meeting-action-evidence").querySelector("a"),
    ).toHaveAttribute("href", "/management/artifacts/old-result");
    fireEvent.change(screen.getByLabelText("Evidence title"), {
      target: { value: "Corrected observations" },
    });
    fireEvent.change(screen.getByLabelText("Details"), {
      target: { value: "Added 2026-11-22 observation dates" },
    });
    fireEvent.click(screen.getByTestId("inbox-meeting-action-submit"));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({
      ticketId: "rt-action-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      transition: "submit",
      revision: 5,
    });
  });

  it("renders view-only without a form when the source denies response (can_respond=false)", () => {
    wrap(<MeetingActionResponseCard work={work({ canRespond: false })} />);
    expect(screen.getByTestId("inbox-meeting-action-view-only")).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-meeting-action-form")).toBeNull();
  });

  it("returns no link for note- ids while keeping artifact, meeting, and evidence targets and rendering note title or id as text", () => {
    expect(resolveMeetingActionEvidenceHref("research_note", "note-action-1")).toBeNull();
    expect(resolveMeetingActionEvidenceHref(null, "note-fee-2026", "note-fee-2026")).toBeNull();
    expect(
      resolveMeetingActionEvidenceHref("research_artifact", "artifact-persona-paper-a81b4fd15944698341aa"),
    ).toBe("/management/artifacts/artifact-persona-paper-a81b4fd15944698341aa");
    expect(resolveMeetingActionEvidenceHref(null, "rart-20260615-001")).toBe(
      "/management/artifacts/rart-20260615-001",
    );
    expect(resolveMeetingActionEvidenceHref("meeting", "mtg-6edaff7d0ff76275")).toBe(
      "/management/meetings/mtg-6edaff7d0ff76275",
    );
    expect(
      resolveMeetingActionEvidenceHref(
        null,
        "mtg-6edaff7d0ff76275",
        "/management/meetings/mtg-6edaff7d0ff76275",
      ),
    ).toBe("/management/meetings/mtg-6edaff7d0ff76275");
    expect(resolveMeetingActionEvidenceHref(null, "evi-1217cd1c8ccc7274")).toBe(
      "/management/evidence?ref_id=evi-1217cd1c8ccc7274",
    );
    expect(resolveMeetingActionEvidenceHref(null, "evref-rart-20260615-002")).toBe(
      "/management/evidence?ref_id=evref-rart-20260615-002",
    );

    const action = normalizeMeetingAction({
      ticket_id: "rt-action-mixed-targets",
      state: "submitted",
      assignee_label: "澄川",
      deliverable: "Cross-target evidence check",
      evidence_refs: [
        { kind: "research_note", artifact_id: "note-fee-2026" },
        { kind: "research_artifact", artifact_id: "artifact-persona-paper-a81b4fd15944698341aa" },
        { kind: "meeting", artifact_id: "mtg-6edaff7d0ff76275" },
        { kind: "evidence_item", artifact_id: "evi-1217cd1c8ccc7274" },
      ],
      evidence_notes: [
        {
          note_id: "note-fee-2026",
          title: "Exchange fee schedule review note",
          body: "Verified tiered maker/taker schedule for 2026.",
          source_refs: ["artifact-persona-paper-a81b4fd15944698341aa"],
        },
      ],
    })!;

    wrap(<PriorActionsSection read={{ state: "ok", items: [action] }} />);
    const evidenceList = screen.getByTestId("meeting-action-evidence");
    expect(evidenceList).toHaveTextContent("note-fee-2026");
    expect(screen.queryByRole("link", { name: "note-fee-2026" })).toBeNull();
    expect(screen.getByTestId("meeting-action-evidence-notes")).toHaveTextContent(
      "Exchange fee schedule review note",
    );
    expect(
      screen.getByRole("link", { name: "artifact-persona-paper-a81b4fd15944698341aa" }),
    ).toHaveAttribute("href", "/management/artifacts/artifact-persona-paper-a81b4fd15944698341aa");
    expect(screen.getByRole("link", { name: "mtg-6edaff7d0ff76275" })).toHaveAttribute(
      "href",
      "/management/meetings/mtg-6edaff7d0ff76275",
    );
    expect(screen.getByRole("link", { name: "evi-1217cd1c8ccc7274" })).toHaveAttribute(
      "href",
      "/management/evidence?ref_id=evi-1217cd1c8ccc7274",
    );
  });
});
