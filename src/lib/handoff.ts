// Handoff — Spec Part 5 §21 / Part 4 §22 W16.
// Single zustand store + drawer pattern. Any Agora surface (Insight, Decision, Signal,
// Committee memo, etc.) calls `useHandoff().open({...})`; the drawer collects evidence,
// priority, suggested owner/persona, notes, and posts to BFF (mocked).
//
// Submitted handoffs become incoming items in Management Command Center (Spec §21).
import { create } from "zustand";

// v3 §15 canonical types: strategy_idea | research_task | training_example
// | committee_memo | skill_draft | mcp_tool_request | incident_note | signal_feedback.
// We retain the legacy `insight` / `training_feedback` / `alert_escalation` aliases
// for back-compat with Phase 1–11 callers; new code should use v3 types.
export type HandoffType =
  | "insight"
  | "strategy_idea"
  | "research_task"
  | "training_example"
  | "training_feedback"
  | "committee_memo"
  | "skill_draft"
  | "mcp_tool_request"
  | "incident_note"
  | "signal_feedback"
  | "alert_escalation";

export interface HandoffSource {
  /** Display kind, e.g. "Insight", "Decision", "Signal", "CommitteeSession". */
  kind: string;
  /** Source object id (e.g. "ins_01", "dec_002"). */
  id: string;
  /** Optional short label for the source. */
  label?: string;
}

export interface HandoffPrefill {
  type: HandoffType;
  source: HandoffSource;
  summary?: string;
  evidence?: string[];
  priority?: "low" | "normal" | "high" | "urgent";
  suggestedOwner?: string;
  suggestedPersona?: string;
  notes?: string;
  /** Optional target page hint — lets the management side prefill the right form */
  targetRoute?: string;
}

export interface HandoffRecord extends Required<Omit<HandoffPrefill, "evidence" | "notes">> {
  id: string;
  status: "submitted" | "received" | "converted" | "rejected";
  evidence: string[];
  notes: string;
  submittedAt: string;
}

interface HandoffStore {
  open: boolean;
  draft: HandoffPrefill | null;
  history: HandoffRecord[];
  openHandoff: (prefill: HandoffPrefill) => void;
  close: () => void;
  submit: (final: HandoffPrefill) => HandoffRecord;
  /** Lookup recent handoffs for a given source id (for "submitted" badge). */
  hasSubmitted: (sourceId: string) => boolean;
}

export const useHandoff = create<HandoffStore>((set, get) => ({
  open: false,
  draft: null,
  history: [],
  openHandoff: (draft) => set({ open: true, draft }),
  close: () => set({ open: false, draft: null }),
  submit: (final) => {
    const rec: HandoffRecord = {
      id: `ho_${Date.now().toString(36)}`,
      status: "submitted",
      type: final.type,
      source: final.source,
      summary: final.summary ?? "",
      evidence: final.evidence ?? [],
      priority: final.priority ?? "normal",
      suggestedOwner: final.suggestedOwner ?? "",
      suggestedPersona: final.suggestedPersona ?? "",
      notes: final.notes ?? "",
      targetRoute: final.targetRoute ?? targetRouteFor(final.type),
      submittedAt: new Date().toISOString(),
    };
    set((s) => ({ history: [rec, ...s.history], open: false, draft: null }));
    return rec;
  },
  hasSubmitted: (sourceId) => get().history.some((h) => h.source.id === sourceId),
}));

/** Default management route a handoff lands on. Used both for navigation hints
 *  and by the prefill query string in the receiving page. */
export function targetRouteFor(type: HandoffType): string {
  switch (type) {
    case "insight": return "/management/command-center";
    case "strategy_idea": return "/management/strategies";
    case "research_task": return "/management/experiments";
    case "committee_memo": return "/management/approvals";
    case "training_feedback":
    case "training_example": return "/management/personas";
    case "skill_draft": return "/management/skills";
    case "mcp_tool_request": return "/management/mcp";
    case "incident_note":
    case "alert_escalation": return "/management/incidents";
    case "signal_feedback": return "/management/strategies";
  }
}
