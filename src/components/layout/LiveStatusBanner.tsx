// Live status banner — shows the current BFF transport mode in the page header.
//
// State mapping:
//   "real"          — live strict mode is active; banner is hidden (operator is in
//                     a known-safe state and does not need a reminder).
//   "real-error"    — strict live mode hit a typed transport error; never label
//                     this as seed/mock data.
//   "hybrid"        — live mode with auto fallback; warning strip states that seed
//                     fallback is armed.
//   "mock-fallback" — hybrid live fell back to seed; prominent "資料來源：seed" warning
//                     with retry action.
//   "mock"          — pure seed mode; "資料來源：seed" warning indicator.
//
// API version mismatch is surfaced independently of the transport mode.
//
// Integration: rendered in PlatformShell so it covers Management Console,
// Agora, and v5 page headers across the full app shell.

import { AlertTriangle, Database, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { liveStatus, connectLiveSse, BFF_API_VERSION } from "@/lib/bff-v1";
import { useLiveStatusSnapshot, type LiveStatusSnapshot } from "@/lib/bff/liveTransport";

function VersionMismatchStrip({
  serverApiVersion,
}: {
  serverApiVersion: string | undefined;
}) {
  return (
    <div className="w-full bg-status-warning/10 border-b border-status-warning/30 text-status-warning px-4 py-1.5 text-xs flex items-center gap-2">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="font-mono uppercase tracking-wider">api version mismatch</span>
      <span className="text-foreground/70">
        server={serverApiVersion} · client={BFF_API_VERSION}
      </span>
    </div>
  );
}

function WriteDegradedStrip() {
  const status = liveStatus.get();
  const events = (status.writeDegraded ?? []).filter((e) => Date.now() - e.at < 5 * 60 * 1000);
  if (events.length === 0) return null;
  const last = events[events.length - 1];
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-status-failed/10 border-b border-status-failed/30 text-status-failed px-4 py-1.5 text-xs flex items-center gap-2"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="font-mono uppercase tracking-wider shrink-0">be write endpoint 未上線</span>
      <span className="text-foreground/70 truncate">
        {events.length} 筆本地 draft（30min TTL）· 最近：{last.endpoint} ({last.reason})
      </span>
    </div>
  );
}

function BannerContent({ snap }: { snap: LiveStatusSnapshot }) {
  const { transportMode, fellBack, fallbackReason, apiVersionMismatch, serverApiVersion } = snap;

  if (transportMode === "real" && !apiVersionMismatch) {
    // Fully live, strict — no visual noise needed (but write-degraded strip still renders).
    return <WriteDegradedStrip />;
  }

  if (transportMode === "real" && apiVersionMismatch) {
    return <VersionMismatchStrip serverApiVersion={serverApiVersion} />;
  }

  if (transportMode === "real-error") {
    return (
      <>
        <div
          role="status"
          aria-live="polite"
          className="w-full bg-status-failed/10 border-b border-status-failed/30 text-status-failed px-4 py-2 text-xs flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono uppercase tracking-wider shrink-0">strict typed error</span>
            <span className="text-foreground/70 truncate">
              {fallbackReason ?? "live BFF unavailable"} · seed fallback blocked
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] shrink-0 self-start sm:self-auto"
            onClick={() => {
              liveStatus.retry();
              connectLiveSse();
            }}
          >
            <RefreshCcw className="h-3 w-3 mr-1" />retry
          </Button>
        </div>
        {apiVersionMismatch && <VersionMismatchStrip serverApiVersion={serverApiVersion} />}
      </>
    );
  }

  if (transportMode === "mock-fallback" || fellBack) {
    return (
      <>
        <div
          role="status"
          aria-live="polite"
          className="w-full bg-status-warning/10 border-b border-status-warning/30 text-status-warning px-4 py-2 text-xs flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono uppercase tracking-wider shrink-0">資料來源：seed</span>
            <span className="text-foreground/70 truncate">
              {fallbackReason ?? "live BFF unavailable"} · hybrid fallback active
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px] shrink-0 self-start sm:self-auto"
            onClick={() => {
              liveStatus.retry();
              connectLiveSse();
            }}
          >
            <RefreshCcw className="h-3 w-3 mr-1" />retry
          </Button>
        </div>
        {apiVersionMismatch && <VersionMismatchStrip serverApiVersion={serverApiVersion} />}
      </>
    );
  }

  if (transportMode === "hybrid") {
    return (
      <>
        <div
          role="status"
          aria-live="polite"
          className="w-full bg-status-warning/10 border-b border-status-warning/25 text-status-warning px-4 py-1.5 text-xs flex items-center gap-2"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono uppercase tracking-wider">hybrid</span>
          <span className="text-foreground/70 truncate">資料來源：live / seed fallback armed</span>
        </div>
        {apiVersionMismatch && <VersionMismatchStrip serverApiVersion={serverApiVersion} />}
      </>
    );
  }

  // Pure mock / seed mode
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-status-warning/10 border-b border-status-warning/25 text-status-warning px-4 py-1.5 text-xs flex items-center gap-2"
    >
      <Database className="h-3 w-3 shrink-0" />
      <span className="font-mono uppercase tracking-wider">資料來源：seed</span>
    </div>
  );
}

export const LiveStatusBanner = () => {
  const snap = useLiveStatusSnapshot();
  return <BannerContent snap={snap} />;
};
