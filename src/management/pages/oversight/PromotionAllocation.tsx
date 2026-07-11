// 2026-07-11 MGMT-PERF-IA-004 - Consolidated Rankings Center - Promotion Allocation redirection stubs
import { useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, ClipboardCheck } from "lucide-react";
import { RealRankingPanel } from "./RealRankingPanel";
import { EmergencyActionsPanel } from "./EmergencyActionsPanel";
import { CapitalPoolsList, RankingFormulasList, RebalancesList } from "@/management/pages/Lists";
import type { PromotionAllocationWorkbenchTab } from "@/routes/management/promotionAllocationRedirectHref";

type PromotionAllocationTab = PromotionAllocationWorkbenchTab;

const TABS: readonly PromotionAllocationTab[] = [
  "paper-candidates",
  "real-ranking",
  "quarterly-capital",
  "emergency-actions",
  "formula-policy",
] as const;

function normalizeTab(value: string | null): PromotionAllocationTab {
  if (value === "real-ranking" || value === "league" || value === "persona-league") return "real-ranking";
  if (value === "quarterly-capital" || value === "rebalance" || value === "quarterly-rebalance") return "quarterly-capital";
  if (value === "emergency-actions" || value === "emergency" || value === "containment") return "emergency-actions";
  if (value === "formula-policy" || value === "ranking-formulas" || value === "formula") return "formula-policy";
  return "paper-candidates";
}

export const PromotionAllocationPage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const activeTab = normalizeTab(params.get("tab"));

  const setActiveTab = (tab: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", normalizeTab(tab));
    setParams(next, { replace: true });
  };

  return (
    <section className="p-6 space-y-4" aria-label={t("promotionAllocation.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("promotionAllocation.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("promotionAllocation.subtitle")}</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`promotionAllocation.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="paper-candidates" className="m-0">
          <Card className="p-6 border-border/80 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-3 bg-primary/10 rounded-full text-primary">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div className="space-y-2 max-w-md">
              <h3 className="text-base font-semibold text-foreground">Quarterly Candidates Evaluation</h3>
              <p className="text-sm text-muted-foreground">
                Quarterly candidate evaluation tables are now consolidated and managed in the Rankings Center.
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/management/rankings?tab=quarterly">Go to Rankings Center (Quarterly)</Link>
            </Button>
          </Card>
        </TabsContent>
        <TabsContent value="real-ranking" className="m-0 space-y-6">
          <RealRankingPanel />
          <Card className="p-6 border-border/80 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-3 bg-primary/10 rounded-full text-primary">
              <Trophy className="h-6 w-6" />
            </div>
            <div className="space-y-2 max-w-md">
              <h3 className="text-base font-semibold text-foreground">Rolling Persona League Rankings</h3>
              <p className="text-sm text-muted-foreground">
                The continuous rolling ranking system is now consolidated and managed in the Rankings Center.
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/management/rankings?tab=rolling">Go to Rankings Center (Rolling)</Link>
            </Button>
          </Card>
        </TabsContent>
        <TabsContent value="quarterly-capital" className="m-0 space-y-6">
          <CapitalPoolsList />
          <RebalancesList />
        </TabsContent>
        <TabsContent value="emergency-actions" className="m-0">
          <EmergencyActionsPanel />
        </TabsContent>
        <TabsContent value="formula-policy" className="m-0">
          <RankingFormulasList />
        </TabsContent>
      </Tabs>
    </section>
  );
};
