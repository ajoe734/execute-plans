import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import "@/i18n";
import { setMockResolver, type MockHandler } from "@/lib/bff-v1/client";
import { makeBffError } from "@/lib/bff-v1/errors";
import { panelView } from "@/management/components/case-file/__tests__/fixtures";
import { CommitteePage } from "./CommitteePage";
import { MemoryReviewPage } from "./MemoryReviewPage";
import { PersonaLabPage } from "./PersonaLabPage";
import { FeedbackPage } from "./FeedbackPage";

const access = vi.hoisted(() => ({ value: { loading: false, writeAllowed: true, writeDisabledReason: null as string | null } }));
vi.mock("@/agora/useAgoraWriteAccess", () => ({ useAgoraWriteAccess: () => access.value }));

type Route = { method: string; path: string; handler: MockHandler };
let routes: Route[] = [];
let calls: Array<{ method: string; path: string; body: unknown; headers: Record<string, string> }> = [];

const json = (body: unknown, status = 200) => ({ kind: "json" as const, status, body });
function on(method: string, path: string, handler: MockHandler | unknown) {
  routes.push({ method, path, handler: typeof handler === "function" ? (handler as MockHandler) : () => json(handler) });
}

beforeEach(() => {
  routes = [];
  calls = [];
  access.value = { loading: false, writeAllowed: true, writeDisabledReason: null };
  setMockResolver((method, path) => {
    const hit = routes.find((r) => r.method === method && r.path === path);
    if (!hit) return undefined;
    return async (req) => {
      calls.push({ method, path, body: req.body, headers: req.headers });
      // Real reads are not instant: a refresh must not tear down mounted receipts.
      if (method === "GET") await new Promise((resolve) => setTimeout(resolve, 50));
      return hit.handler(req);
    };
  });
});
afterEach(() => {
  cleanup();
  setMockResolver(undefined);
});

const renderAt = (ui: React.ReactElement, url = "/") => render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

// Shapes mirror the restored BFF routers (committee/owner.envelope, AgoraEnvelope).
const ownerEnvelope = (owner: string, data: unknown) => ({
  status: "ok", reason: null, owner, data, fallback_used: false, environment_ceiling: "paper", execution_authority: "none",
});
const labEnvelope = (data: unknown) => ({ data, meta: { snapshot_at: "2026-11-13T03:00:00Z", capability: "agora.persona_lab.v1", audience: "tenant:t1:user:u1" } });

