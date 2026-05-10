// Pack E E6 — /management/interventions (HIQ)
// Unified queue across approval / sentinel / incident / policy_exception.
// Decisions go through v5.interventions.decide → emits v5 event → auto refresh (Q22).
// Approvals page coexists; HIQ links into the original source.

import { useEffect, useMemo, useState } from "react";
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
import { usePermissions } from "@/lib/usePermissions";
import { toast } from "@/components/ui/use-toast";
import { useV5Live } from "./useV5Live";
import type { InterventionItem } from "@/lib/v5";
import type { InterventionDecision } from "@/lib/v5/enums";

const sevCls: Record<string, string> = {
  critical: "bg-status-failed/15 text-status-failed border-status-failed/30",
  warning: "bg-status-warning/15 text-status-warning border-status-warning/30",
  watch: "bg-accent/15 text-accent border-accent/30",
  info: "bg-muted text-muted-foreground border-border",
};

const sourceCls: Record<string, string> = {
  approval: "bg-accent/15 text-accent border-accent/30",
  sentinel: "bg-status-warning/15 text-status-warning border-status-warning/30",
  incident: "bg-status-failed/15 text-status-failed border-status-failed/30",
  policy_exception: "bg-muted text-muted-foreground border-border",
  emergency_review: "bg-status-failed/15 text-status-failed border-status-failed/30",
};

const SOURCES: Array<"all" | InterventionItem["source"]> = [
  "all", "approval", "sentinel", "incident", "policy_exception", "emergency_review",
];

