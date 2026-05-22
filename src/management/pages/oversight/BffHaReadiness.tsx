// 2026-05-20 revamp §7.4 + design ruling §4.4 — BFF HA / Control Plane.
import { useMemo } from "react";
import { ReadinessHeader } from "@/management/components/readiness/ReadinessHeader";
import { ReadinessChecklist } from "@/management/components/readiness/ReadinessChecklist";
import { EvidencePacketList } from "@/management/components/readiness/EvidencePacketList";
import { BlockersList } from "@/management/components/readiness/BlockersList";
import { buildReadinessPage, passItem, pendingItem } from "@/lib/v5/management/readinessSeeds";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";

const checklist = [
  passItem("topology_selected", "Topology selected", "platform-owner"),
  passItem("sla_targets", "SLA targets present", "platform-owner"),
  pendingItem("multi_replica_poc", "Multi-replica PoC present", "platform-owner"),
  pendingItem("sse_fanout_replay", "SSE fanout / replay proof present", "platform-owner"),
  pendingItem("idempotency_shared_store", "Idempotency shared store proof present", "platform-owner"),
  pendingItem("audit_store", "Audit store proof present", "platform-owner"),
  passItem("degraded_mode_matrix", "Degraded mode matrix present", "platform-owner"),
  passItem("failover_runbook", "Failover runbook present", "ops-owner"),
  passItem("observability_spec", "Observability spec present", "platform-owner"),
  passItem("cost_ceiling", "Cost ceiling present", "platform-owner"),
  pendingItem("cutover_approval", "Production cutover approval present", "operator"),
];

const packets = [
  { id: "bff-ha-topology-2026-05-19", packetType: "BffHaTopology", status: "verified" as const, hash: "0xha2026", createdAt: "2026-05-19T09:00:00Z" },
];

const blockers = [
  { id: "missing_bff_ha", severity: "high" as const, reason: "Multi-replica PoC + SSE replay still in progress.", requiredRole: "platform-owner", nextAction: "Complete PoC", linkedEvidence: [] },
];

export const BffHaReadinessPage = () => {
  const seed = useMemo(() => buildReadinessPage({
    title: "BFF HA / Control Plane Resilience",
    environment: "platform",
    checklist, packets, blockers,
    lastUpdated: "2026-05-20T12:00:00Z",
  }), []);
  const { data } = useV5Live(() => mgmt.readiness.bffHa(() => seed), []);
  const page = data ?? seed;
  return (
    <section className="p-6 space-y-4" aria-label="BFF HA Readiness">
      <ReadinessHeader model={page.header} />
      <ReadinessChecklist items={page.checklist} />
      <EvidencePacketList packets={page.packets} />
      <BlockersList blockers={page.blockers} />
    </section>
  );
};
