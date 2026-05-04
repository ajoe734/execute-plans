// CapitalPool Mandate panel (read-only stub; Phase 12 promotes to full editor).
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CapitalPool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

export const MandatePanel = ({ pool }: { pool: CapitalPool }) => {
  const t = useT();
  const charter = [
    { k: "objective", v: t("capitalPool.mandate.objectiveValue", { defaultValue: "Generate risk-adjusted alpha within sanctioned mandate." }) },
    { k: "horizon", v: t("capitalPool.mandate.horizonValue", { defaultValue: "Quarterly review cycle, 12-month horizon." }) },
    { k: "currency", v: pool.currency },
    { k: "allocated", v: `${pool.currency} ${pool.allocated.toLocaleString()}` },
  ];
  const rules = [
    { id: "b1", text: t("capitalPool.mandate.rule1", { defaultValue: "No single strategy > 35% of allocated capital." }), tone: "warning" },
    { id: "b2", text: t("capitalPool.mandate.rule2", { defaultValue: "Live-env strategies require dual approval." }), tone: "danger" },
    { id: "b3", text: t("capitalPool.mandate.rule3", { defaultValue: "Drawdown breach > 8% triggers auto-pause." }), tone: "warning" },
  ];
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="text-sm font-semibold">{t("capitalPool.mandate.charter")}</div>
        <div className="grid grid-cols-2 gap-3">
          {charter.map((c) => (
            <div key={c.k} className="text-xs">
              <div className="uppercase tracking-wider text-muted-foreground">{c.k}</div>
              <div className="text-sm mt-0.5">{c.v}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-semibold">{t("capitalPool.mandate.bindingRules")}</div>
        {rules.map((r) => (
          <div key={r.id} className="flex items-start gap-2 p-2 rounded-md border border-border">
            <Badge variant="outline" className="text-[10px] uppercase">{r.id}</Badge>
            <span className="text-sm flex-1">{r.text}</span>
          </div>
        ))}
      </Card>
    </div>
  );
};
