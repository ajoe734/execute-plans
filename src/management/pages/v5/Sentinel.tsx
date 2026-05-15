// Pack E E5 — /management/sentinel
// High-fidelity findings list + remediation drawer with Q24 advisory /
// guarded_automation / emergency_override flow. Emergency wraps HighRiskConfirm.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { v5 } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { toast } from "@/components/ui/use-toast";
import { useV5Live } from "./useV5Live";
import type { SentinelFinding, RemediationAction } from "@/lib/v5";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonThreshold } from "@/components/ui/skeleton-threshold";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck } from "lucide-react";

const sevCls: Record<string, string> = {
  critical: "bg-status-failed/15 text-status-failed border-status-failed/30",
  warning: "bg-status-warning/15 text-status-warning border-status-warning/30",
  watch: "bg-accent/15 text-accent border-accent/30",
  info: "bg-muted text-muted-foreground border-border",
};

const statusCls: Record<string, string> = {
  open: "bg-status-failed/15 text-status-failed border-status-failed/30",
  acknowledged: "bg-status-warning/15 text-status-warning border-status-warning/30",
  action_pending: "bg-status-warning/15 text-status-warning border-status-warning/30",
  mitigating: "bg-status-running/15 text-status-running border-status-running/30",
  resolved: "bg-status-success/15 text-status-success border-status-success/30",
  dismissed: "bg-muted text-muted-foreground border-border",
};

const modeCls: Record<string, string> = {
  advisory: "bg-accent/15 text-accent border-accent/30",
  guarded_automation: "bg-status-warning/15 text-status-warning border-status-warning/30",
  emergency_override: "bg-status-failed/15 text-status-failed border-status-failed/30",
};

export const SentinelPage = () => {
  const t = useT();
  const findings = useV5Live(() => v5.sentinel.list());
  const [active, setActive] = useState<SentinelFinding | null>(null);
  const [filter, setFilter] = useState("");
  const [sevFilter, setSevFilter] = useState<string>("all");
  // D (2026-05-09) — list ↔ timeline toggle
  const [view, setView] = useState<"list" | "timeline">("list");
  const [params, setParams] = useSearchParams();
  const activeFindingTriggerRef = useRef<HTMLElement | null>(null);

  // E2 drill-down: ?finding=<id> auto-opens the matching finding drawer.
  useEffect(() => {
    const id = params.get("finding");
    if (!id || !findings.data) return;
    const match = findings.data.items.find((f) => f.id === id);
    if (match) setActive(match);
  }, [params, findings.data]);

  const openFinding = (finding: SentinelFinding, trigger?: HTMLElement) => {
    activeFindingTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setActive(finding);
  };

  const closeActive = () => {
    setActive(null);
    if (params.get("finding")) {
      params.delete("finding");
      setParams(params, { replace: true });
    }
  };

  const all = findings.data?.items ?? [];
  const visible = useMemo(() => all.filter((f) => {
    if (sevFilter !== "all" && f.severity !== sevFilter) return false;
    if (filter && !`${f.title} ${f.summary}`.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  }), [all, filter, sevFilter]);

  const open = all.filter((f) => f.status === "open").length;
  const critical = all.filter((f) => f.severity === "critical").length;
  const mitigating = all.filter((f) => f.status === "mitigating").length;

  return (
    <>
      <PageHeader title={t("nav.sentinel")} subtitle={t("v5.sentinel.subtitle")} />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("v5.kpi.openFindings")} value={open} tone={open > 0 ? "warning" : "default"} />
          <StatCard label={t("v5.kpi.criticalFindings")} value={critical} tone={critical > 0 ? "danger" : "default"} />
          <StatCard label={t("v5.sentinel.mitigating")} value={mitigating} tone={mitigating > 0 ? "warning" : "default"} />
          <StatCard label={t("v5.sentinel.total")} value={all.length} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={t("v5.sentinel.search")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
          />
          {(["all", "critical", "warning", "watch", "info"] as const).map((s) => (
            <Button key={s} size="sm" variant={sevFilter === s ? "default" : "outline"} onClick={() => setSevFilter(s)}>
              {s}
            </Button>
          ))}
          <div className="ml-auto inline-flex rounded-md border border-border overflow-hidden">
            <Button size="sm" variant={view === "list" ? "default" : "ghost"} className="rounded-none" onClick={() => setView("list")}>
              {t("v5.sentinel.viewList")}
            </Button>
            <Button size="sm" variant={view === "timeline" ? "default" : "ghost"} className="rounded-none" onClick={() => setView("timeline")}>
              {t("v5.sentinel.viewTimeline")}
            </Button>
          </div>
        </div>

        <SkeletonThreshold
          loading={!findings.data}
          fallback={
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          }
        >
          {view === "timeline" ? (
            <SentinelTimelineView findings={visible} onPick={openFinding} />
          ) : (
            <ul className="space-y-2">
              {visible.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={(e) => openFinding(f, e.currentTarget)}
                    className="w-full text-left border border-border rounded-md p-3 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm truncate">{f.title}</div>
                      <div className="flex gap-2 shrink-0">
                        <Badge variant="outline" className={sevCls[f.severity]}>{f.severity}</Badge>
                        <Badge variant="outline" className={statusCls[f.status]}>{f.status}</Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{f.summary}</div>
                    <div className="text-xs mt-2 text-muted-foreground flex flex-wrap gap-x-3">
                      <span>{t("v5.sentinel.confidence")}: {(f.confidence * 100).toFixed(0)}%</span>
                      <span>{t("v5.sentinel.source")}: {f.source}</span>
                      <span>{t("v5.sentinel.actions")}: {f.recommendedActionIds.length}</span>
                    </div>
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li>
                  <EmptyState
                    icon={<ShieldCheck className="h-8 w-8" />}
                    title={all.length === 0 ? t("v5.sentinel.noFindingsTitle", { defaultValue: "No findings" }) : t("v5.sentinel.noMatchTitle", { defaultValue: "No matches" })}
                    description={all.length === 0
                      ? t("v5.sentinel.noFindingsDesc", { defaultValue: "Sentinel hasn't surfaced any findings for the current scope." })
                      : t("v5.sentinel.noMatchDesc", { defaultValue: "Adjust the search or severity filter to see more findings." })}
                  />
                </li>
              )}
            </ul>
          )}
        </SkeletonThreshold>
      </PageBody>

      <FindingDrawer finding={active} onClose={closeActive} onActed={findings.refresh} triggerRef={activeFindingTriggerRef} />
    </>
  );
};

