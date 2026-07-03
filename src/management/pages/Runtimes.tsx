import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { lists, runActionSafe, useLiveListV1 } from "@/lib/bff-v1";
import type { RuntimeListItem } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, RotateCcw, PowerOff, Move, Maximize2, ShieldAlert, ScrollText, Ban, Skull } from "lucide-react";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";

const NAN = "nan";

type RuntimeAction = "restart" | "drain" | "move" | "scale" | "quarantine" | "inspect_logs" | "disable_new";

type RuntimeRow = RuntimeListItem & {
  bindingId?: string;
  binding_id?: string;
};

const cleanText = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && trimmed !== "null" && trimmed !== "undefined") return trimmed;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const textOrNan = (...values: unknown[]): string => cleanText(...values) ?? NAN;

const hasFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const progressValue = (value: unknown): number =>
  hasFinite(value) ? Math.max(0, Math.min(100, value * 100)) : 0;

const formatRatio = (value: unknown): string =>
  hasFinite(value) ? `${(value * 100).toFixed(0)}%` : NAN;

const formatUptime = (value: unknown): string =>
  hasFinite(value) ? `${value.toFixed(2)}%` : NAN;

const formatLatency = (value: unknown): string =>
  hasFinite(value) ? `${value}ms` : NAN;

const envTone = (e?: string) => {
  if (e === "live") return "bg-env-live-bg text-status-success border-status-success/30";
  if (e === "paper") return "bg-env-paper-bg text-status-warning border-status-warning/30";
  if (e === "research") return "bg-env-research-bg text-status-running border-status-running/30";
  return "bg-muted text-muted-foreground border-border";
};

const runtimeIdOf = (r: RuntimeRow): string | undefined =>
  cleanText(r.runtimeId, r.runtime_id, r.id);

const bindingIdOf = (r: RuntimeRow): string | undefined =>
  cleanText(r.runtimeBindingId, r.runtime_binding_id, r.bindingId, r.binding_id);

const personaIdOf = (r: RuntimeRow): string | undefined =>
  cleanText(r.personaId, r.persona_id);

const actionTargetId = (r: RuntimeRow): string | undefined =>
  runtimeIdOf(r) ?? cleanText(r.id);

const matchesAny = (needle: string, values: Array<string | undefined>): boolean =>
  values.some((value) => value === needle);

const matchesPersona = (r: RuntimeRow, persona: string): boolean =>
  matchesAny(persona, [personaIdOf(r)]);

const matchesRuntime = (r: RuntimeRow, runtime: string): boolean =>
  matchesAny(runtime, [runtimeIdOf(r), cleanText(r.id)]);

const matchesBinding = (r: RuntimeRow, binding: string): boolean =>
  matchesAny(binding, [bindingIdOf(r), cleanText(r.id)]);

function filterRuntimeRowsForFocus(
  rows: RuntimeRow[],
  focus: { personaFocus?: string; runtimeFocus?: string; bindingFocus?: string },
): { rows: RuntimeRow[]; matched: boolean } {
  let scoped = rows;
  let matched = true;
  const runtimeFocus = focus.runtimeFocus?.trim() ?? "";
  const bindingFocus = focus.bindingFocus?.trim() ?? "";
  const personaFocus = focus.personaFocus?.trim() ?? "";

  if (runtimeFocus) {
    const next = scoped.filter((r) => matchesRuntime(r, runtimeFocus));
    matched = matched && next.length > 0;
    scoped = next;
  }
  if (bindingFocus) {
    const next = scoped.filter((r) => matchesBinding(r, bindingFocus));
    matched = matched && next.length > 0;
    scoped = next;
  }
  if (personaFocus) {
    const next = scoped.filter((r) => matchesPersona(r, personaFocus));
    matched = matched && next.length > 0;
    scoped = next;
  }

  return { rows: scoped, matched };
}

