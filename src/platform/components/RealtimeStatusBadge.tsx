// Phase 16 + 22 — popover panel for realtime activity, connection diagnostics,
// per-topic counts, and a mock disconnect/reconnect control for QA.
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Activity, Plug, PlugZap } from "lucide-react";
import { useLiveStatus, useRealtimeStatus } from "@/lib/bff-v1";
import { realtime } from "@/lib/bff/realtime";
import { useT } from "@/platform/hooks";

export const RealtimeStatusBadge = () => {
  const t = useT();
  const { status, lastEventAt } = useRealtimeStatus();
  const live = useLiveStatus();
  const [open, setOpen] = useState(false);
  const ageSec = Math.max(0, Math.round((Date.now() - lastEventAt) / 1000));
  const effectiveStatus = live.mode === "live" && live.effective === "mock" ? "offline" : status;

  const tone =
    effectiveStatus === "live" ? "text-status-success"
    : effectiveStatus === "stale" ? "text-status-warning"
    : "text-status-failed";
  const dotTone =
    effectiveStatus === "live" ? "bg-status-success animate-pulse-dot"
    : effectiveStatus === "stale" ? "bg-status-warning"
    : "bg-status-failed";
  const Icon = effectiveStatus === "offline" ? WifiOff : Wifi;

  const recent = realtime.getRecent();
  const recentSlice = recent.slice(0, 12);

  const topicCounts = useMemo(() => {
    const m = new Map<string, number>();
    recent.forEach((e) => m.set(e.topic, (m.get(e.topic) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [recent]);

  const connected = realtime.isConnected();
  const toggle = () => realtime.setConnected(!connected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={`gap-1.5 px-2 ${tone}`}>
          <Icon className="h-3.5 w-3.5" />
          <span className="text-mono text-xs uppercase tracking-wider">{t(`realtime.status.${effectiveStatus}`, { defaultValue: effectiveStatus })}</span>
          <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" />
            {t("realtime.title", { defaultValue: "Realtime activity" })}
          </div>
          <Badge variant="outline" className={`text-[10px] ${tone}`}>
            {t(`realtime.status.${effectiveStatus}`, { defaultValue: effectiveStatus })}
          </Badge>
        </div>

        <div className="px-3 py-2 border-b border-border grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[9px]">{t("realtime.lastEvent", { defaultValue: "Last event" })}</div>
            <div className="text-mono">{ageSec}s</div>
          </div>
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[9px]">{t("realtime.events", { defaultValue: "Buffered" })}</div>
            <div className="text-mono">{recent.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[9px]">{t("realtime.topics", { defaultValue: "Topics" })}</div>
            <div className="text-mono">{topicCounts.length}</div>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-border text-[11px] space-y-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground uppercase tracking-wider text-[9px]">BFF mode</span>
            <span className="text-mono">{live.mode}/{live.effective}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground uppercase tracking-wider text-[9px]">BFF URL</span>
            <span className="text-mono truncate">{live.baseUrl || "mock"}</span>
          </div>
          {live.lastError && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground uppercase tracking-wider text-[9px]">Fallback</span>
              <span className="text-mono truncate">{live.lastError}</span>
            </div>
          )}
        </div>

        {topicCounts.length > 0 && (
          <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1">
            {topicCounts.map(([k, n]) => (
              <Badge key={k} variant="outline" className="text-[10px] text-mono">{k} · {n}</Badge>
            ))}
          </div>
        )}

        <div className="max-h-56 overflow-y-auto">
          {recentSlice.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">{t("empty.noResults")}</div>
          ) : recentSlice.map((e, i) => (
            <div key={i} className="px-3 py-1.5 border-b border-border/40 last:border-0 text-xs flex items-center gap-2">
              <span className="text-mono text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className="text-mono uppercase tracking-wider text-status-running">{e.topic}</span>
              <span className="truncate text-muted-foreground flex-1">{summarize(e.payload)}</span>
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{t("realtime.diagnostics", { defaultValue: "QA: simulate connection state" })}</span>
          <Button size="sm" variant="outline" onClick={toggle}>
            {connected
              ? <><Plug className="h-3.5 w-3.5 mr-1" />{t("realtime.disconnect", { defaultValue: "Disconnect" })}</>
              : <><PlugZap className="h-3.5 w-3.5 mr-1" />{t("realtime.reconnect", { defaultValue: "Reconnect" })}</>}
          </Button>
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
