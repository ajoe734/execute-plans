// CapitalPool Mandate panel (read-only stub; Phase 12 promotes to full editor).
// Planner Response §E10 (2026-05-08) — surfaces canonical breach cadences + auto-actions.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CapitalPool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { MANDATE_BREACH_CADENCES, MANDATE_BREACH_AUTO_ACTIONS } from "@/lib/v4/mandateBreachDefaults";

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
      <Card className="p-4 space-y-2">
        <div className="text-sm font-semibold">{t("capitalPool.mandate.breachCadence", { defaultValue: "Breach detection cadence" })}</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {MANDATE_BREACH_CADENCES.map((c) => (
            <div key={c.metric} className="flex items-center justify-between rounded border border-border px-2 py-1.5">
              <span className="text-mono">{c.metric}</span>
              <span className="text-muted-foreground">
                every {Math.round(c.evaluateEverySec / 60)}m{c.eventDriven ? " · event" : ""}
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mt-3">
          {t("capitalPool.mandate.autoActions", { defaultValue: "Auto-actions" })}
        </div>
        <div className="space-y-1">
          {MANDATE_BREACH_AUTO_ACTIONS.map((a) => (
            <div key={a.severity} className="flex flex-wrap items-center gap-1 text-xs">
              <Badge variant="outline" className="text-[10px] uppercase">{a.severity}</Badge>
              <span className="text-muted-foreground">→</span>
              {a.actions.map((act) => (
                <Badge key={act} variant="secondary" className="text-mono text-[10px]">{act}</Badge>
              ))}
              <span className="text-muted-foreground ml-1">notify: {a.notify.join(", ")}</span>
            </div>
          ))}
        </div>
      </Card>
