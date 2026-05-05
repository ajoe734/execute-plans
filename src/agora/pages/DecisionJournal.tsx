import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, BookMarked, Send, GitBranch, ArrowUpRight, X } from "lucide-react";
import { useT } from "@/platform/hooks";
import { useHandoff } from "@/lib/handoff";
import { toast } from "sonner";
import { bff } from "@/lib/bff/client";
import type { DecisionJournalEntry } from "@/lib/bff/types";
import { resolveEntity, lineageHref, auditHref } from "@/lib/entityLinks";

interface LongDecision {
  id: string;
  ts: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  outcome?: "win" | "loss" | "open" | "good" | "neutral" | "bad";
  reflection?: string;
  tags: string[];
  subjectKind?: string;
  subjectId?: string;
}

const longSeed: LongDecision[] = [
  {
    id: "dec_001", ts: new Date(Date.now() - 86400_000 * 2).toISOString(),
    title: "Override stg_004 risk pause",
    context: "FX Carry Tactical breached drawdown threshold during JPY intervention.",
    decision: "Held position; tightened stop to −2%.",
    rationale: "Drawdown looked event-driven; mean-reversion expected within 48h.",
    outcome: "loss", tags: ["risk-override", "fx", "high-stakes"],
    subjectKind: "Strategy", subjectId: "stg_004",
  },
  {
    id: "dec_002", ts: new Date(Date.now() - 86400_000 * 5).toISOString(),
    title: "Approve Q2 rotation toward Vol Surface Arb",
    context: "Q2 rebalance proposal increased VSA weight from 20% to 30%.",
    decision: "Approved as-is.",
    rationale: "Backtest showed +0.5 Sharpe under current vol regime.",
    outcome: "open", tags: ["capital-allocation", "rebalance"],
    subjectKind: "Rebalance", subjectId: "rb_q2_2026",
  },
];

const tone = (o?: string) =>
  o === "win" || o === "good" ? "bg-status-success/15 text-status-success border-status-success/30"
  : o === "loss" || o === "bad" ? "bg-status-failed/15 text-status-failed border-status-failed/30"
  : "bg-status-pending/15 text-status-pending border-status-pending/30";

