// Phase 12 — generic expression editor with metric library + validation.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import { METRIC_LIBRARY, MetricLibrary } from "./MetricLibrary";

const TOKEN = /[a-zA-Z_][a-zA-Z0-9_]*/g;

export interface FormulaEditorState {
  expression: string;
  valid: boolean;
  metrics: string[];
}

export const FormulaEditor = ({
  initialExpression,
  onChange,
  rightSlot,
}: {
  initialExpression: string;
  onChange?: (s: FormulaEditorState) => void;
  rightSlot?: React.ReactNode;
}) => {
  const t = useT();
  const [expr, setExpr] = useState(initialExpression);
  const [touched, setTouched] = useState(false);

  const metricIds = useMemo(() => new Set(METRIC_LIBRARY.map((m) => m.id)), []);
  const allowed = useMemo(() => new Set(["abs", "sqrt", "min", "max", "log", "exp"]), []);

  const result = useMemo(() => {
    const opens = (expr.match(/\(/g) ?? []).length;
    const closes = (expr.match(/\)/g) ?? []).length;
    const tokens = expr.match(TOKEN) ?? [];
    const used: string[] = [];
    let unknown = false;
    for (const tk of tokens) {
      if (/^\d/.test(tk)) continue;
      if (metricIds.has(tk)) {
        if (!used.includes(tk)) used.push(tk);
        continue;
      }
      if (allowed.has(tk)) continue;
      unknown = true;
    }
    return { valid: opens === closes && !unknown && expr.trim().length > 0, metrics: used };
  }, [expr, metricIds, allowed]);

  const update = (next: string) => {
    setExpr(next);
    setTouched(true);
    onChange?.({ expression: next, valid: result.valid, metrics: result.metrics });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-3">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{t("studios.expression")}</div>
            <Badge variant="outline" className={`text-[10px] uppercase ${result.valid ? "border-status-success/40 text-status-success" : "border-status-warning/40 text-status-warning"}`}>
              {touched ? (result.valid ? t("studios.validateOk") : t("studios.validateErr")) : t("studios.validate")}
            </Badge>
          </div>
          <Textarea
            value={expr}
            onChange={(e) => update(e.target.value)}
            rows={4}
            className="text-mono text-sm"
            placeholder="0.6*sharpe - 0.3*abs(dd) + 0.1*capacity"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">{t("studios.metrics")}:</span>
            {result.metrics.map((m) => (
              <Badge key={m} variant="outline" className="text-mono text-[10px]">{m}</Badge>
            ))}
            {result.metrics.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </Card>
        {rightSlot}
      </div>
      <MetricLibrary onPick={(id) => update(expr ? `${expr} + ${id}` : id)} />
    </div>
  );
};
