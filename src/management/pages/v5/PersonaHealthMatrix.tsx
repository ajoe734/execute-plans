// Pack E E3 — Persona Health Matrix.
// Renders the v5 PersonaExecutionHealth list as a sortable status matrix.
// Pure presentational; data injected by ExecutionLoop page.

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import type { PersonaExecutionHealth } from "@/lib/v5";

const statusCls: Record<string, string> = {
  healthy: "bg-status-success/15 text-status-success border-status-success/30",
  watch: "bg-accent/15 text-accent border-accent/30",
  degraded: "bg-status-warning/15 text-status-warning border-status-warning/30",
  critical: "bg-status-failed/15 text-status-failed border-status-failed/30",
};

const modeCls: Record<string, string> = {
  live: "bg-status-success/15 text-status-success border-status-success/30",
  paper: "bg-accent/15 text-accent border-accent/30",
  shadow: "bg-status-warning/15 text-status-warning border-status-warning/30",
  suspended: "bg-muted text-muted-foreground border-border",
};

function scoreHistory(item: PersonaExecutionHealth): number[] {
  const row = item as PersonaExecutionHealth & { history?: number[]; scoreHistory?: number[]; score_history?: number[] };
  return row.history ?? row.scoreHistory ?? row.score_history ?? [];
}

const Sparkline = ({ values, tone }: { values: number[]; tone: string }) => {
  if (values.length === 0) return null;
  const w = 80, h = 22, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / (values.length - 1);
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="score trend" className={tone}>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.25" points={pts} />
    </svg>
  );
};

const sparkTone = (status: string) =>
  status === "critical" ? "text-status-failed" :
  status === "degraded" ? "text-status-warning" :
  status === "watch"    ? "text-accent" :
                          "text-status-success";

export const PersonaHealthMatrix = ({ items }: { items: PersonaExecutionHealth[] }) => {
  const t = useT();
  // Sort: critical → degraded → watch → healthy, then by score asc
  const sorted = [...items].sort((a, b) => {
    const order = { critical: 0, degraded: 1, watch: 2, healthy: 3 } as const;
    const oa = order[a.status as keyof typeof order] ?? 4;
    const ob = order[b.status as keyof typeof order] ?? 4;
    return oa - ob || a.score - b.score;
  });

  return (
    <Card className="p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground bg-muted/40">
          <tr>
            <th className="text-left px-3 py-2">{t("v5.matrix.persona")}</th>
            <th className="text-left px-3 py-2">{t("v5.matrix.mode")}</th>
            <th className="text-left px-3 py-2">{t("v5.matrix.status")}</th>
            <th className="text-right px-3 py-2">{t("v5.matrix.score")}</th>
            <th className="text-left px-3 py-2">{t("v5.matrix.trend")}</th>
            <th className="text-right px-3 py-2">{t("v5.matrix.routed")}</th>
            <th className="text-right px-3 py-2">{t("v5.matrix.findings")}</th>
            <th className="text-left px-3 py-2">{t("v5.matrix.formula")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.personaId} className="border-t border-border">
              <td className="px-3 py-2">
                <div className="font-medium">{p.personaName}</div>
                {p.suspendedReason && <div className="text-xs text-muted-foreground">{p.suspendedReason}</div>}
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline" className={modeCls[p.mode] ?? ""}>{p.mode}</Badge>
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline" className={statusCls[p.status] ?? ""}>{p.status}</Badge>
              </td>
              <td className="px-3 py-2 text-right text-mono">{p.score.toFixed(0)}</td>
              <td className="px-3 py-2">
                <Sparkline values={scoreHistory(p)} tone={sparkTone(p.status)} />
              </td>
              <td className="px-3 py-2 text-right text-mono">{p.routedStrategies}</td>
              <td className="px-3 py-2 text-right text-mono">
                <span className={p.openFindings > 0 ? "text-status-warning" : "text-muted-foreground"}>
                  {p.openFindings}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{p.formulaVersion}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">{t("v5.empty")}</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
};
