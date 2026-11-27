import { describe, expect, it } from "vitest";

import type { InterventionRecord } from "@/lib/bff-v1/agora/performance";
import type { TradingDecisionEvent } from "@/lib/bff-v1/agora/tradingRoom";
import { interventionDecisionEventId } from "./RuleVsHumanComparison";

const events = [{ decision_event_id: "evt-1" }, { decision_event_id: "evt-2" }] as TradingDecisionEvent[];

function intervention(overrides: Partial<InterventionRecord> = {}): InterventionRecord {
  return {
    intervention_id: "iv-1",
    kind: "manual_override",
    status: "recorded",
    occurred_at: "2026-11-27T00:00:00Z",
    source_id: "intervention-ledger",
    evidence_refs: ["journey-event-9"],
    ...overrides,
  };
}

describe("interventionDecisionEventId", () => {
  it("links through an evidence ref that is a known decision event", () => {
    expect(interventionDecisionEventId(intervention({ evidence_refs: ["decision_event:evt-2"] }), events)).toBe("evt-2");
  });

  it("links through a journey row sharing an evidence ref with the intervention", () => {
    const journeys = [
      { evidence_refs: ["journey-event-9"], decision_ids: ["evt-1"] },
      { evidence_refs: ["other"], decision_ids: ["evt-2"] },
    ];
    expect(interventionDecisionEventId(intervention(), events, journeys)).toBe("evt-1");
  });

  it("never guesses a link: unknown ids and unrelated journeys stay unlinked", () => {
    const journeys = [{ evidence_refs: ["unrelated"], decision_ids: ["evt-1"] }];
    expect(interventionDecisionEventId(intervention(), events, journeys)).toBeNull();
    expect(interventionDecisionEventId(intervention({ evidence_refs: ["evt-unknown"] }), events)).toBeNull();
    expect(interventionDecisionEventId(intervention(), [])).toBeNull();
  });
});