export const InterventionsPage = () => {
  const t = useT();
  const list = useV5Live(() => v5.interventions.list());
  const [active, setActive] = useState<InterventionItem | null>(null);
  const [filter, setFilter] = useState("");
  const [src, setSrc] = useState<typeof SOURCES[number]>("all");
  const [params, setParams] = useSearchParams();
  // D (2026-05-09) — batch decide selection set
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);

  // E2 drill-down: ?item=<id> auto-opens the matching intervention drawer.
  useEffect(() => {
    const id = params.get("item");
    if (!id || !list.data) return;
    const match = list.data.items.find((i) => i.id === id);
    if (match) setActive(match);
  }, [params, list.data]);

  const closeActive = () => {
    setActive(null);
    if (params.get("item")) {
      params.delete("item");
      setParams(params, { replace: true });
    }
  };

  const all = list.data?.items ?? [];
  const visible = useMemo(() => all.filter((it) => {
    if (src !== "all" && it.source !== src) return false;
    if (filter && !`${it.title} ${it.summary ?? ""}`.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  }), [all, filter, src]);

  const counts = useMemo(() => ({
    total: all.length,
    critical: all.filter((i) => i.severity === "critical").length,
    approval: all.filter((i) => i.source === "approval").length,
    sentinel: all.filter((i) => i.source === "sentinel").length,
  }), [all]);

  const selectedItems = useMemo(
    () => visible.filter((it) => selected.has(it.id)),
    [visible, selected],
  );

  // Decisions common to every selected item (intersection of allowedDecisions).
  const commonDecisions = useMemo<InterventionDecision[]>(() => {
    if (selectedItems.length === 0) return [];
    const sets = selectedItems.map((it) => new Set(it.allowedDecisions));
    const [first, ...rest] = sets;
    return [...first].filter((d) => rest.every((s) => s.has(d))) as InterventionDecision[];
  }, [selectedItems]);

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === visible.length ? new Set() : new Set(visible.map((it) => it.id)),
    );

  const batchDecide = async (d: InterventionDecision) => {
    if (selectedItems.length === 0 || batchRunning) return;
    setBatchRunning(true);
    let ok = 0, fail = 0;
    for (const it of selectedItems) {
      try { await v5.interventions.decide(it.id, d); ok++; }
      catch { fail++; }
    }
    setBatchRunning(false);
    setSelected(new Set());
    toast({
      title: t("v5.interventions.batchDone"),
      description: t("v5.interventions.batchDoneDesc", { ok, fail, decision: d }),
    });
    list.refresh();
  };

  return (
    <>
      <PageHeader
        title={t("nav.interventions")}
        subtitle={t("v5.interventions.subtitle")}
        actions={
          <Link to="/management/approvals" className="text-xs text-primary hover:underline">
            {t("v5.interventions.openLegacyApprovals")} →
          </Link>
        }
      />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("v5.interventions.total")} value={counts.total} />
          <StatCard label={t("v5.kpi.criticalFindings")} value={counts.critical} tone={counts.critical > 0 ? "danger" : "default"} />
          <StatCard label={t("v5.interventions.fromApprovals")} value={counts.approval} />
          <StatCard label={t("v5.interventions.fromSentinel")} value={counts.sentinel} tone={counts.sentinel > 0 ? "warning" : "default"} />
        </div>

        <div className="text-xs text-muted-foreground">{t("v5.interventions.coexist")}</div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={t("v5.interventions.search")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
          />
          {SOURCES.map((s) => (
            <Button key={s} size="sm" variant={src === s ? "default" : "outline"} onClick={() => setSrc(s)}>
              {s}
            </Button>
          ))}
        </div>

        {selectedItems.length > 0 && (
          <Card className="p-2 flex flex-wrap items-center gap-2 border-accent/40 bg-accent/5">
            <span className="text-xs text-muted-foreground px-2">
              {t("v5.interventions.batchSelected", { count: selectedItems.length })}
            </span>
            {commonDecisions.length === 0 ? (
              <span className="text-xs text-status-warning">
                {t("v5.interventions.batchNoCommon")}
              </span>
            ) : (
              commonDecisions.map((d) => (
                <Button key={d} size="sm" variant="outline" disabled={batchRunning} onClick={() => batchDecide(d)}>
                  {t("v5.interventions.batchApply", { decision: d })}
                </Button>
              ))
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={batchRunning}>
              {t("v5.interventions.batchClear")}
            </Button>
          </Card>
        )}

        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label={t("v5.interventions.batchSelectAll")}
                    checked={visible.length > 0 && selected.size === visible.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="text-left px-3 py-2">{t("v5.col.subject")}</th>
                <th className="text-left px-3 py-2">{t("v5.interventions.source")}</th>
                <th className="text-left px-3 py-2">{t("v5.col.status")}</th>
                <th className="text-left px-3 py-2">{t("v5.interventions.recommended")}</th>
                <th className="text-left px-3 py-2">{t("v5.interventions.roles")}</th>
                <th className="text-right px-3 py-2">{t("v5.col.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((it) => (
                <tr key={it.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={t("v5.interventions.batchSelectOne", { title: it.title })}
                      checked={selected.has(it.id)}
                      onChange={() => toggleOne(it.id)}
                    />
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => setActive(it)}>
                    <div className="font-medium">{it.title}</div>
                    {it.summary && <div className="text-xs text-muted-foreground line-clamp-1">{it.summary}</div>}
                  </td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => setActive(it)}><Badge variant="outline" className={sourceCls[it.source]}>{it.source}</Badge></td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => setActive(it)}><Badge variant="outline" className={sevCls[it.severity]}>{it.severity}</Badge></td>
                  <td className="px-3 py-2 text-xs cursor-pointer" onClick={() => setActive(it)}>{it.recommendedDecision ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground cursor-pointer" onClick={() => setActive(it)}>{it.requiredRoles.join(", ")}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground cursor-pointer" onClick={() => setActive(it)}>{new Date(it.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">{t("v5.empty")}</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </PageBody>

      <InterventionDrawer item={active} onClose={closeActive} onActed={list.refresh} />
    </>
  );
};

// ---------- Drawer ----------

const InterventionDrawer = ({
  item, onClose, onActed,
}: { item: InterventionItem | null; onClose: () => void; onActed: () => void }) => {
  const t = useT();
  const { role } = usePermissions();
  if (!item) return null;

  const roleAllowed = item.requiredRoles.length === 0 || item.requiredRoles.includes(role);

  const decide = async (d: InterventionDecision) => {
    await v5.interventions.decide(item.id, d);
    toast({ title: t("v5.interventions.decided"), description: `${item.title} · ${d}` });
    onActed();
    onClose();
  };

  const sourceLink =
    item.linkedApprovalId ? "/management/approvals" :
    item.linkedFindingId ? "/management/sentinel" :
    item.linkedIncidentId ? `/management/incidents/${item.linkedIncidentId}` : null;

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Badge variant="outline" className={sevCls[item.severity]}>{item.severity}</Badge>
            <Badge variant="outline" className={sourceCls[item.source]}>{item.source}</Badge>
            <span className="text-base">{item.title}</span>
          </SheetTitle>
          {item.summary && <SheetDescription>{item.summary}</SheetDescription>}
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("v5.interventions.recommended")} value={item.recommendedDecision ?? "—"} />
            <Field label={t("v5.interventions.roles")} value={item.requiredRoles.join(", ") || "—"} />
            <Field label={t("v5.interventions.modifyAllowed")} value={item.modifyAllowed ? "yes" : "no"} />
            <Field label={t("v5.col.updated")} value={new Date(item.updatedAt).toLocaleString()} />
          </div>

          {sourceLink && (
            <Link to={sourceLink} className="text-xs text-primary hover:underline inline-block">
              {t("v5.interventions.openSource")} →
            </Link>
          )}

          {item.evidenceRefs && item.evidenceRefs.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t("v5.sentinel.evidence")}</div>
              <ul className="space-y-1">
                {item.evidenceRefs.map((e, i) => (
                  <li key={i} className="text-xs text-mono text-muted-foreground">{e.kind}:{e.id}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-border pt-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {t("v5.interventions.decide")}
              {!roleAllowed && (
                <span className="ml-2 text-status-warning">
                  ({t("v5.interventions.roleNotAllowed", { roles: item.requiredRoles.join(", ") })})
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {item.allowedDecisions.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={d === item.recommendedDecision ? "default" : "outline"}
                  disabled={!roleAllowed}
                  onClick={() => decide(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-0.5">{value}</div>
  </div>
);
