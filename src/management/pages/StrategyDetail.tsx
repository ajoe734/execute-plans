import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import type { Strategy } from "@/lib/bff/types";
import { ArrowLeft, Rocket, Pause, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const StrategyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const [s, setS] = useState<Strategy | undefined>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [action, setAction] = useState<{ kind: string; token: string; destructive?: boolean } | null>(null);

  useEffect(() => { if (id) bff.strategies.get(id).then(setS); }, [id]);
  if (!s) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  const trigger = (kind: string, token: string, destructive = false) => {
    setAction({ kind, token, destructive });
    setConfirmOpen(true);
  };

  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={`${s.alpha} · ${s.id}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
            <Button size="sm" variant="outline" onClick={() => trigger("pause", "PAUSE")}><Pause className="h-4 w-4 mr-1" />{t("actions.suspend")}</Button>
            <Button size="sm" variant="outline" onClick={() => trigger("rollback", "ROLLBACK", true)}><RotateCcw className="h-4 w-4 mr-1" />{t("actions.rollback")}</Button>
            <Button size="sm" onClick={() => trigger("promote", "PROMOTE-LIVE", true)}><Rocket className="h-4 w-4 mr-1" />{t("actions.promoteLive")}</Button>
          </div>
        }
      />
      <PageBody>
        <div className="flex items-center gap-2">
          <StatusBadge state={s.state} />
          <RiskBadge level={s.risk} />
          <span className="text-xs text-muted-foreground">{t("common.owner")}: {s.owner}</span>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="runtime">Runtime</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Alpha" value={s.alpha} mono />
              <Field label="Capital Pool" value={s.capitalPoolId} mono />
              <Field label="Personas" value={s.personaIds.join(", ")} mono />
              <Field label="Updated" value={new Date(s.updatedAt).toLocaleString()} mono />
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="mt-4">
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="PnL 30d" value={`${(s.pnl30d * 100).toFixed(2)}%`} tone={s.pnl30d >= 0 ? "success" : "danger"} />
              <StatCard label="Sharpe" value={s.sharpe.toFixed(2)} />
              <StatCard label="Max Drawdown" value={`${(s.drawdown * 100).toFixed(2)}%`} tone="warning" />
            </div>
          </TabsContent>

          <TabsContent value="risk" className="mt-4">
            <Card className="p-4 text-sm text-muted-foreground">Risk dashboards & limits will appear here.</Card>
          </TabsContent>
          <TabsContent value="runtime" className="mt-4">
            <Card className="p-4 text-sm text-muted-foreground">Live runtime, queues, jobs, latency.</Card>
          </TabsContent>
          <TabsContent value="approvals" className="mt-4">
            <Card className="p-4 text-sm text-muted-foreground">Approval history & open requests.</Card>
          </TabsContent>
          <TabsContent value="audit" className="mt-4">
            <Card className="p-4 text-sm text-muted-foreground">Audit trail of every state change.</Card>
          </TabsContent>
        </Tabs>
      </PageBody>

      {action && (
        <HighRiskConfirm
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`${action.kind.toUpperCase()} — ${s.name}`}
          description={`This will ${action.kind} the strategy. Audit trail will be recorded.`}
          confirmToken={action.token}
          destructive={action.destructive}
          onConfirm={() => { toast.success(`${action.kind} requested`); }}
        />
      )}
    </>
  );
};

const Field = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div>
    <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`mt-0.5 text-sm ${mono ? "text-mono" : ""}`}>{value}</div>
  </div>
);
