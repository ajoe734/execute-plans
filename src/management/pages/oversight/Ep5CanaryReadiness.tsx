// 2026-05-20 revamp §7.1 + design ruling §4.1 — EP5 Canary Readiness.
// Route: /management/readiness/ep5 (also reachable via /management/broker-live
// in M1 transitional IA — see App.tsx). Phase 1 ships full minimum fields;
// "Enable Canary"/"Enable Live" buttons are intentionally OMITTED.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ReadinessHeader } from "@/management/components/readiness/ReadinessHeader";
import { ReadinessChecklist } from "@/management/components/readiness/ReadinessChecklist";
import { EvidencePacketList } from "@/management/components/readiness/EvidencePacketList";
import { BlockersList } from "@/management/components/readiness/BlockersList";
import { buildReadinessPage, passItem, pendingItem } from "@/lib/v5/management/readinessSeeds";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";

const checklist = [
  passItem("ooda_paper_packet", "OODA paper packet present", "research-owner"),
  passItem("ep4_paper_proof", "EP4 governed paper proof present", "research-owner"),
  passItem("m7_readiness_packet", "M7 readiness packet present", "research-owner"),
  passItem("broker_sandbox_smoke", "Broker sandbox smoke present", "broker-owner"),
  passItem("shioaji_sandbox_evidence", "Shioaji sandbox evidence present", "broker-owner"),
  pendingItem("canary_activation_refs", "Canary activation refs present", "ops-owner"),
  passItem("rollback_drill", "Rollback drill present", "ops-owner"),
  passItem("kill_switch_demo", "Kill-switch demo present", "ops-owner"),
  passItem("telemetry_readiness", "Telemetry readiness present", "ops-owner"),
  pendingItem("risk_owner_approval", "Risk-owner approval present", "risk-owner"),
  pendingItem("operator_approval", "Operator approval present", "operator"),
  pendingItem("can_proceed_true", "can_proceed flag true", "operator"),
];

const packets = [
  { id: "ep4-paper-2026-05-18", packetType: "EP4ProofPacket", status: "verified" as const, hash: "0xabc1234ef5", createdAt: "2026-05-18T09:00:00Z", linkedObject: "strategy:alpha-momentum" },
  { id: "m7-readiness-2026-05-19", packetType: "M7ReadinessPacket", status: "verified" as const, hash: "0xdef5678abc", createdAt: "2026-05-19T10:00:00Z" },
  { id: "shioaji-sandbox-2026-05-20", packetType: "BrokerSandboxEvidence", status: "verified" as const, hash: "0x111aa2233b", createdAt: "2026-05-20T07:00:00Z", linkedObject: "broker:shioaji-sandbox" },
];

const blockers = [
  { id: "B-EP5-001", severity: "high" as const, reason: "Risk-owner signoff pending on canary activation", requiredRole: "risk-owner", nextAction: "Open Human Gate", linkedEvidence: ["ep4-paper-2026-05-18"] },
];

import { useMemo } from "react";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";

export const Ep5CanaryReadinessPage = () => {
  const { t } = useTranslation();
  const seed = useMemo(() => buildReadinessPage({
    title: t("mgmt.readiness.ep5Title"),
    environment: "paper→canary",
    checklist, packets, blockers,
    lastUpdated: "2026-05-20T12:00:00Z",
  }), [t]);
  const { data } = useV5Live(() => mgmt.readiness.ep5(() => seed), []);
  const page = data ?? seed;
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.readiness.ep5Title")}>
      <ReadinessHeader model={page.header} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/management/evidence">{t("mgmt.actions.viewEvidence")}</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/management/human-inbox">{t("mgmt.actions.openHumanGate")}</Link>
        </Button>
        <Button variant="outline" size="sm">{t("mgmt.actions.refreshReadiness")}</Button>
        <Button variant="outline" size="sm">{t("mgmt.actions.exportPacket")}</Button>
        {/* Per design ruling §4.1: Enable Canary / Enable Live are NOT exposed. */}
      </div>
      <ReadinessChecklist items={page.checklist} />
      <EvidencePacketList packets={page.packets} />
      <BlockersList blockers={page.blockers} />
    </section>
  );
};
