// Notification Center — Part 1 §Shell. Sheet anchored on TopBar Bell icon.
// Tabs: alerts / approvals / jobs. Counts auto-refresh from realtime bus.
import { useEffect, useState } from "react";
import { create } from "zustand";
import { useNavigate } from "react-router-dom";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/platform/hooks";
import { bff } from "@/lib/bff-v1";
import { realtime } from "@/lib/bff/realtime";
import { RiskBadge } from "./RiskBadge";
import { StatusBadge } from "./StatusBadge";
import type { Alert, ApprovalRequest, Job, Incident } from "@/lib/bff/types";
import { AlertTriangle, ClipboardCheck, Loader2, ShieldAlert } from "lucide-react";

interface NCState {
  open: boolean;
  setOpen: (o: boolean) => void;
}
export const useNotificationCenter = create<NCState>((set) => ({
  open: false,
  setOpen: (o) => set({ open: o }),
}));

export const NotificationCenter = () => {
  const t = useT();
  const navigate = useNavigate();
  const open = useNotificationCenter((s) => s.open);
  const setOpen = useNotificationCenter((s) => s.setOpen);

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([bff.alerts.list(), bff.approvals.list(), bff.jobs.list(), bff.incidents.list()]).then(
      ([a, ap, j, inc]) => { setAlerts(a); setApprovals(ap); setJobs(j); setIncidents(inc); },
    );
    const offAlert = realtime.on("alert", (p) => {
      const a = p as Alert;
      setAlerts((cur) => [a, ...cur].slice(0, 50));
    });
    const offJob = realtime.on("job", (p) => {
      const j = p as { jobId: string; kind: string; status: Job["status"]; ts: string; owner: string };
      setJobs((cur) => [{ id: j.jobId, kind: j.kind, status: j.status, startedAt: j.ts, owner: j.owner }, ...cur].slice(0, 50));
    });
    const offData = realtime.on("data", (e) => {
      const event = e as { kind?: string } | undefined;
      if (event?.kind === "Incident") void bff.incidents.list().then(setIncidents);
    });
    return () => { offAlert?.(); offJob?.(); offData?.(); };
  }, [open]);

  const go = (path: string) => { setOpen(false); navigate(path); };
  const openCount = alerts.filter((a) => !a.acknowledged).length;
  const pendingCount = approvals.filter((a) => a.state === "pending").length;
  const runningCount = jobs.filter((j) => j.status === "running").length;
  const incidentCount = incidents.filter((i) => i.status !== "resolved").length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px] p-0">
        <div className="p-5 pb-3">
          <SheetHeader className="text-left space-y-1">
            <SheetTitle className="text-base">{t("notifications.title")}</SheetTitle>
            <SheetDescription className="text-xs">{t("notifications.subtitle")}</SheetDescription>
          </SheetHeader>
        </div>

        <Tabs defaultValue="alerts" className="px-5">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="alerts" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />{t("topbar.openAlerts")}
              {openCount > 0 && <Badge variant="destructive" className="ml-1 px-1 text-[10px]">{openCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="incidents" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />{t("notifications.incidents")}
              {incidentCount > 0 && <Badge variant="destructive" className="ml-1 px-1 text-[10px]">{incidentCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="approvals" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />{t("topbar.pendingApprovals")}
              {pendingCount > 0 && <Badge variant="secondary" className="ml-1 px-1 text-[10px]">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-1.5">
              <Loader2 className="h-3.5 w-3.5" />{t("topbar.runningJobs")}
              {runningCount > 0 && <Badge variant="secondary" className="ml-1 px-1 text-[10px]">{runningCount}</Badge>}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(100vh-200px)] mt-3 -mx-5 px-5">
            <TabsContent value="alerts" className="space-y-2 mt-0">
              {alerts.length === 0 && <Empty text={t("common.noResults")} />}
              {alerts.map((a) => (
                <button key={a.id} onClick={() => go("/management/alerts")}
                  className="w-full text-left rounded-md border border-border bg-card hover:bg-muted/40 px-3 py-2 transition">
                  <div className="flex items-center gap-2">
                    <RiskBadge level={a.severity} />
                    <span className="text-mono text-[10px] text-muted-foreground">{a.source}</span>
                    {!a.acknowledged && <Badge variant="outline" className="text-[10px] ml-auto">{t("notifications.unack")}</Badge>}
                  </div>
                  <div className="text-sm mt-1">{a.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{new Date(a.openedAt).toLocaleString()}</div>
                </button>
              ))}
            </TabsContent>

            <TabsContent value="incidents" className="space-y-2 mt-0">
              {incidents.length === 0 && <Empty text={t("common.noResults")} />}
              {incidents.map((i) => (
                <button key={i.id} onClick={() => go(`/management/incidents/${i.id}`)}
                  className="w-full text-left rounded-md border border-border bg-card hover:bg-muted/40 px-3 py-2 transition">
                  <div className="flex items-center gap-2">
                    <RiskBadge level={i.severity} />
                    <StatusBadge state={i.status === "resolved" ? "success" : i.status === "mitigating" ? "running" : "warning"} />
                    {i.commander && <span className="text-mono text-[10px] text-muted-foreground ml-auto">{i.commander}</span>}
                  </div>
                  <div className="text-sm mt-1">{i.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{new Date(i.openedAt).toLocaleString()}</div>
                </button>
              ))}
            </TabsContent>

            <TabsContent value="approvals" className="space-y-2 mt-0">
              {approvals.length === 0 && <Empty text={t("common.noResults")} />}
              {approvals.map((a) => (
                <button key={a.id} onClick={() => go("/management/approvals")}
                  className="w-full text-left rounded-md border border-border bg-card hover:bg-muted/40 px-3 py-2 transition">
                  <div className="flex items-center gap-2">
                    <span className="text-mono text-[10px] text-muted-foreground">{a.kind}</span>
                    <StatusBadge state={a.state} />
                    <RiskBadge level={a.riskLevel} />
                  </div>
                  <div className="text-sm mt-1">{a.subject}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.requester} · {new Date(a.createdAt).toLocaleString()}</div>
                </button>
              ))}
            </TabsContent>

            <TabsContent value="jobs" className="space-y-2 mt-0">
              {jobs.length === 0 && <Empty text={t("common.noResults")} />}
              {jobs.map((j) => (
                <button key={j.id} onClick={() => go("/management/jobs")}
                  className="w-full text-left rounded-md border border-border bg-card hover:bg-muted/40 px-3 py-2 transition">
                  <div className="flex items-center gap-2">
                    <span className="text-mono text-[10px] text-muted-foreground">{j.id}</span>
                    <StatusBadge state={j.status} />
                  </div>
                  <div className="text-sm mt-1 text-mono text-xs">{j.kind}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{j.owner} · {new Date(j.startedAt).toLocaleString()}</div>
                </button>
              ))}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="absolute bottom-0 inset-x-0 border-t border-border bg-card/80 backdrop-blur p-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
          <Button size="sm" onClick={() => go("/management/audit")}>{t("notifications.viewAudit")}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Empty = ({ text }: { text: string }) => (
  <div className="text-center text-xs text-muted-foreground py-8">{text}</div>
);
