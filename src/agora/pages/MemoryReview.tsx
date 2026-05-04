import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/platform/hooks";
import { Check, X, Edit3, Brain } from "lucide-react";
import { toast } from "sonner";

interface MemoryCandidate {
  id: string;
  source: string;
  scope: "persona" | "skill" | "global";
  target: string;
  proposal: string;
  evidence: string;
  confidence: number;
  capturedAt: string;
}

const seed: MemoryCandidate[] = [
  { id: "mc_01", source: "decision_log:dec_001", scope: "persona", target: "per_risk", proposal: "Risk Officer should challenge any drawdown override that lacks a written event-driven rationale.", evidence: "Operator overrode pause without justification; loss followed.", confidence: 0.86, capturedAt: new Date(Date.now() - 3600_000).toISOString() },
  { id: "mc_02", source: "signal_feedback:sig_3", scope: "skill", target: "signal_review", proposal: "When conviction < 60% and risk = high, default to 'flag for review' rather than 'reject'.", evidence: "Operator flagged 4/4 such signals over the past week.", confidence: 0.78, capturedAt: new Date(Date.now() - 18_000_000).toISOString() },
  { id: "mc_03", source: "research_note:rn_22", scope: "persona", target: "per_quant", proposal: "Asia Tech earnings drift holds for 4 days post-print; consider in tactical sizing.", evidence: "Repeated note across 3 quarters.", confidence: 0.72, capturedAt: new Date(Date.now() - 86400_000).toISOString() },
  { id: "mc_04", source: "persona_response_feedback:pr_88", scope: "global", target: "all", proposal: "Avoid hedging language when stating drawdown numbers; quote precise observed values.", evidence: "Operator down-voted 6 vague responses last week.", confidence: 0.81, capturedAt: new Date(Date.now() - 200_000_000).toISOString() },
];

const scopeTone = (s: string) =>
  s === "global" ? "bg-status-failed/15 text-status-failed border-status-failed/30"
  : s === "persona" ? "bg-accent/15 text-accent border-accent/30"
  : "bg-status-success/15 text-status-success border-status-success/30";

export const MemoryReview = () => {
  const t = useT();
  const [items, setItems] = useState<MemoryCandidate[]>(seed);
  const [active, setActive] = useState<MemoryCandidate | null>(seed[0]);
  const [edit, setEdit] = useState("");

  const decide = (id: string, action: "approve" | "reject") => {
    setItems((m) => m.filter((i) => i.id !== id));
    setActive((a) => (a?.id === id ? null : a));
    toast.success(action === "approve" ? t("memoryReview.promoted") : t("memoryReview.rejected"));
  };

  return (
    <>
      <PageHeader title={t("memoryReview.title")} subtitle={t("memoryReview.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {items.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">{t("memoryReview.inboxZero")}</Card>}
            {items.map((i) => (
              <Card key={i.id} onClick={() => { setActive(i); setEdit(i.proposal); }} className={`p-3 cursor-pointer transition ${active?.id === i.id ? "ring-2 ring-accent" : "hover:bg-muted/40"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={`text-[10px] uppercase ${scopeTone(i.scope)}`}>{t(`memoryReview.scope.${i.scope}`)}</Badge>
                  <span className="text-mono text-[10px] text-muted-foreground">{i.target}</span>
                  <span className="text-mono text-[10px] text-muted-foreground ml-auto">conf {(i.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm leading-snug">{i.proposal}</p>
                <div className="text-mono text-[10px] text-muted-foreground mt-2">{i.source}</div>
              </Card>
            ))}
          </div>

          <Card className="lg:col-span-3 p-5">
            {active ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="h-4 w-4 text-accent" />
                  <Badge variant="outline" className={`uppercase text-[10px] ${scopeTone(active.scope)}`}>{t(`memoryReview.scope.${active.scope}`)}</Badge>
                  <span className="text-mono text-xs">{active.target}</span>
                  <span className="text-mono text-xs text-muted-foreground ml-auto">conf {(active.confidence * 100).toFixed(0)}%</span>
                </div>

                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 mt-2">{t("memoryReview.memoryText")}</div>
                <Textarea value={edit} onChange={(e) => setEdit(e.target.value)} className="min-h-[100px]" />

                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 mt-4">{t("memoryReview.evidence")}</div>
                <p className="text-sm leading-relaxed bg-muted/40 rounded-md p-3">{active.evidence}</p>

                <div className="text-mono text-xs text-muted-foreground mt-3">
                  {t("memoryReview.fromSource", { src: active.source, ts: new Date(active.capturedAt).toLocaleString() })}
                </div>

                <div className="flex gap-2 mt-5">
                  <Button onClick={() => decide(active.id, "approve")}><Check className="h-4 w-4 mr-1" />{t("memoryReview.approve")}</Button>
                  <Button variant="outline" onClick={() => toast(t("memoryReview.editSaved"))}><Edit3 className="h-4 w-4 mr-1" />{t("memoryReview.saveEdit")}</Button>
                  <Button variant="ghost" onClick={() => decide(active.id, "reject")}><X className="h-4 w-4 mr-1" />{t("memoryReview.reject")}</Button>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-12 text-sm">{t("memoryReview.selectHint")}</div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
};
