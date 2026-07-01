import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { bff } from "@/lib/bff-v1";
import type { AuditEvent, Strategy, Tool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { ToolSchemaPanel, ToolSandboxPanel } from "@/management/components/detail/ToolSchemaPanel";
import { ActivityMonitor } from "@/management/components/detail/ActivityMonitor";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";
import { toolMachine, type ToolState } from "@/lib/stateMachines";
import { PlayCircle, Power, ShieldOff, ShieldCheck, ArchiveX, Archive, Gauge, Tag } from "lucide-react";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";

const STATE_MAP: Record<string, ToolState> = {
  draft: "draft", testing: "testing", active: "active", deployed: "active",
  restricted: "restricted", deprecated: "deprecated", blocked: "blocked", retired: "retired",
};

export const ToolDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [tool, setTool] = useState<Tool | undefined>();
  const [consumers, setConsumers] = useState<Strategy[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  useEffect(() => {
    if (!id) return;
    bff.tools.get(id).then(setTool);
    bff.strategies.list().then((s) => setConsumers(s.slice(0, 4)));
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action?.startsWith("tool."))));
  }, [id]);
  if (!tool) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  const machineState: ToolState = STATE_MAP[tool.state ?? ""] ?? "draft";

  const actions = (
    <div className="flex flex-wrap gap-2">
      {machineState === "draft" && (
        <NonProductionActionButton size="sm" variant="outline">
          <PlayCircle className="h-4 w-4 mr-1" />{t("tool.actions.test")}
        </NonProductionActionButton>
      )}
      {machineState === "testing" && (
        <NonProductionActionButton size="sm">
          <Power className="h-4 w-4 mr-1" />{t("tool.actions.activate")}
        </NonProductionActionButton>
      )}
      {machineState === "active" && (
        <>
          <NonProductionActionButton size="sm" variant="outline">
            <ShieldOff className="h-4 w-4 mr-1" />{t("tool.actions.restrict")}
          </NonProductionActionButton>
          <NonProductionActionButton size="sm" variant="outline">
            <Archive className="h-4 w-4 mr-1" />{t("tool.actions.deprecate")}
          </NonProductionActionButton>
          <NonProductionActionButton size="sm" variant="outline">
            <ArchiveX className="h-4 w-4 mr-1" />{t("tool.actions.block")}
          </NonProductionActionButton>
        </>
      )}
      {machineState === "restricted" && (
        <NonProductionActionButton size="sm">
          <ShieldCheck className="h-4 w-4 mr-1" />{t("tool.actions.unrestrict")}
        </NonProductionActionButton>
      )}
      {machineState === "deprecated" && (
        <NonProductionActionButton size="sm" variant="outline">
          <ArchiveX className="h-4 w-4 mr-1" />{t("tool.actions.retire")}
        </NonProductionActionButton>
      )}
      <NonProductionActionButton size="sm" variant="outline">
        <Gauge className="h-4 w-4 mr-1" />{t("tool.actions.rateLimit")}
      </NonProductionActionButton>
      <NonProductionActionButton size="sm" variant="outline">
        <Tag className="h-4 w-4 mr-1" />{t("tool.actions.classifyRisk")}
      </NonProductionActionButton>
    </div>
  );

  return (
    <>
      <ObjectDetailLayout
        object={tool}
        subtitle={`${tool.category} · v${tool.version}`}
        actions={actions}
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <Section>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("lifecycle.title")}</div>
                  <LifecycleStepper machine={toolMachine} current={machineState} />
                </Section>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Category" value={(tool.category ?? "").toUpperCase()} />
                  <StatCard label={t("table.version")} value={tool.version} />
                  <StatCard label="Inputs" value={tool.inputs} />
                  <StatCard label="Used by" value={tool.usedBy} />
                </div>
                <Section title={t("table.description")}>
                  <p className="text-sm leading-relaxed">{tool.description}</p>
                </Section>
                <Section title={t("detail.section.schema")}>
                  <Field label="Tool ID" value={tool.id} mono />
                  <Field label={t("table.owner")} value={tool.owner} mono />
                </Section>
              </>
            ),
          },
          { value: "schema", label: t("tool.tab.schema"), content: <ToolSchemaPanel tool={tool} /> },
          { value: "sandbox", label: t("tool.tab.sandbox"), content: <ToolSandboxPanel tool={tool} /> },
          { value: "activity", label: t("tool.tab.activity"), content: <ActivityMonitor scope={tool.id} /> },
          { value: "consumers", label: t("nav.strategies"), content: (
            <DataTable rows={consumers} onRowClick={(r) => nav(`/management/strategies/${r.id}`)} columns={[
              { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
              { key: "alpha", header: "Alpha", cell: (r) => <span className="text-mono text-xs">{r.alpha}</span> },
              { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
            ]} empty={t("empty.noResults")} />
          )},
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
        ]}
      />
    </>
  );
};
