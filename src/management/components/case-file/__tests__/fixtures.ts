// BFF-shaped case_file_view fixtures (mirror bff/agora/committee/owner.py projections).
const item = (id: string, kind: string, excerpt: string, mode: string) => ({
  item_id: id, kind, excerpt, source_owner: "memory", source_id: `src-${id}`, retrieval_mode: mode, retrieval_score: 0.8,
});
export const caseFile = {
  case_file_id: "cf-1", digest: "d1", decision_type: "consult", persona_id: "persona-a", composed_at: "2026-11-13T01:00:00Z",
  private_items_withheld: 1,
  groups: {
    facts: { status: "ok", reason: null, items: [item("facts:1", "fact", "BTC funding flipped negative", "structured")], unavailable: [], truncated: false },
    similar_history: { status: "ok", reason: null, items: [item("history:1", "memory_episode", "similar drawdown in Q3", "semantic")], unavailable: [], truncated: false },
    lessons: { status: "ok", reason: null, items: [item("lessons:1", "memory_lesson", "cut size after two stops", "tag_match")], unavailable: [], truncated: false },
    evidence: { status: "unavailable", reason: "evidence_owner_unconfigured", items: [], unavailable: ["evidence"], truncated: false },
  },
};
export const panelView = {
  status: "ok", reason: null, case_file: caseFile,
  contributions: [{ persona_id: "persona-a", event_id: "e2", recommendation: "approve", role: "primary_reviewer",
    claims: [{ claim: "grounded claim", cited_item_ids: ["lessons:1"], unresolved_item_ids: [] },
             { claim: "stray claim", cited_item_ids: [], unresolved_item_ids: ["lessons:ghost"] }] }],
  rejected_contributions: [{ persona_id: "persona-b", contribution_id: "c-2", reason: "claim_uncited", cited: false }],
};
export const packetView = {
  status: "ok", reason: null, case_files: [caseFile],
  decisions: [{ kind: "no_action", status: "no_action", case_file_id: "cf-1", case_file_scope: "persona",
    none_applicable_reason: null, cited_item_ids: ["facts:1"], unresolved_item_ids: [] }],
};
