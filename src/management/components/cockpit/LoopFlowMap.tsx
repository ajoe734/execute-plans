import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import type { LoopFlowMapModel } from "@/lib/v5/management/cockpit";

const sevColor = (s: "ok" | "warn" | "bad") =>
  s === "bad"  ? "hsl(var(--status-failed))" :
  s === "warn" ? "hsl(var(--status-warning))" :
                 "hsl(var(--status-success))";

const sevText = (s: "ok" | "warn" | "bad") =>
  s === "bad" ? "text-status-failed" :
  s === "warn" ? "text-status-warning" :
                 "text-status-success";

export const LoopFlowMap = ({ model }: { model: LoopFlowMapModel }) => {
  // Pure list rendering (keyboard navigable, screen-reader friendly).
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        OODA Loop Flow
      </h2>
      <ul
        className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
        role="list"
        aria-label="OODA loop nodes"
      >
        {model.nodes.map((n) => {
          const body = (
            <div className="rounded-md border border-border p-2 hover:bg-muted/30 focus-within:ring-2 focus-within:ring-ring">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: sevColor(n.severity) }}
                />
                <span className={"text-xs font-medium " + sevText(n.severity)}>
                  {n.severity}
                </span>
              </div>
              <div className="mt-1 text-sm text-foreground">{n.label}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{n.loop}</div>
            </div>
          );
          return (
            <li key={n.id}>
              {n.href ? (
                <Link to={n.href} aria-label={`${n.label} — severity ${n.severity}`}>
                  {body}
                </Link>
              ) : body}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {model.edges.length} edges · severity propagated from upstream nodes.
      </p>
    </Card>
  );
};
