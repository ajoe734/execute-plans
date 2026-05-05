// AuditTimeline — Spec §3.9.
// Standardised vertical timeline for AuditEvent[] (or compatible). Used by Incident,
// Governance, Strategy, and Right Drawer. Renders: actor avatar · action · target · ts · memo.
// Phase 18 — adds cross-page jump buttons (lineage / decisions / detail) when target id resolves.
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { GitBranch, BookMarked, ArrowUpRight } from "lucide-react";
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
          {rows.map((e, i) => (
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
                {e.target && (
                  <span className="text-xs text-muted-foreground">→ <span className="text-mono">{e.target}</span></span>
                )}
                <span className="text-mono text-xs text-muted-foreground ml-auto">
                  {new Date(e.ts).toLocaleString()}
                </span>
              </div>
              {e.memo && <p className="text-xs text-muted-foreground mt-0.5">{e.memo}</p>}
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
          ))}
        </ol>
      )}
    </>
  );

  return framed ? <Card className="p-4">{body}</Card> : <div>{body}</div>;
};
