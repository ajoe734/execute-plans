// AuditTimeline — Spec §3.9.
// Standardised vertical timeline for AuditEvent[] (or compatible). Used by Incident,
// Governance, Strategy, and Right Drawer. Renders: actor avatar · action · target · ts · memo.
// Phase 18 — adds cross-page jump buttons (lineage / decisions / detail) when target id resolves.
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { GitBranch, BookMarked, ArrowUpRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/platform/hooks";
import { resolveEntity, lineageHref, decisionsHref } from "@/lib/entityLinks";

export interface AuditEntry {
  id?: string;
  ts: string;
  actor: string;
  action: string;
  target?: string;
  memo?: string;
  /** Phase 15 — JSON snapshot of entity prior to mutation. */
  before?: string;
  /** Phase 15 — JSON snapshot of entity after mutation. */
  after?: string;
  /** Phase 15 — outcome marker; rejected entries are tinted destructive. */
  outcome?: "ok" | "rejected";
  /** spec-conflict-G G05 — entry produced by 30-min overlay (mock-only, will not persist). */
  ephemeral?: boolean;
  /** spec-conflict-G G13 — placeholder hash chain (mock-only). */
  prevHash?: string | null;
  hash?: string;
}

interface Props {
  entries: AuditEntry[];
  /** Pass false to render without the surrounding Card (e.g. inside another Card). */
  framed?: boolean;
  /** Optional title rendered above the list. */
  title?: string;
  /** Limit to N most recent (default: show all). */
  limit?: number;
  emptyText?: string;
}

const initials = (name: string) =>
  name.split(/[._\s-]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";

export const AuditTimeline = ({ entries, framed = true, title, limit, emptyText }: Props) => {
  const t = useT();
  const rows = limit ? entries.slice(0, limit) : entries;
  const empty = emptyText ?? t("empty.noEvents");

  const body = (
    <>
      {title && (
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      )}
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">{empty}</div>
      ) : (
        <ol className="relative space-y-3 pl-6 before:absolute before:left-3 before:top-1.5 before:bottom-1.5 before:w-px before:bg-border">
          {rows.map((e, i) => {
            const resolved = resolveEntity(e.target);
            return (
            <li key={e.id ?? `${e.ts}-${i}`} className="relative">
              <span className="absolute -left-[18px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-[10px] text-mono text-muted-foreground">
                {initials(e.actor)}
              </span>
              <div className="text-sm flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-mono text-xs text-accent">{e.actor}</span>
                <span className={`text-mono text-xs ${e.outcome === "rejected" ? "text-destructive" : ""}`}>{e.action}</span>
                {e.outcome === "rejected" && (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-destructive/40 text-destructive">
                    rejected
                  </span>
                )}
                {e.ephemeral && (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-status-warning/40 text-status-warning bg-status-warning/10 cursor-help"
                          aria-label={t("audit.ephemeralTooltip")}
                        >
                          {t("audit.ephemeral")}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {t("audit.ephemeralTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {e.target && (
                  <span className="text-xs text-muted-foreground">→ {resolved ? (
                    <Link to={resolved.route} className="text-mono text-accent hover:underline">{e.target}</Link>
                  ) : (
                    <span className="text-mono">{e.target}</span>
                  )}</span>
                )}
                <span className="text-mono text-xs text-muted-foreground ml-auto">
                  {safeDateTime(e.ts)}
                </span>
              </div>
              {e.memo && <p className="text-xs text-muted-foreground mt-0.5">{e.memo}</p>}
              {resolved && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Link to={lineageHref(resolved.id)} title={t("audit.openLineage")}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5">
                    <GitBranch className="h-3 w-3" />{t("audit.openLineage")}
                  </Link>
                  <Link to={decisionsHref(resolved.kind, resolved.id)} title={t("audit.openDecisions")}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5">
                    <BookMarked className="h-3 w-3" />{t("audit.openDecisions")}
                  </Link>
                  <Link to={resolved.route} title={t("audit.openDetail")}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5">
                    <ArrowUpRight className="h-3 w-3" />{resolved.label}
                  </Link>
                </div>
              )}
              {(e.before || e.after) && (
                <details className="mt-1 group">
                  <summary className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground">
                    {t("audit.viewDiff")}
                  </summary>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <pre className="text-mono text-[10px] bg-muted/40 p-2 rounded overflow-x-auto max-h-40">
                      {e.before ?? "—"}
                    </pre>
                    <pre className="text-mono text-[10px] bg-muted/40 p-2 rounded overflow-x-auto max-h-40">
                      {e.after ?? "—"}
                    </pre>
                  </div>
                </details>
              )}
            </li>
            );
          })}
        </ol>
      )}
    </>
  );

  return framed ? <Card className="p-4">{body}</Card> : <div>{body}</div>;
};
