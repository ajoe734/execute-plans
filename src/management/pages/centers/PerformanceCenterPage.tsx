// MGMT-PERF-IA-001 — canonical Performance Center shell.
//
// Wave 0: mounts the existing, unmodified overview/attribution page
// components as tabs so the canonical URL is fully functional on merge.
// MGMT-PERF-IA-003 replaces the `exposure` tab body with a dedicated
// Exposure & Holdings read model instead of reusing the overview component.
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CANONICAL_CENTERS } from "@/management/navigation/managementRouteManifest";
import { PortfolioBookPage } from "@/management/pages/oversight/PortfolioBook";
import { PerformanceAttributionPage } from "@/management/pages/oversight/PerformanceAttribution";

const CENTER = CANONICAL_CENTERS.performance;
const TAB_IDS = CENTER.tabs.map((tab) => tab.id);

function normalizeTab(value: string | null): string {
  return value && (TAB_IDS as string[]).includes(value) ? value : CENTER.defaultTab;
}

export const PerformanceCenterPage = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const activeTab = normalizeTab(params.get("tab"));

  const setActiveTab = (tab: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", normalizeTab(tab));
    setParams(next, { replace: true });
  };

  return (
    <section className="p-6 space-y-4" aria-label={t("performanceCenter.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("performanceCenter.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("performanceCenter.subtitle")}</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {CENTER.tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="m-0">
          <PortfolioBookPage embedded />
        </TabsContent>
        <TabsContent value="attribution" className="m-0">
          <PerformanceAttributionPage embedded />
        </TabsContent>
        <TabsContent value="exposure" className="m-0">
          <PortfolioBookPage embedded />
        </TabsContent>
      </Tabs>
    </section>
  );
};
