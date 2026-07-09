import { useState } from "react";
import { safeDateTime } from "@/lib/utils";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/platform/hooks";
import { Check, X, Edit3, Brain, ArrowRight, MoreHorizontal, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useHandoff } from "@/lib/handoff";

type Scope = "persona" | "skill" | "global";
type Visibility = "private" | "shared";
type Status =
  | "proposed" | "approved" | "rejected" | "edited" | "merged"
  | "moved" | "deprecated" | "deleted" | "sensitive";

interface MemoryCandidate {
  id: string;
  source: string;
  scope: Scope;
  target: string;
  proposal: string;
  evidence: string;
  confidence: number;
  capturedAt: string;
  visibility: Visibility;
  sensitive: boolean;
  doNotRemember: boolean;
  status: Status;
  conflictWith?: string;
}

const seed: MemoryCandidate[] = [
  { id: "mc_01", source: "decision_log:dec_001", scope: "persona", target: "per_risk", proposal: "Risk Officer should challenge any drawdown override that lacks a written event-driven rationale.", evidence: "Operator overrode pause without justification; loss followed.", confidence: 0.86, capturedAt: new Date(Date.now() - 3600_000).toISOString(), visibility: "shared", sensitive: false, doNotRemember: false, status: "proposed" },
  { id: "mc_02", source: "signal_feedback:sig_3", scope: "skill", target: "signal_review", proposal: "When conviction < 60% and risk = high, default to 'flag for review' rather than 'reject'.", evidence: "Operator flagged 4/4 such signals over the past week.", confidence: 0.78, capturedAt: new Date(Date.now() - 18_000_000).toISOString(), visibility: "shared", sensitive: false, doNotRemember: false, status: "proposed", conflictWith: "mu_44" },
  { id: "mc_03", source: "research_note:rn_22", scope: "persona", target: "per_quant", proposal: "Asia Tech earnings drift holds for 4 days post-print; consider in tactical sizing.", evidence: "Repeated note across 3 quarters.", confidence: 0.72, capturedAt: new Date(Date.now() - 86400_000).toISOString(), visibility: "private", sensitive: false, doNotRemember: false, status: "proposed" },
  { id: "mc_04", source: "persona_response_feedback:pr_88", scope: "global", target: "all", proposal: "Avoid hedging language when stating drawdown numbers; quote precise observed values.", evidence: "Operator down-voted 6 vague responses last week.", confidence: 0.81, capturedAt: new Date(Date.now() - 200_000_000).toISOString(), visibility: "shared", sensitive: false, doNotRemember: false, status: "proposed" },
];

const scopeTone = (s: string) =>
  s === "global" ? "bg-status-failed/15 text-status-failed border-status-failed/30"
  : s === "persona" ? "bg-accent/15 text-accent border-accent/30"
  : "bg-status-success/15 text-status-success border-status-success/30";

const statusTone = (s: Status) => {
  if (s === "approved") return "bg-status-success/15 text-status-success border-status-success/30";
  if (s === "rejected" || s === "deleted") return "bg-status-failed/15 text-status-failed border-status-failed/30";
  if (s === "sensitive") return "bg-status-warning/15 text-status-warning border-status-warning/30";
  return "bg-muted/40 text-muted-foreground border-border";
};

