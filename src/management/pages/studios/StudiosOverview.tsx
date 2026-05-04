// Phase 12 — Studios hub: cards linking to each specialized studio.
import { useNavigate } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { useT } from "@/platform/hooks";
import { Calculator, Sparkles, GitBranch, Sliders, ShieldCheck, Wallet, Beaker } from "lucide-react";

const items = [
  { to: "/management/studios/formula", titleKey: "studios.formula", subKey: "studios.formulaSubtitle", icon: Calculator },
  { to: "/management/studios/fitness", titleKey: "studios.fitness", subKey: "studios.fitnessSubtitle", icon: Sparkles },
  { to: "/management/studios/evolution", titleKey: "studios.evolution", subKey: "studios.evolutionSubtitle", icon: GitBranch },
  { to: "/management/studios/allocation", titleKey: "studios.allocation", subKey: "studios.allocationSubtitle", icon: Sliders },
  { to: "/management/studios/rebalance-ops", titleKey: "studios.rebalanceOps", subKey: "studios.rebalanceOpsSubtitle", icon: ShieldCheck },
  { to: "/management/studios/capital", titleKey: "studios.capital", subKey: "studios.capitalSubtitle", icon: Wallet },
  { to: "/management/studios/skill-sandbox", titleKey: "studios.skill", subKey: "studios.skillSubtitle", icon: Beaker },
];

export const StudiosOverview = () => {
  const t = useT();
  const nav = useNavigate();
  return (
    <>
      <PageHeader title={t("studios.hub")} subtitle={t("studios.hubSubtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button key={it.to} onClick={() => nav(it.to)} className="text-left">
                <Card className="p-5 space-y-3 hover:border-accent transition-colors h-full">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted"><Icon className="h-5 w-5 text-accent" /></div>
                    <div className="text-base font-semibold">{t(it.titleKey)}</div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t(it.subKey)}</p>
                </Card>
              </button>
            );
          })}
        </div>
      </PageBody>
    </>
  );
};
