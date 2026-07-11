// MGMT-PERF-IA-001 — canonical Governance Decisions shell.
//
// Wave 0: mounts the existing capital-pool/rebalance and ranking-formula
// list components (previously Promotion Allocation's `quarterly-capital`
// and `formula-policy` tabs) as the `capital` and `policy` tabs. The
// `recommendations` tab has no existing 1:1 component — Promotion
// Allocation never had a distinct recommendations surface, so this task
// does not fabricate one. It links to the still-live legacy Promotion
// Allocation ranking tabs and the generic Governance Queue as an interim
// path until MGMT-PERF-IA-005 builds the real recommendation ->
// review -> apply-receipt lifecycle.
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CANONICAL_CENTERS } from "@/management/navigation/managementRouteManifest";
import { CapitalPoolsList, RankingFormulasList, RebalancesList } from "@/management/pages/Lists";

const CENTER = CANONICAL_CENTERS["governance-decisions"];
const TAB_IDS = CENTER.tabs.map((tab) => tab.id);

function normalizeTab(value: string | null): string {
  return value && (TAB_IDS as string[]).includes(value) ? value : CENTER.defaultTab;
}

const RecommendationsPendingNotice = () => {
  const { t } = useTranslation();
  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{t("governanceDecisions.recommendationsPending.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("governanceDecisions.recommendationsPending.body")}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/management/governance">{t("governanceDecisions.recommendationsPending.openGovernanceQueue")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/management/promotion-allocation">{t("governanceDecisions.recommendationsPending.openLegacyPromotionAllocation")}</Link>
        </Button>
      </div>
    </Card>
  );
};

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
          <RecommendationsPendingNotice />
        </TabsContent>
        <TabsContent value="capital" className="m-0 space-y-6">
          <CapitalPoolsList />
          <RebalancesList />
        </TabsContent>
        <TabsContent value="policy" className="m-0">
          <RankingFormulasList />
        </TabsContent>
      </Tabs>
    </section>
  );
};
