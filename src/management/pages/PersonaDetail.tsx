import { useEffect, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bff } from "@/lib/bff-v1";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";
import { runPersonaAction, testPersonaPrompt } from "@/lib/bff-v1/personas";
import { commandReceiptDescription } from "@/lib/bff-v1/commandReceipt";
import { useT } from "@/platform/hooks";
import { usePermissions } from "@/lib/usePermissions";
import type { Persona, Strategy, AuditEvent } from "@/lib/bff/types";
import { Pause, Edit, Beaker, Play, Lock, Archive } from "lucide-react";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";
import { RoutePolicyPreview } from "../components/detail/RoutePolicyPreview";
import { PermissionMatrixEmbed } from "../components/detail/PermissionMatrixEmbed";
import { ActivityMonitor } from "../components/detail/ActivityMonitor";
import { MemoryGovernanceQueue } from "../components/detail/MemoryGovernanceQueue";
import { PersonaIdentityTab } from "../components/detail/PersonaIdentityTab";
import { PersonaWorkspaceTab } from "../components/detail/PersonaWorkspaceTab";
import { PersonaCapitalBindingTab } from "../components/detail/PersonaCapitalBindingTab";
import { PersonaStrategyOwnershipTab } from "../components/detail/PersonaStrategyOwnershipTab";
import { PersonaPolicyViolationsTab } from "../components/detail/PersonaPolicyViolationsTab";
import { PersonaEvaluationsTab } from "../components/detail/PersonaEvaluationsTab";
import { PersonaVersionHistoryTab } from "../components/detail/PersonaVersionHistoryTab";
import { resolvePersonaForDetail } from "./personaDetailData";
import { PersonaReadinessCard } from "../components/persona/PersonaReadinessCard";

type PersonaLoadState = "loading" | "ready" | "not-found" | "error";

