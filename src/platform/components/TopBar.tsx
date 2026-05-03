import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Search, Bell, AlertTriangle, ClipboardCheck, Loader2, Globe, User, Wifi, WifiOff } from "lucide-react";
import { usePlatform, type Locale, type UserRole } from "@/platform/store";
import { useT } from "@/platform/hooks";
import { EnvSwitcher } from "./EnvSwitcher";
import { CommandPalette } from "./CommandPalette";
import { bff } from "@/lib/bff/client";
import { useNotificationCenter } from "./NotificationCenter";

const roles: UserRole[] = [
  "admin", "research_lead", "risk_officer", "capital_manager",
  "strategy_manager", "system_operator", "reviewer", "capability_admin",
  "analyst", "trader", "ai_trainer",
];

export const TopBar = () => {
  const t = useT();
  const navigate = useNavigate();
  const loc = useLocation();
  const isManagement = loc.pathname.startsWith("/management");
  const { locale, setLocale, role, setRole, bffOnline } = usePlatform();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [counts, setCounts] = useState({ approvals: 0, alerts: 0, jobs: 0 });

  useEffect(() => {
    Promise.all([bff.approvals.list(), bff.alerts.list(), bff.jobs.list()]).then(([a, al, j]) => {
      setCounts({
        approvals: a.filter((x) => x.state === "pending").length,
        alerts: al.filter((x) => !x.acknowledged).length,
        jobs: j.filter((x) => x.status === "running").length,
      });
    });
    let cleanup: (() => void) | undefined;
    import("@/lib/bff/realtime").then(({ realtime }) => {
      const offJob = realtime.on("job", (p) => {
        const e = p as { status: string };
        setCounts((c) => ({
          ...c,
          jobs: e.status === "running"
            ? c.jobs + 1
            : Math.max(0, c.jobs - ((e.status === "success" || e.status === "failed") ? 1 : 0)),
        }));
      });
      const offAlert = realtime.on("alert", () => {
        setCounts((c) => ({ ...c, alerts: c.alerts + 1 }));
      });
      cleanup = () => { offJob?.(); offAlert?.(); };
    });
    return () => cleanup?.();
  }, []);

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

      <EnvSwitcher />

      {/* Search */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="flex items-center gap-2 flex-1 max-w-xl mx-auto h-9 px-3 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground hover:bg-muted transition"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">{t("topbar.search")}</span>
        <kbd className="text-mono text-xs bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
      </button>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {/* Indicators */}
      <div className="flex items-center gap-1">
        <IndicatorButton icon={ClipboardCheck} count={counts.approvals} tooltip={t("topbar.pendingApprovals")} onClick={() => navigate("/management/approvals")} />
        <IndicatorButton icon={AlertTriangle} count={counts.alerts} tooltip={t("topbar.openAlerts")} onClick={() => navigate("/management/alerts")} />
        <IndicatorButton icon={Loader2} count={counts.jobs} tooltip={t("topbar.runningJobs")} onClick={() => navigate("/management/jobs")} spin />
        <Button variant="ghost" size="icon" title={t("topbar.notifications")} onClick={() => useNotificationCenter.getState().setOpen(true)}><Bell className="h-4 w-4" /></Button>
      </div>

      {/* BFF status */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2">
        {bffOnline ? <Wifi className="h-3.5 w-3.5 text-status-success" /> : <WifiOff className="h-3.5 w-3.5 text-status-failed" />}
        <span className="text-mono">{t("topbar.bff")}</span>
        <span className="h-1.5 w-1.5 rounded-full bg-status-success animate-pulse-dot" title={t("topbar.realtime")} />
      </div>

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

      {/* Role */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1"><User className="h-4 w-4" /> {role}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t("topbar.role")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {roles.map((r) => (
            <DropdownMenuItem key={r} onClick={() => setRole(r)}>{r}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};

const IndicatorButton = ({ icon: Icon, count, tooltip, onClick, spin }: { icon: typeof Bell; count: number; tooltip: string; onClick: () => void; spin?: boolean }) => (
  <Button variant="ghost" size="sm" className="relative h-9 px-2" title={tooltip} onClick={onClick}>
    <Icon className={`h-4 w-4 ${spin && count > 0 ? "animate-spin" : ""}`} />
    {count > 0 && (
      <span className="ml-1 text-xs font-semibold text-mono">{count}</span>
    )}
  </Button>
);
