import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { bffV1 } from "@/lib/bff-v1";
import type { McpServer, McpTool } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { StatCard } from "@/platform/components/StatCard";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";
import { mcpServerMachine, type McpServerState } from "@/lib/stateMachines";
import { ShieldCheck } from "lucide-react";
import { envBadge, scopeTone } from "./CapabilitiesLists";
import { McpRegistryPanel } from "@/management/components/detail/McpRegistryPanel";
import { ActivityMonitor } from "@/management/components/detail/ActivityMonitor";
import { McpSecretsPanel } from "@/management/components/detail/McpSecretsPanel";
import { McpServerSchemaPanel } from "@/management/components/detail/McpServerSchemaPanel";
import { CapabilityDetailEmptyState } from "@/management/components/CapabilityDetailEmptyState";

const HEALTH_TO_STATE: Record<string, McpServerState> = {
  healthy: "healthy", warning: "degraded", failed: "disabled",
};

export const McpServerDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [s, setS] = useState<McpServer | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [tools, setTools] = useState<McpTool[]>([]);
  useEffect(() => {
    if (!id) return;
    setLoaded(false);
    bffV1.mcpServers.get(id).then((row) => { setS(row); setLoaded(true); }).catch(() => setLoaded(true));
    bffV1.mcpTools.list().then((all) => setTools(all.filter((t) => t.serverId === id)));
  }, [id]);
  if (!s) {
    return loaded
      ? <CapabilityDetailEmptyState kind="MCP server" id={id} />
      : <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  }

  const machineState: McpServerState = HEALTH_TO_STATE[s.health] ?? "healthy";

  const actionBar = (
    <Button size="sm" variant="outline" asChild>
      <Link to="/management/capabilities/mcps">
        {t("nav.mcpServers", { defaultValue: "MCP Servers" })}
      </Link>
    </Button>
  );

  return (
    <>
    <ObjectDetailLayout
      object={s}
      subtitle={s.endpoint}
      actions={actionBar}
      tabs={[
        {
          value: "overview", label: t("section.overview"),
          content: (
            <>
              <Section>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("lifecycle.title")}</div>
                <LifecycleStepper machine={mcpServerMachine} current={machineState} i18nPrefix="lifecycle.mcpServer" />
              </Section>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label={t("table.status")} value={(s.health ?? "").toUpperCase()} tone={s.health === "warning" ? "warning" : s.health === "failed" ? "danger" : "success"} />
                <StatCard label={t("nav.tools")} value={s.toolCount} />
                <StatCard label={t("table.region")} value={s.region} />
                <StatCard label="Envs" value={s.envAllowed.length} />
              </div>
              <Section title={t("section.configuration")}>
                <Field label="URL" value={s.endpoint} mono />
                <Field label={t("table.env")} value={
                  <div className="flex gap-1 mt-1">
                    {(s.envAllowed ?? []).map((e) => (
                      <Badge key={e} variant="outline" className={`text-[10px] uppercase ${envBadge(e)}`}>{e}</Badge>
                    ))}
                  </div>
                } />
              </Section>
            </>
          ),
        },
        {
          value: "tools", label: `Tools (${tools.length})`,
          content: (
            <DataTable
              rows={tools}
              onRowClick={(r) => navigate(`/management/mcp-tools/${r.id}`)}
              columns={[
                { key: "name", header: t("table.name"), cell: (r) => <div className="font-mono text-xs">{r.name}</div> },
                { key: "scope", header: t("section.permissions"), cell: (r) => <span className={`text-xs uppercase tracking-wider ${scopeTone(r.scope)}`}>{r.scope}</span> },
                { key: "envs", header: "Granted Envs", cell: (r) => (
                  <div className="flex gap-1">
                    {(r.envGrants ?? []).map((e) => <Badge key={e} variant="outline" className={`text-[10px] uppercase ${envBadge(e)}`}>{e}</Badge>)}
                  </div>
                )},
                { key: "calls", header: "Calls 24h", cell: (r) => <span className="text-mono text-xs">{(r.callsLast24h ?? 0).toLocaleString()}</span> },
                { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
              ]}
              empty="No tools registered on this server."
            />
          ),
        },
        { value: "registry", label: t("mcp.tab.registry"), content: <McpRegistryPanel server={s} /> },
        { value: "activity", label: t("mcp.tab.activity"), content: <ActivityMonitor scope={s.id} /> },
        {
          value: "health", label: "Health",
          content: (
            <Section title={t("detail.section.runtimeHealth")}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label={t("table.status")} value={(s.health ?? "").toUpperCase()} tone={s.health === "warning" ? "warning" : s.health === "failed" ? "danger" : "success"} />
                <StatCard label="Uptime" value="—" />
                <StatCard label="P95 latency" value="—" />
                <StatCard label={t("table.region")} value={s.region} />
              </div>
            </Section>
          ),
        },
        {
          value: "permissions", label: t("section.permissions"),
          content: (
            <Section title={t("detail.section.allowedEnvs")}>
              <div className="flex gap-1">
                {(s.envAllowed ?? []).map((e) => (
                  <Badge key={e} variant="outline" className={`text-[10px] uppercase ${envBadge(e)}`}>{e}</Badge>
                ))}
              </div>
            </Section>
          ),
        },
        { value: "lineage", label: t("section.lineage"), content: (
          <Section>
            <div className="text-sm space-y-2">
              <div><span className="text-mono text-xs text-muted-foreground">tools:</span> <span className="text-mono text-xs text-accent">{tools.map((tt) => tt.name).join(", ") || "—"}</span></div>
              <div><span className="text-mono text-xs text-muted-foreground">runtime:</span> <span className="text-mono text-xs">{s.region} · {s.endpoint}</span></div>
            </div>
          </Section>
        ) },
        { value: "schema", label: t("phase13.mcp.tabs.schema"), content: <McpServerSchemaPanel server={s} /> },
        { value: "secrets", label: t("phase13.mcp.tabs.secrets"), content: <McpSecretsPanel server={s} /> },
        { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={[]} /> },
      ]}
    />
    </>
  );
};

