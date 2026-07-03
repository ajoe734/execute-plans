// Pack E E5 — /management/sentinel
// Findings list + investigation workspace. Sentinel summarizes evidence and
// governance handoff, but does not expose local-only status/action mutations.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { StatCard } from "@/platform/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { v5 } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { useV5Live } from "./useV5Live";
import type { SentinelFinding, RemediationAction } from "@/lib/v5";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonThreshold } from "@/components/ui/skeleton-threshold";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { safeDateTime } from "@/lib/utils";
import { buildSentinelResolutionLinks } from "@/lib/v5/management/links";

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

const statusLabel = (t: (key: string, opts?: Record<string, unknown>) => string, status: SentinelFinding["status"]) =>
  t(`v5.sentinel.statuses.${status}`, { defaultValue: status });

export const SentinelPage = () => {
  const t = useT();
  const findings = useV5Live(() => v5.sentinel.list(), [], {
    cacheKey: "v5.sentinel.findings",
  });
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

  const all = useMemo(() => findings.data?.items ?? [], [findings.data]);
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
                        <Badge variant="outline" className={statusCls[f.status]}>{statusLabel(t, f.status)}</Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{f.summary}</div>
                    <div className="text-xs mt-2 text-muted-foreground flex flex-wrap gap-x-3">
                      <span>{t("v5.sentinel.detectedAt")}: {safeDateTime(f.detectedAt)}</span>
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

      <FindingDrawer finding={active} onClose={closeActive} triggerRef={activeFindingTriggerRef} />
    </>
  );
};

// ---------- Finding drawer: investigation + governance handoff ----------

