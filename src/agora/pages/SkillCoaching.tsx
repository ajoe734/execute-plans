import { useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import { Sparkles, Plus, Send, ThumbsUp, ThumbsDown, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useHandoff } from "@/lib/handoff";
import { mutations } from "@/lib/bff/mutations";
import { useNavigate } from "react-router-dom";

interface CoachingExample {
  id: string;
  prompt: string;
  expected: string;
  rating?: "good" | "bad";
}

interface SkillDraft {
  id: string;
  name: string;
  archetype: string;
  systemPrompt: string;
  examples: CoachingExample[];
}

const seed: SkillDraft[] = [
  {
    id: "sk_macro_brief",
    name: "macro_briefing",
    archetype: "Macro",
    systemPrompt: "You generate a daily macro briefing. Always cite primary sources, label regime explicitly, and keep paragraphs under 4 sentences.",
    examples: [
      { id: "ex1", prompt: "Brief on USD strength today.", expected: "Regime: USD-strong (DXY +0.4%). Drivers: hawkish Fed minutes, EU PMI miss…", rating: "good" },
      { id: "ex2", prompt: "Why is gold rallying?", expected: "Regime: risk-off + falling real yields. Real 10y −5bp; safe-haven bid resumed…" },
    ],
  },
  {
    id: "sk_redteam",
    name: "redteam_attack",
    archetype: "RedTeam",
    systemPrompt: "Adversarially probe a strategy's assumptions. Ask 3 hardest-to-defend questions; do not propose fixes.",
    examples: [
      { id: "ex1", prompt: "Strategy: Asia tech earnings drift, holds 4 days.", expected: "1) Survivorship bias in your sample? 2) What if liquidity vanishes? 3) Earnings calendar shifts in Q3?", rating: "good" },
    ],
  },
];

export const SkillCoaching = () => {
  const t = useT();
  const openHandoff = useHandoff((s) => s.openHandoff);
  const [drafts, setDrafts] = useState<SkillDraft[]>(seed);
  const [activeId, setActiveId] = useState(seed[0].id);
  const [newPrompt, setNewPrompt] = useState("");
  const [newExpected, setNewExpected] = useState("");

  const active = drafts.find((d) => d.id === activeId)!;
  const updateActive = (patch: Partial<SkillDraft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === activeId ? { ...d, ...patch } : d)));

  const addExample = () => {
    if (!newPrompt.trim()) return;
    updateActive({
      examples: [...active.examples, { id: `ex_${Math.random().toString(36).slice(2, 7)}`, prompt: newPrompt, expected: newExpected }],
    });
    setNewPrompt(""); setNewExpected("");
    toast.success("training_example saved");
  };

  const rate = (exId: string, rating: "good" | "bad") =>
    updateActive({ examples: active.examples.map((e) => (e.id === exId ? { ...e, rating } : e)) });

  return (
    <>
      <PageHeader title={t("nav.skillCoaching")} subtitle="Refine in-flight skill drafts. Each example becomes a training_example used by the trainer to fine-tune behavior." />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1 space-y-2">
            {drafts.map((d) => (
              <Card key={d.id} onClick={() => setActiveId(d.id)} className={`p-3 cursor-pointer transition ${activeId === d.id ? "ring-2 ring-accent" : "hover:bg-muted/40"}`}>
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><span className="font-mono text-sm font-semibold">{d.name}</span></div>
                <div className="text-xs text-muted-foreground mt-1">{d.archetype} · {d.examples.length} examples</div>
              </Card>
            ))}
          </div>

          <div className="lg:col-span-3 space-y-4">
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("agora.skillCoaching.systemPrompt")}</div>
              <Textarea
                value={active.systemPrompt}
                onChange={(e) => updateActive({ systemPrompt: e.target.value })}
                className="min-h-[100px] text-mono text-xs"
              />
              <div className="flex justify-end gap-2 mt-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => openHandoff({
                  type: "skill_draft",
                  source: { kind: "SkillDraft", id: active.id, label: active.name },
                  summary: `Promote skill draft ${active.name}`,
                  evidence: active.examples.map((e) => `${e.prompt} → ${e.expected.slice(0, 40)}…`),
                  priority: "normal",
                })}><ArrowRight className="h-4 w-4 mr-1" />{t("handoff.heading", { defaultValue: "Hand off" })}</Button>
                <Button size="sm" variant="outline" onClick={() => toast.success(t("agora.skillCoaching.draftSaved", { defaultValue: "Skill draft saved" }))}>{t("agora.skillCoaching.saveDraft")}</Button>
                <Button size="sm" onClick={submitForApproval} disabled={submitting}>
                  <ShieldCheck className="h-4 w-4 mr-1" />
                  {submitting ? t("actions.submitting", { defaultValue: "Submitting…" })
                              : t("agora.skillCoaching.sendForApproval", { defaultValue: "Send for approval" })}
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Examples ({active.examples.length})</h3>
              </div>
              <div className="space-y-3">
                {active.examples.map((ex) => (
                  <div key={ex.id} className="rounded-md border border-border p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">User</div>
                    <p className="text-sm mb-2">{ex.prompt}</p>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.skillCoaching.expected")}</div>
                    <p className="text-sm">{ex.expected}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button size="sm" variant={ex.rating === "good" ? "default" : "outline"} onClick={() => rate(ex.id, "good")}><ThumbsUp className="h-3 w-3 mr-1" />Good</Button>
                      <Button size="sm" variant={ex.rating === "bad" ? "destructive" : "outline"} onClick={() => rate(ex.id, "bad")}><ThumbsDown className="h-3 w-3 mr-1" />Bad</Button>
                      {ex.rating && <Badge variant="outline" className="ml-auto text-[10px]">{ex.rating}</Badge>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border mt-4 pt-4 space-y-2">
                <Textarea value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} placeholder="New user prompt…" className="min-h-[60px]" />
                <Textarea value={newExpected} onChange={(e) => setNewExpected(e.target.value)} placeholder="Expected response…" className="min-h-[60px]" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => toast("Sent to draft preview")}><Send className="h-3 w-3 mr-1" />{t("agora.skillCoaching.testDraft")}</Button>
                  <Button size="sm" onClick={addExample}><Plus className="h-3 w-3 mr-1" />{t("agora.skillCoaching.addExample")}</Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
};
