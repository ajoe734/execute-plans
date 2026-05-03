import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Rocket, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { Deployment } from "@/lib/bff/types";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";

const targetTone = (t: Deployment["target"]) =>
  t === "live" ? "danger" : t === "paper" ? "warning" : "default";

export const DeploymentDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [d, setD] = useState<Deployment | undefined>();
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);

  useEffect(() => { if (id) bff.deployments.get(id).then(setD); }, [id]);
  if (!d) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  const isLive = d.target === "live";

  return (
    <>
      <ObjectDetailLayout
        object={d}
        subtitle={`${d.target.toUpperCase()} · ${d.version}`}
        actions={
          <>
            {!isLive && (
              <Button size="sm" onClick={() => setPromoteOpen(true)}>
                <Rocket className="h-4 w-4 mr-1" />{t("actions.promoteLive")}
              </Button>
            )}
            {d.rollbackAvailable && (
              <Button size="sm" variant="outline" onClick={() => setRollbackOpen(true)}>
                <Undo2 className="h-4 w-4 mr-1" />{t("actions.rollback")}
              </Button>
            )}
          </>
        }
        tabs={[
          {
            value: "overview", label: "Overview",
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Target" value={d.target.toUpperCase()} tone={targetTone(d.target)} />
                  <StatCard label="Version" value={d.version} />
                  <StatCard label="Previous" value={d.previousVersion ?? "—"} />
                  <StatCard label="Promoted" value={d.promotedAt ? new Date(d.promotedAt).toLocaleString() : "—"} />
                </div>
                <Section title="Linked objects">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Field label="Strategy" value={
                      d.strategyId
                        ? <button className="text-accent hover:underline text-mono" onClick={() => navigate(`/management/strategies/${d.strategyId}`)}>{d.strategyId}</button>
                        : "—"
                    } />
                    <Field label="Artifact" value={
                      <button className="text-accent hover:underline text-mono" onClick={() => navigate(`/management/artifacts/${d.artifactId}`)}>{d.artifactId}</button>
                    } />
                    <Field label="Owner" value={d.owner} mono />
                  </div>
                </Section>
              </>
            ),
          },
          { value: "runtime", label: "Runtime", content: <Placeholder text="Live executor metrics for this deployment." /> },
          { value: "approvals", label: "Approvals", content: <Placeholder text="Promotion and rollback approvals." /> },
          { value: "audit", label: "Audit", content: <Placeholder text="Deployment audit trail." /> },
        ]}
      />

      <HighRiskConfirm
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        title={`Promote to Live — ${d.name}`}
        description="Promotes this deployment to the LIVE environment. Generates an approval request that requires risk and ops sign-off."
        confirmToken="PROMOTE"
        destructive
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "Deployment", id: d.id, action: "promote_live", newState: "deployed", memo }); toast.success("Promotion request submitted"); }}
      />
      <HighRiskConfirm
        open={rollbackOpen}
        onOpenChange={setRollbackOpen}
        title={`Rollback — ${d.name}`}
        description={`Rolls back to version ${d.previousVersion ?? "previous"}. Live orders will continue to flow through the previous artifact.`}
        confirmToken="ROLLBACK"
        destructive
        onConfirm={async (memo) => { await bff.mutations.rollback("Deployment", d.id, memo); toast.success("Rollback executed"); }}
      />
    </>
  );
};
