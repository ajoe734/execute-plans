import { ObjectListPage } from "./ObjectListPage";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import { Badge } from "@/components/ui/badge";

const envBadge = (env: string) => {
  if (env === "live") return "bg-env-live-bg text-status-success border-status-success/30";
  if (env === "paper") return "bg-env-paper-bg text-status-warning border-status-warning/30";
  return "bg-env-research-bg text-status-running border-status-running/30";
};

const scopeTone = (s: string) => {
  if (s === "destructive") return "text-status-failed";
  if (s === "write") return "text-status-warning";
  return "text-status-success";
};

export const ToolsList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.tools")}
      loader={() => bff.tools.list()}
      basePath="/management/tools"
      extraColumns={[
        { key: "cat", header: "Category", cell: (r) => <span className="text-xs uppercase tracking-wider text-muted-foreground">{r.category}</span> },
        { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version}</span> },
        { key: "in", header: "Inputs", cell: (r) => <span className="text-mono text-xs">{r.inputs}</span> },
        { key: "used", header: "Used by", cell: (r) => <span className="text-mono text-xs">{r.usedBy}</span> },
      ]}
    />
  );
};

export const McpServersList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.mcp")}
      loader={() => bff.mcpServers.list()}
      basePath="/management/mcp"
      extraColumns={[
        { key: "ep", header: "Endpoint", cell: (r) => <span className="text-mono text-xs text-muted-foreground">{r.endpoint}</span> },
        { key: "rg", header: t("table.region"), cell: (r) => <span className="text-mono text-xs">{r.region}</span> },
        { key: "tc", header: "Tools", cell: (r) => <span className="text-mono text-xs">{r.toolCount}</span> },
        { key: "envs", header: "Envs", cell: (r) => (
          <div className="flex gap-1">
            {r.envAllowed.map((e) => (
              <Badge key={e} variant="outline" className={`text-[10px] uppercase ${envBadge(e)}`}>{e}</Badge>
            ))}
          </div>
        )},
      ]}
    />
  );
};

export const SkillsList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.skills")}
      loader={() => bff.skills.list()}
      basePath="/management/skills"
      extraColumns={[
        { key: "arch", header: "Archetype", cell: (r) => r.archetype },
        { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version}</span> },
        { key: "draft", header: "Mode", cell: (r) => <span className={`text-xs uppercase tracking-wider ${r.draft ? "text-status-warning" : "text-status-success"}`}>{r.draft ? "Draft" : "Published"}</span> },
        { key: "eval", header: "Eval", cell: (r) => <span className="text-mono text-xs">{r.evalScore?.toFixed(2) ?? "—"}</span> },
        { key: "use", header: "Personas", cell: (r) => <span className="text-mono text-xs">{r.usedByPersonas}</span> },
      ]}
    />
  );
};

export const ChannelsList = () => {
  const t = useT();
  return (
    <ObjectListPage
      title={t("nav.channels")}
      loader={() => bff.channels.list()}
      basePath="/management/channels"
      extraColumns={[
        { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-xs uppercase tracking-wider">{r.kind}</span> },
        { key: "dst", header: t("table.destination"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{r.destination}</span> },
        { key: "subs", header: "Subs", cell: (r) => <span className="text-mono text-xs">{r.subscribers}</span> },
        { key: "f", header: t("table.filters"), cell: (r) => <code className="text-mono text-xs bg-muted px-1.5 py-0.5 rounded">{r.filters ?? "—"}</code> },
      ]}
    />
  );
};

export { envBadge, scopeTone };