export const McpToolDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [tool, setTool] = useState<McpTool | undefined>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!id) return;
    setLoaded(false);
    bffV1.mcpTools.get(id).then((row) => { setTool(row); setLoaded(true); }).catch(() => setLoaded(true));
  }, [id]);
  if (!tool) {
    return loaded
      ? <CapabilityDetailEmptyState kind="MCP tool" id={id} />
      : <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  }

  const liveGranted = tool.envGrants.includes("live");

  return (
    <>
      <ObjectDetailLayout
        object={tool}
        subtitle={`MCP tool · ${tool.scope}`}
        actions={null}
        tabs={[
          {
            value: "overview", label: t("section.overview"),
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label={t("section.permissions")} value={(tool.scope ?? "").toUpperCase()} tone={tool.scope === "destructive" ? "danger" : tool.scope === "write" ? "warning" : "success"} />
                  <StatCard label="Calls 24h" value={(tool.callsLast24h ?? 0).toLocaleString()} />
                  <StatCard label="Envs" value={tool.envGrants.length} />
                  <StatCard label={t("table.state")} value={tool.state} />
                </div>
                <Section title={t("table.description")}>
                  <p className="text-sm leading-relaxed">{tool.description}</p>
                </Section>
                <Section title={t("nav.mcp")}>
                  <Field label={t("nav.mcp")} value={
                    <button className="text-accent hover:underline text-mono text-xs" onClick={() => navigate(`/management/mcp/${tool.serverId}`)}>
                      {tool.serverId}
                    </button>
                  } />
                  <Field label={t("table.env")} value={
                    <div className="flex gap-1 mt-1">
                      {(tool.envGrants ?? []).map((e) => <Badge key={e} variant="outline" className={`text-[10px] uppercase ${envBadge(e)}`}>{e}</Badge>)}
                    </div>
                  } />
                </Section>
              </>
            ),
          },
          { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={[]} /> },
        ]}
      />
    </>
  );
};