export const MemoryReview = () => {
  const t = useT();
  const openHandoff = useHandoff((s) => s.openHandoff);
  const [items, setItems] = useState<MemoryCandidate[]>(seed);
  const [activeId, setActiveId] = useState<string | null>(seed[0]?.id ?? null);
  const [edit, setEdit] = useState(seed[0]?.proposal ?? "");

  const active = items.find((i) => i.id === activeId) ?? null;

  const select = (i: MemoryCandidate) => {
    setActiveId(i.id);
    setEdit(i.proposal);
  };

  const update = (id: string, patch: Partial<MemoryCandidate>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const remove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  };

  const decide = (id: string, action: "approve" | "reject") => {
    remove(id);
    toast.success(action === "approve" ? t("memoryReview.promoted") : t("memoryReview.rejected"));
  };

  const moveScope = (id: string, visibility: Visibility) => {
    update(id, { visibility, status: "moved" });
    toast.success(t("memoryReview.movedToast"));
  };

  const markSensitive = (id: string) => {
    update(id, { sensitive: true, status: "sensitive" });
    toast.success(t("memoryReview.sensitiveToast"));
  };

  const markDNR = (id: string) => {
    update(id, { doNotRemember: true, status: "deprecated" });
    toast.success(t("memoryReview.dnrToast"));
  };

  const mergeWith = (id: string) => {
    update(id, { status: "merged" });
    toast.success(t("memoryReview.mergeToast"));
    setTimeout(() => remove(id), 600);
  };

  const resolveConflict = (id: string) => {
    update(id, { conflictWith: undefined, status: "edited" });
    toast.success(t("memoryReview.resolvedToast"));
  };

  const del = (id: string) => {
    update(id, { status: "deleted" });
    setTimeout(() => remove(id), 400);
  };

  return (
    <>
      <PageHeader title={t("memoryReview.title")} subtitle={t("memoryReview.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-2">
            {items.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">{t("memoryReview.inboxZero")}</Card>}
            {items.map((i) => (
              <Card key={i.id} onClick={() => select(i)} className={`p-3 cursor-pointer transition ${activeId === i.id ? "ring-2 ring-accent" : "hover:bg-muted/40"}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] uppercase ${scopeTone(i.scope)}`}>{t(`memoryReview.scope.${i.scope}`)}</Badge>
                  <Badge variant="outline" className="text-[9px]">{t(`memoryReview.typeChips.${i.visibility}`)}</Badge>
                  {i.sensitive && <Badge variant="outline" className="text-[9px] border-status-warning/40 text-status-warning">{t("memoryReview.typeChips.sensitive")}</Badge>}
                  {i.doNotRemember && <Badge variant="outline" className="text-[9px] border-status-failed/40 text-status-failed">{t("memoryReview.typeChips.doNotRemember")}</Badge>}
                  {i.conflictWith && <AlertTriangle className="h-3 w-3 text-status-warning" />}
                  <span className="text-mono text-[10px] text-muted-foreground ml-auto">conf {(i.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm leading-snug">{i.proposal}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-mono text-[10px] text-muted-foreground">{i.source}</span>
                  <Badge variant="outline" className={`text-[9px] ml-auto ${statusTone(i.status)}`}>{t(`memoryReview.statuses.${i.status}`)}</Badge>
                </div>
              </Card>
            ))}
          </div>

          <Card className="lg:col-span-3 p-5">
            {active ? (
              <>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Brain className="h-4 w-4 text-accent" />
                  <Badge variant="outline" className={`uppercase text-[10px] ${scopeTone(active.scope)}`}>{t(`memoryReview.scope.${active.scope}`)}</Badge>
                  <Badge variant="outline" className="text-[10px]">{t(`memoryReview.typeChips.${active.visibility}`)}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${statusTone(active.status)}`}>{t(`memoryReview.statuses.${active.status}`)}</Badge>
                  <span className="text-mono text-xs">{active.target}</span>
                  <span className="text-mono text-xs text-muted-foreground ml-auto">conf {(active.confidence * 100).toFixed(0)}%</span>
                </div>

                {active.conflictWith && (
                  <div className="rounded-md border border-status-warning/40 bg-status-warning/5 p-2 mb-3 flex items-center gap-2 text-xs">
                    <AlertTriangle className="h-3 w-3 text-status-warning" />
                    Conflicts with <code className="text-mono">{active.conflictWith}</code>
                    <Button size="sm" variant="outline" className="ml-auto h-6 text-[10px]" onClick={() => resolveConflict(active.id)}>
                      {t("memoryReview.actions.resolveConflict")}
                    </Button>
                  </div>
                )}

                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 mt-2">{t("memoryReview.memoryText")}</div>
                <Textarea value={edit} onChange={(e) => setEdit(e.target.value)} className="min-h-[100px]" />

                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 mt-4">{t("memoryReview.evidence")}</div>
                <p className="text-sm leading-relaxed bg-muted/40 rounded-md p-3">{active.evidence}</p>

                <div className="text-mono text-xs text-muted-foreground mt-3">
                  {t("memoryReview.fromSource", { src: active.source, ts: safeDateTime(active.capturedAt) })}
                </div>

                <div className="flex flex-wrap gap-2 mt-5">
                  <Button onClick={() => decide(active.id, "approve")}><Check className="h-4 w-4 mr-1" />{t("memoryReview.approve")}</Button>
                  <Button variant="outline" onClick={() => { update(active.id, { proposal: edit, status: "edited" }); toast(t("memoryReview.editSaved")); }}>
                    <Edit3 className="h-4 w-4 mr-1" />{t("memoryReview.saveEdit")}
                  </Button>
                  <Button variant="outline" onClick={() => openHandoff({
                    type: "training_feedback",
                    source: { kind: "MemoryCandidate", id: active.id, label: active.target },
                    summary: edit || active.proposal,
                    evidence: [active.evidence, active.source],
                    priority: active.confidence > 0.8 ? "high" : "normal",
                    suggestedPersona: active.scope === "persona" ? active.target : "",
                  })}><ArrowRight className="h-4 w-4 mr-1" />{t("handoff.heading", { defaultValue: "Hand off" })}</Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline"><MoreHorizontal className="h-4 w-4 mr-1" />More</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => moveScope(active.id, active.visibility === "private" ? "shared" : "private")}>
                        {active.visibility === "private"
                          ? t("memoryReview.actions.moveToShared")
                          : t("memoryReview.actions.moveToPrivate")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => markSensitive(active.id)}>{t("memoryReview.actions.markSensitive")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => markDNR(active.id)}>{t("memoryReview.actions.markDoNotRemember")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => mergeWith(active.id)}>{t("memoryReview.actions.merge")}</DropdownMenuItem>
                      {active.conflictWith && (
                        <DropdownMenuItem onClick={() => resolveConflict(active.id)}>{t("memoryReview.actions.resolveConflict")}</DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-status-failed" onClick={() => del(active.id)}>{t("memoryReview.actions.delete")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

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
