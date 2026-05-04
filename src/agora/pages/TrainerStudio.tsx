import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { useT } from "@/platform/hooks";
import { Brain, Wand2, FlaskConical, Beaker, Radio, ArrowRight, GraduationCap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

const queues = [
  { to: "/agora/memory", icon: Brain, title: "Memory Review", desc: "Approve/reject memory candidates harvested from operator activity.", count: 18, accent: "text-accent" },
  { to: "/agora/skills", icon: Wand2, title: "Skill Coaching", desc: "Refine in-flight skill drafts with paired examples.", count: 4, accent: "text-status-warning" },
  { to: "/agora/persona-lab", icon: FlaskConical, title: "Persona Lab", desc: "Compose and test personas with skill / tool / memory routing.", count: 2, accent: "text-status-success" },
  { to: "/agora/eval", icon: Beaker, title: "Evaluation Suites", desc: "Run regression suites against personas and skills.", count: 6, accent: "text-status-running" },
  { to: "/agora/channels", icon: Radio, title: "Channels", desc: "Manage notification routes the trainer publishes into.", count: 3, accent: "text-status-paused" },
];

const sources = [
  { kind: "signal_feedback", count: 132, period: "last 7d" },
  { kind: "research_note", count: 41, period: "last 7d" },
  { kind: "decision_log", count: 9, period: "last 7d" },
  { kind: "persona_response_feedback", count: 64, period: "last 7d" },
  { kind: "alert_response", count: 21, period: "last 7d" },
];

export const TrainerStudio = () => {
  const t = useT();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={t("nav.trainerStudio")} subtitle="Convert operator behavior into AI personas, skills, and memories." />
      <PageBody>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-md p-2 bg-accent/10 border border-accent/20"><GraduationCap className="h-5 w-5 text-accent" /></div>
            <div>
              <h3 className="font-semibold">{t("agora.trainerStudio.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("agora.trainerStudio.subtitle")}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
            {sources.map((s) => (
              <div key={s.kind} className="rounded-md border border-border p-3">
                <div className="text-mono text-[10px] uppercase tracking-wider text-muted-foreground">{s.kind}</div>
                <div className="text-2xl text-mono font-semibold mt-1">{s.count}</div>
                <div className="text-[10px] text-muted-foreground">{s.period}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {queues.map((q) => {
            const Icon = q.icon;
            return (
              <Card key={q.to} onClick={() => navigate(q.to)} className="p-4 cursor-pointer hover:bg-muted/30 transition group">
                <div className="flex items-start gap-3">
                  <div className="rounded-md p-2 border border-border bg-muted/40">
                    <Icon className={`h-5 w-5 ${q.accent}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">{q.title}</h4>
                      <Badge variant="outline" className="text-[10px]">{q.count}</Badge>
                      <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-foreground transition" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{q.desc}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </PageBody>
    </>
  );
};
