import { useEffect, useState } from "react";
import { bff } from "@/lib/bff/client";
import type { WorkflowStep } from "@/lib/bff/types";
import { WorkflowStepper } from "./WorkflowStepper";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { useT } from "@/platform/hooks";

export const RebalanceWorkflowTab = ({ rebalanceId }: { rebalanceId: string }) => {
  const t = useT();
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  useEffect(() => {
    bff.rebalanceWorkflow.forRebalance(rebalanceId).then((arr) => setSteps(arr as unknown as WorkflowStep[]));
  }, [rebalanceId]);
  const current = steps.findIndex((s) => s.status === "in_progress");
  return (
    <Section title={t("phase13.rebalance.workflow.title")}>
      <div className="text-xs text-muted-foreground mb-2">
        {t("phase13.rebalance.workflow.current")}: {current >= 0 ? `${current + 1}. ${steps[current]?.label}` : "—"}
      </div>
      <WorkflowStepper steps={steps} orientation="vertical" />
    </Section>
  );
};
