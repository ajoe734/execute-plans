import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonaLeaguePage } from "./PersonaLeague";
import { QuarterlyRankingPage } from "./QuarterlyRanking";
import { CapitalPoolsList, RankingFormulasList, RebalancesList } from "@/management/pages/Lists";
import { RealAllocationPanel } from "./RealAllocationPanel";
import { RebalanceProposalWorkbench } from "./RebalanceProposalWorkbench";
import { EmergencyActionsPanel } from "./EmergencyActionsPanel";

type PromotionAllocationTab =
  | "paper-candidates"
  | "real-ranking"
  | "quarterly-capital"
  | "emergency-actions"
  | "formula-policy";

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
          <QuarterlyRankingPage embedded />
        </TabsContent>
        <TabsContent value="real-ranking" className="m-0 space-y-6">
          <PersonaLeaguePage embedded />
          <RealAllocationPanel />
        </TabsContent>
        <TabsContent value="quarterly-capital" className="m-0 space-y-6">
          <CapitalPoolsList />
          <RebalanceProposalWorkbench />
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