// ---------- Finding drawer with remediation flow ----------

const FindingDrawer = ({
  finding, onClose, onActed, triggerRef,
}: { finding: SentinelFinding | null; onClose: () => void; onActed: () => void; triggerRef?: { current: HTMLElement | null } }) => {
  const t = useT();
  const [pendingEmergency, setPendingEmergency] = useState<RemediationAction | null>(null);

  if (!finding) return null;

  const actions: RemediationAction[] = finding.recommendedActionIds
    .map((kind) => v5.remediation.build(kind, {
      targetKind: (finding.blastRadius.strategies?.[0] ? "strategy" : finding.blastRadius.personas?.[0] ? "persona" : undefined),
      targetId: finding.blastRadius.strategies?.[0] ?? finding.blastRadius.personas?.[0],
    }))
    .filter((a): a is RemediationAction => !!a);

  const grouped = {
    advisory: actions.filter((a) => a.mode === "advisory"),
    guarded_automation: actions.filter((a) => a.mode === "guarded_automation"),
    emergency_override: actions.filter((a) => a.mode === "emergency_override"),
  };

  const execute = async (a: RemediationAction) => {
    const r = await v5.remediation.execute(a);
    toast({
      title: t("v5.sentinel.actionExecuted"),
      description: `${a.label} · overlay=${r.overlayUpdated ? "updated" : "noop"}`,
    });
    onActed();
  };

  const acknowledge = async () => {
    await v5.sentinel.setStatus(finding.id, "acknowledged");
    toast({ title: t("v5.sentinel.acknowledged") });
    onActed();
    onClose();
  };

  const dismiss = async () => {
    await v5.sentinel.setStatus(finding.id, "dismissed");
    toast({ title: t("v5.sentinel.dismissed") });
    onActed();
    onClose();
  };

  return (
    <>
      <Sheet open={!!finding} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto"
          onCloseAutoFocus={(e) => {
            const el = triggerRef?.current;
            if (el?.isConnected) { e.preventDefault(); el.focus(); }
          }}
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Badge variant="outline" className={sevCls[finding.severity]}>{finding.severity}</Badge>
              <span className="text-base">{finding.title}</span>
            </SheetTitle>
            <SheetDescription>{finding.summary}</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("v5.sentinel.status")} value={<Badge variant="outline" className={statusCls[finding.status]}>{finding.status}</Badge>} />
              <Field label={t("v5.sentinel.confidence")} value={`${(finding.confidence * 100).toFixed(0)}%`} />
              <Field label={t("v5.sentinel.source")} value={finding.source} />
              <Field label={t("v5.sentinel.detectedAt")} value={new Date(finding.detectedAt).toLocaleString()} />
            </div>

            {(finding.blastRadius.strategies?.length || finding.blastRadius.personas?.length) ? (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t("v5.sentinel.blastRadius")}</div>
                <div className="flex flex-wrap gap-1">
                  {finding.blastRadius.strategies?.map((id) => <Badge key={id} variant="outline" className="text-mono text-[10px]">strategy:{id}</Badge>)}
                  {finding.blastRadius.personas?.map((id) => <Badge key={id} variant="outline" className="text-mono text-[10px]">persona:{id}</Badge>)}
                </div>
              </div>
            ) : null}

            {finding.evidence.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t("v5.sentinel.evidence")}</div>
                <ul className="space-y-1">
                  {finding.evidence.map((e, i) => (
                    <li key={i} className="text-xs text-mono text-muted-foreground">
                      {e.kind}:{e.id}
                      {e.snapshot?.label && <span className="ml-2">({e.snapshot.label}={String(e.snapshot.value)})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Remediation actions */}
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("v5.sentinel.remediation")}</div>

              <ActionGroup
                title={t("v5.remediation.advisory")}
                hint={t("v5.remediation.advisoryHint")}
                actions={grouped.advisory}
                modeCls={modeCls.advisory}
                onRun={execute}
                t={t}
              />
              <ActionGroup
                title={t("v5.remediation.guarded")}
                hint={t("v5.remediation.guardedHint")}
                actions={grouped.guarded_automation}
                modeCls={modeCls.guarded_automation}
                onRun={async (a) => {
                  if (!confirm(`${a.label}\n\n${t("v5.remediation.guardedConfirm")}`)) return;
                  await execute(a);
                }}
                t={t}
              />
              <ActionGroup
                title={t("v5.remediation.emergency")}
                hint={t("v5.remediation.emergencyHint")}
                actions={grouped.emergency_override}
                modeCls={modeCls.emergency_override}
                onRun={(a) => setPendingEmergency(a)}
                t={t}
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-border">
              {finding.status === "open" && (
                <Button variant="outline" size="sm" onClick={acknowledge}>{t("v5.sentinel.acknowledge")}</Button>
              )}
              <Button variant="ghost" size="sm" onClick={dismiss}>{t("v5.sentinel.dismiss")}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {pendingEmergency && (
        <HighRiskConfirm
          open={!!pendingEmergency}
          onOpenChange={(o) => !o && setPendingEmergency(null)}
          operation={pendingEmergency.kind}
          target={{ type: pendingEmergency.targetKind ?? "v5", id: pendingEmergency.targetId ?? "—", name: pendingEmergency.label }}
          risk="critical"
          riskImpact={pendingEmergency.description}
          requiredApproval={pendingEmergency.requiredRoles}
          onConfirm={async () => {
            await execute(pendingEmergency);
            setPendingEmergency(null);
          }}
          destructive
        />
      )}
    </>
  );
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-0.5">{value}</div>
  </div>
);

