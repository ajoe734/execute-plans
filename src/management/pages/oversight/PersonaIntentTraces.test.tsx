import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { adaptPersonaIntent } from "@/lib/bff-v1/management";
import { isTranslationKeyLike } from "@/lib/enumLabels";
import { PersonaIntentTracesPage } from "./PersonaIntentTraces";

const mocks = vi.hoisted(() => ({
  useV5Live: vi.fn(),
}));

vi.mock("@/management/pages/v5/useV5Live", () => ({
  useV5Live: mocks.useV5Live,
}));

const BFF_SAMPLE_PAYLOAD = {
  data: {
    id: "management_persona_intent",
    items: [
      {
        id: "persona_trace:cycle-trade-20261120-001",
        intent_id: "persona_trace:cycle-trade-20261120-001",
        kind: "trade_intent",
        source_type: "persona_trace",
        source_id: "cycle-trade-20261120-001",
        persona_id: "persona-ee7112a829d38b9135ac",
        persona_name: "TW Momentum Alpha",
        persona_display_name: "TW Momentum Alpha",
        persona_label: "TW Momentum Alpha",
        persona_ids: ["persona-ee7112a829d38b9135ac", "persona-risk-officer"],
        persona_display_names: {
          "persona-ee7112a829d38b9135ac": "TW Momentum Alpha",
          "persona-risk-officer": "Institutional Risk Officer",
        },
        intent: "daily_cycle",
        title: "Rebalance TW semiconductor momentum basket for 2026-11-20",
        topic: "Rebalance TW semiconductor momentum basket for 2026-11-20",
        summary:
          "Rebalance TW semiconductor momentum basket for 2026-11-20 — Proposed: Increase 2330.TW weight by +2.5% and trim 2454.TW by -2.5% in paper pool v3 — Outcome: approved_for_paper_execution",
        proposed_action:
          "Increase 2330.TW weight by +2.5% and trim 2454.TW by -2.5% in paper pool v3",
        outcome: "approved_for_paper_execution",
        decision: "submit_reweight_proposal",
        tools_used: ["memory_search", "pool_virtual_book_read", "regime_state_lookup"],
        consulted_personas: [
          {
            id: "persona-risk-officer",
            persona_id: "persona-risk-officer",
            name: "Institutional Risk Officer",
            display_name: "Institutional Risk Officer",
          },
        ],
        evidence_refs: ["ev-cycle-20261120-001", "case-file-20261120-001"],
        risk_flags: ["concentration_near_cap"],
        policy_violations: [],
        status: "completed",
        occurred_at: "2026-11-20T01:05:00Z",
        withheld_fields: [
          { field: "private_memory", reason_code: "private_memory_withheld" },
          { field: "persona_interpretation", reason_code: "private_interpretation_withheld" },
        ],
        withheld_reason_codes: ["private_memory_withheld", "private_interpretation_withheld"],
        redacted: true,
        redaction: {
          is_redacted: true,
          redacted: true,
          status: "redacted",
          policy: "sd_persona_meetings_12_2_private_memory_boundary",
          reason_code: "private_memory_withheld",
          reason_codes: ["private_memory_withheld", "private_interpretation_withheld"],
          withheld_fields: [
            { field: "private_memory", reason_code: "private_memory_withheld" },
            { field: "persona_interpretation", reason_code: "private_interpretation_withheld" },
          ],
        },
      },
      {
        id: "agora_session:consult-envelope-publication-98f3c36b851627e3814268877ddb33db",
        intent_id: "agora_session:consult-envelope-publication-98f3c36b851627e3814268877ddb33db",
        kind: "consultation",
        source_type: "agora_session",
        source_id: "consult-envelope-publication-98f3c36b851627e3814268877ddb33db",
        persona_id: "persona-ee7112a829d38b9135ac",
        persona_display_name: "TW Momentum Alpha",
        intent: "persona_panel",
        title: "Risk review of paper envelope publication of pool v3 (live membership changed)",
        topic: "Risk review of paper envelope publication of pool v3 (live membership changed)",
        proposed_action: "envelope publication for pool-v3",
        outcome: "in_progress",
        decision: "in_progress",
        tools_used: ["case_file_reader", "risk_limit_verifier"],
        consulted_personas: [
          {
            id: "persona-risk-officer",
            persona_id: "persona-risk-officer",
            name: "Institutional Risk Officer",
            display_name: "Institutional Risk Officer",
          },
        ],
        evidence_refs: ["ev-consult-pool-v3"],
        risk_flags: [],
        policy_violations: [],
        status: "in_progress",
        occurred_at: "2026-11-19T10:06:11Z",
        withheld_fields: [
          { field: "private_memory", reason_code: "private_memory_withheld" },
          { field: "persona_interpretation", reason_code: "private_interpretation_withheld" },
        ],
        redacted: true,
        redaction: {
          status: "redacted",
          policy: "sd_persona_meetings_12_2_private_memory_boundary",
          reason_code: "private_memory_withheld",
        },
      },
      {
        id: "agora_session:mtg-16d42d0b44dfeab5",
        intent_id: "agora_session:mtg-16d42d0b44dfeab5",
        kind: "meeting",
        source_type: "agora_session",
        source_id: "mtg-16d42d0b44dfeab5",
        persona_id: "persona-6507750312870d03a241",
        persona_display_name: "TW Mean Reversion Beta",
        intent: "persona_meeting",
        title: "Quarterly optimisation review for mean-reversion sleeve",
        topic: "Quarterly optimisation review for mean-reversion sleeve",
        proposed_action: "Adopt 20-day volatility regime filter before mean-reversion entry",
        outcome: "propose_harness_patch",
        decision: "propose_harness_patch",
        tools_used: ["lesson_candidate_reader", "shadow_counterfactual_eval"],
        consulted_personas: [
          {
            id: "persona-ee7112a829d38b9135ac",
            persona_id: "persona-ee7112a829d38b9135ac",
            name: "TW Momentum Alpha",
            display_name: "TW Momentum Alpha",
          },
          {
            id: "persona-risk-officer",
            persona_id: "persona-risk-officer",
            name: "Institutional Risk Officer",
            display_name: "Institutional Risk Officer",
          },
        ],
        evidence_refs: ["ev-mtg-16d42d0b"],
        risk_flags: [],
        policy_violations: [],
        status: "submitted",
        occurred_at: "2026-11-19T10:03:31Z",
        withheld_fields: [
          { field: "private_memory", reason_code: "private_memory_withheld" },
          { field: "persona_interpretation", reason_code: "private_interpretation_withheld" },
        ],
        redacted: true,
        redaction: {
          status: "redacted",
          policy: "sd_persona_meetings_12_2_private_memory_boundary",
          reason_code: "private_memory_withheld",
        },
      },
      {
        id: "trainer_session:teach-20261120-001",
        intent_id: "trainer_session:teach-20261120-001",
        kind: "trainer",
        source_type: "trainer_session",
        source_id: "teach-20261120-001",
        persona_id: "persona-ee7112a829d38b9135ac",
        persona_display_name: "TW Momentum Alpha",
        intent: "trainer",
        title: "High-volatility stop-loss calibration",
        topic: "High-volatility stop-loss calibration",
        proposed_action: "Tightened intraday trailing stop from 3.5% to 2.5%",
        outcome: "Tightened intraday trailing stop from 3.5% to 2.5%",
        decision: "Tightened intraday trailing stop from 3.5% to 2.5%",
        tools_used: ["replay_simulator"],
        consulted_personas: [],
        evidence_refs: ["ev-trainer-20261120-001"],
        risk_flags: [],
        policy_violations: [],
        status: "completed",
        occurred_at: "2026-11-19T08:30:00Z",
        withheld_fields: [
          { field: "private_memory", reason_code: "private_memory_withheld" },
          { field: "persona_interpretation", reason_code: "private_interpretation_withheld" },
          { field: "raw_control_diff", reason_code: "raw_control_diff_withheld" },
        ],
        redacted: true,
        redaction: {
          status: "redacted",
          policy: "sd_persona_meetings_12_2_private_memory_boundary",
          reason_code: "private_memory_withheld",
        },
      },
    ],
  },
};

