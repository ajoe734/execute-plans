// 2026-05-20 revamp §7.5 + design ruling §4.5 — Strict Publish Audit.
import { useMemo } from "react";
import { ReadinessHeader } from "@/management/components/readiness/ReadinessHeader";
import { ReadinessChecklist } from "@/management/components/readiness/ReadinessChecklist";
import { EvidencePacketList } from "@/management/components/readiness/EvidencePacketList";
import { BlockersList } from "@/management/components/readiness/BlockersList";
import { buildReadinessPage, passItem } from "@/lib/v5/management/readinessSeeds";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";

const checklist = [
  passItem("deployment_url", "Deployment URL present", "operator"),
  passItem("strict_env_manifest", "Strict env manifest present", "operator"),
  passItem("vite_bff_mode_live", "VITE_BFF_MODE=live", "operator", false),
  passItem("vite_bff_fallback_strict", "VITE_BFF_FALLBACK=strict", "operator", false),
  passItem("vite_bff_real_writes_false", "VITE_BFF_REAL_WRITES=false", "operator", false),
  passItem("bundle_hash", "Bundle hash present", "operator"),
  passItem("forbidden_path_scan", "Forbidden path scan passed", "operator"),
  passItem("no_seed_fallback", "No seed fallback proof present", "operator"),
  passItem("browser_probe", "Browser probe passed", "operator"),
  passItem("api_version_match", "API version matched", "operator"),
  passItem("audit_json", "Audit JSON present", "operator"),
  passItem("audit_markdown", "Audit markdown present", "operator"),
];

const packets = [
  { id: "strict-publish-2026-05-20", packetType: "StrictPublishAudit", status: "verified" as const, hash: "0xstrict20260520", createdAt: "2026-05-20T11:30:00Z", linkedObject: "deployment:pantheon-dev" },
];

const blockers: never[] = [];

export const StrictPublishAuditPage = () => {
  const page = buildReadinessPage({
    title: "Strict Publish Audit",
    environment: "strict-live",
    checklist, packets, blockers,
    lastUpdated: "2026-05-20T12:00:00Z",
  });
  return (
    <section className="p-6 space-y-4" aria-label="Strict Publish Audit">
      <ReadinessHeader model={page.header} />
      <ReadinessChecklist items={page.checklist} />
      <EvidencePacketList packets={page.packets} />
      <BlockersList blockers={page.blockers} />
    </section>
  );
};
