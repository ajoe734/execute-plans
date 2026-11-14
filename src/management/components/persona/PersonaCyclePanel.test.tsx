import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonaCyclePanel } from "./PersonaCyclePanel";
import type { PersonaManagementEnvelope } from "@/lib/bff-v1/personas";

const surfaces = (over: Record<string, { status: string; reason?: string }> = {}) => ({
  persona_cycles: { status: "ok" }, persona_memory_summary: { status: "ok" },
  persona_consultation_memos: { status: "ok" }, persona_harness: { status: "ok" },
  harness_experiences: { status: "ok" }, ...over,
});

const full: PersonaManagementEnvelope = {
  data: { personaCycle: {
    cycle: { health: { status: "completed", last_packet_id: "p1", stage: "closed", failure_reason: null },
      packets: [{ packet_id: "p1", stage: "closed", updated_at: "2026-11-13T01:00:00Z", phase: "terminal", failure_reason: null, harness_version: 1 }] },
    memorySummary: { returned: 1, limit: 100, entries: [{ memory_id: "m1", memory_type: "episodic", written_at: "t", source_event_id: "e", summary: "mem summary" }] },
    consultationMemos: [{ memo_id: "memo-1", request_id: "r1", status: "final", summary: "memo summary", recommendation: "hold", created_at: "t", evidence_refs: [] }],
    harness: { active_version: 1, versions: [{ version: 1, persona_id: "p", parent_version: null, patch_id: null, created_at: "t", created_by: "op", content_digest: "dg" }] },
    harnessExperiences: [{ memory_id: "x1", summary: "exp", experience: { lesson: "lesson-a", outcome: "ok", harness_version: 1 } }],
  } },
  meta: { surfaces: surfaces() },
} as PersonaManagementEnvelope;

describe("PersonaCyclePanel", () => {
  it("renders every section from a BFF-shaped payload", () => {
    render(<PersonaCyclePanel management={full} />);
    expect(screen.getByTestId("cycle-packet-p1")).toBeInTheDocument();
    expect(screen.getByTestId("cycle-health-status").textContent).toBe("completed");
    expect(screen.getByTestId("cycle-memory").textContent).toContain("mem summary");
    expect(screen.getByTestId("cycle-memos").textContent).toContain("hold");
    expect(screen.getByTestId("cycle-harness-v1").textContent).toContain("使用中");
    expect(screen.getByTestId("cycle-experiences").textContent).toContain("lesson-a");
  });

  it("shows unavailable with owner reason and no rows when sections are null", () => {
    const m = { data: { personaCycle: { cycle: null, memorySummary: null, consultationMemos: null, harness: null, harnessExperiences: null } },
      meta: { surfaces: surfaces({ persona_cycles: { status: "unavailable", reason: "cycle_owner_unavailable" },
        persona_memory_summary: { status: "unavailable", reason: "no_memory_records" },
        persona_consultation_memos: { status: "unavailable", reason: "no_consultation_memos" },
        persona_harness: { status: "unavailable", reason: "harness_not_initialized_or_invalid" },
        harness_experiences: { status: "unavailable", reason: "no_harness_experiences" } }) } } as PersonaManagementEnvelope;
    render(<PersonaCyclePanel management={m} />);
    expect(screen.getByTestId("cycle-packets-unavailable").textContent).toContain("cycle_owner_unavailable");
    expect(screen.getByTestId("cycle-memory-unavailable").textContent).toContain("no_memory_records");
    expect(screen.getByTestId("cycle-harness-unavailable").textContent).toContain("harness_not_initialized_or_invalid");
    expect(screen.queryByTestId("cycle-packets")).toBeNull();
  });

  it("treats a non-ok surface as unavailable even if data is present", () => {
    const m = { ...full, meta: { surfaces: surfaces({ persona_harness: { status: "unavailable", reason: "x" } }) } } as PersonaManagementEnvelope;
    render(<PersonaCyclePanel management={m} />);
    expect(screen.getByTestId("cycle-harness-unavailable")).toBeInTheDocument();
  });

  it("shows unavailable when the personaCycle block is absent or the read failed", () => {
    const { unmount } = render(<PersonaCyclePanel management={{ data: {} } as PersonaManagementEnvelope} />);
    expect(screen.getByTestId("cycle-unavailable-all")).toBeInTheDocument();
    unmount();
    render(<PersonaCyclePanel management={full} managementUnavailable />);
    expect(screen.getByTestId("cycle-unavailable-all")).toBeInTheDocument();
  });
});
