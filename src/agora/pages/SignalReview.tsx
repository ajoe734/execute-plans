import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, MessageSquareWarning, ArrowRight } from "lucide-react";
import { legacyBff as bff } from "@/lib/bff-v1";
import type { Strategy } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { useNavigate } from "react-router-dom";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { toast } from "sonner";
import {
  validateSignalFeedback,
  SIGNAL_FEEDBACK_ENDPOINT,
  SIGNAL_FEEDBACK_EDIT_WINDOW_SECONDS,
  type SignalConfidence,
  type SignalDecision,
} from "@/lib/v3/signalFeedback";

interface Signal {
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

const mockSignals = (strategies: Strategy[]): Signal[] => {
  if (!strategies.length) return [];
  const symbols = ["TSM", "NVDA", "AAPL", "JPM", "BTCUSD", "XOM"];
  return strategies.slice(0, 5).map((s, i) => ({
    id: `sig_${i}`,
    strategyId: s.id,
    strategyName: s.name,
    alpha: s.alpha,
    side: i % 2 === 0 ? "long" : "short",
    symbol: symbols[i % symbols.length],
    size: 0.04 + (i * 0.013),
    conviction: 0.55 + (i * 0.07),
    rationale: i === 0
      ? "Momentum z-score crossed +1.8 with positive earnings drift; gross to risk budget cap."
      : i === 1
      ? "Mean-reversion trigger on overbought 14d RSI; expects fade into close."
      : "Composite score in top decile; volatility within target band.",
    generatedAt: new Date(Date.now() - i * 1800_000).toISOString(),
    risk: s.risk,
  }));
};

export const SignalReview = () => {
  const t = useT();
  const navigate = useNavigate();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [active, setActive] = useState<Signal | null>(null);
  const [comment, setComment] = useState("");
  const [confidence, setConfidence] = useState<SignalConfidence>(3);
  const [decided, setDecided] = useState<Record<string, { decision: SignalDecision; confidence: SignalConfidence; at: number }>>({});

  useEffect(() => {
    bff.strategies.list().then((s) => {
      const sg = mockSignals(s);
      setSignals(sg);
      setActive(sg[0] ?? null);
    });
  }, []);

  const decide = (id: string, decision: SignalDecision) => {
    const req = { signalId: id, decision, confidence, reason: comment || undefined };
    const errs = validateSignalFeedback(req);
    if (errs.length) {
      toast.error(t(`signal.feedback.error.${errs[0].code}`) || errs[0].code);
      return;
    }
    // POST to v3 §16 endpoint (mock).
    void fetch(SIGNAL_FEEDBACK_ENDPOINT(id), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req),
    }).catch(() => {/* mocked BFF */});
    setDecided((m) => ({ ...m, [id]: { decision, confidence, at: Date.now() } }));
    toast.success(`signal_feedback ${decision} · conf ${confidence}/5 · editable ${SIGNAL_FEEDBACK_EDIT_WINDOW_SECONDS}s`);
    setComment("");
  };

  return (
    <>
      <PageHeader title={t("nav.signals")} subtitle={t("agora.signalReview.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {signals.map((s) => {
              const d = decided[s.id];
              const isActive = active?.id === s.id;
              return (
                <Card
                  key={s.id}
                  onClick={() => setActive(s)}
                  className={`p-3 cursor-pointer transition ${isActive ? "ring-2 ring-accent" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-[10px] uppercase ${s.side === "long" ? "bg-status-success/15 text-status-success border-status-success/30" : "bg-status-failed/15 text-status-failed border-status-failed/30"}`}>{s.side}</Badge>
                    <span className="font-mono text-sm font-semibold">{s.symbol}</span>
                    <RiskBadge level={s.risk} />
                    {d && <Badge variant="outline" className="ml-auto text-[10px] uppercase">{d.decision}·{d.confidence}/5</Badge>}
                  </div>
                  <div className="text-sm font-medium truncate">{s.strategyName}</div>
                  <div className="text-xs text-mono text-muted-foreground">size {(s.size * 100).toFixed(2)}% · conviction {(s.conviction * 100).toFixed(0)}%</div>
                </Card>
              );
            })}
          </div>

          <Card className="lg:col-span-3 p-5">
            {active ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs uppercase ${active.side === "long" ? "bg-status-success/15 text-status-success border-status-success/30" : "bg-status-failed/15 text-status-failed border-status-failed/30"}`}>{active.side}</Badge>
                      <h2 className="text-xl font-mono font-semibold">{active.symbol}</h2>
                      <RiskBadge level={active.risk} />
                    </div>
                    <button className="text-sm text-accent hover:underline mt-1" onClick={() => navigate(`/management/strategies/${active.strategyId}`)}>
                      {active.strategyName} <ArrowRight className="h-3 w-3 inline" />
                    </button>
                  </div>
                  <div className="text-right text-mono text-xs text-muted-foreground">
                    {new Date(active.generatedAt).toLocaleString()}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-md border p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("table.size")}</div><div className="text-mono text-sm">{(active.size * 100).toFixed(2)}%</div></div>
                  <div className="rounded-md border p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.signalReview.conviction")}</div><div className="text-mono text-sm">{(active.conviction * 100).toFixed(0)}%</div></div>
                  <div className="rounded-md border p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.signalReview.alpha")}</div><div className="text-mono text-sm">{active.alpha}</div></div>
                </div>

                <div className="rounded-md bg-muted/50 p-3 text-sm leading-relaxed mb-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("agora.signalReview.rationale")}</div>
                  {active.rationale}
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.signalReview.confidence") || "Confidence"} (1–5)</span>
                  {[1,2,3,4,5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setConfidence(n as SignalConfidence)}
                      className={`h-7 w-7 rounded-md border text-xs font-mono ${confidence === n ? "bg-accent text-accent-foreground border-accent" : "hover:bg-muted/50"}`}
                    >{n}</button>
                  ))}
                </div>

                <Textarea
                  placeholder={t("agora.signalReview.reasonPlaceholder") || "Reason (required for disagree at confidence ≥4 and any flag_suspicious)…"}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="min-h-[80px] mb-3"
                />

                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => decide(active.id, "agree")}><ThumbsUp className="h-4 w-4 mr-1" />{t("agora.signalReview.agree") || "Agree"}</Button>
                  <Button variant="outline" onClick={() => decide(active.id, "disagree")}><ThumbsDown className="h-4 w-4 mr-1" />{t("agora.signalReview.disagree") || "Disagree"}</Button>
                  <Button variant="ghost" onClick={() => decide(active.id, "flag_suspicious")}><MessageSquareWarning className="h-4 w-4 mr-1" />{t("agora.signalReview.flag") || "Flag suspicious"}</Button>
                  <Button variant="outline" className="ml-auto" onClick={() => navigate(`/agora/signals/${active.id}`)}>{t("agora.signalReview.openDetail")} <ArrowRight className="h-4 w-4 ml-1" /></Button>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-12 text-sm">{t("agora.signalReview.selectSignal")}</div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
};
