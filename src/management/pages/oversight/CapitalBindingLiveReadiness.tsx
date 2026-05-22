// 2026-05-20 revamp §7.3 + design ruling §4.3 — Capital Binding Live.
import { useMemo } from "react";
import { ReadinessHeader } from "@/management/components/readiness/ReadinessHeader";
import { ReadinessChecklist } from "@/management/components/readiness/ReadinessChecklist";
import { EvidencePacketList } from "@/management/components/readiness/EvidencePacketList";
import { BlockersList } from "@/management/components/readiness/BlockersList";
import { buildReadinessPage, passItem, pendingItem } from "@/lib/v5/management/readinessSeeds";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";

const checklist = [
  passItem("capital_binding_live_packet", "CapitalBindingLiveReadiness packet present", "capital-owner"),
  passItem("sponsor_persona_assigned", "Sponsor persona assigned", "capital-owner"),
  passItem("live_owner_assigned", "Live owner assigned", "capital-owner"),
  passItem("risk_owner_assigned", "Risk owner assigned", "risk-owner"),
  pendingItem("operator_assigned", "Operator assigned", "operator"),
  passItem("pool_risk_budget", "Pool risk budget confirmed", "risk-owner"),
  passItem("runtime_compatibility", "Runtime compatibility present", "platform-owner"),
  passItem("artifact_approval", "Artifact approval present", "research-owner"),
  passItem("rollback_target", "Rollback target present", "ops-owner"),
  passItem("binding_ttl", "Binding TTL present", "capital-owner"),
  passItem("revocation_policy", "Revocation policy present", "capital-owner"),
  passItem("conflict_resolution_log", "Conflict resolution log present", "capital-owner"),
  pendingItem("risk_owner_signoff", "Risk-owner signoff present", "risk-owner"),
  pendingItem("operator_signoff", "Operator signoff present", "operator"),
];

const packets = [
  { id: "cap-binding-live-2026-05-20", packetType: "CapitalBindingLiveReadiness", status: "verified" as const, hash: "0xcap2026", createdAt: "2026-05-20T08:00:00Z", linkedObject: "pool:alpha-pool-1" },
];

const blockers = [
  { id: "missing_operator_assignment", severity: "high" as const, reason: "Operator role not yet assigned for the binding.", requiredRole: "operator", nextAction: "Assign operator", linkedEvidence: [] },
];

export const CapitalBindingLiveReadinessPage = () => {
  const seed = useMemo(() => buildReadinessPage({
    title: "Capital Binding Live",
    environment: "live",
    checklist, packets, blockers,
    lastUpdated: "2026-05-20T12:00:00Z",
  }), []);
  const { data } = useV5Live(() => mgmt.readiness.capitalBinding(() => seed), []);
  const page = data ?? seed;
  return (
    <section className="p-6 space-y-4" aria-label="Capital Binding Live Readiness">
      <ReadinessHeader model={page.header} />
      <ReadinessChecklist items={page.checklist} />
      <EvidencePacketList packets={page.packets} />
      <BlockersList blockers={page.blockers} />
    </section>
  );
};
