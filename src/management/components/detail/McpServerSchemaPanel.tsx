// Phase 13.G — MCP server schema overview: lists tools with i/o stub schemas.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bff } from "@/lib/bff/client";
import type { McpServer, McpTool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

export const McpServerSchemaPanel = ({ server }: { server: McpServer }) => {
  const t = useT();
  const [tools, setTools] = useState<McpTool[]>([]);
  useEffect(() => {
    bff.mcpTools.list().then((all) => setTools(all.filter((tt) => tt.serverId === server.id)));
  }, [server.id]);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {t("phase13.mcp.tabs.schema")} — {tools.length} tools
      </div>
      {tools.map((tool) => (
        <Card key={tool.id} className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-mono">{tool.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{tool.description}</div>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase">{tool.scope}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="rounded-md border border-border p-3">
              <div className="uppercase tracking-wider text-[10px] text-muted-foreground mb-2">{t("phase13.mcp.schema.input")}</div>
              <pre className="text-mono text-[11px] leading-5 whitespace-pre-wrap">{`{
  "type": "object",
  "required": [${tool.inputs > 0 ? `"arg0"` : ""}],
  "properties": ${JSON.stringify(
    Object.fromEntries(Array.from({ length: Math.max(1, tool.inputs) }, (_, i) => [`arg${i}`, { type: i === 0 ? "string" : "number" }])),
    null,
    2,
  )}
}`}</pre>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="uppercase tracking-wider text-[10px] text-muted-foreground mb-2">{t("phase13.mcp.schema.output")}</div>
              <pre className="text-mono text-[11px] leading-5 whitespace-pre-wrap">{`{
  "type": "object",
  "properties": {
    "result": { "type": "object" },
    "latencyMs": { "type": "number" }
  }
}`}</pre>
            </div>
          </div>
        </Card>
      ))}
      {tools.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-6">{t("empty.none")}</div>
      )}
    </div>
  );
};
