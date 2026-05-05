// Phase 13.G — Skill risk score + historical incidents.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Skill } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { StatCard } from "@/platform/components/StatCard";
import { DataTable } from "@/platform/components/DataTable";
import { RiskBadge } from "@/platform/components/RiskBadge";

interface Incident {
  id: string;
  ts: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  resolved: boolean;
}

const buildIncidents = (skill: Skill): Incident[] => {
  if ((skill.evalScore ?? 1) > 0.9) return [];
  return [
    { id: `inc_${skill.id}_1`, ts: new Date(Date.now() - 86400_000 * 14).toISOString(), severity: "medium", summary: "Hallucinated source URL in macro briefing.", resolved: true },
    { id: `inc_${skill.id}_2`, ts: new Date(Date.now() - 86400_000 * 4).toISOString(), severity: "low", summary: "Output exceeded length budget.", resolved: true },
  ];
};

export const SkillRiskPanel = ({ skill }: { skill: Skill }) => {
  const t = useT();
  const incidents = buildIncidents(skill);
  const score = Math.max(0, 1 - (skill.evalScore ?? 0.85));
  const tone = score < 0.1 ? "success" : score < 0.2 ? "warning" : "danger";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t("phase13.skill.risk.score")} value={score.toFixed(2)} tone={tone} />
        <StatCard label="Risk tier" value={<RiskBadge level={skill.risk} />} />
        <StatCard label={t("phase13.skill.risk.incidents")} value={incidents.length} />
        <StatCard label="Resolved" value={`${incidents.filter((i) => i.resolved).length}/${incidents.length || 0}`} />
      </div>
      <Card className="p-0">
        <DataTable
          rows={incidents}
          empty={t("phase13.skill.risk.empty")}
          columns={[
            { key: "ts", header: t("common.updated"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.ts).toLocaleDateString()}</span> },
            { key: "sev", header: t("table.risk"), cell: (r) => <RiskBadge level={r.severity} /> },
            { key: "sum", header: t("table.description"), cell: (r) => <span className="text-sm">{r.summary}</span> },
            { key: "state", header: t("table.state"), cell: (r) => (
              <Badge variant="outline" className={`text-[10px] uppercase ${r.resolved ? "border-status-success/40 text-status-success" : "border-status-warning/40 text-status-warning"}`}>
                {r.resolved ? "resolved" : "open"}
              </Badge>
            ) },
          ]}
        />
      </Card>
    </div>
  );
};
