import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, FlaskConical, Zap, Archive, Sparkles } from "lucide-react";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";

interface Insight {
  id: string;
  kind: "pattern" | "anomaly" | "research_idea" | "skill_suggestion";
  source: string;
  title: string;
  body: string;
  confidence: number;
  ts: string;
  read?: boolean;
}

const kindMeta: Record<Insight["kind"], { icon: typeof Lightbulb; label: string; tone: string }> = {
  pattern: { icon: Sparkles, label: "Pattern", tone: "bg-accent/15 text-accent border-accent/30" },
  anomaly: { icon: Zap, label: "Anomaly", tone: "bg-status-warning/15 text-status-warning border-status-warning/30" },
  research_idea: { icon: Lightbulb, label: "Idea", tone: "bg-status-success/15 text-status-success border-status-success/30" },
  skill_suggestion: { icon: FlaskConical, label: "Skill", tone: "bg-status-paused/15 text-status-paused border-status-paused/30" },
};

const seed: Insight[] = [
  { id: "ins_01", kind: "pattern", source: "ev_001", title: "Earnings drift on Asia Tech holds 4+ days post-print", body: "Across the last 8 quarters, Asia Tech names show statistically significant drift on day 4 (t=2.7). Worth productizing as a tactical strategy.", confidence: 0.86, ts: new Date(Date.now() - 3600_000).toISOString() },
  { id: "ins_02", kind: "anomaly", source: "stg_004", title: "FX Carry slippage 2.3× expected", body: "Slippage on FX Carry Tactical exceeded modeled by 2.3× over the past week. Likely book-quality issue.", confidence: 0.78, ts: new Date(Date.now() - 7200_000).toISOString() },
  { id: "ins_03", kind: "research_idea", source: "rx_203", title: "Cross-asset momentum blend looks robust under regime gating", body: "Preliminary backtest suggests a 0.31 Sharpe lift when blending bond/equity momentum with VIX gating.", confidence: 0.72, ts: new Date(Date.now() - 18_000_000).toISOString() },
  { id: "ins_04", kind: "skill_suggestion", source: "ai_trainer", title: "Coach 'risk_override_review' skill", body: "Operators routinely override risk pauses without structured rationale. A new skill could prompt the right questions.", confidence: 0.81, ts: new Date(Date.now() - 86400_000).toISOString() },
];

export const InsightInbox = () => {
  const t = useT();
  const [items, setItems] = useState<Insight[]>(seed);
  const [filter, setFilter] = useState<"all" | Insight["kind"]>("all");

  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const archive = (id: string) => {
    setItems((m) => m.filter((i) => i.id !== id));
    toast.success("Archived");
  };
  const promote = (i: Insight) => {
    if (i.kind === "research_idea") toast.success("Created research_task");
    else if (i.kind === "skill_suggestion") toast.success("Drafted skill in coaching queue");
    else toast.success("Saved to research_note");
  };

  return (
    <>
      <PageHeader
        title={t("nav.insights")}
        subtitle="Patterns, anomalies, ideas, and coaching suggestions surfaced by Pantheon. Triage to grow research and skill backlog."
        actions={
          <div className="flex gap-1">
            {(["all", "pattern", "anomaly", "research_idea", "skill_suggestion"] as const).map((k) => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
                {k === "all" ? t("common.all") : kindMeta[k].label}
              </Button>
            ))}
          </div>
        }
      />
      <PageBody>
        <div className="space-y-3">
          {filtered.map((i) => {
            const meta = kindMeta[i.kind];
            const Icon = meta.icon;
            return (
              <Card key={i.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`rounded-md p-2 border ${meta.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-[10px] uppercase ${meta.tone}`}>{meta.label}</Badge>
                      <span className="text-mono text-[10px] text-muted-foreground">{i.source}</span>
                      <span className="text-mono text-[10px] text-muted-foreground">· conf {(i.confidence * 100).toFixed(0)}%</span>
                      <span className="text-mono text-[10px] text-muted-foreground ml-auto">{new Date(i.ts).toLocaleString()}</span>
                    </div>
                    <h3 className="font-semibold text-sm">{i.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{i.body}</p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" onClick={() => promote(i)}>Promote</Button>
                      <Button size="sm" variant="outline" onClick={() => toast.success("Pushed to Ask Personas")}>Discuss</Button>
                      <Button size="sm" variant="ghost" onClick={() => archive(i.id)}><Archive className="h-4 w-4 mr-1" />Dismiss</Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">Inbox zero.</Card>}
        </div>
      </PageBody>
    </>
  );
};
