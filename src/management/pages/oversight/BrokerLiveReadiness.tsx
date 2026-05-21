// 2026-05-20 revamp §7.2 + design ruling §4.2 — Broker Live Activation.
import { ReadinessHeader } from "@/management/components/readiness/ReadinessHeader";
import { ReadinessChecklist } from "@/management/components/readiness/ReadinessChecklist";
import { EvidencePacketList } from "@/management/components/readiness/EvidencePacketList";
import { BlockersList } from "@/management/components/readiness/BlockersList";
import { buildReadinessPage, passItem, pendingItem } from "@/lib/v5/management/readinessSeeds";

const checklist = [
  passItem("broker_live_activation_criteria", "broker_live_activation_criteria present", "broker-owner"),
  passItem("paper_14d", "14d paper evidence present", "research-owner"),
  pendingItem("canary_7d", "7d canary evidence present", "ops-owner"),
  passItem("broker_sandbox", "Broker sandbox evidence present", "broker-owner"),
  passItem("kill_switch_demo", "Kill-switch demo evidence present", "ops-owner"),
  passItem("rollback_drill", "Rollback drill evidence present", "ops-owner"),
  pendingItem("first_week_window", "First week observation window present", "ops-owner"),
  pendingItem("risk_owner_signoff", "Risk-owner signoff present", "risk-owner"),
  pendingItem("operator_signoff", "Operator signoff present", "operator"),
  passItem("fail_closed_invariants", "Fail-closed invariants satisfied", "ops-owner"),
];

const packets = [
  { id: "paper-14d-2026-05-19", packetType: "Paper14dEvidence", status: "verified" as const, hash: "0xpaper14d", createdAt: "2026-05-19T00:00:00Z" },
  { id: "broker-sandbox-2026-05-20", packetType: "BrokerSandboxEvidence", status: "verified" as const, hash: "0xsbx2026", createdAt: "2026-05-20T00:00:00Z" },
];

const blockers = [
  { id: "missing_risk_owner_signoff", severity: "critical" as const, reason: "Risk-owner has not signed off broker-live activation.", requiredRole: "risk-owner", nextAction: "Open Human Gate", linkedEvidence: [] },
  { id: "missing_operator_signoff", severity: "critical" as const, reason: "Operator signoff missing.", requiredRole: "operator", nextAction: "Open Human Gate", linkedEvidence: [] },
  { id: "missing_canary_7d", severity: "high" as const, reason: "7d canary evidence not yet collected.", requiredRole: "ops-owner", nextAction: "Run canary 7d window", linkedEvidence: [] },
];

export const BrokerLiveReadinessPage = () => {
  const page = buildReadinessPage({
    title: "Broker Live Activation",
    environment: "canary→live",
    checklist, packets, blockers,
    lastUpdated: "2026-05-20T12:00:00Z",
  });
  return (
    <section className="p-6 space-y-4" aria-label="Broker Live Readiness">
      <ReadinessHeader model={page.header} />
      <ReadinessChecklist items={page.checklist} />
      <EvidencePacketList packets={page.packets} />
      <BlockersList blockers={page.blockers} />
    </section>
  );
};
