// Live BFF status banner — shown when configured for `live` mode but the
// runtime has fallen back to mock due to a transport failure.
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useLiveStatus, liveStatus, connectLiveSse } from "@/lib/bff-v1";

export const LiveBffBanner = () => {
  const s = useLiveStatus();
  if (s.mode !== "live" || s.effective !== "mock") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-status-warning/10 border-b border-status-warning/30 text-status-warning px-4 py-2 text-xs flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span className="text-mono uppercase tracking-wider">live BFF unavailable</span>
        <span className="text-foreground/70">
          {s.lastError ?? "transport failed"} · serving mock data
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[11px]"
        onClick={() => { liveStatus.retry(); connectLiveSse(); }}
      >
        <RefreshCcw className="h-3 w-3 mr-1" />retry
      </Button>
    </div>
  );
};
