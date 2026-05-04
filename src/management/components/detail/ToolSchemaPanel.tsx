// Tool I/O schema preview + lightweight editor stub.
// Phase 12 will replace with full JSON-Schema editor.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Tool } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

interface SchemaField { name: string; type: string; required: boolean; description: string; }

const mockSchema = (tool: Tool): { inputs: SchemaField[]; output: SchemaField } => {
  const baseByCategory: Record<string, SchemaField[]> = {
    data: [
      { name: "symbol", type: "string", required: true, description: "Instrument identifier" },
      { name: "lookback_days", type: "number", required: false, description: "History window" },
      { name: "interval", type: "enum<1m|5m|1h|1d>", required: false, description: "Bar interval" },
    ],
    execution: [
      { name: "venue", type: "string", required: true, description: "Execution venue" },
      { name: "symbol", type: "string", required: true, description: "Instrument" },
      { name: "side", type: "enum<buy|sell>", required: true, description: "Direction" },
      { name: "qty", type: "number", required: true, description: "Quantity" },
    ],
    research: [
      { name: "hypothesis", type: "string", required: true, description: "Research hypothesis" },
      { name: "dataset_id", type: "string", required: false, description: "Bound dataset" },
    ],
    communication: [
      { name: "channel", type: "string", required: true, description: "Target channel id" },
      { name: "payload", type: "object", required: true, description: "Message body" },
    ],
    analysis: [
      { name: "input_artifact", type: "string", required: true, description: "Source artifact id" },
      { name: "metric", type: "string", required: true, description: "Metric name" },
    ],
  };
  return {
    inputs: (baseByCategory[tool.category] ?? []).slice(0, tool.inputs || 3),
    output: { name: "result", type: "object", required: true, description: "Tool execution result" },
  };
};

export const ToolSchemaPanel = ({ tool }: { tool: Tool }) => {
  const t = useT();
  const schema = mockSchema(tool);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">{t("tool.schema.inputs")}</div>
        <div className="space-y-1.5">
          {schema.inputs.map((f) => (
            <div key={f.name} className="flex items-center gap-3 p-2 rounded-md border border-border">
              <code className="text-mono text-xs bg-muted px-2 py-0.5 rounded">{f.name}</code>
              <span className="text-mono text-[11px] text-accent">{f.type}</span>
              {f.required && <Badge variant="outline" className="text-[10px] uppercase text-status-warning border-status-warning/40">required</Badge>}
              <span className="text-xs text-muted-foreground flex-1">{f.description}</span>
            </div>
          ))}
          {schema.inputs.length === 0 && (
            <div className="text-xs text-muted-foreground py-4 text-center">{t("empty.none")}</div>
          )}
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">{t("tool.schema.output")}</div>
        <div className="flex items-center gap-3 p-2 rounded-md border border-border">
          <code className="text-mono text-xs bg-muted px-2 py-0.5 rounded">{schema.output.name}</code>
          <span className="text-mono text-[11px] text-accent">{schema.output.type}</span>
          <span className="text-xs text-muted-foreground flex-1">{schema.output.description}</span>
        </div>
      </Card>
    </div>
  );
};

export const ToolSandboxPanel = ({ tool }: { tool: Tool }) => {
  const t = useT();
  const [payload, setPayload] = useState<string>(() =>
    JSON.stringify({ tool: tool.id, args: { symbol: "BTC-PERP", lookback_days: 30 } }, null, 2)
  );
  const [response, setResponse] = useState<string>("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      JSON.parse(payload);
    } catch {
      toast.error(t("tool.sandbox.invalidJson"));
      setRunning(false);
      return;
    }
    setTimeout(() => {
      setResponse(JSON.stringify({
        ok: true,
        tool: tool.id,
        latencyMs: 124 + Math.round(Math.random() * 60),
        result: { rows: 30, sample: { ts: new Date().toISOString(), value: 42.17 } },
      }, null, 2));
      setRunning(false);
      toast.success(t("tool.sandbox.executed"));
    }, 600);
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{t("tool.sandbox.hint")}</div>
      <Card className="p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("tool.sandbox.request")}</div>
        <Textarea value={payload} onChange={(e) => setPayload(e.target.value)} rows={8} className="text-mono text-xs" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setResponse("")}>{t("actions.reset")}</Button>
          <Button size="sm" onClick={run} disabled={running}>
            {running ? t("common.loading") : t("tool.sandbox.run")}
          </Button>
        </div>
      </Card>
      {response && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("tool.sandbox.response")}</div>
          <pre className="text-mono text-xs bg-muted/30 p-3 rounded overflow-x-auto">{response}</pre>
        </Card>
      )}
    </div>
  );
};