export const DecisionJournal = () => {
  const t = useT();
  const openHandoff = useHandoff((s) => s.openHandoff);
  const [params, setParams] = useSearchParams();
  const subjectKind = params.get("subjectKind");
  const subjectId = params.get("subjectId");

  const [decisions, setDecisions] = useState<LongDecision[]>(longSeed);
  const [shortEntries, setShortEntries] = useState<DecisionJournalEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: "", context: "", decision: "", rationale: "", tags: "" });

  useEffect(() => { bff.decisionJournal.list().then(setShortEntries); }, []);

  const filteredLong = useMemo(() => {
    if (!subjectId) return decisions;
    return decisions.filter((d) => d.subjectId === subjectId);
  }, [decisions, subjectId]);

  const filteredShort = useMemo(() => {
    if (!subjectId) return shortEntries;
    return shortEntries.filter((d) => d.subjectId === subjectId && (!subjectKind || d.subjectKind === subjectKind));
  }, [shortEntries, subjectId, subjectKind]);

  const totalShown = filteredLong.length + filteredShort.length;
  const resolvedSubject = subjectId ? resolveEntity(subjectId) : null;
  const clearFilter = () => { const p = new URLSearchParams(params); p.delete("subjectKind"); p.delete("subjectId"); setParams(p, { replace: true }); };

  const save = () => {
    if (!draft.title.trim()) return;
    setDecisions((d) => [{
      id: `dec_${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      title: draft.title, context: draft.context, decision: draft.decision, rationale: draft.rationale,
      outcome: "open",
      tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
      subjectKind: subjectKind ?? undefined, subjectId: subjectId ?? undefined,
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
        actions={!creating && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />{t("agora.decisionJournal.newDecision")}</Button>}
      />
      <PageBody>
        {subjectId && (
          <Card className="p-3 flex flex-wrap items-center gap-2 border-accent/40 bg-accent/5">
            <span className="text-xs">
              {t("audit.decisionFilterBanner", { kind: subjectKind ?? resolvedSubject?.kind ?? "?", id: subjectId, count: totalShown })}
            </span>
            {resolvedSubject && (
              <>
                <Link to={resolvedSubject.route}>
                  <Badge variant="outline" className="cursor-pointer text-[10px]"><ArrowUpRight className="h-3 w-3 mr-1" />{t("audit.openDetail")}</Badge>
                </Link>
                <Link to={lineageHref(subjectId)}>
                  <Badge variant="outline" className="cursor-pointer text-[10px]"><GitBranch className="h-3 w-3 mr-1" />{t("audit.openLineage")}</Badge>
                </Link>
                <Link to={auditHref(subjectId)}>
                  <Badge variant="outline" className="cursor-pointer text-[10px]"><BookMarked className="h-3 w-3 mr-1" />{t("audit.openAudit")}</Badge>
                </Link>
              </>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={clearFilter}>
              <X className="h-3 w-3 mr-1" />{t("audit.clearFilter")}
            </Button>
          </Card>
        )}

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

        {filteredShort.length > 0 && (
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("audit.relatedDecisions")}</div>
            <ol className="space-y-1.5">
              {filteredShort.map((d) => {
                const r = resolveEntity(d.subjectId);
                return (
                  <li key={d.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="text-mono text-xs text-muted-foreground">{new Date(d.decidedAt).toLocaleString()}</span>
                    <span className="text-mono text-xs text-accent">{d.decidedBy}</span>
                    <span>{d.title}</span>
                    {d.outcome && <Badge variant="outline" className={`uppercase text-[10px] ${tone(d.outcome)}`}>{d.outcome}</Badge>}
                    {r && <Link to={r.route} className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">{r.label} →</Link>}
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        <div className="space-y-3">
          {filteredLong.length === 0 && filteredShort.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">{t("audit.noDecisions")}</Card>
          )}
          {filteredLong.map((d) => {
            const r = d.subjectId ? resolveEntity(d.subjectId) : null;
            return (
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
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("agora.decisionJournal.context")}</div>
                    <p className="text-sm leading-relaxed">{d.context}</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("agora.decisionJournal.decision")}</div>
                    <p className="text-sm leading-relaxed">{d.decision}</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("agora.decisionJournal.rationale")}</div>
                    <p className="text-sm leading-relaxed">{d.rationale}</p>
                  </div>
                </div>

                {d.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-4">
                    {d.tags.map((tg) => <Badge key={tg} variant="outline" className="text-[10px]">{tg}</Badge>)}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-border space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.decisionJournal.followUp")}</div>
                      <div className="text-[11px] text-muted-foreground">{t("agora.decisionJournal.followUpHint")}</div>
                    </div>
                    <div className="flex gap-1">
                      {(["good","neutral","bad"] as const).map((o) => (
                        <Button key={o} size="sm" variant={d.outcome === o ? "default" : "outline"}
                          onClick={() => {
                            setDecisions((all) => all.map((x) => x.id === d.id ? { ...x, outcome: o } : x));
                            toast.success(t("agora.decisionJournal.outcomeSaved"));
                          }}>
                          {t(`agora.decisionJournal.outcome${o.charAt(0).toUpperCase()}${o.slice(1)}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Textarea rows={2} placeholder={t("agora.decisionJournal.reflectionPh")}
                    value={d.reflection ?? ""}
                    onChange={(e) => setDecisions((all) => all.map((x) => x.id === d.id ? { ...x, reflection: e.target.value } : x))} />
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {r && (
                    <>
                      <Link to={r.route}>
                        <Button size="sm" variant="ghost"><ArrowUpRight className="h-4 w-4 mr-1" />{r.label}</Button>
                      </Link>
                      <Link to={lineageHref(r.id)}>
                        <Button size="sm" variant="ghost"><GitBranch className="h-4 w-4 mr-1" />{t("audit.openLineage")}</Button>
                      </Link>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openHandoff({
                    type: "insight",
                    source: { kind: "Decision", id: d.id, label: d.title },
                    summary: d.title, notes: `${d.context}\n\nDecision: ${d.decision}\nRationale: ${d.rationale}${d.reflection ? `\n\nReflection: ${d.reflection}` : ""}`,
                  })}><Send className="h-4 w-4 mr-1" />{t("agora.decisionJournal.handoff")}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      </PageBody>
    </>
  );
};
