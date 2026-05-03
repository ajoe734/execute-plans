import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { bff } from "@/lib/bff/client";
import type { McpServer, McpTool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ObjectDetailLayout, Section, Field, Placeholder } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { envBadge, scopeTone } from "./CapabilitiesLists";

export const McpServerDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [s, setS] = useState<McpServer | undefined>();
  const [tools, setTools] = useState<McpTool[]>([]);
  useEffect(() => {
    if (!id) return;
    bff.mcpServers.get(id).then(setS);
    bff.mcpTools.list().then((all) => setTools(all.filter((t) => t.serverId === id)));
  }, [id]);
  if (!s) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <ObjectDetailLayout
      object={s}
      subtitle={s.endpoint}
      tabs={[
        {
          value: "overview", label: "Overview",
          content: (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Health" value={s.health.toUpperCase()} tone={s.health === "warning" ? "warning" : s.health === "failed" ? "danger" : "success"} />
                <StatCard label="Tools" value={s.toolCount} />
                <StatCard label="Region" value={s.region} />
                <StatCard label="Envs" value={s.envAllowed.length} />
              </div>
              <Section title="Endpoint">
                <Field label="URL" value={s.endpoint} mono />
                <Field label="Allowed Environments" value={
                  <div className="flex gap-1 mt-1">
                    {s.envAllowed.map((e) => (
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
                { key: "name", header: "Name", cell: (r) => <div className="font-mono text-xs">{r.name}</div> },
                { key: "scope", header: "Scope", cell: (r) => <span className={`text-xs uppercase tracking-wider ${scopeTone(r.scope)}`}>{r.scope}</span> },
                { key: "envs", header: "Granted Envs", cell: (r) => (
                  <div className="flex gap-1">
                    {r.envGrants.map((e) => <Badge key={e} variant="outline" className={`text-[10px] uppercase ${envBadge(e)}`}>{e}</Badge>)}
                  </div>
                )},
                { key: "calls", header: "Calls 24h", cell: (r) => <span className="text-mono text-xs">{r.callsLast24h.toLocaleString()}</span> },
                { key: "state", header: "State", cell: (r) => <StatusBadge state={r.state} /> },
              ]}
              empty="No tools registered on this server."
            />
          ),
        },
        { value: "audit", label: "Audit", content: <Placeholder text="Per-server invocation log." /> },
      ]}
    />
  );
};

export const McpToolDetail = () => {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [tool, setTool] = useState<McpTool | undefined>();
  const [grantOpen, setGrantOpen] = useState(false);
  useEffect(() => { if (id) bff.mcpTools.get(id).then(setTool); }, [id]);
  if (!tool) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  const liveGranted = tool.envGrants.includes("live");

  return (
    <>
      <ObjectDetailLayout
        object={tool}
        subtitle={`MCP tool · ${tool.scope}`}
        actions={
          !liveGranted && tool.scope === "destructive" ? (
            <Button size="sm" variant="destructive" onClick={() => setGrantOpen(true)}>
              <ShieldCheck className="h-4 w-4 mr-1" />Grant Live access
            </Button>
          ) : null
        }
        tabs={[
          {
            value: "overview", label: "Overview",
            content: (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Scope" value={tool.scope.toUpperCase()} tone={tool.scope === "destructive" ? "danger" : tool.scope === "write" ? "warning" : "success"} />
                  <StatCard label="Calls 24h" value={tool.callsLast24h.toLocaleString()} />
                  <StatCard label="Envs" value={tool.envGrants.length} />
                  <StatCard label="State" value={tool.state} />
                </div>
                <Section title="Description">
                  <p className="text-sm leading-relaxed">{tool.description}</p>
                </Section>
                <Section title="Server">
                  <Field label="Server" value={
                    <button className="text-accent hover:underline text-mono text-xs" onClick={() => navigate(`/management/mcp/${tool.serverId}`)}>
                      {tool.serverId}
                    </button>
                  } />
                  <Field label="Granted environments" value={
                    <div className="flex gap-1 mt-1">
                      {tool.envGrants.map((e) => <Badge key={e} variant="outline" className={`text-[10px] uppercase ${envBadge(e)}`}>{e}</Badge>)}
                    </div>
                  } />
                </Section>
              </>
            ),
          },
          { value: "audit", label: "Audit", content: <Placeholder text="Per-tool invocation log." /> },
        ]}
      />

      <HighRiskConfirm
        open={grantOpen}
        onOpenChange={setGrantOpen}
        title={`Grant LIVE access — ${tool.name}`}
        description="Authorizes this destructive tool to execute against the LIVE environment. Requires dual approval (risk + ops) before taking effect."
        confirmToken="GRANT-LIVE"
        destructive
        onConfirm={async (memo) => { await bff.mutations.runAction({ kind: "McpTool", id: tool.id, action: "grant_env", memo }); toast.success("Live grant request submitted for approval"); }}
      />
    </>
  );
};
