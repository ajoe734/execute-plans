import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, BookMarked, Send } from "lucide-react";
import { useT } from "@/platform/hooks";
import { useHandoff } from "@/lib/handoff";
import { toast } from "sonner";

interface Decision {
  id: string;
  ts: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  outcome?: "win" | "loss" | "open";
  tags: string[];
}

const seed: Decision[] = [
  {
    id: "dec_001", ts: new Date(Date.now() - 86400_000 * 2).toISOString(),
    title: "Override stg_004 risk pause",
    context: "FX Carry Tactical breached drawdown threshold during JPY intervention.",
    decision: "Held position; tightened stop to −2%.",
    rationale: "Drawdown looked event-driven; mean-reversion expected within 48h.",
    outcome: "loss",
    tags: ["risk-override", "fx", "high-stakes"],
  },
  {
    id: "dec_002", ts: new Date(Date.now() - 86400_000 * 5).toISOString(),
    title: "Approve Q2 rotation toward Vol Surface Arb",
    context: "Q2 rebalance proposal increased VSA weight from 20% to 30%.",
    decision: "Approved as-is.",
    rationale: "Backtest showed +0.5 Sharpe under current vol regime.",
    outcome: "open",
    tags: ["capital-allocation", "rebalance"],
  },
];

const tone = (o?: string) =>
  o === "win" ? "bg-status-success/15 text-status-success border-status-success/30"
  : o === "loss" ? "bg-status-failed/15 text-status-failed border-status-failed/30"
  : "bg-status-pending/15 text-status-pending border-status-pending/30";

export const DecisionJournal = () => {
  const t = useT();
  const openHandoff = useHandoff((s) => s.openHandoff);
  const [decisions, setDecisions] = useState<Decision[]>(seed);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: "", context: "", decision: "", rationale: "", tags: "" });

  const save = () => {
    if (!draft.title.trim()) return;
    setDecisions((d) => [{
      id: `dec_${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      title: draft.title,
      context: draft.context,
      decision: draft.decision,
      rationale: draft.rationale,
      outcome: "open",
      tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
    }, ...d]);
    setDraft({ title: "", context: "", decision: "", rationale: "", tags: "" });
    setCreating(false);
    toast.success("decision_log saved");
  };

  return (
    <>
      <PageHeader
        title={t("nav.decisions")}
        subtitle="Long-form record of judgment calls. Used to coach AI personas and reflect on operator skill."
        actions={!creating && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />New decision</Button>}
      />
      <PageBody>
        {creating && (
          <Card className="p-4 space-y-3 border-accent/40">
            <Input placeholder="Decision title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <Textarea placeholder="Context — what was happening?" value={draft.context} onChange={(e) => setDraft({ ...draft, context: e.target.value })} />
            <Textarea placeholder="Decision — what did you do?" value={draft.decision} onChange={(e) => setDraft({ ...draft, decision: e.target.value })} />
            <Textarea placeholder="Rationale — why?" value={draft.rationale} onChange={(e) => setDraft({ ...draft, rationale: e.target.value })} />
            <Input placeholder="Tags (comma-separated)" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>{t("actions.cancel")}</Button>
              <Button onClick={save}>{t("actions.save")}</Button>
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {decisions.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2">
                  <BookMarked className="h-4 w-4 text-accent" />
                  <h3 className="font-semibold">{d.title}</h3>
                  {d.outcome && <Badge variant="outline" className={`uppercase text-[10px] ${tone(d.outcome)}`}>{d.outcome}</Badge>}
                </div>
                <span className="text-mono text-xs text-muted-foreground whitespace-nowrap">{new Date(d.ts).toLocaleString()}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Context</div>
                  <p className="text-sm leading-relaxed">{d.context}</p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Decision</div>
                  <p className="text-sm leading-relaxed">{d.decision}</p>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Rationale</div>
                  <p className="text-sm leading-relaxed">{d.rationale}</p>
                </div>
              </div>

              {d.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-4">
                  {d.tags.map((tg) => <Badge key={tg} variant="outline" className="text-[10px]">{tg}</Badge>)}
                </div>
              )}
            </Card>
          ))}
        </div>
      </PageBody>
    </>
  );
};
