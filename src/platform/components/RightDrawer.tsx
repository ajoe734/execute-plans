// Right-side Inspector drawer — Part 1 §Shell, Part 7 §Shared Components.
// Opened from list rows or detail headers to peek at metadata, lineage, recent activity, and actions.
import { create } from "zustand";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RiskBadge } from "./RiskBadge";
import { StatusBadge } from "./StatusBadge";
import { useT } from "@/platform/hooks";
import { usePermissions } from "@/lib/usePermissions";
import { useEffect, useState } from "react";
import { bff } from "@/lib/bff/client";
import type { AuditEvent } from "@/lib/bff/types";
import { useNavigate } from "react-router-dom";

export interface InspectorTarget {
  id: string;
  type: string;             // e.g. "Strategy"
  name: string;
  state?: string;
  risk?: "low" | "medium" | "high" | "critical";
  owner?: string;
  updatedAt?: string;
  availableActions?: string[];
  /** Optional deep-link route — if provided, "Open" button navigates here. */
  href?: string;
  /** Optional extra metadata rows. */
  meta?: Array<{ label: string; value: string }>;
  /** Optional environment chip. */
  env?: "research" | "paper" | "live";
  /** Lineage preview: upstream / downstream object refs. */
  lineage?: { upstream?: string[]; downstream?: string[] };
  /** Next-step transitions to surface (action → state). */
  nextTransitions?: Array<{ action: string; to: string }>;
}

interface InspectorState {
  target: InspectorTarget | null;
  open: (t: InspectorTarget) => void;
  close: () => void;
}

export const useInspector = create<InspectorState>((set) => ({
  target: null,
  open: (t) => set({ target: t }),
  close: () => set({ target: null }),
}));

export const RightDrawer = () => {
  const t = useT();
  const target = useInspector((s) => s.target);
  const close = useInspector((s) => s.close);
  const { allowed } = usePermissions();
  const navigate = useNavigate();
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (!target) return;
    bff.audit.list().then((rows) =>
      setAudit(rows.filter((r) => r.target === target.id).slice(0, 6)),
    );
  }, [target]);

  if (!target) return null;
  const acts = allowed(target.availableActions);

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] p-0">
        <ScrollArea className="h-full">
          <div className="p-5 space-y-4">
            <SheetHeader className="space-y-1.5 text-left">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-mono text-[10px]">{target.type}</Badge>
                {target.state && <StatusBadge state={target.state} />}
                {target.risk && <RiskBadge level={target.risk} />}
                {target.env && (
                  <Badge variant="secondary" className="text-mono text-[10px] uppercase">
                    {t(`env.${target.env}`, { defaultValue: target.env })}
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-base">{target.name}</SheetTitle>
              <SheetDescription className="text-mono text-xs">{target.id}</SheetDescription>
            </SheetHeader>

            <Separator />

            <section className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("inspector.metadata")}</div>
              <div className="space-y-1.5 text-sm">
                {target.owner && <Row label={t("common.owner")} value={target.owner} />}
                {target.updatedAt && <Row label={t("common.updated")} value={new Date(target.updatedAt).toLocaleString()} />}
                {target.meta?.map((m) => <Row key={m.label} label={m.label} value={m.value} />)}
              </div>
            </section>

            {(target.lineage?.upstream?.length || target.lineage?.downstream?.length) && (
              <>
                <Separator />
                <section className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("inspector.lineage")}</div>
                  {target.lineage?.upstream?.length ? (
                    <div className="text-xs">
                      <span className="text-muted-foreground mr-1">↑</span>
                      {target.lineage.upstream.map((u) => (
                        <Badge key={u} variant="outline" className="text-mono text-[10px] mr-1">{u}</Badge>
                      ))}
                    </div>
                  ) : null}
                  {target.lineage?.downstream?.length ? (
                    <div className="text-xs">
                      <span className="text-muted-foreground mr-1">↓</span>
                      {target.lineage.downstream.map((d) => (
                        <Badge key={d} variant="outline" className="text-mono text-[10px] mr-1">{d}</Badge>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            )}

            {target.nextTransitions && target.nextTransitions.length > 0 && (
              <>
                <Separator />
                <section className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("inspector.nextTransitions")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {target.nextTransitions.map((tr) => (
                      <Badge key={tr.action} variant="secondary" className="text-mono text-[11px]">
                        {tr.action} → {tr.to}
                      </Badge>
                    ))}
                  </div>
                </section>
              </>
            )}

            {acts.length > 0 && (
              <>
                <Separator />
                <section className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("inspector.actions")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {acts.map((a) => (
                      <Badge key={a} variant="secondary" className="text-mono text-[11px]">{a}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("inspector.actionsHint")}</p>
                </section>
              </>
            )}

            <Separator />

            <section className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("inspector.recentActivity")}</div>
              {audit.length === 0 ? (
                <div className="text-xs text-muted-foreground">{t("common.noResults")}</div>
              ) : (
                <ul className="space-y-1.5">
                  {audit.map((a) => (
                    <li key={a.id} className="text-xs flex items-start gap-2">
                      <span className="text-mono text-muted-foreground shrink-0">{new Date(a.ts).toLocaleTimeString()}</span>
                      <span><span className="text-mono">{a.actor}</span> · {a.action}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {target.href && (
              <>
                <Separator />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => { const h = target.href!; close(); navigate(h); }}
                >
                  {t("inspector.openDetail")}
                </Button>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-mono text-xs text-right truncate max-w-[60%]">{value}</span>
  </div>
);