function renderPage(initialEntry = "/management/persona-intent") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <PersonaIntentTracesPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("PersonaIntentTracesPage readable audit view (FE-PERSONA-INTENT-READABLE-20261120)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    mocks.useV5Live.mockReset();
    const adapted = adaptPersonaIntent(BFF_SAMPLE_PAYLOAD) ?? [];
    mocks.useV5Live.mockReturnValue({
      data: adapted,
      loading: false,
      refreshing: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  it("AC1: has no raw JSON dump and no normalized-field or BFF-state debug section, and subtitle states the page question", async () => {
    const { container, unmount } = renderPage();

    // Subtitle and purpose panel state the page questions (which persona left a trade-relevant intent; what was proposed; what to cross-check)
    expect(
      screen.getByText(/Answers which persona left a trade-relevant intent, what was proposed and decided, and what to cross-check/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Which persona left a trade-relevant intent?")).toBeInTheDocument();
    expect(screen.getByText("What was proposed and what was the session outcome?")).toBeInTheDocument();
    expect(
      screen.getByText("What tools, consulted personas, risk flags, and evidence links to cross-check?"),
    ).toBeInTheDocument();

    // No raw JSON dump or debug section headers
    expect(screen.queryByText(/Normalized fields/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/BFF \/ policy state/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Raw BFF row/i)).not.toBeInTheDocument();
    expect(screen.queryByText("userIntentSummary / summary")).not.toBeInTheDocument();
    expect(screen.queryByText("personaInterpretation")).not.toBeInTheDocument();
    expect(screen.queryByText("proposedAction")).not.toBeInTheDocument();
    expect(screen.queryByText("toolsUsed")).not.toBeInTheDocument();
    expect(screen.queryByText("consultedPersonas")).not.toBeInTheDocument();
    expect(screen.queryByText("ringBearerId")).not.toBeInTheDocument();
    expect(screen.queryByText("redaction.status")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('"intent_id"');
    expect(container.textContent).not.toContain("management_persona_intent_public_summary");
    expect(isTranslationKeyLike(container.textContent ?? "")).toBe(false);

    unmount();

    // Also verify zh-TW subtitle and questions
    await i18n.changeLanguage("zh-TW");
    const zhRender = renderPage();
    expect(
      screen.getByText(/回答哪個 Persona 留下了交易相關意圖、提議了什麼與決策結果，以及要交叉查證哪些工具/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Debug 檢視/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Normalized 欄位/)).not.toBeInTheDocument();
    expect(screen.queryByText(/BFF \/ policy 狀態/)).not.toBeInTheDocument();
    expect(screen.queryByText(/BFF 原始 row/)).not.toBeInTheDocument();
    zhRender.unmount();
  });

  it("AC2: each card shows persona name, kind, topic, proposed action, outcome, tools used, consulted personas by name, risk flags, evidence links, and translated withheld reasons", async () => {
    renderPage();

    const tradeCard = screen.getByTestId("persona-intent-card-persona_trace:cycle-trade-20261120-001");

    // Persona name (not raw internal ID)
    expect(within(tradeCard).getByRole("link", { name: "TW Momentum Alpha" })).toHaveAttribute(
      "href",
      "/management/personas/persona-ee7112a829d38b9135ac",
    );
    expect(tradeCard.textContent).not.toContain("persona-ee7112a829d38b9135ac");

    // Kind and localized status
    expect(within(tradeCard).getByText("Trade intent")).toBeInTheDocument();
    expect(within(tradeCard).getByText("Completed")).toBeInTheDocument();

    // Topic
    expect(
      within(tradeCard).getAllByText("Rebalance TW semiconductor momentum basket for 2026-11-20").length,
    ).toBeGreaterThanOrEqual(1);

    // Proposed action
    expect(
      within(tradeCard).getByText(
        "Increase 2330.TW weight by +2.5% and trim 2454.TW by -2.5% in paper pool v3",
      ),
    ).toBeInTheDocument();

    // Outcome + Decision localized
    expect(
      within(tradeCard).getByText("Approved for paper execution · Submit reweight proposal"),
    ).toBeInTheDocument();

    // Tools used
    expect(within(tradeCard).getByText("memory_search")).toBeInTheDocument();
    expect(within(tradeCard).getByText("pool_virtual_book_read")).toBeInTheDocument();
    expect(within(tradeCard).getByText("regime_state_lookup")).toBeInTheDocument();

    // Consulted personas by display name
    expect(within(tradeCard).getByText("Institutional Risk Officer")).toBeInTheDocument();
    expect(tradeCard.textContent).not.toContain("persona-risk-officer");

    // Risk flags
    expect(within(tradeCard).getByText("concentration_near_cap")).toBeInTheDocument();

    // Evidence links
    const evLink1 = within(tradeCard).getByRole("link", { name: "ev-cycle-20261120-001" });
    expect(evLink1).toHaveAttribute("href", "/management/evidence/ev-cycle-20261120-001");
    const evLink2 = within(tradeCard).getByRole("link", { name: "case-file-20261120-001" });
    expect(evLink2).toHaveAttribute("href", "/management/evidence/case-file-20261120-001");

    // Withheld fields show translated field names and translated reasons
    const withheldBlock = within(tradeCard).getByTestId("persona-intent-withheld-fields");
    expect(within(withheldBlock).getByText("Private memory:")).toBeInTheDocument();
    expect(
      within(withheldBlock).getByText(
        "Persona private memory is withheld per governance boundary (SD §12.2)",
      ),
    ).toBeInTheDocument();
    expect(within(withheldBlock).getByText("Private interpretation:")).toBeInTheDocument();
    expect(
      within(withheldBlock).getByText(
        "Persona private interpretation is withheld per governance boundary (SD §12.2)",
      ),
    ).toBeInTheDocument();
    expect(withheldBlock.textContent).not.toContain("private_memory_withheld");
    expect(withheldBlock.textContent).not.toContain("private_interpretation_withheld");
  });

  it("AC2: renders translated withheld reason directly inside a card field when that field is withheld", () => {
    mocks.useV5Live.mockReturnValue({
      data: adaptPersonaIntent({
        items: [
          {
            id: "persona_trace:withheld-action-001",
            kind: "trade_intent",
            source_type: "persona_trace",
            persona_id: "persona-ee7112a829d38b9135ac",
            persona_display_name: "TW Momentum Alpha",
            topic: "Intraday hedge check",
            proposed_action: "",
            outcome: "completed",
            tools_used: [],
            consulted_personas: [],
            withheld_fields: [
              { field: "proposed_action", reason_code: "execution_blocked" },
              { field: "private_memory", reason_code: "private_memory_withheld" },
            ],
          },
        ],
      }),
      loading: false,
      refreshing: false,
      error: null,
      refresh: vi.fn(),
    });

    renderPage();

    const card = screen.getByTestId("persona-intent-card-persona_trace:withheld-action-001");
    expect(
      within(card).getAllByText("Execution blocked by governance gate").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("AC3: kind filter defaults to trade intents and switches to consultations, meetings, and trainer sessions", () => {
    renderPage();

    const tradeBtn = screen.getByTestId("persona-intent-kind-trade_intent");
    const consultBtn = screen.getByTestId("persona-intent-kind-consultation");
    const meetingBtn = screen.getByTestId("persona-intent-kind-meeting");
    const trainerBtn = screen.getByTestId("persona-intent-kind-trainer");

    // Defaults to trade_intent: shows trade intent, excludes pool v3 Agora consultation, meeting, and trainer session
    expect(tradeBtn).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("persona-intent-card-persona_trace:cycle-trade-20261120-001"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(
        "persona-intent-card-agora_session:consult-envelope-publication-98f3c36b851627e3814268877ddb33db",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("persona-intent-card-agora_session:mtg-16d42d0b44dfeab5"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("persona-intent-card-trainer_session:teach-20261120-001"),
    ).not.toBeInTheDocument();

    // Switch to Consultations
    fireEvent.click(consultBtn);
    expect(consultBtn).toHaveAttribute("aria-pressed", "true");
    expect(tradeBtn).toHaveAttribute("aria-pressed", "false");
    const consultCard = screen.getByTestId(
      "persona-intent-card-agora_session:consult-envelope-publication-98f3c36b851627e3814268877ddb33db",
    );
    expect(consultCard).toBeInTheDocument();
    expect(within(consultCard).getByText("Consultation")).toBeInTheDocument();
    expect(within(consultCard).getByText("envelope publication for pool-v3")).toBeInTheDocument();
    expect(within(consultCard).getByText("case_file_reader")).toBeInTheDocument();
    expect(within(consultCard).getByText("Institutional Risk Officer")).toBeInTheDocument();

    // Switch to Meetings
    fireEvent.click(meetingBtn);
    expect(meetingBtn).toHaveAttribute("aria-pressed", "true");
    const meetingCard = screen.getByTestId("persona-intent-card-agora_session:mtg-16d42d0b44dfeab5");
    expect(meetingCard).toBeInTheDocument();
    expect(within(meetingCard).getByText("Meeting")).toBeInTheDocument();
    expect(within(meetingCard).getByText("TW Mean Reversion Beta")).toBeInTheDocument();
    expect(
      within(meetingCard).getByText(
        "Adopt 20-day volatility regime filter before mean-reversion entry",
      ),
    ).toBeInTheDocument();
    expect(within(meetingCard).getByText("Propose harness patch")).toBeInTheDocument();
    expect(within(meetingCard).getByText("TW Momentum Alpha")).toBeInTheDocument();
    expect(within(meetingCard).getByText("Institutional Risk Officer")).toBeInTheDocument();

    // Switch to Trainer sessions
    fireEvent.click(trainerBtn);
    expect(trainerBtn).toHaveAttribute("aria-pressed", "true");
    const trainerCard = screen.getByTestId("persona-intent-card-trainer_session:teach-20261120-001");
    expect(trainerCard).toBeInTheDocument();
    expect(within(trainerCard).getByText("Trainer session")).toBeInTheDocument();
    expect(
      within(trainerCard).getAllByText("Tightened intraday trailing stop from 3.5% to 2.5%").length,
    ).toBeGreaterThanOrEqual(1);
    expect(within(trainerCard).getByText("replay_simulator")).toBeInTheDocument();
    expect(
      within(trainerCard).getByText("Raw trainer control diff is withheld from audit summary"),
    ).toBeInTheDocument();
  });
});
