// E3 — LoopRun drawer: stage timeline with timeout state badges + advance/pause/resume/cancel.
// Mock-only via bff.v5.loops.* (overlay-backed); never mutates seed.

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { useT } from "@/platform/hooks";
import {
  DEFAULT_TIMEOUT_POLICY,
  V5_TIMEOUT_POLICY_VERSION,
  stageTimeoutState,
  type LoopRun,
  type LoopStage,
} from "@/lib/v5";
import { legacyBff as bff } from "@/lib/bff-v1";
import { Play, Pause, SkipForward, X, AlertTriangle, ShieldAlert } from "lucide-react";

const stageTone: Record<string, string> = {
  succeeded: "bg-status-success/15 text-status-success border-status-success/30",
  running:   "bg-status-running/15 text-status-running border-status-running/30",
  blocked:   "bg-status-warning/15 text-status-warning border-status-warning/30",
  failed:    "bg-status-failed/15 text-status-failed border-status-failed/30",
  pending:   "bg-muted text-muted-foreground border-border",
  skipped:   "bg-muted text-muted-foreground border-border",
};

const timeoutTone: Record<string, string> = {
  ok:       "bg-status-success/10 text-status-success border-status-success/30",
  warn:     "bg-status-warning/15 text-status-warning border-status-warning/30",
  escalate: "bg-status-failed/15 text-status-failed border-status-failed/30",
};

interface Props {
  run: LoopRun | null;
  onClose: () => void;
}

export const LoopRunDrawer = ({ run, onClose }: Props) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const policy = DEFAULT_TIMEOUT_POLICY;

  const isOpen = !!run;

  const callable = useMemo(() => {
    if (!run) return { advance: false, pause: false, resume: false, cancel: false };
    const terminal = ["succeeded", "failed", "cancelled"].includes(run.status);
    return {
      advance: !terminal && run.stages.some((s) => s.status === "running" || s.status === "pending"),
      pause:   !terminal && run.stages.some((s) => s.status === "running"),
      resume:  run.status === "blocked",
      cancel:  !terminal,
    };
  }, [run]);

  const wrap = async (kind: "advance" | "pause" | "resume" | "cancel") => {
    if (!run) return;
    setBusy(true);
    try {
      const r = kind === "pause"
        ? await bff.v5.loops.pause(run.id, reason || undefined)
        : kind === "resume" ? await bff.v5.loops.resume(run.id)
        : kind === "cancel" ? await bff.v5.loops.cancel(run.id)
        : await bff.v5.loops.advance(run.id);
      if (r.ok) {
        toast({ title: t(`v5.loops.execution.action.${kind}.ok`, { defaultValue: kind }) });
        if (kind === "pause") setReason("");
      } else {
        toast({ title: t(`v5.loops.execution.action.${kind}.err`, { defaultValue: "reason" in r ? r.reason : kind }), variant: "destructive" });
      }
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {run && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle className="text-base">{run.subjectName ?? run.id}</SheetTitle>
                <Badge variant="outline" className={stageTone[run.status] ?? ""}>{run.status}</Badge>
              </div>
              <SheetDescription className="text-xs">
                {run.loopKind} · {t("v5.col.updated")}: {new Date(run.updatedAt).toLocaleString()} · {t("v5.kpi.timeoutPolicy")}: {V5_TIMEOUT_POLICY_VERSION}
              </SheetDescription>
            </SheetHeader>

            <section className="mt-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">{t("v5.col.stages")}</h3>
              <ol className="space-y-2">
                {run.stages.map((s) => (
                  <StageRow key={s.id} stage={s} policy={policy} active={s.id === run.currentStageId} />
                ))}
              </ol>
            </section>

            {run.nextAction && (
              <section className="mt-4 text-xs">
                <div className="text-muted-foreground">{t("v5.col.next")}</div>
                <div className="mt-1 font-medium">{run.nextAction.label ?? run.nextAction.kind}</div>
              </section>
            )}

            {callable.pause && (
              <section className="mt-4">
                <label className="text-xs font-semibold text-muted-foreground" htmlFor="pause-reason">
                  {t("v5.loops.execution.action.pauseReason", { defaultValue: "Pause reason (optional)" })}
                </label>
                <Textarea
                  id="pause-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="mt-1 text-xs"
                  placeholder={t("v5.loops.execution.action.pauseReasonHint", { defaultValue: "Why pausing this run?" })}
                />
              </section>
            )}

            <section className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => wrap("advance")} disabled={!callable.advance || busy}>
                <SkipForward className="h-3.5 w-3.5 mr-1" />
                {t("v5.loops.execution.action.advance", { defaultValue: "Advance stage" })}
              </Button>
              <Button size="sm" variant="outline" onClick={() => wrap("pause")} disabled={!callable.pause || busy}>
                <Pause className="h-3.5 w-3.5 mr-1" />
                {t("v5.loops.execution.action.pause", { defaultValue: "Pause" })}
              </Button>
              <Button size="sm" variant="outline" onClick={() => wrap("resume")} disabled={!callable.resume || busy}>
                <Play className="h-3.5 w-3.5 mr-1" />
                {t("v5.loops.execution.action.resume", { defaultValue: "Resume" })}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => wrap("cancel")} disabled={!callable.cancel || busy}>
                <X className="h-3.5 w-3.5 mr-1" />
                {t("v5.loops.execution.action.cancel", { defaultValue: "Cancel run" })}
              </Button>
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const StageRow = ({ stage, policy, active }: { stage: LoopStage; policy: { runningWarnMs: number; blockedEscalateMs: number }; active: boolean }) => {
  const t = useT();
  const tState = stageTimeoutState(stage, policy);
  return (
    <li className={`rounded-md border p-2 ${active ? "border-primary/50 bg-primary/5" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate">{stage.name}</span>
          <Badge variant="outline" className={`text-[10px] ${stageTone[stage.status] ?? ""}`}>{stage.status}</Badge>
        </div>
        {tState !== "idle" && (
          <Badge variant="outline" className={`text-[10px] ${timeoutTone[tState] ?? ""}`}>
            {tState === "escalate"
              ? <ShieldAlert className="h-3 w-3 mr-0.5 inline-block" />
              : tState === "warn" ? <AlertTriangle className="h-3 w-3 mr-0.5 inline-block" /> : null}
            {t(`v5.loops.execution.timeout.${tState}`, { defaultValue: tState })}
          </Badge>
        )}
      </div>
      {(stage.startedAt || stage.completedAt) && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          {stage.startedAt && <>↑ {new Date(stage.startedAt).toLocaleTimeString()}</>}
          {stage.completedAt && <> · ↓ {new Date(stage.completedAt).toLocaleTimeString()}</>}
        </div>
      )}
    </li>
  );
};
