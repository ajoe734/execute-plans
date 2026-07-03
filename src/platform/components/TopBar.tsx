import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Bell, AlertTriangle, ClipboardCheck, Loader2, Globe, User, Lock } from "lucide-react";
import { usePlatform, type Locale } from "@/platform/store";
import { useT } from "@/platform/hooks";
import {
  lists, liveStatus, probeLiveHealth, useLiveStatus, type ListEnvelope,
  fetchShellSummary, shellSummaryStatus,
} from "@/lib/bff-v1";
import { useMe } from "@/lib/v4/session/me";
import { useNotificationCenter } from "./NotificationCenter";
import { RealtimeStatusBadge } from "./RealtimeStatusBadge";
import { scheduleAfterRoutePrimaryReady } from "@/platform/routePrimaryReady";

type TopbarDataSource = "checking" | "live" | "mock" | "fallback" | "degraded" | "unverified" | "unavailable";

const CommandPalette = lazy(() =>
  import("./CommandPalette").then((module) => ({ default: module.CommandPalette })),
);

export const TopBar = () => {
  const t = useT();
  const navigate = useNavigate();
  const loc = useLocation();
  const isManagement = loc.pathname.startsWith("/management");
  const { locale, setLocale } = usePlatform();
  const live = useLiveStatus();
  const { me, loading: meLoading, error: meError } = useMe();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [counts, setCounts] = useState({ approvals: 0, alerts: 0, jobs: 0 });
  const transportSource: TopbarDataSource = live.mode === "mock" ? "mock" : live.effective === "mock" ? "fallback" : "live";
  const [dataSource, setDataSource] = useState<TopbarDataSource>(transportSource === "live" ? "checking" : transportSource);
  const dataSourceRef = useRef<TopbarDataSource>(dataSource);
  const pathnameRef = useRef(loc.pathname);
  const countsAreLive = dataSource === "live";

  useEffect(() => {
    pathnameRef.current = loc.pathname;
  }, [loc.pathname]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    let cancelDeferredFallback: (() => void) | undefined;
    const setSource = (next: TopbarDataSource) => {
      dataSourceRef.current = next;
      setDataSource(next);
    };
    const clearCounts = (next: TopbarDataSource) => {
      setSource(next);
      setCounts({ approvals: 0, alerts: 0, jobs: 0 });
    };

    // Deferred fallback: only used when shell-summary itself is unavailable.
    // Waits for the route-primary-ready milestone, then runs on an idle
    // callback so it cannot compete with the route's first row/empty state.
    //
    // Deliberately does NOT read `lists.jobs()`: JobProgressDrawer already
    // owns the one jobs-list hydration for the shell (its own idle-callback
    // effect, unconditional on mount — see JobProgressDrawer.tsx), so a
    // second independent read here would be a genuine duplicate `/bff/jobs`
    // request, not just a redundant one. This is also dead weight even
    // without that: `counts.jobs` (like approvals/alerts here) only renders
    // once `dataSource === "live"`, and this fallback path only ever lands
    // on "degraded" or a non-live source, so a jobs count fetched here was
    // never shown.
    const hydrateFromFullLists = () => {
      if (disposed) return;
      Promise.all([lists.approvals(), lists.alerts()]).then(([a, al]) => {
        const source = liveStatus.get();
        if (disposed || source.mode !== "live" || source.effective !== "live") {
          clearCounts("fallback");
          return;
        }
        const listSource = classifyListSource([a, al]);
        if (listSource !== "live") {
          clearCounts(listSource);
          return;
        }
        const approvals = a.items as Array<{ state?: string }>;
        const alerts = al.items as Array<{ acknowledged?: boolean }>;
        // Recovered via the heavier full-list path, not the cheap summary —
        // label as degraded so the operator knows counts came from a fallback.
        setSource("degraded");
        setCounts((c) => ({
          ...c,
          approvals: approvals.filter((x) => x.state === "pending").length,
          alerts: alerts.filter((x) => !x.acknowledged).length,
        }));
      }).catch(() => clearCounts("fallback"));
    };
    const deferHydrateFromFullLists = () => {
      const pathname = pathnameRef.current;
      cancelDeferredFallback = scheduleAfterRoutePrimaryReady(hydrateFromFullLists, {
        pathname,
        isStillCurrent: () => pathnameRef.current === pathname,
      });
    };

    if (transportSource !== "live") {
      clearCounts(transportSource);
    } else {
      setSource("checking");
      fetchShellSummary().then((summary) => {
        if (disposed) return;
        const source = liveStatus.get();
        if (source.mode !== "live" || source.effective !== "live") {
          clearCounts("fallback");
          return;
        }
        const status = shellSummaryStatus(summary);
        if (status === "unavailable" || status === "unknown") {
          clearCounts("unavailable");
          deferHydrateFromFullLists();
          return;
        }
        setSource(status === "degraded" ? "degraded" : "live");
        setCounts({
          approvals: summary.counts.pendingApprovals,
          alerts: summary.counts.openAlerts,
          jobs: summary.counts.runningJobs,
        });
      }).catch(() => {
        if (disposed) return;
        clearCounts("unavailable");
        deferHydrateFromFullLists();
      });

      import("@/lib/bff/realtime").then(({ realtime }) => {
        if (disposed) return;
        const offJob = realtime.on("job", (p) => {
          const source = liveStatus.get();
          if (source.mode !== "live" || source.effective !== "live" || dataSourceRef.current !== "live") return;
          const e = p as { status: string };
          setCounts((c) => ({
            ...c,
            jobs: e.status === "running"
              ? c.jobs + 1
              : Math.max(0, c.jobs - ((e.status === "success" || e.status === "failed") ? 1 : 0)),
          }));
        });
        const offAlert = realtime.on("alert", () => {
          const source = liveStatus.get();
          if (source.mode !== "live" || source.effective !== "live" || dataSourceRef.current !== "live") return;
          setCounts((c) => ({ ...c, alerts: c.alerts + 1 }));
        });
        cleanup = () => { offJob?.(); offAlert?.(); };
      });
    }

    void probeLiveHealth().catch(() => undefined);
    const healthTimer = window.setInterval(() => {
      void probeLiveHealth().catch(() => undefined);
    }, 30_000);
    return () => {
      disposed = true;
      cancelDeferredFallback?.();
      cleanup?.();
      window.clearInterval(healthTimer);
    };
  }, [transportSource]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 sticky top-0 z-40">
      {/* Logo + product switcher */}
      <div className="flex items-center gap-2">
        <div className="font-bold tracking-tight text-base">⟁ {t("app.name")}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="font-medium">
              {isManagement ? t("app.management") : t("app.agora")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t("topbar.productSwitcher")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigate("/management")}>{t("app.management")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/agora")}>{t("app.agora")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="flex items-center gap-2 flex-1 max-w-xl mx-auto h-9 px-3 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground hover:bg-muted transition"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">{t("topbar.search")}</span>
        <kbd className="text-mono text-xs bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
      </button>

      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </Suspense>
      )}

      {/* Indicators */}
      <div className="flex items-center gap-1">
        <IndicatorButton icon={ClipboardCheck} count={countsAreLive ? counts.approvals : undefined} muted={!countsAreLive} tooltip={t("topbar.pendingApprovals")} onClick={() => navigate("/management/approvals")} />
        <IndicatorButton icon={AlertTriangle} count={countsAreLive ? counts.alerts : undefined} muted={!countsAreLive} tooltip={t("topbar.openAlerts")} onClick={() => navigate("/management/alerts")} />
        <IndicatorButton icon={Loader2} count={countsAreLive ? counts.jobs : undefined} muted={!countsAreLive} tooltip={t("topbar.runningJobs")} onClick={() => navigate("/management/jobs")} spin />
        {!countsAreLive && (
          <Badge variant="outline" className="h-6 px-2 text-[10px] uppercase tracking-wider text-status-warning border-status-warning/30 bg-status-warning/10">
            {t(`topbar.dataSource.${dataSource}`)}
          </Badge>
        )}
        <Button variant="ghost" size="icon" title={t("topbar.notifications")} onClick={() => useNotificationCenter.getState().setOpen(true)}><Bell className="h-4 w-4" /></Button>
      </div>

      {/* Realtime / BFF status */}
      <RealtimeStatusBadge />

      {/* Locale */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1"><Globe className="h-4 w-4" /> {locale}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(["en-US", "zh-TW"] as Locale[]).map((l) => (
            <DropdownMenuItem key={l} onClick={() => setLocale(l)}>{l}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User / Session — sourced from /bff/me; 401 surfaces auth error, never mock user */}
      {meLoading && !me ? (
        <Button variant="ghost" size="sm" disabled className="gap-1">
          <Loader2 className="h-4 w-4 animate-spin" />
        </Button>
      ) : meError || !me ? (
        <Button variant="ghost" size="sm" className="gap-1 text-destructive" title={meError?.message ?? "Session unavailable"} aria-label="auth-error">
          <Lock className="h-4 w-4" />
          <span className="text-xs">Auth</span>
        </Button>
      ) : me ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1">
              <User className="h-4 w-4" />
              {String(
                (me.user as { displayName?: string; display_name?: string }).displayName
                  ?? (me.user as { display_name?: string }).display_name
                  ?? me.user.id
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("topbar.role")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {me.roles.map((r) => (
              <DropdownMenuItem key={r} disabled>{r}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </header>
  );
};

const IndicatorButton = ({ icon: Icon, count, tooltip, onClick, spin, muted }: { icon: typeof Bell; count?: number; tooltip: string; onClick: () => void; spin?: boolean; muted?: boolean }) => (
  <Button variant="ghost" size="sm" className={`relative h-9 px-2 ${muted ? "text-muted-foreground" : ""}`} title={tooltip} onClick={onClick}>
    <Icon className={`h-4 w-4 ${spin && count > 0 ? "animate-spin" : ""}`} />
    {count !== undefined && count > 0 && (
      <span className="ml-1 text-xs font-semibold text-mono">{count}</span>
    )}
  </Button>
);

function classifyListSource(envelopes: Array<ListEnvelope<unknown>>): TopbarDataSource {
  let hasUnverified = false;
  for (const env of envelopes) {
    const source = classifyEnvelopeSource(env);
    if (source === "degraded") return "degraded";
    if (source === "unverified") hasUnverified = true;
  }
  return hasUnverified ? "unverified" : "live";
}

function classifyEnvelopeSource(env: ListEnvelope<unknown>): TopbarDataSource {
  const meta = asRecord(env.meta);
  const surfaces = asRecord(meta?.surfaces);
  if (!meta || !surfaces || Object.keys(surfaces).length === 0) return "unverified";
  if (meta.staleness || meta.degradation) return "degraded";
  for (const surface of Object.values(surfaces)) {
    if (!surfaceIsLive(surface)) return "degraded";
  }
  return "live";
}

function surfaceIsLive(surface: unknown): boolean {
  if (typeof surface === "string") return ["ok", "fresh", "live"].includes(surface.toLowerCase());
  const record = asRecord(surface);
  if (!record) return false;
  const source = String(record.source ?? "").toLowerCase();
  if (["local_snapshot", "missing", "unverifiable"].includes(source)) return false;
  const status = String(record.status ?? record.state ?? "ok").toLowerCase();
  if (!["ok", "fresh", "live"].includes(status)) return false;
  return !record.staleness && !record.degradation;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
