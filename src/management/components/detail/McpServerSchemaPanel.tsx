// Phase 13.G + P1 — MCP server schema overview: per-tool collapsible schema viewer.
// Each tool can be expanded to inspect input/output schema, scope, env grants, and a sample call.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { bff } from "@/lib/bff-v1";
import type { McpServer, McpTool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { envBadge, scopeTone } from "@/management/pages/CapabilitiesLists";

// Per-tool deterministic schema stub keyed by name/scope so each tool reads distinctly.
function inputSchemaFor(tool: McpTool): string {
  const base = tool.scope === "destructive"
    ? `{
  "type": "object",
  "required": ["target", "confirmation"],
  "properties": {
    "target":       { "type": "string", "description": "Resource id" },
    "confirmation": { "type": "string", "enum": ["CONFIRM"] },
    "memo":         { "type": "string" }
  }
}`
    : tool.scope === "write"
    ? `{
  "type": "object",
  "required": ["target", "payload"],
  "properties": {
    "target":  { "type": "string" },
    "payload": { "type": "object" },
    "dryRun":  { "type": "boolean", "default": false }
  }
}`
    : `{
  "type": "object",
  "required": ["query"],
  "properties": {
    "query":   { "type": "string" },
    "limit":   { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 }
  }
}`;
  return base;
}

function outputSchemaFor(tool: McpTool): string {
  return tool.scope === "destructive"
    ? `{
  "type": "object",
  "properties": {
    "applied":   { "type": "boolean" },
    "rollbackId":{ "type": "string" },
    "latencyMs": { "type": "number" }
  }
}`
    : `{
  "type": "object",
  "properties": {
    "result":    { "type": "object" },
    "items":     { "type": "array" },
    "latencyMs": { "type": "number" }
  }
}`;
}

function sampleCallFor(tool: McpTool): string {
  const args = tool.scope === "destructive"
    ? { target: "strategy:strat_btc_alpha_01", confirmation: "CONFIRM", memo: "from console" }
    : tool.scope === "write"
    ? { target: "channel:ch_research", payload: { note: "draft" }, dryRun: true }
    : { query: "BTC-PERP last 30d returns", limit: 30 };
  return JSON.stringify({ tool: tool.name, args }, null, 2);
}

export const McpServerSchemaPanel = ({ server }: { server: McpServer }) => {
  const t = useT();
  const [tools, setTools] = useState<McpTool[]>([]);
  useEffect(() => {
    bff.mcpTools.list().then((all) => setTools(all.filter((tt) => tt.serverId === server.id)));
  }, [server.id]);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {t("phase13.mcp.tabs.schema")} — {tools.length} {t("nav.tools").toLowerCase()}
      </div>
      {tools.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted-foreground">{t("empty.none")}</Card>
      )}
      <Accordion type="multiple" className="space-y-2">
        {tools.map((tool) => (
          <AccordionItem key={tool.id} value={tool.id} className="border border-border rounded-md bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <code className="text-mono text-xs font-semibold truncate">{tool.name}</code>
                <Badge variant="outline" className={`text-[10px] uppercase ${scopeTone(tool.scope)}`}>{tool.scope}</Badge>
                <div className="flex gap-1">
                  {(tool.envGrants ?? []).map((e) => (
                    <Badge key={e} variant="outline" className={`text-[10px] uppercase ${envBadge(e)}`}>{e}</Badge>
                  ))}
                </div>
                <span className="ml-auto text-mono text-[10px] text-muted-foreground">
                  {tool.callsLast24h.toLocaleString()} {t("phase13.mcp.calls24h")}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <p className="text-xs text-muted-foreground">{tool.description}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border border-border p-3">
                  <div className="uppercase tracking-wider text-[10px] text-muted-foreground mb-2">{t("phase13.mcp.schema.input")}</div>
                  <pre className="text-mono text-[11px] leading-5 whitespace-pre-wrap">{inputSchemaFor(tool)}</pre>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="uppercase tracking-wider text-[10px] text-muted-foreground mb-2">{t("phase13.mcp.schema.output")}</div>
                  <pre className="text-mono text-[11px] leading-5 whitespace-pre-wrap">{outputSchemaFor(tool)}</pre>
                </div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="uppercase tracking-wider text-[10px] text-muted-foreground mb-2">{t("phase13.mcp.schema.sample")}</div>
                <pre className="text-mono text-[11px] leading-5 whitespace-pre-wrap bg-muted/30 p-2 rounded">{sampleCallFor(tool)}</pre>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};
