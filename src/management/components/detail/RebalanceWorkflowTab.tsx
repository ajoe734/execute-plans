import { useEffect, useState } from "react";
import { bff } from "@/lib/bff-v1";
import { mutations } from "@/lib/bff/mutations";
import type { WorkflowStep } from "@/lib/bff/types";
import { WorkflowStepper } from "./WorkflowStepper";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { useT } from "@/platform/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, RefreshCw, Snowflake, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { realtime } from "@/lib/bff/realtime";

interface StepX extends WorkflowStep { jobKind?: string }

export const RebalanceWorkflowTab = ({ rebalanceId }: { rebalanceId: string }) => {
  const t = useT();
  const [steps, setSteps] = useState<StepX[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    bff.rebalanceWorkflow.forRebalance(rebalanceId).then((arr) => setSteps(arr as unknown as StepX[]));

  useEffect(() => {
    refresh();
    const off = realtime.on("data", (e: any) => {
      if (e?.kind === "RebalanceStep" || e?.kind === "Job") refresh();
    });
    return () => { off(); };
  }, [rebalanceId]);

  const current = steps.findIndex((s) => s.status === "in_progress");
  const cur = current >= 0 ? steps[current] : undefined;

  const advance = async () => {
    setBusy(true);
    const res = await mutations.advanceRebalanceStep(rebalanceId);
    setBusy(false);
    if (res.ok) {
      toast.success(t("phase21.rebalance.workflow.advanced"), {
        description: res.jobId ? `${t("phase21.rebalance.workflow.queuedJob")}: ${res.jobId}` : undefined,
      });
    } else {
      toast.error(res.message ?? "Cannot advance");
    }
    refresh();
  };

  const rerun = async () => {
    if (!cur) return;
    setBusy(true);
    const res = await mutations.rerunRebalanceStep(rebalanceId, cur.id);
    setBusy(false);
    if (res.ok) toast.success(t("phase21.rebalance.workflow.rerun"), { description: res.jobId });
    else toast.error("Step has no rerunnable job");
  };

  const stepIcon = (kind?: string) => {
    if (!kind) return <ChevronRight className="h-3.5 w-3.5" />;
    if (kind.includes("freeze")) return <Snowflake className="h-3.5 w-3.5" />;
    if (kind.includes("apply") || kind.includes("monitor")) return <PlayCircle className="h-3.5 w-3.5" />;
    return <RefreshCw className="h-3.5 w-3.5" />;
  };

  return (
    <Section title={t("phase13.rebalance.workflow.title")}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground">
          {t("phase13.rebalance.workflow.current")}:{" "}
          <span className="font-medium text-foreground">
            {cur ? `${current + 1}. ${cur.label}` : "—"}
          </span>
          {cur?.jobKind && (
            <Badge variant="outline" className="ml-2 text-[10px] text-mono">
              {stepIcon(cur.jobKind)}
              <span className="ml-1">{cur.jobKind}</span>
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {cur?.jobKind && (
            <Button size="sm" variant="outline" disabled={busy} onClick={rerun}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />{t("phase21.rebalance.workflow.rerunBtn")}
            </Button>
          )}
          <Button size="sm" disabled={!cur || busy} onClick={advance}>
            {t("phase21.rebalance.workflow.advanceBtn")}<ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
      <WorkflowStepper steps={steps} orientation="vertical" />
    </Section>
  );
};