describe("committee page", () => {
  const session = { request_id: "req-1", tenant_id: "t1", consultation_type: "persona_panel", status: "open" };
  const memo = { memo_id: "memo-1", request_id: "req-1", status: "draft", summary: "risk persona opposes" };

  it("shows sessions, memos and the owner receipt after publish", async () => {
    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [session]));
    let published = false;
    on("GET", "/bff/agora/committee/sessions/req-1/memos", () => json(ownerEnvelope("consultation", [{ ...memo, status: published ? "published" : "draft" }])));
    on("POST", "/bff/agora/committee/sessions/req-1/memos/memo-1/publish", () => {
      published = true;
      return json(ownerEnvelope("consultation", { ...memo, status: "published", published_at: "2026-11-13T03:10:00Z" }));
    });
    renderAt(<CommitteePage />);
    fireEvent.click(await screen.findByText("req-1"));
    fireEvent.click(await screen.findByRole("button", { name: /發布備忘錄|Publish memo/ }));
    const receipt = await screen.findByTestId("learning-receipt");
    expect(receipt.textContent).toContain('"status": "published"');
    expect(receipt.textContent).toContain("2026-11-13T03:10:00Z");
    expect(calls.find((c) => c.method === "POST")?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("shows the memo's case file, claim citations and rejected-contribution reason", async () => {
    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [session]));
    on("GET", "/bff/agora/committee/sessions/req-1/memos", ownerEnvelope("consultation", [{ ...memo, case_file_view: panelView }]));
    renderAt(<CommitteePage />);
    fireEvent.click(await screen.findByText("req-1"));
    const view = await screen.findByTestId("memo-memo-1-case-file");
    expect(view.textContent).toContain("similar drawdown in Q3");
    expect(screen.getByTestId("memo-memo-1-case-file-contribution-0-claim-0-cite-lessons:1")).toBeInTheDocument();
    expect(screen.getByTestId("memo-memo-1-case-file-rejected-0-reason").textContent).toBe("claim_uncited");
  });

  it("shows the recorded reason when a memo's case file is unavailable", async () => {
    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [session]));
    on("GET", "/bff/agora/committee/sessions/req-1/memos", ownerEnvelope("consultation", [{ ...memo, case_file_view: { status: "unavailable", reason: "no_case_file_recorded", case_file: null } }]));
    renderAt(<CommitteePage />);
    fireEvent.click(await screen.findByText("req-1"));
    expect((await screen.findByTestId("memo-memo-1-case-file-unavailable-reason")).textContent).toContain("no_case_file_recorded");
  });

  it("shows an empty owner as unavailable with the recorded reason, never as an empty list", async () => {
    on("GET", "/bff/agora/committee/sessions", { ...ownerEnvelope("consultation", []), status: "unavailable", reason: "no_persona_panels" });
    renderAt(<CommitteePage />);
    const note = await screen.findByTestId("learning-unavailable");
    expect(note.textContent).toContain("no_persona_panels");
    expect(note.textContent).toContain("consultation");
    expect(screen.queryByTestId("committee-sessions")).toBeNull();
  });

  it("surfaces the owner's failure reason from an HTTP 503 detail", async () => {
    on("GET", "/bff/agora/committee/sessions", () => ({
      kind: "error",
      error: makeBffError({ code: "UNKNOWN_ERROR", cause: "consultation_service_credential_unconfigured" }),
    }));
    renderAt(<CommitteePage />);
    expect((await screen.findByTestId("learning-unavailable")).textContent).toContain("consultation_service_credential_unconfigured");
  });

  it("disables publish when the session cannot write", async () => {
    access.value = { loading: false, writeAllowed: false, writeDisabledReason: "read-only session" };
    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [session]));
    on("GET", "/bff/agora/committee/sessions/req-1/memos", ownerEnvelope("consultation", [memo]));
    renderAt(<CommitteePage />);
    fireEvent.click(await screen.findByText("req-1"));
    expect((await screen.findByRole("button", { name: /發布備忘錄|Publish memo/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("learning-write-disabled").textContent).toContain("read-only session");
  });

  const gatePanelWithRounds = {
    request_id: "panel-gate-1",
    session_id: "panel-gate-1",
    tenant_id: "tenant-a",
    consultation_type: "persona_panel",
    session_class: "gate_panel",
    target_type: "trial_admission",
    target_id: "cand-1",
    status: "published",
    round: 1,
    rounds: [
      {
        round: 1,
        mode: "independent",
        positions: [
          {
            label: "risk_officer",
            persona_id: "persona-risk-officer",
            role: "risk_officer",
            style: "independent_gate_panel",
            stance: "approve",
            confidence: null,
            citations: ["artifact://risk-check-1"],
            changed: false,
          },
        ],
      },
    ],
  };

  const deliberativeMeeting = {
    session_id: "mtg-delib-1",
    meeting_id: "mtg-delib-1",
    request_id: "mtg-delib-1",
    meeting_type: "MT-3",
    consultation_type: "persona_meeting",
    session_class: "deliberative_meeting",
    status: "closed",
    outcome: "completed",
    chair_persona_id: "persona-inst-1",
    convened_by: { kind: "agora_user", id: "alice" },
    subject_ref: "strat-alpha",
    participants: [
      { persona_id: "persona-inst-1", role: "chair", origin: "institutional" },
      { persona_id: "persona-advisor-1", role: "advisor", origin: "agora_advisor" },
      {
        persona_id: "agora-servant-alice",
        role: "servant",
        origin: "private_servant",
        agora_user_id: "alice",
      },
    ],
    round: 2,
    agenda: "Turn volatility regime findings into testable ideas",
    case_file_items: [
      {
        item_id: "cf-shared-1",
        kind: "research_finding",
        excerpt: "Intraday range expansion precedes trend continuation.",
        relevance_scope: "committee",
      },
      {
        item_id: "cf-private-leak",
        kind: "private_memory",
        excerpt: "SECRET_PRIVATE_MEMORY_NEVER_RETURN",
        relevance_scope: "persona_private",
      },
    ],
    rounds: [
      {
        round: 1,
        positions: [
          {
            label: "chair_trend",
            persona_id: "persona-inst-1",
            role: "chair",
            style: "trend",
            stance: "support",
            confidence: 0.84,
            citations: ["cf-shared-1"],
            changed: false,
          },
          {
            label: "advisor_macro",
            persona_id: "persona-advisor-1",
            role: "advisor",
            style: "macro",
            stance: "support",
            confidence: 0.78,
            citations: ["cf-shared-1"],
            changed: false,
          },
          {
            label: "servant_operator_guided",
            persona_id: "agora-servant-alice",
            role: "servant",
            style: "operator-guided",
            stance: "conditional",
            confidence: 0.71,
            citations: ["cf-shared-1"],
            changed: false,
          },
        ],
      },
      {
        round: 2,
        positions: [
          {
            label: "chair_trend",
            persona_id: "persona-inst-1",
            role: "chair",
            style: "trend",
            stance: "support",
            confidence: 0.86,
            citations: ["cf-shared-1"],
            changed: false,
          },
          {
            label: "advisor_macro",
            persona_id: "persona-advisor-1",
            role: "advisor",
            style: "macro",
            stance: "support",
            confidence: 0.8,
            citations: ["cf-shared-1"],
            changed: false,
          },
          {
            label: "servant_operator_guided",
            persona_id: "agora-servant-alice",
            role: "servant",
            style: "operator-guided",
            stance: "support",
            confidence: 0.79,
            citations: ["cf-shared-1"],
            changed: true,
          },
        ],
      },
    ],
    synthesis: {
      proposals: [
        {
          proposal_id: "prop-sponsored-1",
          meeting_id: "mtg-delib-1",
          kind: "research_demand",
          sponsor_persona_id: "persona-inst-1",
          approval_path: "governed_owner_entry_point",
          payload: { title: "Sponsored volatility demand", proposed_value: { window: 20 } },
          citations: ["cf-shared-1"],
          downstream: { target: "research_demand", id: "rd-101", status: "open" },
          execution_authority: "none",
        },
        {
          proposal_id: "prop-unsponsored-1",
          meeting_id: "mtg-delib-1",
          kind: "agora_candidate_decision",
          sponsor_persona_id: null,
          approval_path: "agora_candidate_decision",
          payload: {
            measure_type: "strategy_parameter_change",
            target: { kind: "strategy", id: "strat-alpha", version: "spec-v1", path: "entry.volatility_threshold" },
            current_value: 1.5,
            proposed_value: 1.25,
            rationale: "Agora workshop meeting proposed tighter volatility entry threshold.",
            confidence: 0.79,
          },
          citations: ["cf-shared-1"],
          downstream: { target: "agora_candidate_decision", id: "prop-unsponsored-1", status: "draft" },
          execution_authority: "none",
        },
      ],
      tally: { support: 2.45, oppose: 0.0 },
      dissent_memo_id: "memo-dissent-1",
      outcome: "completed",
    },
    proposals: [
      {
        proposal_id: "prop-sponsored-1",
        meeting_id: "mtg-delib-1",
        kind: "research_demand",
        sponsor_persona_id: "persona-inst-1",
        approval_path: "governed_owner_entry_point",
        payload: { title: "Sponsored volatility demand", proposed_value: { window: 20 } },
        citations: ["cf-shared-1"],
        downstream: { target: "research_demand", id: "rd-101", status: "open" },
        execution_authority: "none",
      },
      {
        proposal_id: "prop-unsponsored-1",
        meeting_id: "mtg-delib-1",
        kind: "agora_candidate_decision",
        sponsor_persona_id: null,
        approval_path: "agora_candidate_decision",
        payload: {
          measure_type: "strategy_parameter_change",
          target: { kind: "strategy", id: "strat-alpha", version: "spec-v1", path: "entry.volatility_threshold" },
          current_value: 1.5,
          proposed_value: 1.25,
          rationale: "Agora workshop meeting proposed tighter volatility entry threshold.",
          confidence: 0.79,
        },
        citations: ["cf-shared-1"],
        downstream: { target: "agora_candidate_decision", id: "prop-unsponsored-1", status: "draft" },
        execution_authority: "none",
      },
    ],
    private_items_withheld: 2,
    environment_ceiling: "paper",
    execution_authority: "none",
  };

  it("lists both gate panels and deliberative meetings with every round, synthesis, and dissent", async () => {
    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [gatePanelWithRounds, deliberativeMeeting]));
    on("GET", "/bff/agora/committee/sessions/panel-gate-1/memos", ownerEnvelope("consultation", [{ memo_id: "memo-gate-1", request_id: "panel-gate-1", status: "published", summary: "Drawdown bounds satisfied" }]));
    on("GET", "/bff/agora/committee/sessions/mtg-delib-1/memos", ownerEnvelope("consultation", [{ memo_id: "memo-dissent-1", request_id: "mtg-delib-1", status: "published", summary: "Red-team dissent: false breakout risk in choppy sessions" }]));

    renderAt(<CommitteePage />);

    const gateItem = await screen.findByTestId("committee-session-panel-gate-1");
    const delibItem = await screen.findByTestId("committee-session-mtg-delib-1");
    expect(gateItem.getAttribute("data-session-offsets") ?? gateItem.getAttribute("data-session-class")).toBe("gate_panel");
    expect(delibItem.getAttribute("data-session-class")).toBe("deliberative_meeting");

    // Select gate panel: shows single independent round + memos
    fireEvent.click(screen.getByText("panel-gate-1"));
    const gateRound1 = await screen.findByTestId("committee-round-1");
    expect(gateRound1.textContent).toContain("persona-risk-officer");
    expect(gateRound1.textContent).toContain("approve");
    expect(gateRound1.textContent).toContain("artifact://risk-check-1");
    expect((await screen.findByTestId("memo-memo-gate-1")).textContent).toContain("Drawdown bounds satisfied");

    // Filter to deliberative meetings only, then back to all
    fireEvent.click(screen.getByTestId("committee-filter-deliberative_meeting"));
    expect(screen.queryByTestId("committee-session-panel-gate-1")).toBeNull();
    expect(screen.getByTestId("committee-session-mtg-delib-1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("committee-filter-all"));

    // Select deliberative meeting: shows participants, Round 1, Round 2, synthesis, tally, and dissent
    fireEvent.click(screen.getByText("mtg-delib-1"));
    const detail = await screen.findByTestId("committee-deliberative-detail");
    expect(detail.textContent).not.toContain("SECRET_PRIVATE_MEMORY_NEVER_RETURN");
    expect(screen.getByTestId("committee-participant-agora-servant-alice").textContent).toMatch(/Private servant|私人交易僕人/);
    expect(screen.getByTestId("committee-private-withheld").textContent).toContain("2");

    const round1 = screen.getByTestId("committee-round-1");
    const round2 = screen.getByTestId("committee-round-2");
    expect(round1.textContent).toContain("chair_trend");
    expect(round1.textContent).toContain("0.84");
    expect(round1.textContent).toContain("servant_operator_guided");
    expect(round1.textContent).toContain("conditional");

    expect(round2.textContent).toContain("0.86");
    expect(round2.textContent).toContain("0.79");
    expect(screen.getByTestId("committee-round-2-position-2-changed")).toBeInTheDocument();

    const synthesis = screen.getByTestId("committee-synthesis");
    expect(synthesis.textContent).toContain("persona-inst-1");
    expect(synthesis.textContent).toContain("completed");
    expect(screen.getByTestId("committee-synthesis-tally").textContent).toContain("2.45");

    const dissent = screen.getByTestId("committee-dissent");
    expect(within(dissent).getByTestId("committee-dissent-memo-id").textContent).toBe("memo-dissent-1");
    expect((await within(dissent).findByTestId("dissent-memo-memo-dissent-1")).textContent).toContain(
      "Red-team dissent: false breakout risk in choppy sessions",
    );
  });

  it("shows proposals without a trading-persona sponsor as Agora candidate decisions with their approval status and routes them on the existing approval path", async () => {
    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [deliberativeMeeting]));
    on("POST", "/bff/agora/meetings/mtg-delib-1/proposals/prop-unsponsored-1/candidates", () =>
      json(
        {
          data: {
            candidate: {
              proposal_id: "prop-unsponsored-1",
              meeting_id: "mtg-delib-1",
              sponsor_persona_id: null,
              state: "review_requested",
              revision: 3,
              proposed_value: 1.25,
              execution_authority: "none",
            },
            validation_receipts: [
              {
                validation_receipt_id: "val-1",
                outcome: "passed",
                authority: "canonical_validation_service",
              },
            ],
            formal_approval_receipts: [
              {
                approval_decision_id: "approval-mtg-1",
                outcome: "rejected",
                reviewer_id: "risk-reviewer-1",
                execution_authority: "none",
              },
            ],
            execution_authority: "none",
          },
          meta: {
            snapshot_at: "2026-11-16T12:00:00Z",
            capability: "agora.persona.candidate.v1.9",
            spec_version: "1.9",
          },
        },
        201,
      ),
    );

    renderAt(<CommitteePage />);
    fireEvent.click(await screen.findByText("mtg-delib-1"));

    const sponsored = await screen.findByTestId("committee-proposal-prop-sponsored-1");
    expect(sponsored.textContent).toContain("persona-inst-1");
    expect(sponsored.textContent).toContain("governed_owner_entry_point");
    expect(screen.getByTestId("proposal-downstream-prop-sponsored-1").textContent).toContain("research_demand:rd-101 (open)");
    expect(screen.queryByTestId("agora-candidate-decision-prop-sponsored-1")).toBeNull();

    const unsponsored = screen.getByTestId("committee-proposal-prop-unsponsored-1");
    expect(screen.getByTestId("agora-candidate-decision-prop-unsponsored-1").textContent).toMatch(
      /Agora candidate decision|Agora 候選決策/,
    );
    expect(screen.getByTestId("candidate-approval-status-prop-unsponsored-1").textContent).toContain("draft");
    expect(unsponsored.textContent).toContain("agora_candidate_decision");
    expect(unsponsored.textContent).toContain("execution_authority");

    fireEvent.click(screen.getByTestId("route-candidate-decision-prop-unsponsored-1"));

    const receipt = await screen.findByTestId("learning-receipt");
    expect(receipt.textContent).toContain('"proposal_id": "prop-unsponsored-1"');
    expect(receipt.textContent).toContain('"execution_authority": "none"');
    expect(screen.getByTestId("candidate-approval-status-prop-unsponsored-1").textContent).toContain("rejected");
    expect(screen.getByTestId("candidate-approval-status-prop-unsponsored-1").textContent).toContain("state=review_requested");
    expect(screen.getByTestId("candidate-approval-status-prop-unsponsored-1").textContent).toContain("validation=passed");

    const postCall = calls.find((c) => c.method === "POST" && c.path === "/bff/agora/meetings/mtg-delib-1/proposals/prop-unsponsored-1/candidates");
    expect(postCall).toBeTruthy();
    expect(postCall?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("surfaces owner refusal when routing a meeting candidate decision fails", async () => {
    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [deliberativeMeeting]));
    on("POST", "/bff/agora/meetings/mtg-delib-1/proposals/prop-unsponsored-1/candidates", () =>
      json({ detail: { reason: "authoritative_approval_store_unavailable" } }, 503),
    );

    renderAt(<CommitteePage />);
    fireEvent.click(await screen.findByText("mtg-delib-1"));
    fireEvent.click(await screen.findByTestId("route-candidate-decision-prop-unsponsored-1"));

    expect((await screen.findByTestId("learning-unavailable")).textContent).toContain(
      "authoritative_approval_store_unavailable",
    );
    expect(screen.queryByTestId("learning-receipt")).toBeNull();
  });
});