const ActionGroup = ({
  title, hint, actions, modeCls, onRun, t,
}: {
  title: string;
  hint: string;
  actions: RemediationAction[];
  modeCls: string;
  onRun: (a: RemediationAction) => void;
  t: (k: string) => string;
}) => {
  if (actions.length === 0) return null;
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold">{title}</div>
        <Badge variant="outline" className={modeCls}>{actions.length}</Badge>
      </div>
      <div className="text-xs text-muted-foreground mb-2">{hint}</div>
      <ul className="space-y-2">
        {actions.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-2 border-t border-border pt-2 first:border-0 first:pt-0">
            <div className="min-w-0">
              <div className="text-sm font-medium">{a.label}</div>
              {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("v5.remediation.roles")}: {a.requiredRoles.join(", ")}
                {a.requiresHumanApproval && <span className="ml-2">· {t("v5.remediation.needsApproval")}</span>}
              </div>
            </div>
            <Button size="sm" variant={a.mode === "emergency_override" ? "destructive" : a.mode === "guarded_automation" ? "default" : "outline"} onClick={() => onRun(a)}>
              {t("v5.remediation.run")}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

// D (2026-05-09) — Timeline view: groups findings by detected date,
// ordered most-recent first. Same drawer interaction as the list view.
const SentinelTimelineView = ({
  findings, onPick,
}: { findings: SentinelFinding[]; onPick: (f: SentinelFinding, trigger?: HTMLElement) => void }) => {
  const t = useT();
  if (findings.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-8 w-8" />}
        title={t("v5.sentinel.noMatchTitle", { defaultValue: "No matches" })}
        description={t("v5.sentinel.noMatchDesc", { defaultValue: "Adjust the search or severity filter." })}
      />
    );
  }
  const sorted = [...findings].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );
  const groups = new Map<string, SentinelFinding[]>();
  for (const f of sorted) {
    const day = new Date(f.detectedAt).toLocaleDateString();
    const arr = groups.get(day) ?? [];
    arr.push(f);
    groups.set(day, arr);
  }
  return (
    <ol className="relative space-y-5 pl-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
      {[...groups.entries()].map(([day, items]) => (
        <li key={day} className="relative">
          <span className="absolute -left-[14px] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-[10px] text-muted-foreground">
            {items.length}
          </span>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{day}</div>
          <ul className="space-y-1.5">
            {items.map((f) => (
              <li key={f.id}>
                <button
                  onClick={(e) => onPick(f, e.currentTarget)}
                  className="w-full text-left border border-border rounded-md px-3 py-2 bg-card hover:bg-muted/30 transition-colors flex items-center gap-2"
                >
                  <span className="text-mono text-[10px] text-muted-foreground w-14 shrink-0">
                    {new Date(f.detectedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <Badge variant="outline" className={sevCls[f.severity]}>{f.severity}</Badge>
                  <span className="text-sm truncate flex-1">{f.title}</span>
                  <Badge variant="outline" className={statusCls[f.status]}>{f.status}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
};
