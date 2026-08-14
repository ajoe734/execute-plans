// MCP server registry readback; env-grant writes stay disabled until command receipts exist.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { McpServer } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { envBadge } from "@/management/pages/CapabilitiesLists";
import { ShieldCheck } from "lucide-react";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";

const ALL_ENVS: ("research" | "paper" | "live")[] = ["research", "paper", "live"];

export const McpRegistryPanel = ({ server }: { server: McpServer }) => {
  const t = useT();
  const grants = new Set(server.envAllowed);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">{t("mcp.registry.title")}</div>
            <div className="text-xs text-muted-foreground mt-1">{t("mcp.registry.hint")}</div>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">{server.region}</Badge>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {ALL_ENVS.map((e) => {
            const on = grants.has(e);
            return (
              <Badge
                key={e}
                variant="outline"
                className={`px-3 py-1.5 text-xs uppercase tracking-wider ${
                  on ? `${envBadge(e)} border-current` : "text-muted-foreground border-border"
                }`}
              >
                {on ? "✓ " : ""}{e}
              </Badge>
            );
          })}
        </div>
        {grants.has("live") && (
          <div className="flex items-center gap-2 text-xs text-status-warning bg-status-warning/10 border border-status-warning/30 p-2 rounded-md">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{t("mcp.registry.liveWarn")}</span>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <NonProductionActionButton size="sm">{t("actions.save")}</NonProductionActionButton>
        </div>
      </Card>
    </div>
  );
};