describe("memory review page", () => {
  const review = {
    entries: [{ type: "persona", entry: { memory_id: "m-1", tenant_id: "t1", persona_id: "p1" } }],
    lesson_candidates: [{ lesson_candidate_id: "lc-1", persona_id: "p1", proposed_change: "avoid gap entries", review_state: "proposed", target_env: "paper" }],
    authz: { allowed: true },
  };

  it("lists entries and candidates and shows the quarantine receipt", async () => {
    on("GET", "/bff/agora/memory", ownerEnvelope("memory", review));
    on("POST", "/bff/agora/memory/lc-1/actions/quarantine", ownerEnvelope("memory", { lesson_candidate_id: "lc-1", tenant_id: "t1", review_state: "quarantined" }));
    renderAt(<MemoryReviewPage />, "/?personaId=p1");
    const candidate = await screen.findByTestId("candidate-lc-1");
    fireEvent.change(within(candidate).getByLabelText(/Reason|原因/), { target: { value: "stale" } });
    fireEvent.change(within(candidate).getByLabelText(/Audit receipt|稽核回條/), { target: { value: "aud-1" } });
    fireEvent.click(within(candidate).getByRole("button", { name: /Quarantine|隔離/ }));
    await waitFor(() => expect(screen.getByTestId("learning-receipt").textContent).toContain('"review_state": "quarantined"'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByTestId("learning-receipt").textContent).toContain('"review_state": "quarantined"');
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ reason: "stale", audit_receipt_id: "aud-1", kind: "lesson_candidate" });
    expect(post?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("shows persona_id_required as unavailable", async () => {
    on("GET", "/bff/agora/memory", { status: "unavailable", reason: "no_memory_records", owner: "memory", data: { entries: [], lesson_candidates: [] } });
    renderAt(<MemoryReviewPage />, "/?personaId=p1");
    expect((await screen.findByTestId("learning-unavailable")).textContent).toContain("no_memory_records");
  });
});

describe("persona lab page", () => {
  const harness = {
    active_version: 2,
    versions: [{ version: 2, patch_id: "patch-2" }, { version: 1, patch_id: "patch-1" }],
    patches: {
      "patch-1": { status: "adopted", proposal: { evidence_refs: ["ev-1"] }, comparisons: [] },
      "patch-2": { status: "adopted", proposal: { evidence_refs: ["ev-9", "ev-10"] }, comparisons: [{}], experience: null },
    },
  };
  const changeLog = (experience: unknown = null) => labEnvelope({
    active_version: 2,
    entries: [{ version: 2, patch_id: "patch-2", status: "adopted", evidence_refs: ["ev-9", "ev-10"], active: true, experience, operator_feedback: null, actions: ["accept", "undo", "never_again", "tell_why"] }],
  });
  const base = "/bff/agora/persona-lab/p1";

  function stubReads(log: () => unknown = () => changeLog()) {
    on("GET", `${base}/harness`, labEnvelope(harness));
    on("GET", `${base}/change-log`, () => json(log()));
    on("GET", `${base}/evaluation/suites`, labEnvelope([{ suite_id: "patch-2", runs: 1 }]));
    on("GET", `${base}/evaluation/runs`, labEnvelope([{ run_id: "patch-2:0", suite_id: "patch-2", patch_id: "patch-2", status: "complete", decision: "adopt", reasons: ["better_pnl"], criteria: null, bundle_count: 3 }]));
  }

  it("asks for a persona id instead of reading anything", () => {
    renderAt(<PersonaLabPage />);
    expect(screen.getByTestId("learning-persona-required")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("renders evidence-cited change log and evaluation runs", async () => {
    stubReads();
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const entry = await screen.findByTestId("change-patch-2");
    expect(entry.textContent).toContain("ev-9, ev-10");
    expect(await screen.findByText(/patch-2:0/)).toBeTruthy();
  });

  it("undo shows the owner receipt and refreshes the recorded effect", async () => {
    let rolledBack = false;
    stubReads(() => (rolledBack
      ? labEnvelope({ active_version: 1, entries: [{ version: 2, patch_id: "patch-2", status: "rolled_back", evidence_refs: [], active: false, experience: null, operator_feedback: null, actions: ["accept", "undo", "never_again", "tell_why"] }] })
      : changeLog()));
    on("POST", `${base}/change-log/patch-2/undo`, () => { rolledBack = true; return json(labEnvelope({ active_version: 1, rolled_back_patch_id: "patch-2" })); });
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const entry = await screen.findByTestId("change-patch-2");
    fireEvent.click(within(entry).getByRole("button", { name: /Undo|復原/ }));
    fireEvent.change(within(entry).getByRole("textbox"), { target: { value: "worse fills" } });
    fireEvent.click(within(entry).getByRole("button", { name: /Confirm|確認/ }));
    await waitFor(() => expect(screen.getByTestId("change-patch-2").textContent).toContain("rolled_back"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByTestId("change-patch-2").textContent).toContain("rolled_back");
    expect(screen.getByTestId("change-patch-2").textContent).toContain('"rolled_back_patch_id": "patch-2"');
    expect(calls.find((c) => c.path.endsWith("/undo"))?.body).toEqual({ reason: "worse fills" });
  });

  it("never-again shows the recorded negative experience on the entry", async () => {
    let recorded = false;
    stubReads(() => changeLog(recorded ? { kind: "negative", reason: "chases gaps" } : null));
    on("POST", `${base}/change-log/patch-2/never-again`, () => { recorded = true; return json(labEnvelope({ negative_experience_id: "ne-1", patch_id: "patch-2" }), 201); });
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const entry = await screen.findByTestId("change-patch-2");
    fireEvent.click(within(entry).getByRole("button", { name: /Never do this again|不要再這樣/ }));
    fireEvent.change(within(entry).getByRole("textbox"), { target: { value: "chases gaps" } });
    fireEvent.click(within(entry).getByRole("button", { name: /Confirm|確認/ }));
    expect(await screen.findByTestId("effect-experience-patch-2")).toBeTruthy();
    expect(screen.getByTestId("effect-experience-patch-2").textContent).toContain("chases gaps");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByTestId("change-patch-2").textContent).toContain("ne-1");
    expect(screen.getByTestId("effect-experience-patch-2").textContent).toContain("chases gaps");
  });

  it("an owner refusal on accept is shown as unavailable with the reason, not as success", async () => {
    stubReads();
    on("POST", `${base}/change-log/patch-2/accept`, () => ({ kind: "error", error: makeBffError({ code: "UNKNOWN_ERROR", cause: "persona_owner_service_token_unconfigured" }) }));
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const entry = await screen.findByTestId("change-patch-2");
    fireEvent.click(within(entry).getByRole("button", { name: /Accept|接受/ }));
    fireEvent.change(within(entry).getByRole("textbox"), { target: { value: "adopt-1" } });
    fireEvent.click(within(entry).getByRole("button", { name: /Confirm|確認/ }));
    await waitFor(() => expect(within(screen.getByTestId("change-patch-2")).getByTestId("learning-unavailable").textContent).toContain("persona_owner_service_token_unconfigured"));
    expect(screen.queryByTestId("learning-receipt")).toBeNull();
  });

  it("shadow comparison renders arms and a missing record as unavailable", async () => {
    stubReads();
    on("GET", `${base}/patches/patch-2/shadow-comparison`, labEnvelope({
      patch_id: "patch-2", status: "complete", decision: "adopt", reasons: [], arms: ["base", "candidate"],
      rows: [{ decision_time: "pkt-1", base: "hold", candidate: "enter", decisions_differ: true, virtual_book_delta: null }],
    }));
    on("GET", `${base}/patches/patch-9/shadow-comparison`, () => ({ kind: "error", error: makeBffError({ code: "RESOURCE_NOT_FOUND", cause: "shadow_comparison_not_recorded" }) }));
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const panel = await screen.findByTestId("lab-shadow");
    const compare = async (id: string) => {
      fireEvent.change(within(panel).getByRole("textbox"), { target: { value: id } });
      fireEvent.click(within(panel).getByRole("button", { name: /Compare|比對/ }));
    };
    await compare("patch-2");
    expect(await within(panel).findByText("enter")).toBeTruthy();
    expect(within(panel).getByText("hold")).toBeTruthy();
    await compare("patch-9");
    expect((await within(panel).findByTestId("learning-unavailable")).textContent).toContain("shadow_comparison_not_recorded");
  });

  it("skill coaching drafts post to the skill route and reject non-JSON locally", async () => {
    stubReads();
    on("POST", `${base}/skill-coaching/patches`, () => json(labEnvelope({ patch_id: "patch-3", status: "draft" }), 201));
    renderAt(<PersonaLabPage />, "/?personaId=p1");
    const form = await screen.findByTestId("skill-coaching-form");
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "not json" } });
    fireEvent.click(within(form).getByRole("button"));
    expect(within(form).getByRole("alert")).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: '{"skill":"gap-fade"}' } });
    fireEvent.click(within(form).getByRole("button"));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ skill: "gap-fade" }));
  });
});

