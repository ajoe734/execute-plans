// MGMT-PERF-IA-001 — canonical Rankings Center shell.
//
// Wave 0: mounts the existing rolling (Persona League) and quarterly
// (Quarterly Ranking) page components as tabs, the same components
// Promotion Allocation's `real-ranking`/`paper-candidates` tabs already
// embedded. MGMT-PERF-IA-004 consolidates and dedupes their read models.
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CANONICAL_CENTERS } from "@/management/navigation/managementRouteManifest";
import { PersonaLeaguePage } from "@/management/pages/oversight/PersonaLeague";
import { QuarterlyRankingPage } from "@/management/pages/oversight/QuarterlyRanking";

const CENTER = CANONICAL_CENTERS.rankings;
const TAB_IDS = CENTER.tabs.map((tab) => tab.id);

function normalizeTab(value: string | null): string {
  return value && (TAB_IDS as string[]).includes(value) ? value : CENTER.defaultTab;
}

export const RankingsCenterPage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const activeTab = normalizeTab(params.get("tab"));

  const setActiveTab = (tab: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", normalizeTab(tab));
    setParams(next, { replace: true });
  };

  return (
    <section className="p-6 space-y-4" aria-label={t("rankingsCenter.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("rankingsCenter.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("rankingsCenter.subtitle")}</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {CENTER.tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="rolling" className="m-0">
          <PersonaLeaguePage embedded />
        </TabsContent>
        <TabsContent value="quarterly" className="m-0">
          <QuarterlyRankingPage embedded />
        </TabsContent>
      </Tabs>
    </section>
  );
};
