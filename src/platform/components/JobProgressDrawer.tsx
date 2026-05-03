// Bottom-anchored job progress drawer — Part 1 §Shell.
// Shows a compact strip when collapsed; expand to see all running jobs with progress.
import { useEffect, useState } from "react";
import { create } from "zustand";
import { realtime } from "@/lib/bff/realtime";
import { bff } from "@/lib/bff/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown, Loader2, X } from "lucide-react";
import { useT } from "@/platform/hooks";
import { StatusBadge } from "./StatusBadge";

interface RunningJob {
  id: string;
  kind: string;
  owner: string;
  startedAt: string;
  status: "queued" | "running" | "success" | "failed" | "warning" | "paused" | "pending";
  progress: number; // 0..1
}

interface JobDrawerState {
  expanded: boolean;
  toggle: () => void;
  setExpanded: (v: boolean) => void;
  jobs: RunningJob[];
  upsert: (j: RunningJob) => void;
  remove: (id: string) => void;
  setAll: (rows: RunningJob[]) => void;
}

export const useJobDrawer = create<JobDrawerState>((set) => ({
  expanded: false,
  toggle: () => set((s) => ({ expanded: !s.expanded })),
  setExpanded: (v) => set({ expanded: v }),
  jobs: [],
  upsert: (j) => set((s) => {
    const i = s.jobs.findIndex((x) => x.id === j.id);
    const next = [...s.jobs];
    if (i >= 0) next[i] = { ...next[i], ...j };
    else next.unshift(j);
    return { jobs: next.slice(0, 30) };
  }),
  remove: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
  setAll: (rows) => set({ jobs: rows.slice(0, 30) }),
}));

export const JobProgressDrawer = () => {
  const t = useT();
  const { expanded, toggle, jobs, upsert, remove, setAll } = useJobDrawer();
  const [tick, setTick] = useState(0);

  // Initial seed from BFF
  useEffect(() => {
    void bff.jobs.list().then((rows) => setAll(
      rows.map((r) => ({
        id: r.id, kind: r.kind, owner: r.owner, startedAt: r.startedAt,
        status: r.status, progress: r.status === "success" ? 1 : Math.random() * 0.6 + 0.2,
      })),
    ));
  }, [setAll]);

  // Subscribe to realtime job events
  useEffect(() => {
    const off = realtime.on("job", (p) => {
      const e = p as { jobId: string; kind: string; owner: string; ts: string; status: RunningJob["status"] };
      if (e.status === "success" || e.status === "failed") {
        upsert({ id: e.jobId, kind: e.kind, owner: e.owner, startedAt: e.ts, status: e.status, progress: 1 });
        setTimeout(() => remove(e.jobId), 6000);
      } else {
        upsert({ id: e.jobId, kind: e.kind, owner: e.owner, startedAt: e.ts, status: e.status, progress: 0.1 });
      }
    });
    return () => { off?.(); };
  }, [upsert, remove]);

  // Animate progress for running jobs
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    useJobDrawer.setState((s) => ({
      jobs: s.jobs.map((j) =>
        j.status === "running" ? { ...j, progress: Math.min(0.97, j.progress + 0.02 + Math.random() * 0.03) } : j,
      ),
    }));
  }, [tick]);

  const running = jobs.filter((j) => j.status === "running" || j.status === "queued" || j.status === "pending");
  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur shadow-lg">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 h-9 text-sm hover:bg-muted/40 transition"
      >
        <Loader2 className={`h-3.5 w-3.5 ${running.length > 0 ? "animate-spin" : ""}`} />
        <span className="font-medium">{t("jobs.runningCount", { count: running.length })}</span>
        <span className="text-xs text-muted-foreground">· {jobs.length} {t("jobs.tracked")}</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          {expanded ? <>{t("jobs.collapse")} <ChevronDown className="h-3.5 w-3.5" /></> : <>{t("jobs.expand")} <ChevronUp className="h-3.5 w-3.5" /></>}
        </span>
      </button>

      {expanded && (
        <div className="max-h-[40vh] overflow-auto border-t border-border divide-y divide-border">
          {jobs.map((j) => (
            <div key={j.id} className="px-4 py-2 flex items-center gap-3 text-sm">
              <span className="text-mono text-[10px] text-muted-foreground w-32 truncate">{j.id}</span>
              <span className="text-mono text-xs w-44 truncate">{j.kind}</span>
              <Badge variant="outline" className="text-[10px]">{j.owner}</Badge>
              <Progress value={j.progress * 100} className="flex-1 h-1.5" />
              <StatusBadge state={j.status} />
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(j.id)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
