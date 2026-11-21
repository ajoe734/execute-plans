import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { tradeJourneyHref } from "@/management/navigation/tradeJourneyLinks";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { realWritesEnabled, runActionSafe, useLiveListV1 } from "@/lib/bff-v1";
import { notReportedLabel, resolveBffSubjectDisplay, sanitizeRawText } from "@/lib/enumLabels";
import { useT } from "@/platform/hooks";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, RotateCcw, PowerOff, Move, Maximize2, ShieldAlert, ScrollText, Ban, Skull } from "lucide-react";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { NON_PRODUCTION_COMMAND_REASON } from "@/management/components/NonProductionActionButton";
import { runtimesWithFleetFallback, type FleetRuntimeRow } from "./runtimeFleetFallback";

type RuntimeAction = "restart" | "drain" | "move" | "scale" | "quarantine" | "inspect_logs" | "disable_new" | "emergency_kill";

type RuntimeRow = FleetRuntimeRow & {
  bindingId?: string;
  binding_id?: string;
};

const cleanText = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const clean = sanitizeRawText(value);
    if (clean) return clean;
  }
  return undefined;
};

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

const strategyIdOf = (r: RuntimeRow): string | undefined =>
  cleanText(r.strategyId, r.strategy_id);

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
  const notReported = notReportedLabel(t);
  const textOrNotReported = (...values: unknown[]): string => cleanText(...values) ?? notReported;
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const runtimeFocus = searchParams.get("runtime")?.trim() ?? "";
  const bindingFocus = searchParams.get("binding")?.trim() ?? "";
  const { items: rows, refresh, loading } = useLiveListV1<RuntimeRow>(runtimesWithFleetFallback, ["Runtime", "PersonaFleet"]);
  const [killTarget, setKillTarget] = useState<RuntimeRow | null>(null);

  const focusFiltered = useMemo(
    () => filterRuntimeRowsForFocus(rows, { personaFocus, runtimeFocus, bindingFocus }),
    [bindingFocus, personaFocus, rows, runtimeFocus],
  );

  const hasFocus = Boolean(personaFocus || runtimeFocus || bindingFocus);
  const visibleRows = focusFiltered.rows;

  const run = async (r: RuntimeRow, action: RuntimeAction, memoOverride?: string) => {
    if (!realWritesEnabled()) return;
    const id = actionTargetId(r);
    if (!id || r.fleetDerived) return;
    const mappedAction = action === "disable_new" ? "quarantine" : action;
    const receipt = await runActionSafe({
      kind: "Runtime",
      id,
      action: mappedAction,
      memo: memoOverride ?? (action === "disable_new" ? "disable_new_deployments" : "from runtimes table"),
    }, {
      successTitle: t(`runtime.actions.${action}.toast`, { name: textOrNotReported(r.name, runtimeIdOf(r)) }),
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
                    persona: personaFocus || notReported,
                    runtime: runtimeFocus || notReported,
                    binding: bindingFocus || notReported,
                    count: visibleRows.length,
                  })
                  : t("runtime.focusMissingFmt", {
                    persona: personaFocus || notReported,
                    runtime: runtimeFocus || notReported,
                    binding: bindingFocus || notReported,
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
                const strategyId = strategyIdOf(r);
                const personaDisplay = resolveBffSubjectDisplay(
                  {
                    id: personaId,
                    displayName: cleanText(r.personaDisplayName, r.persona_display_name, r.personaName),
                    nameMissing: r.personaNameMissing ?? r.persona_name_missing,
                  },
                  t,
                );
                const strategyDisplay = resolveBffSubjectDisplay(
                  {
                    id: strategyId,
                    displayName: cleanText(r.strategyDisplayName, r.strategy_display_name),
                    nameMissing: r.strategyNameMissing ?? r.strategy_name_missing,
                  },
                  t,
                );
                const hasPersonaSubject = Boolean(
                  personaId || cleanText(r.personaDisplayName, r.persona_display_name, r.personaName),
                );
                const hasStrategySubject = Boolean(
                  strategyId || cleanText(r.strategyDisplayName, r.strategy_display_name),
                );
                const runtimeLabel = textOrNotReported(r.name, runtimeId, bindingId);
                const hasDistinctDisplayHeadline =
                  (hasPersonaSubject && personaDisplay.primaryText !== personaId) ||
                  (hasStrategySubject && strategyDisplay.primaryText !== strategyId);
                return (
                  <div className="min-w-[220px] space-y-0.5">
                    {hasPersonaSubject && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            personaDisplay.primaryText !== personaId
                              ? "font-medium text-xs text-foreground"
                              : "font-mono text-[11px] text-muted-foreground"
                          }
                          data-testid="runtime-persona-display"
                        >
                          {personaDisplay.primaryText}
                        </span>
                        {personaDisplay.nameMissing && (
                          <Badge
                            variant="outline"
                            data-testid="runtime-persona-name-missing"
                            data-name-missing="true"
                            className="border-status-warning/40 text-[10px] text-status-warning"
                          >
                            {personaDisplay.nameMissingLabel}
                          </Badge>
                        )}
                      </div>
                    )}
                    {hasStrategySubject && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            strategyDisplay.primaryText !== strategyId
                              ? "font-medium text-xs text-foreground"
                              : "font-mono text-[11px] text-muted-foreground"
                          }
                          data-testid="runtime-strategy-display"
                        >
                          {strategyDisplay.primaryText}
                        </span>
                        {strategyDisplay.nameMissing && (
                          <Badge
                            variant="outline"
                            data-testid="runtime-strategy-name-missing"
                            data-name-missing="true"
                            className="border-status-warning/40 text-[10px] text-status-warning"
                          >
                            {strategyDisplay.nameMissingLabel}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div
                      className={
                        hasDistinctDisplayHeadline
                          ? "font-mono text-[11px] text-muted-foreground"
                          : "font-medium text-mono text-xs"
                      }
                    >
                      {runtimeLabel}
                    </div>
                    {runtimeId && runtimeId !== runtimeLabel && (
                      <div className="font-mono text-[11px] text-muted-foreground">{runtimeId}</div>
                    )}
                    {bindingId && bindingId !== runtimeId && bindingId !== runtimeLabel && (
                      <div className="font-mono text-[11px] text-muted-foreground">{bindingId}</div>
                    )}
                    {personaDisplay.secondaryId && (
                      <div className="font-mono text-[11px] text-muted-foreground" data-testid="runtime-persona-id">
                        {personaDisplay.secondaryId}
                      </div>
                    )}
                    {strategyDisplay.secondaryId && (
                      <div className="font-mono text-[11px] text-muted-foreground" data-testid="runtime-strategy-id">
                        {strategyDisplay.secondaryId}
                      </div>
                    )}
                    {personaId && (
                      <Link
                        aria-label={`${personaId} trade journeys`}
                        to={tradeJourneyHref(location, { personaId }, "Runtimes")}
                        className="mt-0.5 inline-block text-[11px] text-primary hover:underline"
                      >
                        {t("nav.tradeJourneys", { defaultValue: "Trade Journeys" })}
                      </Link>
                    )}
                  </div>
                );
              },
            },
            { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-xs uppercase tracking-wider text-muted-foreground">{textOrNotReported(r.kind, r.runtimeKind, r.runtime_kind)}</span> },
            { key: "env", header: t("table.env"), cell: (r) => {
              const env = cleanText(r.env, r.deploymentStage, r.deployment_stage);
              return <Badge variant="outline" className={`uppercase text-[10px] ${envTone(env)}`}>{env ?? notReported}</Badge>;
            } },
            { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={cleanText(r.status)} /> },
            { key: "act", header: "", cell: (r) => {
              const writesAllowed = realWritesEnabled();
              const canAct = writesAllowed && Boolean(actionTargetId(r)) && !r.fleetDerived;
              return (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      disabled={!canAct}
                      aria-disabled={!canAct}
                      title={!writesAllowed ? NON_PRODUCTION_COMMAND_REASON : undefined}
                      aria-label={t("runtime.actions.menu", { defaultValue: "Runtime actions" })}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem disabled={!canAct} onClick={() => run(r, "restart")}><RotateCcw className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.restart.label")}</DropdownMenuItem>
                    <DropdownMenuItem disabled={!canAct} onClick={() => run(r, "drain")}><PowerOff className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.drain.label")}</DropdownMenuItem>
                    <DropdownMenuItem disabled={!canAct} onClick={() => run(r, "move")}><Move className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.move.label")}</DropdownMenuItem>
                    <DropdownMenuItem disabled={!canAct} onClick={() => run(r, "scale")}><Maximize2 className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.scale.label")}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={!canAct} onClick={() => run(r, "disable_new")}><Ban className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.disable_new.label")}</DropdownMenuItem>
                    <DropdownMenuItem disabled={!canAct} onClick={() => run(r, "quarantine")} className="text-status-warning"><ShieldAlert className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.quarantine.label")}</DropdownMenuItem>
                    <DropdownMenuItem disabled={!canAct} onClick={() => run(r, "inspect_logs")}><ScrollText className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.inspect_logs.label")}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={!canAct} onClick={() => { if (!canAct) return; setKillTarget(r); }} className="text-destructive"><Skull className="h-3.5 w-3.5 mr-2" />{t("runtime.actions.emergency_kill.label")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            } },
          ]}
        />
      </PageBody>
      {killTarget && (
        <HighRiskConfirm
          open={!!killTarget && realWritesEnabled()}
          onOpenChange={(o) => !o && setKillTarget(null)}
          operation="runtime.emergency_kill"
          target={{ type: "Runtime", id: actionTargetId(killTarget) ?? textOrNotReported(killTarget.id), name: textOrNotReported(killTarget.name, runtimeIdOf(killTarget)) }}
          risk="critical"
          destructive
          riskImpact={t("runtime.actions.emergency_kill.impact")}
          confirmToken="KILL"
          onConfirm={async (memo) => {
            if (!killTarget || !realWritesEnabled()) return;
            const target = killTarget;
            setKillTarget(null);
            await run(target, "emergency_kill", memo);
          }}
        />
      )}
    </>
  );
};
