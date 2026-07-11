// 2026-07-11 MGMT-PERF-IA-005 — legacy Promotion & Allocation shell.
//
// PromotionAllocationLegacyGate (src/routes/management/managementCanonicalRedirect.tsx)
// only ever mounts this page for ?tab=emergency-actions|emergency|containment
// — every other tab (and the bare route) redirects through
// ManagementCanonicalRedirect before this component renders, per the route
// manifest (src/management/navigation/managementRouteManifest.ts). Emergency
// actions has no canonical-center home yet (PPL-ALLOC-008 territory), so it
// stays here; paper-candidates/real-ranking/quarterly-capital/formula-policy
// no longer have a page body here — their content lives in the Rankings
// Center and Governance Decisions canonical centers.
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, ClipboardCheck, Trophy } from "lucide-react";
import { EmergencyActionsPanel } from "./EmergencyActionsPanel";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";

export const PromotionAllocationPage = () => {
  const { t } = useTranslation();

  return (
    <section className="p-6 space-y-4" aria-label={t("promotionAllocation.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("promotionAllocation.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("promotionAllocation.subtitle")}</p>
      </header>

      <Card className="p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("promotionAllocation.moved.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("promotionAllocation.moved.body")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to={canonicalCenterUrl("performance")}>
              <BarChart3 className="mr-1 h-3.5 w-3.5" />
              {t("promotionAllocation.moved.openPerformanceCenter")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={canonicalCenterUrl("rankings")}>
              <Trophy className="mr-1 h-3.5 w-3.5" />
              {t("promotionAllocation.moved.openRankingsCenter")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={canonicalCenterUrl("governance-decisions")}>
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
              {t("promotionAllocation.moved.openGovernanceDecisions")}
            </Link>
          </Button>
        </div>
      </Card>

      <EmergencyActionsPanel />
    </section>
  );
};
