import { useEffect, useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, FlaskConical, Zap, Archive, Sparkles, Send } from "lucide-react";
import { useT } from "@/platform/hooks";
import { useHandoff } from "@/lib/handoff";
import { toast } from "sonner";
import { bff } from "@/lib/bff-v1";

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

export const InsightInbox = () => {
  const t = useT();
  const openHandoff = useHandoff((s) => s.openHandoff);
  const [items, setItems] = useState<Insight[]>([]);
  const [filter, setFilter] = useState<"all" | Insight["kind"]>("all");

  useEffect(() => {
    let alive = true;
    bff.agora.inbox.list()
      .then((next) => { if (alive) setItems(next); })
      .catch((err) => {
        if (!alive) return;
        setItems([]);
        toast.error(err instanceof Error ? err.message : "Agora inbox unavailable");
      });
    return () => { alive = false; };
  }, []);

  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const archive = (id: string) => {
    setItems((m) => m.filter((i) => i.id !== id));
    toast.success(t("agora.insightInbox.dismiss"));
  };
  const promote = (i: Insight) => {
    if (i.kind === "research_idea") toast.success("Created research_task");
    else if (i.kind === "skill_suggestion") toast.success("Drafted skill in coaching queue");
    else toast.success("Saved to research_note");
  };
  const promoteToStrategy = (i: Insight) => {
    openHandoff({
      type: "research_task",
      source: { kind: "Insight", id: i.id, label: i.title },
      summary: `Strategy idea: ${i.title}`,
      notes: i.body,
      evidence: [`source:${i.source}`],
    });
    toast.success(t("agora.insightInbox.promotedStrategy"));
  };
  const promoteToTraining = (i: Insight) => {
    openHandoff({
      type: "skill_draft",
      source: { kind: "Insight", id: i.id, label: i.title },
      summary: `Training example: ${i.title}`,
      notes: i.body,
    });
    toast.success(t("agora.insightInbox.promotedTraining"));
  };

  return (
    <>
      <PageHeader
        title={t("nav.insights")}
        subtitle={t("agora.insightInbox.subtitle")}
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
                      <span className="text-mono text-[10px] text-muted-foreground ml-auto">{safeDateTime(i.ts)}</span>
                    </div>
                    <h3 className="font-semibold text-sm">{i.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{i.body}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" onClick={() => promote(i)}>{t("agora.insightInbox.promote")}</Button>
                      <Button size="sm" variant="outline" onClick={() => promoteToStrategy(i)}>{t("agora.insightInbox.promoteToStrategy")}</Button>
                      <Button size="sm" variant="outline" onClick={() => promoteToTraining(i)}>{t("agora.insightInbox.promoteToTraining")}</Button>
                      <Button size="sm" variant="outline" onClick={() => openHandoff({
                        type: i.kind === "research_idea" ? "research_task" : i.kind === "skill_suggestion" ? "skill_draft" : "insight",
                        source: { kind: "Insight", id: i.id, label: i.title },
                        summary: i.title, notes: i.body, evidence: [`source:${i.source}`],
                      })}><Send className="h-4 w-4 mr-1" />{t("agora.insightInbox.handoff")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => toast.success("Pushed to Ask Personas")}>{t("agora.insightInbox.discuss")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => archive(i.id)}><Archive className="h-4 w-4 mr-1" />{t("agora.insightInbox.dismiss")}</Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">{t("agora.insightInbox.empty")}</Card>}
        </div>
      </PageBody>
    </>
  );
};