export const RuntimesPage = () => {
  const t = useT();
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const runtimeFocus = searchParams.get("runtime")?.trim() ?? "";
  const bindingFocus = searchParams.get("binding")?.trim() ?? "";
  const { items: rows, refresh, loading } = useLiveListV1<RuntimeRow>(lists.runtimes, ["Runtime"]);
  const [killTarget, setKillTarget] = useState<RuntimeRow | null>(null);

  const focusFiltered = useMemo(
    () => filterRuntimeRowsForFocus(rows, { personaFocus, runtimeFocus, bindingFocus }),
    [bindingFocus, personaFocus, rows, runtimeFocus],
  );

  const hasFocus = Boolean(personaFocus || runtimeFocus || bindingFocus);
  const visibleRows = focusFiltered.rows;

  const run = async (r: RuntimeRow, action: RuntimeAction) => {
    const id = actionTargetId(r);
    if (!id) return;
    const mappedAction = action === "disable_new" ? "quarantine" : action;
    const receipt = await runActionSafe({
      kind: "Runtime",
      id,
      action: mappedAction,
      memo: action === "disable_new" ? "disable_new_deployments" : "from runtimes table",
    }, {
      successTitle: t(`runtime.actions.${action}.toast`, { name: textOrNan(r.name, runtimeIdOf(r)) }),
    });
    if (!receipt.ok) return;
    refresh();
  };

  return (
    <>
      <PageHeader title={t("nav.runtimes")} subtitle={t("runtime.subtitle")} />
      <PageBody>
        {hasFocus && (
          <Card className={`mb-3 p-3 text-sm ${focusFiltered.matched ? "border-primary/30 bg-primary/5" : "border-status-warning/30 bg-status-warning/10"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-foreground">
                {focusFiltered.matched
                  ? t("runtime.focusedFmt", {
                    persona: personaFocus || NAN,
                    runtime: runtimeFocus || NAN,
                    binding: bindingFocus || NAN,
                    count: visibleRows.length,
                  })
                  : t("runtime.focusMissingFmt", {
                    persona: personaFocus || NAN,
                    runtime: runtimeFocus || NAN,
                    binding: bindingFocus || NAN,
                  })}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to="/management/runtimes">{t("runtime.showAll")}</Link>
              </Button>
            </div>
          </Card>
        )}
        <DataTable
          rows={visibleRows}
          empty={loading ? t("common.loading", { defaultValue: "Loading..." }) : t("runtime.empty", { defaultValue: "No runtime rows." })}
          columns={[
            {
              key: "name",
              header: t("table.name"),
              cell: (r) => {
                const runtimeId = runtimeIdOf(r);
                const bindingId = bindingIdOf(r);
                const personaId = personaIdOf(r);
                const primary = textOrNan(r.name, runtimeId, bindingId);
                return (
                  <div className="min-w-[220px]">
                    <div className="font-medium text-mono text-xs">{primary}</div>
                    {runtimeId && runtimeId !== primary && <div className="font-mono text-[11px] text-muted-foreground">{runtimeId}</div>}
                    {bindingId && bindingId !== runtimeId && <div className="font-mono text-[11px] text-muted-foreground">{bindingId}</div>}
                    {personaId && <div className="font-mono text-[11px] text-muted-foreground">{personaId}</div>}
                  </div>
                );
              },
            },
            { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-xs uppercase tracking-wider text-muted-foreground">{textOrNan(r.kind, r.runtimeKind, r.runtime_kind)}</span> },
            { key: "env", header: t("table.env"), cell: (r) => {
              const env = cleanText(r.env, r.deploymentStage, r.deployment_stage);
              return <Badge variant="outline" className={`uppercase text-[10px] ${envTone(env)}`}>{env ?? NAN}</Badge>;
            } },
            { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={cleanText(r.status)} /> },
            { key: "cpu", header: "CPU", cell: (r) => <div className="flex items-center gap-2 w-28"><Progress value={progressValue(r.cpu)} className="h-1.5" /><span className="text-mono text-xs w-10 text-right">{formatRatio(r.cpu)}</span></div> },
            { key: "mem", header: "Memory", cell: (r) => <div className="flex items-center gap-2 w-28"><Progress value={progressValue(r.memory)} className="h-1.5" /><span className="text-mono text-xs w-10 text-right">{formatRatio(r.memory)}</span></div> },
            { key: "lat", header: "p95 latency", cell: (r) => <span className={`text-mono text-xs ${hasFinite(r.latencyP95Ms) && r.latencyP95Ms > 1000 ? "text-status-warning" : ""}`}>{formatLatency(r.latencyP95Ms)}</span> },
            { key: "up", header: "Uptime", cell: (r) => <span className="text-mono text-xs">{formatUptime(r.uptimePct)}</span> },
            { key: "region", header: t("table.region"), cell: (r) => <span className="text-mono text-xs">{textOrNan(r.region)}</span> },
            { key: "act", header: "", cell: (r) => {
              const canAct = Boolean(actionTargetId(r));
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={!canAct} onClick={(e) => e.stopPropagation()}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => run(r, "restart")}><RotateCcw className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.restart.label")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => run(r, "drain")}><PowerOff className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.drain.label")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => run(r, "move")}><Move className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.move.label")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => run(r, "scale")}><Maximize2 className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.scale.label")}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => run(r, "disable_new")}><Ban className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.disable_new.label")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => run(r, "quarantine")} className="text-status-warning"><ShieldAlert className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.quarantine.label")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => run(r, "inspect_logs")}><ScrollText className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.inspect_logs.label")}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setKillTarget(r)} className="text-destructive"><Skull className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.emergency_kill.label")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            } },
          ]}
        />
      </PageBody>
      {killTarget && (
        <HighRiskConfirm
          open={!!killTarget}
          onOpenChange={(o) => !o && setKillTarget(null)}
          operation="runtime.emergency_kill"
          target={{ type: "Runtime", id: actionTargetId(killTarget) ?? textOrNan(killTarget.id), name: textOrNan(killTarget.name, runtimeIdOf(killTarget)) }}
          risk="critical"
          destructive
          riskImpact={t("runtime.actions.emergency_kill.impact")}
          confirmToken="KILL"
          onConfirm={async (memo) => {
            const id = actionTargetId(killTarget);
            if (!id) return;
            const receipt = await runActionSafe({
              kind: "Runtime",
              id,
              action: "emergency_kill",
              memo,
            }, {
              successTitle: t("runtime.actions.emergency_kill.toast", { name: textOrNan(killTarget.name, runtimeIdOf(killTarget)) }),
            });
            if (!receipt.ok) return;
            refresh();
          }}
        />
      )}
    </>
  );
};