export const PersonaDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [p, setP] = useState<Persona | undefined>();
  const [loadState, setLoadState] = useState<PersonaLoadState>("loading");
  const [routed, setRouted] = useState<Strategy[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const { can } = usePermissions();
  const canRetire = can("archive");

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setP(undefined);
      setRouted([]);
      setAudit([]);
      setLoadState("not-found");
      return;
    }

    setP(undefined);
    setRouted([]);
    setAudit([]);
    setLoadState("loading");

    Promise.all([
      resolvePersonaForDetail(id),
      bff.strategies.list().catch(() => [] as Strategy[]),
      bff.audit.list().catch(() => [] as AuditEvent[]),
    ])
      .then(([persona, allStrategies, allAudit]) => {
        if (cancelled) return;
        setP(persona);
        setRouted(allStrategies.filter((s) => s.personaIds.includes(id)));
        setAudit(allAudit.filter((x) => x.target === id));
        setLoadState(persona ? "ready" : "not-found");
      })
      .catch(() => {
        if (cancelled) return;
        setP(undefined);
        setLoadState("error");
      });

    return () => { cancelled = true; };
  }, [id]);

  if (loadState === "loading") {
    return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  }

  if (!p) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-sm text-muted-foreground">
          {loadState === "error"
            ? t("errors.BACKEND_UNAVAILABLE")
            : t("agora.trainerStudio.detail.notFound", { id: id ?? "" })}
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/management/personas")}>
          {t("nav.personas")}
        </Button>
      </div>
    );
  }

  const personaReceipt = (receipt: Record<string, unknown>, action: string) =>
    commandReceiptDescription(receipt, { fallback: `Persona ${p.id} · ${action}` });

  return (
    <>
      <ObjectDetailLayout
        object={p}
        subtitle={`${p.archetype} · ${p.id}`}
        actions={
          <>
            <NonProductionActionButton size="sm" variant="outline">
              <Edit className="h-4 w-4 mr-1" />{t("actions.edit")}
            </NonProductionActionButton>
            <Button size="sm" variant="outline" onClick={async () => {
              const receipt = await testPersonaPrompt(p.id, "manual test");
              toast.success(t("persona.ops.testToast", { name: p.name }), {
                description: personaReceipt(receipt, "test_prompt"),
              });
            }}>
              <Beaker className="h-4 w-4 mr-1" />{t("persona.ops.testAs")}
            </Button>
            <Button size="sm" variant="outline" onClick={async () => {
              const receipt = await runPersonaAction(p.id, "run_eval", { memo: "manual eval" });
              toast.success(t("persona.ops.evalToast"), {
                description: personaReceipt(receipt, "run_eval"),
              });
            }}>
              <Play className="h-4 w-4 mr-1" />{t("persona.ops.runEval")}
            </Button>
            <Button size="sm" variant="outline" onClick={async () => {
              const receipt = await runPersonaAction(p.id, "restrict_tools", { memo: "temporary restriction" });
              toast.success(t("persona.ops.restrictToast"), {
                description: personaReceipt(receipt, "restrict_tools"),
              });
            }}>
              <Lock className="h-4 w-4 mr-1" />{t("persona.ops.restrictTools")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)}>
              <Pause className="h-4 w-4 mr-1" />{t("actions.suspend")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!canRetire}
              onClick={() => setRetireOpen(true)}
              title={canRetire ? t("persona.ops.retireHint", { defaultValue: "封存後進入 retired 終態，保留稽核軌跡；不可物理刪除。" }) : t("permission.requireAction", { action: "archive" })}
            >
              <Archive className="h-4 w-4 mr-1" />{t("actions.retire")}
            </Button>
          </>
        }
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <Section>
                <PersonaReadinessCard personaId={p.id} persona={p} personaName={p.name} className="mb-4" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label={t("table.type")} value={p.archetype} />
                  <Field label={t("nav.strategies")} value={p.routedStrategies} mono />
                  <Field label={t("table.winRate")} value={`${(p.successRate * 100).toFixed(0)}%`} mono />
                  <Field label={t("table.owner")} value={p.owner} mono />
                </div>
                <div className="flex justify-end pt-2">
                  <Button asChild variant="outline" size="sm">
                    <Link aria-label={`${p.id} trade journeys`} to={`/management/trade-journeys?persona_id=${encodeURIComponent(p.id)}`}>
                      {t("detail.tradeJourneys.viewTradeJourneys", { defaultValue: "View Trade Journeys" })} →
                    </Link>
                  </Button>
                </div>
              </Section>
            ),
          },
          { value: "identity", label: t("phase13.persona.tabs.identity"), content: <PersonaIdentityTab p={p} /> },
          { value: "workspace", label: t("phase13.persona.tabs.workspace"), content: <PersonaWorkspaceTab personaId={p.id} /> },
          { value: "capitalBinding", label: t("phase13.persona.tabs.capitalBinding"), content: <PersonaCapitalBindingTab personaId={p.id} /> },
          { value: "strategyOwnership", label: t("phase13.persona.tabs.strategyOwnership"), content: <PersonaStrategyOwnershipTab personaId={p.id} strategies={routed} /> },
          {
            value: "routes", label: t("section.permissions"),
            content: (
              <DataTable
                rows={routed}
                onRowClick={(r) => navigate(`/management/strategies/${r.id}`)}
                columns={[
                  { key: "name", header: t("nav.strategies"), cell: (r) => <div className="font-medium">{r.name}</div> },
                  { key: "alpha", header: "Alpha", cell: (r) => <span className="text-mono text-xs">{r.alpha}</span> },
                  { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                  { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
                ]}
                empty={t("empty.noResults")}
              />
            ),
          },
          {
            value: "performance", label: t("section.performance"),
            content: (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label={t("table.winRate")} value={`${(p.successRate * 100).toFixed(0)}%`} tone="success" />
                  <StatCard label={t("nav.strategies")} value={p.routedStrategies} />
                  <StatCard label={t("section.activity")} value="—" />
                </div>
                <div className="flex justify-end pt-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={canonicalCenterUrl("performance", "overview", { persona: p.id })}>
                      {t("detail.performance.openPerformanceCenter", { defaultValue: "Open Performance Center" })} →
                    </Link>
                  </Button>
                </div>
              </div>
            ),
          },
          {
            value: "routePolicy", label: t("persona.tabs.routePolicy"),
            content: <RoutePolicyPreview personaId={p.id} />,
          },
          {
            value: "permissions", label: t("persona.tabs.toolsMcpSkills"),
            content: <PermissionMatrixEmbed personaId={p.id} />,
          },
          {
            value: "activity", label: t("persona.tabs.activity"),
            content: <ActivityMonitor scope={p.id} />,
          },
          {
            value: "memory", label: t("persona.tabs.training"),
            content: <MemoryGovernanceQueue personaId={p.id} />,
          },
          { value: "violations", label: t("phase13.persona.tabs.violations"), content: <PersonaPolicyViolationsTab personaId={p.id} /> },
          { value: "evaluations", label: t("phase13.persona.tabs.evaluations"), content: <PersonaEvaluationsTab personaId={p.id} /> },
          { value: "versions", label: t("phase13.persona.tabs.versions"), content: <PersonaVersionHistoryTab personaId={p.id} /> },
          {
            value: "audit", label: t("nav.audit"),
            content: (
              <DataTable rows={audit} columns={[
                { key: "ts", header: t("table.time"), cell: (r) => <span className="text-mono text-xs">{safeDateTime(r.ts)}</span> },
                { key: "actor", header: t("table.actor"), cell: (r) => r.actor },
                { key: "action", header: t("table.action"), cell: (r) => <span className="text-mono text-xs">{r.action}</span> },
              ]} empty={t("empty.noResults")} />
            ),
          },
        ]}
      />

      <HighRiskConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Suspend persona — ${p.name}`}
        description={t("detail.confirm.suspendPersona")}
        actionId="persona.suspend"
        confirmEntity={{ type: "persona", id: p.id }}
        target={{ type: "Persona", id: p.id, name: p.name }}
        risk="high"
        onConfirm={async (memo, token) => {
          const receipt = await runPersonaAction(p.id, "suspend", { memo, confirmToken: token });
          toast.success(t("toast.saved"), {
            description: personaReceipt(receipt, "suspend"),
          });
        }}
      />

      <HighRiskConfirm
        open={retireOpen}
        onOpenChange={setRetireOpen}
        title={t("persona.ops.retireTitle", { name: p.name, defaultValue: `Retire persona — ${p.name}` })}
        description={t("persona.ops.retireDesc", { defaultValue: "Persona 將進入 retired 終態，從預設列表移除，但保留審計軌跡 7 年。Persona 為審計實體，無法物理刪除；若需替換請使用 Fork from Retired。" })}
        actionId="persona.retire"
        confirmEntity={{ type: "persona", id: p.id }}
        target={{ type: "Persona", id: p.id, name: p.name }}
        risk="high"
        onConfirm={async (memo, token) => {
          const receipt = await runPersonaAction(p.id, "retire", { memo, confirmToken: token });
          toast.success(t("toast.saved"), {
            description: personaReceipt(receipt, "retire"),
          });
          navigate("/management/personas");
        }}
      />
    </>
  );
};
