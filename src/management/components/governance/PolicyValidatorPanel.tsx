import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/platform/hooks";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from "lucide-react";

type ValidatorState = "running" | "passed" | "failed" | "warning";
interface ValidatorResult {
  key: "schema" | "consistency" | "impact" | "precedence" | "coverage";
  state: ValidatorState;
  detail: string;
  durationMs: number;
}

// Deterministic mock per approval id
function buildResults(approvalId: string): ValidatorResult[] {
  let s = 0;
  for (let i = 0; i < approvalId.length; i++) s = (s * 31 + approvalId.charCodeAt(i)) >>> 0;
  const pick = (i: number, opts: ValidatorState[]) => opts[(s + i) % opts.length];
  return [
    { key: "schema", state: pick(0, ["passed", "passed", "passed", "warning"]), detail: "JSON schema check vs registry v3.", durationMs: 110 + (s % 90) },
    { key: "consistency", state: pick(1, ["passed", "passed", "warning", "failed"]), detail: "Cross-policy consistency vs production set.", durationMs: 210 + (s % 200) },
    { key: "impact", state: pick(2, ["passed", "warning", "passed"]), detail: "Estimated impact on 3 routes / 12 strategies.", durationMs: 320 + (s % 250) },
    { key: "precedence", state: pick(3, ["passed", "passed", "warning"]), detail: "No precedence collision with rule #14.", durationMs: 90 + (s % 60) },
    { key: "coverage", state: pick(4, ["passed", "warning", "passed"]), detail: "Covers 92% of historical decision corpus.", durationMs: 480 + (s % 400) },
  ];
}

const tone = (s: ValidatorState) =>
  s === "passed" ? "border-status-success/40 text-status-success bg-status-success/10"
  : s === "failed" ? "border-status-failed/40 text-status-failed bg-status-failed/10"
  : s === "warning" ? "border-status-warning/40 text-status-warning bg-status-warning/10"
  : "border-border text-muted-foreground bg-muted/30";

const Icon = ({ state }: { state: ValidatorState }) => {
  if (state === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (state === "passed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (state === "failed") return <XCircle className="h-3.5 w-3.5" />;
  return <AlertTriangle className="h-3.5 w-3.5" />;
};

export const PolicyValidatorPanel = ({ approvalId }: { approvalId: string }) => {
  const t = useT();
  const [results, setResults] = useState<ValidatorResult[]>(
    () => buildResults(approvalId).map((r) => ({ ...r, state: "running" as ValidatorState })),
  );
  const [running, setRunning] = useState(true);

  const run = () => {
    const target = buildResults(approvalId);
    setResults(target.map((r) => ({ ...r, state: "running" })));
    setRunning(true);
    target.forEach((r, i) => {
      setTimeout(() => {
        setResults((prev) => prev.map((p, j) => (j === i ? { ...p, state: r.state } : p)));
        if (i === target.length - 1) setRunning(false);
      }, 250 + i * 350);
    });
  };

  useEffect(() => { run(); /* eslint-disable-next-line */ }, [approvalId]);

  const summary = results.reduce(
    (acc, r) => { acc[r.state] = (acc[r.state] ?? 0) + 1; return acc; },
    {} as Record<ValidatorState, number>,
  );

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h4 className="text-sm font-semibold">{t("phase21.governance.validatorTitle")}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{t("phase21.governance.validatorHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <Badge variant="outline" className="text-[10px]">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />{t("phase21.governance.running")}
            </Badge>
          )}
          {!running && (
            <>
              {summary.passed && <Badge variant="outline" className="text-[10px] border-status-success/40 text-status-success">{summary.passed} {t("phase21.governance.passed")}</Badge>}
              {summary.warning && <Badge variant="outline" className="text-[10px] border-status-warning/40 text-status-warning">{summary.warning} {t("phase21.governance.warning")}</Badge>}
              {summary.failed && <Badge variant="outline" className="text-[10px] border-status-failed/40 text-status-failed">{summary.failed} {t("phase21.governance.failed")}</Badge>}
            </>
          )}
          <Button size="sm" variant="ghost" onClick={run} disabled={running}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border mt-3">
        {results.map((r) => (
          <li key={r.key} className="py-2 flex items-center gap-3">
            <Badge variant="outline" className={`text-[10px] ${tone(r.state)} flex items-center gap-1`}>
              <Icon state={r.state} />
              {r.state === "running" ? "…" : t(`phase21.governance.${r.state}`)}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="text-sm">{t(`phase21.governance.validator.${r.key}`)}</div>
              <div className="text-xs text-muted-foreground">{r.detail}</div>
            </div>
            <span className="text-mono text-[10px] text-muted-foreground">{r.durationMs}ms</span>
          </li>
        ))}
      </ul>
    </Card>
  );
};