const FindingDrawer = ({
  finding, onClose, triggerRef,
}: { finding: SentinelFinding | null; onClose: () => void; triggerRef?: { current: HTMLElement | null } }) => {
  const t = useT();

  if (!finding) return null;

  const actions: RemediationAction[] = finding.recommendedActionIds
    .map((kind) => v5.remediation.build(kind, {
      targetKind: (finding.blastRadius.strategies?.[0] ? "strategy" : finding.blastRadius.personas?.[0] ? "persona" : undefined),
      targetId: finding.blastRadius.strategies?.[0] ?? finding.blastRadius.personas?.[0],
    }))
    .filter((a): a is RemediationAction => !!a);

  const targets = investigationTargets(finding);
  const resolutionLinks = buildSentinelResolutionLinks(finding);
  const thinEvidence = finding.evidence.length === 0 || finding.evidence.every((e) => !e.snapshot);

  return (
    <Sheet open={!!finding} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl overflow-y-auto"
        onCloseAutoFocus={(e) => {
          const el = triggerRef?.current;
          if (el?.isConnected) { e.preventDefault(); el.focus(); }
        }}
      >
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={sevCls[finding.severity]}>{finding.severity}</Badge>
            <Badge variant="outline" className={statusCls[finding.status]}>{statusLabel(t, finding.status)}</Badge>
            <span className="text-base">{finding.title}</span>
          </SheetTitle>
          <SheetDescription>{finding.summary}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4 text-sm">
          <Card className="p-4">
            <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
              {t("v5.sentinel.investigationSummary")}
            </div>
            <p className="text-sm leading-6 text-foreground">{finding.summary}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t("v5.sentinel.status")} value={<Badge variant="outline" className={statusCls[finding.status]}>{statusLabel(t, finding.status)}</Badge>} />
              <Field label={t("v5.sentinel.confidence")} value={`${(finding.confidence * 100).toFixed(0)}%`} />
              <Field label={t("v5.sentinel.source")} value={finding.source} />
              <Field label={t("v5.sentinel.detectedAt")} value={safeDateTime(finding.detectedAt)} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {t("v5.sentinel.severityRationale")}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("v5.sentinel.severity")} value={<Badge variant="outline" className={sevCls[finding.severity]}>{finding.severity}</Badge>} />
              <Field label={t("v5.sentinel.updatedAt")} value={safeDateTime(finding.updatedAt)} />
              <Field label={t("v5.sentinel.recommendedCount")} value={actions.length} />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {t("v5.sentinel.severityRationaleDesc")}
            </p>
          </Card>

          <Card className="border-accent/30 bg-accent/5 p-4">
            <div className="text-sm font-semibold text-foreground">{t("v5.sentinel.resolutionRoutes")}</div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("v5.sentinel.resolutionRoutesDesc")}</p>
            {resolutionLinks.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {resolutionLinks.map((link) => (
                  <Button key={link.id} asChild size="sm" variant={link.kind === "decision" ? "default" : "outline"}>
                    <Link to={link.href}>
                      {t(link.labelKey, { defaultValue: link.label })}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">{t("v5.sentinel.noResolutionRoutes")}</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {t("v5.sentinel.blastRadius")}
            </div>
            {targets.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {targets.map((target) => (
                  target.href ? (
                    <Link
                      key={`${target.kind}:${target.id}`}
                      to={target.href}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
                    >
                      <span className="font-mono">{target.kind}:{target.id}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </Link>
                  ) : (
                    <Badge key={`${target.kind}:${target.id}`} variant="outline" className="font-mono text-[10px]">
                      {target.kind}:{target.id}
                    </Badge>
                  )
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("v5.sentinel.noBlastRadius")}</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {t("v5.sentinel.evidencePacket")}
            </div>
            {thinEvidence ? (
              <div className="mb-3 rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
                {t("v5.sentinel.thinEvidenceWarning")}
              </div>
            ) : null}
            {finding.evidence.length > 0 ? (
              <ul className="space-y-2">
                {finding.evidence.map((e, i) => (
                  <li key={`${e.kind}:${e.id}:${i}`} className="rounded-md border border-border px-3 py-2">
                    <div className="font-mono text-xs text-foreground">{e.kind}:{e.id}</div>
                    {e.snapshot ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {e.snapshot.label ?? t("v5.sentinel.snapshot")}: {String(e.snapshot.value ?? "—")}
                        {e.snapshot.ts ? <span className="ml-2">{safeDateTime(e.snapshot.ts)}</span> : null}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-muted-foreground">{t("v5.sentinel.noSnapshot")}</div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("v5.sentinel.noEvidenceRefs")}</p>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {t("v5.sentinel.recommendedNextSteps")}
            </div>
            {actions.length > 0 ? (
              <RecommendationList actions={actions} t={t} />
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t("v5.sentinel.defaultStepVerifyEvidence")}</li>
                <li>{t("v5.sentinel.defaultStepRouteGovernance")}</li>
                <li>{t("v5.sentinel.defaultStepDocumentDecision")}</li>
              </ul>
            )}
          </Card>

          <Card className="border-status-warning/30 bg-status-warning/5 p-4">
            <div className="text-sm font-semibold text-foreground">{t("v5.sentinel.governanceHandling")}</div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("v5.sentinel.noDirectMutationDesc")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/management/interventions">{t("v5.sentinel.openInterventions")}</Link>
              </Button>
              {targets.find((target) => target.kind === "persona" && target.href) ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={targets.find((target) => target.kind === "persona" && target.href)?.href ?? "/management/persona-fleet"}>
                    {t("v5.sentinel.openPersonaFleet")}
                  </Link>
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-0.5 break-words">{value}</div>
  </div>
);

type InvestigationTarget = {
  kind: "strategy" | "persona" | "pool" | "deployment";
  id: string;
  href?: string;
};

const investigationTargets = (finding: SentinelFinding): InvestigationTarget[] => {
  const targets: InvestigationTarget[] = [];
  const push = (kind: InvestigationTarget["kind"], ids: string[] | undefined, hrefFor: (id: string) => string | undefined) => {
    ids?.forEach((id) => targets.push({ kind, id, href: hrefFor(id) }));
  };
  push("strategy", finding.blastRadius.strategies, (id) => `/management/strategies/${encodeURIComponent(id)}`);
  push("persona", finding.blastRadius.personas, (id) => `/management/persona-fleet?persona=${encodeURIComponent(id)}`);
  push("pool", finding.blastRadius.pools, (id) => `/management/capital/${encodeURIComponent(id)}`);
  push("deployment", finding.blastRadius.deployments, () => undefined);
  return targets;
};

const recommendationModeLabel = (mode: RemediationAction["mode"], t: (key: string) => string) => {
  if (mode === "guarded_automation") return t("v5.remediation.guarded");
  if (mode === "emergency_override") return t("v5.remediation.emergency");
  return t("v5.remediation.advisory");
};

const RecommendationList = ({
  actions, t,
}: {
  actions: RemediationAction[];
  t: (k: string) => string;
}) => {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-muted-foreground">{t("v5.sentinel.recommendationsAreAdvisory")}</p>
      <ul className="space-y-2">
        {actions.map((a) => (
          <li key={a.id} className="rounded-md border border-border px-3 py-2">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={modeCls[a.mode]}>{recommendationModeLabel(a.mode, t)}</Badge>
              {a.requiresHumanApproval ? (
                <Badge variant="outline" className="border-status-warning/30 bg-status-warning/10 text-status-warning">
                  {t("v5.remediation.needsApproval")}
                </Badge>
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">{a.label}</div>
              {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
              <div className="text-xs text-muted-foreground mt-0.5">
                {t("v5.remediation.roles")}: {a.requiredRoles.join(", ") || "—"}
                {a.targetKind && a.targetId ? <span className="ml-2">· {a.targetKind}:{a.targetId}</span> : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
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
    const day = safeDateTime(f.detectedAt, "date");
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
                  <Badge variant="outline" className={statusCls[f.status]}>{statusLabel(t, f.status)}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
};
