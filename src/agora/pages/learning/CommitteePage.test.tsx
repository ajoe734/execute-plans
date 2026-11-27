import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n";
import { setMockResolver, type MockHandler } from "@/lib/bff-v1/client";
import { caseFile, panelView } from "@/management/components/case-file/__tests__/fixtures";
import { CommitteePage } from "./CommitteePage";

const access = vi.hoisted(() => ({
  value: { loading: false, writeAllowed: true, writeDisabledReason: null as string | null },
}));
vi.mock("@/agora/useAgoraWriteAccess", () => ({ useAgoraWriteAccess: () => access.value }));

type Route = { method: string; path: string; handler: MockHandler };
let routes: Route[] = [];
let calls: Array<{ method: string; path: string; body: unknown; headers: Record<string, string> }> = [];

const json = (body: unknown, status = 200) => ({ kind: "json" as const, status, body });
function on(method: string, path: string, handler: MockHandler | unknown) {
  routes.push({
    method,
    path,
    handler: typeof handler === "function" ? (handler as MockHandler) : () => json(handler),
  });
}

const ownerEnvelope = (owner: string, data: unknown) => ({
  status: "ok",
  reason: null,
  owner,
  data,
  fallback_used: false,
  environment_ceiling: "paper",
  execution_authority: "none",
});

const renderCommittee = () =>
  render(
    <MemoryRouter initialEntries={["/agora/committee"]}>
      <CommitteePage />
    </MemoryRouter>,
  );

beforeEach(async () => {
  routes = [];
  calls = [];
  access.value = { loading: false, writeAllowed: true, writeDisabledReason: null };
  await i18n.changeLanguage("zh-TW");
  setMockResolver((method, path) => {
    const hit = routes.find((r) => r.method === method && r.path === path);
    if (!hit) return undefined;
    return async (req) => {
      calls.push({ method, path, body: req.body, headers: req.headers });
      return hit.handler(req);
    };
  });
});

afterEach(() => {
  cleanup();
  setMockResolver(undefined);
});

