import { describe, it, expect, beforeEach } from "vitest";
import { useHandoff, targetRouteFor } from "@/lib/handoff";

describe("handoff store", () => {
  beforeEach(() => {
    useHandoff.setState({ open: false, draft: null, history: [] });
  });

  it("openHandoff stores draft and opens drawer", () => {
    useHandoff.getState().openHandoff({
      type: "insight",
      source: { kind: "Signal", id: "sig_01" },
      summary: "BTC breakout",
    });
    const s = useHandoff.getState();
    expect(s.open).toBe(true);
    expect(s.draft?.summary).toBe("BTC breakout");
  });

  it("submit pushes a record, clears draft, closes drawer", () => {
    const rec = useHandoff.getState().submit({
      type: "research_task",
      source: { kind: "Insight", id: "ins_42" },
      summary: "Backtest idea",
    });
    const s = useHandoff.getState();
    expect(rec.status).toBe("submitted");
    expect(rec.targetRoute).toBe("/management/experiments");
    expect(s.history).toHaveLength(1);
    expect(s.open).toBe(false);
    expect(s.draft).toBeNull();
  });

  it("hasSubmitted finds previously-submitted source", () => {
    useHandoff.getState().submit({
      type: "insight",
      source: { kind: "Decision", id: "dec_7" },
    });
    expect(useHandoff.getState().hasSubmitted("dec_7")).toBe(true);
    expect(useHandoff.getState().hasSubmitted("dec_999")).toBe(false);
  });

  it("targetRouteFor maps every handoff type", () => {
    expect(targetRouteFor("insight")).toMatch(/command-center/);
    expect(targetRouteFor("strategy_idea")).toMatch(/strategies/);
    expect(targetRouteFor("research_task")).toMatch(/experiments/);
    expect(targetRouteFor("committee_memo")).toMatch(/approvals/);
    expect(targetRouteFor("training_feedback")).toMatch(/personas/);
    expect(targetRouteFor("skill_draft")).toMatch(/skills/);
    expect(targetRouteFor("mcp_tool_request")).toMatch(/mcp/);
    expect(targetRouteFor("alert_escalation")).toMatch(/incidents/);
  });
});