describe("feedback page", () => {
  it("submits evidence with an idempotency key, consent and paper ceiling, and shows the receipt", async () => {
    on("GET", "/bff/agora/personas/p1/human-evidence", { status: "unavailable", reason: "no_new_human_evidence", items: [], total: 0 });
    on("POST", "/bff/agora/notes", () => json({ status: "created", idempotent: false, data: { evidence_id: "ev-x", evidence_type: "note" } }, 201));
    renderAt(<FeedbackPage />, "/?personaId=p1");
    const form = await screen.findByTestId("feedback-form-notes");
    const submit = within(form).getByRole("button") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Subject reference|對象參照/), { target: { value: "trade:42" } });
    fireEvent.change(within(form).getByLabelText(/^(Content|內容)/), { target: { value: "entry was late" } });
    fireEvent.click(within(form).getByRole("checkbox"));
    fireEvent.click(submit);
    await waitFor(() => expect(within(form).getByTestId("learning-receipt").textContent).toContain("ev-x"));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.headers["Idempotency-Key"]).toBeTruthy();
    expect(post?.body).toMatchObject({ persona_id: "p1", subject_ref: "trade:42", content: { note: "entry was late" }, consent_granted: true, environment_ceiling: "paper" });
    await waitFor(() => expect(screen.getByTestId("feedback-observed").textContent).toContain("no_new_human_evidence"));
  });

  it("surfaces consent refusal from the owner without a receipt", async () => {
    on("GET", "/bff/agora/personas/p1/human-evidence", { status: "ok", reason: null, items: [{ evidence_id: "ev-1", evidence_type: "note" }], total: 1 });
    on("POST", "/bff/agora/insights", () => ({ kind: "error", error: makeBffError({ code: "UNKNOWN_ERROR", cause: "agora_evidence_durable_owner_unconfigured" }) }));
    renderAt(<FeedbackPage />, "/?personaId=p1");
    const form = await screen.findByTestId("feedback-form-insights");
    fireEvent.change(within(form).getByLabelText(/Subject reference|對象參照/), { target: { value: "s" } });
    fireEvent.change(within(form).getByLabelText(/^(Content|內容)/), { target: { value: "c" } });
    fireEvent.click(within(form).getByRole("checkbox"));
    fireEvent.click(within(form).getByRole("button"));
    expect((await within(form).findByTestId("learning-unavailable")).textContent).toContain("agora_evidence_durable_owner_unconfigured");
    expect(await screen.findByText(/ev-1/)).toBeTruthy();
  });

  async function fillNote(form: HTMLElement, subject: string, content: string) {
    fireEvent.change(within(form).getByLabelText(/Subject reference|對象參照/), { target: { value: subject } });
    fireEvent.change(within(form).getByLabelText(/^(Content|內容)/), { target: { value: content } });
    if (!(within(form).getByRole("checkbox") as HTMLInputElement).checked) fireEvent.click(within(form).getByRole("checkbox"));
  }

  it("retries replay the exact frozen payload and key; edited content rotates both ids", async () => {
    on("GET", "/bff/agora/personas/p1/human-evidence", { status: "ok", items: [], total: 0 });
    let n = 0;
    // First attempt: owner answers 409 (digest conflict shape), then 201 on retry.
    on("POST", "/bff/agora/notes", () => (++n === 1
      ? { kind: "error", error: makeBffError({ code: "UNKNOWN_ERROR", cause: "evidence_idempotency_conflict" }) }
      : json({ status: "created", idempotent: false, data: { evidence_id: "ev-x" } }, 201)));
    renderAt(<FeedbackPage />, "/?personaId=p1");
    const form = await screen.findByTestId("feedback-form-notes");
    await fillNote(form, "trade:42", "entry was late");
    fireEvent.click(within(form).getByRole("button"));
    expect((await within(form).findByTestId("learning-unavailable")).textContent).toContain("evidence_idempotency_conflict");
    await new Promise((resolve) => setTimeout(resolve, 25)); // clock moves between attempts
    fireEvent.click(within(form).getByRole("button"));
    await within(form).findByTestId("learning-receipt");
    const [a, b] = calls.filter((c) => c.method === "POST");
    expect(b.headers["Idempotency-Key"]).toBe(a.headers["Idempotency-Key"]);
    expect(b.body).toEqual(a.body);

    await fillNote(form, "trade:42", "entry was very late");
    fireEvent.click(within(form).getByRole("button"));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(3));
    const c3 = calls.filter((c) => c.method === "POST")[2];
    expect(c3.headers["Idempotency-Key"]).not.toBe(a.headers["Idempotency-Key"]);
    expect((c3.body as { evidence_id: string }).evidence_id).not.toBe((a.body as { evidence_id: string }).evidence_id);
    expect((c3.body as { content: unknown }).content).toEqual({ note: "entry was very late" });
  });
});