describe("CommitteePage deliberative meeting and gate-panel memo case-file views (FE-AGORA-DELIBERATIVE-MEMO-CASE-FILE-20261121)", () => {
  const naturalDeliberativeMeeting = {
    session_id: "mtg-0f7fa4993625ca47",
    meeting_id: "mtg-0f7fa4993625ca47",
    request_id: "mtg-0f7fa4993625ca47",
    meeting_type: "MT-2",
    consultation_type: "persona_meeting",
    session_class: "deliberative_meeting",
    status: "closed",
    outcome: "completed",
    chair_persona_id: "persona-inst-1",
    agenda: "Optimisation review for volatility threshold",
    participants: [
      { persona_id: "persona-inst-1", role: "chair", origin: "institutional" },
      { persona_id: "persona-advisor-1", role: "advisor", origin: "agora_advisor" },
    ],
    round: 2,
    rounds: [
      {
        round: 1,
        mode: "independent",
        positions: [
          {
            label: "chair_trend",
            persona_id: "persona-inst-1",
            role: "chair",
            style: "trend",
            stance: "support",
            confidence: 0.82,
            citations: ["lessons:1"],
            changed: false,
          },
        ],
      },
    ],
    synthesis: {
      tally: { support: 1.6, oppose: 0.4 },
      dissent_memo_id: "mem-859108aab82a9ef57033",
      outcome: "completed",
      summary: "Proceed with conditional paper threshold adjustment.",
      proposals: [],
    },
    proposals: [],
    private_items_withheld: 1,
    environment_ceiling: "paper",
    execution_authority: "none",
  };

  it("renders the recorded unavailable case-file state and zh-TW reason strings on a natural deliberative meeting memo", async () => {
    const naturalMemos = [
      {
        memo_id: "mem-859108aab82a9ef57033",
        request_id: "mtg-0f7fa4993625ca47",
        status: "published",
        summary: "Minority/adversarial perspective recorded for mtg-0f7fa4993625ca47 (no vote).",
        recommendation: "approve_with_conditions",
        case_file_view: {
          status: "unavailable",
          reason: "no_case_file_recorded",
          case_file: null,
        },
      },
      {
        memo_id: "mem-9f855b503b53a654b2d5",
        request_id: "mtg-0f7fa4993625ca47",
        status: "published",
        summary: "Secondary dissent perspective for mtg-0f7fa4993625ca47.",
        recommendation: "hold",
        case_file_view: {
          status: "unavailable",
          reason: "",
          case_file: null,
        },
      },
    ];

    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [naturalDeliberativeMeeting]));
    on("GET", "/bff/agora/committee/meetings/mtg-0f7fa4993625ca47", ownerEnvelope("consultation", naturalDeliberativeMeeting));
    on("GET", "/bff/agora/committee/meetings/mtg-0f7fa4993625ca47/proposals", ownerEnvelope("consultation", []));
    on("GET", "/bff/agora/committee/sessions/mtg-0f7fa4993625ca47/memos", ownerEnvelope("consultation", naturalMemos));

    renderCommittee();
    fireEvent.click(await screen.findByText("mtg-0f7fa4993625ca47"));

    const memoRow = await screen.findByTestId("dissent-memo-mem-859108aab82a9ef57033");
    expect(memoRow.textContent).toContain("mem-859108aab82a9ef57033");
    expect(memoRow.textContent).toContain("published");
    expect(memoRow.textContent).toContain("Minority/adversarial perspective recorded for mtg-0f7fa4993625ca47 (no vote).");
    expect(memoRow.textContent).toContain("approve_with_conditions");

    const unavailablePanel = within(memoRow).getByTestId("memo-mem-859108aab82a9ef57033-case-file-unavailable");
    expect(unavailablePanel.textContent).toContain("決策卷宗");
    expect(unavailablePanel.textContent).toContain("無法讀取");
    const reasonEl = within(memoRow).getByTestId("memo-mem-859108aab82a9ef57033-case-file-unavailable-reason");
    expect(reasonEl.textContent).toContain("no_case_file_recorded");

    const fallbackRow = await screen.findByTestId("dissent-memo-mem-9f855b503b53a654b2d5");
    const fallbackPanel = within(fallbackRow).getByTestId("memo-mem-9f855b503b53a654b2d5-case-file-unavailable");
    expect(fallbackPanel.textContent).toContain("決策卷宗");
    expect(fallbackPanel.textContent).toContain("無法讀取");
    expect(
      within(fallbackRow).getByTestId("memo-mem-9f855b503b53a654b2d5-case-file-unavailable-reason").textContent,
    ).toContain("owner_unavailable");
  });

  it("renders excerpts, sources, retrieval mode, empty-group reason, rejected reason, and focuses cited items on a deliberative memo with a valid case file", async () => {
    const memoWithCaseFile = {
      memo_id: "mem-859108aab82a9ef57033",
      request_id: "mtg-0f7fa4993625ca47",
      status: "published",
      summary: "Dissent grounded in shared memory lessons",
      recommendation: "approve_with_conditions",
      case_file_view: panelView,
    };

    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [naturalDeliberativeMeeting]));
    on("GET", "/bff/agora/committee/meetings/mtg-0f7fa4993625ca47", ownerEnvelope("consultation", naturalDeliberativeMeeting));
    on("GET", "/bff/agora/committee/meetings/mtg-0f7fa4993625ca47/proposals", ownerEnvelope("consultation", []));
    on("GET", "/bff/agora/committee/sessions/mtg-0f7fa4993625ca47/memos", ownerEnvelope("consultation", [memoWithCaseFile]));

    renderCommittee();
    fireEvent.click(await screen.findByText("mtg-0f7fa4993625ca47"));

    const memoRow = await screen.findByTestId("dissent-memo-mem-859108aab82a9ef57033");
    const caseFilePanel = within(memoRow).getByTestId("memo-mem-859108aab82a9ef57033-case-file");
    expect(caseFilePanel.textContent).toContain("決策卷宗");

    // Excerpts, sources, and retrieval modes across groups
    const historyGroup = within(caseFilePanel).getByTestId(
      "case-file-group-memo-mem-859108aab82a9ef57033-similar_history",
    );
    expect(historyGroup.textContent).toContain("similar drawdown in Q3");
    expect(
      within(caseFilePanel).getByTestId("case-file-item-memo-mem-859108aab82a9ef57033-history:1-mode").textContent,
    ).toContain("semantic (0.8)");
    expect(
      within(caseFilePanel).getByTestId("case-file-item-memo-mem-859108aab82a9ef57033-history:1-source").textContent,
    ).toContain("memory / src-history:1");

    expect(
      within(caseFilePanel).getByTestId("case-file-item-memo-mem-859108aab82a9ef57033-facts:1").textContent,
    ).toContain("BTC funding flipped negative");
    expect(
      within(caseFilePanel).getByTestId("case-file-item-memo-mem-859108aab82a9ef57033-lessons:1").textContent,
    ).toContain("cut size after two stops");

    // Unavailable group reason
    expect(
      within(caseFilePanel).getByTestId(
        "case-file-group-memo-mem-859108aab82a9ef57033-evidence-empty-reason",
      ).textContent,
    ).toContain("evidence_owner_unconfigured");

    // Citation click focuses target item element
    const citeButton = within(caseFilePanel).getByTestId(
      "memo-mem-859108aab82a9ef57033-case-file-contribution-0-claim-0-cite-lessons:1",
    );
    fireEvent.click(citeButton);
    expect(document.activeElement?.id).toBe("cf-memo-mem-859108aab82a9ef57033-lessons:1");

    // Unresolved citation and rejected contribution reason
    expect(
      within(caseFilePanel).getByTestId(
        "memo-mem-859108aab82a9ef57033-case-file-contribution-0-claim-1-unresolved-lessons:ghost",
      ),
    ).toBeInTheDocument();
    expect(
      within(caseFilePanel).getByTestId("memo-mem-859108aab82a9ef57033-case-file-rejected-0-reason").textContent,
    ).toBe("claim_uncited");
  });

  it("preserves privacy projection on deliberative and gate-panel memos and keeps gate-panel memo publish behavior", async () => {
    const caseFileWithPrivateLeak = {
      ...caseFile,
      private_items_withheld: 2,
      groups: {
        ...caseFile.groups,
        lessons: {
          ...caseFile.groups.lessons,
          items: [
            ...caseFile.groups.lessons.items,
            {
              item_id: "lessons:private-1",
              kind: "memory_lesson",
              excerpt: "PRIVATE_LESSON_MUST_NEVER_LEAK",
              source_owner: "memory",
              source_id: "src-private-1",
              retrieval_mode: "semantic",
              relevance_scope: "persona_private",
            },
          ],
        },
      },
    };
    const viewWithPrivateLeak = {
      ...panelView,
      case_file: caseFileWithPrivateLeak,
    };

    const gateSession = {
      request_id: "req-gate-1",
      session_id: "req-gate-1",
      tenant_id: "t1",
      consultation_type: "persona_panel",
      session_class: "gate_panel",
      status: "open",
    };
    let gatePublished = false;
    const gateMemo = {
      memo_id: "memo-gate-1",
      request_id: "req-gate-1",
      status: "draft",
      summary: "Gate risk check pending publish",
      recommendation: "approve",
      case_file_view: viewWithPrivateLeak,
    };

    on("GET", "/bff/agora/committee/sessions", ownerEnvelope("consultation", [gateSession, naturalDeliberativeMeeting]));
    on("GET", "/bff/agora/committee/sessions/req-gate-1/memos", () =>
      json(ownerEnvelope("consultation", [{ ...gateMemo, status: gatePublished ? "published" : "draft" }])),
    );
    on("POST", "/bff/agora/committee/sessions/req-gate-1/memos/memo-gate-1/publish", () => {
      gatePublished = true;
      return json(
        ownerEnvelope("consultation", {
          ...gateMemo,
          status: "published",
          published_at: "2026-11-21T16:00:00Z",
        }),
      );
    });
    on("GET", "/bff/agora/committee/meetings/mtg-0f7fa4993625ca47", ownerEnvelope("consultation", naturalDeliberativeMeeting));
    on("GET", "/bff/agora/committee/meetings/mtg-0f7fa4993625ca47/proposals", ownerEnvelope("consultation", []));
    on(
      "GET",
      "/bff/agora/committee/sessions/mtg-0f7fa4993625ca47/memos",
      ownerEnvelope("consultation", [
        {
          memo_id: "mem-859108aab82a9ef57033",
          request_id: "mtg-0f7fa4993625ca47",
          status: "published",
          summary: "Deliberative memo with private item in raw payload",
          case_file_view: viewWithPrivateLeak,
        },
      ]),
    );

    renderCommittee();

    // 1. Deliberative memo strips private item and shows withheld count
    fireEvent.click(await screen.findByText("mtg-0f7fa4993625ca47"));
    const delibMemo = await screen.findByTestId("dissent-memo-mem-859108aab82a9ef57033");
    expect(delibMemo.textContent).not.toContain("PRIVATE_LESSON_MUST_NEVER_LEAK");
    expect(within(delibMemo).getByTestId("case-file-memo-mem-859108aab82a9ef57033-withheld").textContent).toContain("2");

    // 2. Gate panel memo strips private item, renders case file, and publishes draft -> published
    fireEvent.click(screen.getByText("req-gate-1"));
    const gateMemoEl = await screen.findByTestId("memo-memo-gate-1");
    expect(gateMemoEl.textContent).not.toContain("PRIVATE_LESSON_MUST_NEVER_LEAK");
    expect(within(gateMemoEl).getByTestId("case-file-memo-memo-gate-1-withheld").textContent).toContain("2");
    expect(within(gateMemoEl).getByTestId("memo-memo-gate-1-case-file")).toBeInTheDocument();

    const publishBtn = within(gateMemoEl).getByRole("button", { name: /發布備忘錄|Publish memo/ });
    fireEvent.click(publishBtn);
    const receipt = await screen.findByTestId("learning-receipt");
    expect(receipt.textContent).toContain('"status": "published"');
    expect(calls.find((c) => c.method === "POST")?.headers["Idempotency-Key"]).toBeTruthy();
  });
});
