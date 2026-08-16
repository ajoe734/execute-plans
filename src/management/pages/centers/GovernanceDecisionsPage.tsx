// MGMT-PERF-IA-001/005 — canonical Governance Decisions shell.
//
// Wave 0 (IA-001) mounted the existing capital-pool/rebalance and
// ranking-formula list components as the `capital` and `policy` tabs.
//
// Wave 1 (this task, IA-005) builds the real recommendations queue:
// `recommendations` now shows the live Human Inbox items that can change
// ranking-driven capital/promotion state (GovernanceDecisionQueue). Per the
// gap doc decision ("Governance Decisions may show a recommendation's rank
// snapshot and evidence link, but cannot host a second sortable ranking
// table" / "references immutable ranking snapshots instead of embedding a
// live ranking table"), this deliberately does NOT re-embed the legacy
// Promotion Allocation `real-ranking` panel (a live-computed, server-scored
// target-weight table — see the now-deleted RealRankingPanel): each queue
// item's own "View decision receipt" link is the per-recommendation
// snapshot/evidence reference, and the link below points to the one place
// that owns the full ranking table (Rankings Center). `capital` adds the
// same queue scoped to capital/access decisions above the existing
// pool/rebalance lists. Neither tab ever renders an apply/approve control:
// every decision and its receipt lives on the linked Human Gate detail page
// (HumanGateDetail.tsx), never here — see the shared-product constraint "no
// analysis or ranking page directly mutates live state".
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import { CANONICAL_CENTERS, canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";
import { CapitalPoolsList, RankingFormulasList, RebalancesList } from "@/management/pages/Lists";
import { GovernanceDecisionQueue } from "./GovernanceDecisionQueue";

const CENTER = CANONICAL_CENTERS["governance-decisions"];
const TAB_IDS = CENTER.tabs.map((tab) => tab.id);

function normalizeTab(value: string | null): string {
  return value && (TAB_IDS as string[]).includes(value) ? value : CENTER.defaultTab;
}

const RecommendationsQueueTab = () => {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <GovernanceDecisionQueue
        kinds={["ranking_recommendation", "promotion_review"]}
        titleKey="governanceDecisions.queue.recommendationsTitle"
        subtitleKey="governanceDecisions.queue.recommendationsSubtitle"
      />
      <Card className="p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("governanceDecisions.recommendationsImpact.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("governanceDecisions.recommendationsImpact.subtitle")}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={canonicalCenterUrl("rankings", "rolling")}>
            <Trophy className="mr-1 h-3.5 w-3.5" />
            {t("governanceDecisions.recommendationsImpact.openRankingsCenter")}
          </Link>
        </Button>
      </Card>
    </div>
  );
};

const CapitalTab = () => (
  <div className="space-y-6">
    <GovernanceDecisionQueue
      kinds={["capital_breach", "policy_violation", "rollback_request", "broker_disconnect", "sentinel"]}
      titleKey="governanceDecisions.queue.capitalTitle"
      subtitleKey="governanceDecisions.queue.capitalSubtitle"
    />
    <CapitalPoolsList />
    <RebalancesList />
  </div>
);

export const GovernanceDecisionsPage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const activeTab = normalizeTab(params.get("tab"));

  const setActiveTab = (tab: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", normalizeTab(tab));
    setParams(next, { replace: true });
  };

  return (
    <section className="p-6 space-y-4" aria-label={t("governanceDecisions.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("governanceDecisions.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("governanceDecisions.subtitle")}</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {CENTER.tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="recommendations" className="m-0">
          <RecommendationsQueueTab />
        </TabsContent>
        <TabsContent value="capital" className="m-0">
          <CapitalTab />
        </TabsContent>
        <TabsContent value="policy" className="m-0">
          <RankingFormulasList />
        </TabsContent>
      </Tabs>
    </section>
  );
};
