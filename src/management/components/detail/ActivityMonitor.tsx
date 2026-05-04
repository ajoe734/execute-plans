// Live mock-realtime stream of activity tied to a persona/strategy/etc.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { realtime } from "@/lib/bff/realtime";
import { useT } from "@/platform/hooks";

interface Event { id: string; ts: string; kind: string; status: string; owner?: string; }

export const ActivityMonitor = ({ scope }: { scope: string }) => {
  const t = useT();
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const seed: Event[] = [
      { id: `seed_${scope}_1`, ts: new Date(Date.now() - 60_000).toISOString(), kind: "route.invoke", status: "success", owner: "scheduler" },
      { id: `seed_${scope}_2`, ts: new Date(Date.now() - 180_000).toISOString(), kind: "memory.update", status: "queued", owner: "ai_trainer" },
      { id: `seed_${scope}_3`, ts: new Date(Date.now() - 300_000).toISOString(), kind: "skill.eval", status: "running", owner: "evaluator" },
    ];
    setEvents(seed);
    const off = realtime.on("job", (p) => {
      const evt = p as { jobId: string; status: string; ts: string; kind?: string; owner?: string };
      setEvents((prev) => [{ id: evt.jobId, ts: evt.ts, kind: evt.kind ?? "job", status: evt.status, owner: evt.owner }, ...prev].slice(0, 20));
    });
    return () => { off(); };
  }, [scope]);

  const tone = (s: string) =>
    s === "success" ? "border-status-success/40 text-status-success"
    : s === "failed" ? "border-status-failed/40 text-status-failed"
    : s === "running" ? "border-accent/40 text-accent"
    : "border-border text-muted-foreground";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{t("persona.activity.title")}</div>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-status-success animate-pulse" />
          live
        </span>
      </div>
      <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-3 text-xs p-2 rounded-md border border-border">
            <span className="text-mono text-[10px] text-muted-foreground w-32 shrink-0">{new Date(e.ts).toLocaleTimeString()}</span>
            <span className="text-mono flex-1 truncate">{e.kind}</span>
            {e.owner && <span className="text-mono text-[10px] text-muted-foreground">{e.owner}</span>}
            <Badge variant="outline" className={`text-[10px] uppercase ${tone(e.status)}`}>{e.status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
};
