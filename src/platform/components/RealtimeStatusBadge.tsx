// Phase 16 — popover panel for realtime activity & connection state.
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, Activity } from "lucide-react";
import { useRealtimeStatus } from "@/lib/useLiveList";
import { realtime } from "@/lib/bff/realtime";
import { useT } from "@/platform/hooks";

export const RealtimeStatusBadge = () => {
  const t = useT();
  const { status, lastEventAt } = useRealtimeStatus();
  const [open, setOpen] = useState(false);
  const ageSec = Math.round((Date.now() - lastEventAt) / 1000);

  const tone =
    status === "live" ? "text-status-success"
    : status === "stale" ? "text-status-warning"
    : "text-status-failed";
  const dotTone =
    status === "live" ? "bg-status-success animate-pulse-dot"
    : status === "stale" ? "bg-status-warning"
    : "bg-status-failed";
  const Icon = status === "offline" ? WifiOff : Wifi;

  const recent = realtime.getRecent().slice(0, 12);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={`gap-1.5 px-2 ${tone}`}>
          <Icon className="h-3.5 w-3.5" />
          <span className="text-mono text-xs uppercase tracking-wider">{t(`realtime.status.${status}`, { defaultValue: status })}</span>
          <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" />
            {t("realtime.title", { defaultValue: "Realtime activity" })}
          </div>
          <span className="text-mono text-[10px] text-muted-foreground">
            {t("realtime.lastEvent", { defaultValue: "last" })} {ageSec}s
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {recent.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">{t("empty.noResults")}</div>
          ) : recent.map((e, i) => (
            <div key={i} className="px-3 py-1.5 border-b border-border/40 last:border-0 text-xs flex items-center gap-2">
              <span className="text-mono text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className="text-mono uppercase tracking-wider text-status-running">{e.topic}</span>
              <span className="truncate text-muted-foreground flex-1">{summarize(e.payload)}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

function summarize(p: unknown): string {
  if (!p || typeof p !== "object") return String(p ?? "");
  const o = p as Record<string, unknown>;
  if (o.kind) return `kind=${o.kind}`;
  if (o.jobId) return `${o.jobId} · ${o.status}`;
  if (o.event) return String(o.event);
  if (o.action) return `${o.action}`;
  return Object.keys(o).slice(0, 2).join(",");
}
