// MCP server "registry" editor stub — env grants + region pinning preview.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { McpServer } from "@/lib/bff/types";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import { envBadge } from "@/management/pages/CapabilitiesLists";
import { ShieldCheck } from "lucide-react";

const ALL_ENVS: ("research" | "paper" | "live")[] = ["research", "paper", "live"];

export const McpRegistryPanel = ({ server }: { server: McpServer }) => {
  const t = useT();
  const [grants, setGrants] = useState<Set<string>>(new Set(server.envAllowed));
  const [dirty, setDirty] = useState(false);

  const toggle = (env: string) => {
    setGrants((g) => {
      const next = new Set(g);
      if (next.has(env)) next.delete(env);
      else next.add(env);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    await bff.mutations.runAction({
      kind: "McpServer",
      id: server.id,
      action: "update_env_grants",
      memo: `envs=${Array.from(grants).join(",")}`,
    });
    toast.success(t("mcp.registry.saved"));
    setDirty(false);
  };

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
              <button
                key={e}
                onClick={() => toggle(e)}
                className={`px-3 py-1.5 rounded-md border text-xs uppercase tracking-wider transition ${
                  on ? `${envBadge(e)} border-current` : "text-muted-foreground border-border hover:border-foreground/30"
                }`}
              >
                {on ? "✓ " : ""}{e}
              </button>
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
          <Button size="sm" variant="outline" onClick={() => { setGrants(new Set(server.envAllowed)); setDirty(false); }}>
            {t("actions.reset")}
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty}>{t("actions.save")}</Button>
        </div>
      </Card>
    </div>
  );
};
