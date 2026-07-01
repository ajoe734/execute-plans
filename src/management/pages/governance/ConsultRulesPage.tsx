// Phase 11.5 — Consult Rules manager (persona → persona consultation policies).
import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { bff, managementConsoleReads } from "@/lib/bff-v1";
import type { ConsultRule, Persona } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";

const ENVS: ("research" | "paper" | "live")[] = ["research", "paper", "live"];
const MODES: ConsultRule["mode"][] = ["advisory", "blocking", "ack"];

const modeTone: Record<ConsultRule["mode"], string> = {
  advisory: "border-accent/40 text-accent",
  blocking: "border-risk-high/40 text-risk-high",
  ack: "border-status-warning/40 text-status-warning",
};

export const ConsultRulesPage = () => {
  const t = useT();
  const [rules, setRules] = useState<ConsultRule[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);

  useEffect(() => {
    managementConsoleReads.consultRules().then((envelope) => setRules(envelope.items));
    bff.personas.list().then(setPersonas);
  }, []);

  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  const enabledCount = useMemo(() => rules.filter((r) => r.enabled).length, [rules]);

  return (
    <>
      <PageHeader
        title={t("governance.consult.title")}
        subtitle={t("governance.consult.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <NonProductionActionButton size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1" />{t("governance.consult.add")}</NonProductionActionButton>
            <NonProductionActionButton size="sm">{t("actions.submitForReview")}</NonProductionActionButton>
          </div>
        }
      />
      <PageBody>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="p-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("governance.consult.totalRules")}</div>
            <div className="text-2xl font-semibold mt-1">{rules.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("governance.consult.enabled")}</div>
            <div className="text-2xl font-semibold mt-1 text-status-success">{enabledCount}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("governance.consult.blocking")}</div>
            <div className="text-2xl font-semibold mt-1 text-risk-high">{rules.filter((r) => r.mode === "blocking" && r.enabled).length}</div>
          </Card>
        </div>

        <div className="space-y-2">
          {rules.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Switch checked={r.enabled} disabled />
                <Input value={r.name} disabled className="h-8 text-sm font-medium flex-1" />
                <Badge variant="outline" className={`text-[10px] uppercase ${modeTone[r.mode]}`}>{r.mode}</Badge>
                <NonProductionActionButton size="icon" variant="ghost" className="h-7 w-7 p-0" aria-label={t("actions.delete")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </NonProductionActionButton>
              </div>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.consult.from")}</label>
                  <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mt-0.5" value={r.fromPersonaId} disabled>
                    {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-1 flex items-center justify-center pb-1.5"><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>
                <div className="col-span-3">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.consult.to")}</label>
                  <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mt-0.5" value={r.toPersonaId} disabled>
                    {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.consult.mode")}</label>
                  <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs mt-0.5" value={r.mode} disabled>
                    {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.consult.envScope")}</label>
                  <div className="flex gap-1 mt-1">
                    {ENVS.map((e) => {
                      const on = r.envScope.includes(e);
                      return (
                        <button key={e} disabled className={`px-2 py-0.5 rounded text-[10px] uppercase border ${on ? "border-accent text-accent bg-accent/10" : "border-border text-muted-foreground"}`}>{e}</button>
                      );
                    })}
                  </div>
                </div>
                <div className="col-span-12 mt-1">
                  <label className="text-[10px] uppercase text-muted-foreground">{t("governance.consult.trigger")}</label>
                  <Input value={r.trigger} disabled className="h-8 text-xs text-mono mt-0.5" placeholder="e.g. order.risk>=high" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border text-[10px] text-muted-foreground">
                <span>{t("table.owner")}: <span className="text-mono text-foreground">{r.owner}</span></span>
                <span>·</span>
                <span>{t("table.updated")}: {safeDateTime(r.updatedAt)}</span>
                <span className="ml-auto text-mono">{personaName(r.fromPersonaId)} → {personaName(r.toPersonaId)}</span>
              </div>
            </Card>
          ))}
          {rules.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">{t("empty.none")}</Card>}
        </div>
      </PageBody>
    </>
  );
};
