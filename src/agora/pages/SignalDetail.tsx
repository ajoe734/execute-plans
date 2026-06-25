// Signal Detail — Spec Part 4 §8.
// Header summary, tabbed body (Explanation / Market Context / Similar Cases / Persona Opinions /
// Trader Feedback / Linked Research / Audit), right-side action panel (agree/disagree/flag, ask).
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, Flag, MessageSquare, Send, ArrowRight } from "lucide-react";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { bff } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { useHandoff } from "@/lib/handoff";
import { toast } from "sonner";
import { safeDateTime } from "@/lib/utils";

interface SignalView {
  id: string;
  strategyId: string;
  strategyName: string;
  alpha: string;
  side: "long" | "short";
  symbol: string;
  size: number;
  conviction: number;
  rationale: string;
  generatedAt: string;
  risk: "info" | "low" | "medium" | "high" | "critical";
}

export const SignalDetail = () => {
  const t = useT();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const openHandoff = useHandoff((s) => s.openHandoff);
  const [signal, setSignal] = useState<SignalView | null>(null);
  const [feedback, setFeedback] = useState("");
  const [decision, setDecision] = useState<"agree" | "disagree" | "flag" | null>(null);

  useEffect(() => {
    bff.agora.signals.get(id)
      .then((next) => setSignal(next ?? null))
      .catch(() => setSignal(null));
  }, [id]);

  if (!signal) {
    return (
      <>
        <PageHeader title={t("signal.notFound")} />
        <PageBody><Card className="p-6 text-sm text-muted-foreground">{t("signal.notFoundHint")}</Card></PageBody>
      </>
    );
  }

  const submit = (d: "agree" | "disagree" | "flag") => {
    setDecision(d);
    toast.success(`${t(`signal.decision.${d}`)} — ${signal.symbol}`);
  };

  const personaOpinions = [
    { persona: "Quant Architect", stance: "agree", text: "Z-score and earnings drift are within historical norms. Trade has positive expected value." },
    { persona: "Macro Strategist", stance: "neutral", text: "Macro tailwind is real but fragile; monitor JPY moves." },
    { persona: "Risk Officer Bot", stance: "disagree", text: "Position size puts pool utilization at 91%. Recommend halving size." },
  ];

  return (
    <>
      <PageHeader
        title={`${signal.symbol} · ${signal.side.toUpperCase()}`}
        subtitle={`${signal.id} · ${signal.strategyName}`}
        actions={<Button variant="outline" size="sm" onClick={() => navigate("/agora/signals")}>{t("common.back")}</Button>}
      />
      <PageBody>
        {/* Top summary */}
        <Card className="p-4 grid grid-cols-2 md:grid-cols-6 gap-4">
          <Field label={t("signal.field.symbol")} value={signal.symbol} mono />
          <Field label={t("signal.field.side")} value={signal.side} mono />
          <Field label={t("signal.field.size")} value={`${(signal.size * 100).toFixed(2)}%`} mono />
          <Field label={t("signal.field.conviction")} value={`${(signal.conviction * 100).toFixed(0)}%`} mono />
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("signal.field.risk")}</div>
            <div className="mt-1"><RiskBadge level={signal.risk} /></div>
          </div>
          <Field label={t("signal.field.generated")} value={safeDateTime(signal.generatedAt)} mono />
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-9">
            <Tabs defaultValue="explain">
              <TabsList>
                <TabsTrigger value="explain">{t("signal.tab.explain")}</TabsTrigger>
                <TabsTrigger value="market">{t("signal.tab.market")}</TabsTrigger>
                <TabsTrigger value="similar">{t("signal.tab.similar")}</TabsTrigger>
                <TabsTrigger value="persona">{t("signal.tab.persona")}</TabsTrigger>
                <TabsTrigger value="feedback">{t("signal.tab.feedback")}</TabsTrigger>
                <TabsTrigger value="research">{t("signal.tab.research")}</TabsTrigger>
                <TabsTrigger value="audit">{t("signal.tab.audit")}</TabsTrigger>
              </TabsList>

              <TabsContent value="explain" className="mt-4">
                <Card className="p-4 space-y-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("signal.explanation")}</div>
                  <p className="text-sm leading-relaxed">{signal.rationale}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <DriverBar label="Momentum" pct={62} />
                    <DriverBar label="Earnings" pct={28} />
                    <DriverBar label="Flow" pct={10} />
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="market" className="mt-4">
                <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Field label={t("table.metric")} value="Mid (VIX 18.4)" mono />
                  <Field label={t("table.metric")} value="1.12" mono />
                  <Field label={t("table.metric")} value="0.42 (SPX)" mono />
                  <Field label={t("table.metric")} value="High (ADV 2.1M)" mono />
                </Card>
              </TabsContent>

              <TabsContent value="similar" className="mt-4">
                <Card className="p-4">
                  <ul className="divide-y divide-border text-sm">
                    {[
                      { id: "case_1", date: "2025-11", note: "Same setup, 4d post-print, +3.2% drift", outcome: "win" },
                      { id: "case_2", date: "2025-08", note: "Higher VIX gating disabled the trade", outcome: "skip" },
                      { id: "case_3", date: "2025-04", note: "Earnings miss; mean-reversion within 24h", outcome: "loss" },
                    ].map((c) => (
                      <li key={c.id} className="py-2 flex justify-between">
                        <span>{c.note}</span>
                        <span className="text-mono text-xs text-muted-foreground">{c.date} · {c.outcome}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </TabsContent>

              <TabsContent value="persona" className="mt-4 space-y-3">
                {personaOpinions.map((p) => (
                  <Card key={p.persona} className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{p.persona}</span>
                      <Badge variant="outline" className={`text-[10px] uppercase ${p.stance === "agree" ? "bg-status-success/15 text-status-success border-status-success/30" : p.stance === "disagree" ? "bg-status-failed/15 text-status-failed border-status-failed/30" : ""}`}>{p.stance}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{p.text}</p>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="feedback" className="mt-4">
                <Card className="p-4 space-y-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("signal.attachRationale")}</div>
                  <Textarea rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t("signal.rationalePlaceholder")} />
                  <Button size="sm" onClick={() => { toast.success(t("signal.feedbackSaved")); }}>{t("signal.saveFeedback")}</Button>
                </Card>
              </TabsContent>

              <TabsContent value="research" className="mt-4">
                <Card className="p-4 text-sm text-muted-foreground">{t("signal.noLinkedResearch")}</Card>
              </TabsContent>

              <TabsContent value="audit" className="mt-4">
                <Card className="p-4 text-sm">
                  <ol className="space-y-1">
                    <li className="flex gap-3"><span className="text-mono text-xs text-muted-foreground">{safeDateTime(signal.generatedAt)}</span><span>signal.created</span></li>
                    {decision && <li className="flex gap-3"><span className="text-mono text-xs text-muted-foreground">{safeDateTime()}</span><span>signal.{decision}</span></li>}
                  </ol>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right action panel */}
          <Card className="p-4 lg:col-span-3 space-y-2 self-start">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("signal.actions")}</div>
            <Button className="w-full justify-start" variant={decision === "agree" ? "default" : "outline"} onClick={() => submit("agree")}>
              <ThumbsUp className="h-4 w-4 mr-2" />{t("signal.decision.agree")}
            </Button>
            <Button className="w-full justify-start" variant={decision === "disagree" ? "default" : "outline"} onClick={() => submit("disagree")}>
              <ThumbsDown className="h-4 w-4 mr-2" />{t("signal.decision.disagree")}
            </Button>
            <Button className="w-full justify-start" variant={decision === "flag" ? "default" : "outline"} onClick={() => submit("flag")}>
              <Flag className="h-4 w-4 mr-2" />{t("signal.decision.flag")}
            </Button>
            <Button className="w-full justify-start" variant="ghost" onClick={() => navigate("/agora/ask")}>
              <MessageSquare className="h-4 w-4 mr-2" />{t("signal.askPersona")}
            </Button>
            <Button className="w-full justify-start" variant="ghost" onClick={() => navigate(`/agora/committee?from=signal&id=${signal.id}`)}>
              <MessageSquare className="h-4 w-4 mr-2" />{t("signal.askCommittee")}
            </Button>
            <div className="border-t border-border my-2" />
            <Button className="w-full justify-start" variant="outline"
              onClick={() => openHandoff({
                type: "research_task",
                source: { kind: "Signal", id: signal.id, label: signal.symbol },
                summary: `Investigate ${signal.symbol} ${signal.side} signal from ${signal.strategyName}`,
                evidence: [`signal:${signal.id}`, `strategy:${signal.strategyId}`],
              })}>
              <Send className="h-4 w-4 mr-2" />{t("signal.handoffResearch")}
            </Button>
            <Button className="w-full justify-start" variant="outline"
              onClick={() => navigate(`/management/strategies/${signal.strategyId}`)}>
              <ArrowRight className="h-4 w-4 mr-2" />{t("signal.openStrategy")}
            </Button>
          </Card>
        </div>
      </PageBody>
    </>
  );
};

const Field = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div>
    <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`text-sm mt-1 ${mono ? "text-mono" : ""}`}>{value}</div>
  </div>
);

const DriverBar = ({ label, pct }: { label: string; pct: number }) => (
  <div>
    <div className="flex justify-between text-xs"><span>{label}</span><span className="text-mono text-muted-foreground">{pct}%</span></div>
    <div className="mt-1 h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
  </div>
);
