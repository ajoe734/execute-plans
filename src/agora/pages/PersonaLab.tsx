import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import { bff } from "@/lib/bff/client";
import type { Skill, Tool } from "@/lib/bff/types";
import { FlaskConical, Save, Play, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface PersonaDraft {
  name: string;
  archetype: string;
  systemPrompt: string;
  skills: string[];
  tools: string[];
  memoryRoutes: string[];
}

export const PersonaLab = () => {
  const t = useT();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [draft, setDraft] = useState<PersonaDraft>({
    name: "Macro Strategist v2",
    archetype: "Macro",
    systemPrompt: "You are a macro strategist focused on rate, FX, and commodity regimes. Always identify the regime first, then state your conviction.",
    skills: ["sk_macro_brief"],
    tools: ["tl_news_search", "tl_factor_attr"],
    memoryRoutes: ["regime-tagged briefs", "post-FOMC playbook"],
  });
  const [testInput, setTestInput] = useState("Brief on tonight's FOMC.");
  const [testOutput, setTestOutput] = useState<string | null>(null);

  useEffect(() => {
    bff.skills.list().then(setSkills);
    bff.tools.list().then(setTools);
  }, []);

  const toggle = (key: "skills" | "tools", id: string) => {
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id],
    }));
  };

  const addRoute = (text: string) => {
    if (!text.trim()) return;
    setDraft((d) => ({ ...d, memoryRoutes: [...d.memoryRoutes, text.trim()] }));
  };

  const runTest = () => {
    setTestOutput(null);
    setTimeout(() => {
      setTestOutput(`(Mock ${draft.name}) Regime: pre-FOMC consolidation. Conviction: medium. Watch for SEP dot-plot revisions; long-end UST likely the cleanest expression.`);
      toast.success("eval_run captured");
    }, 600);
  };

  return (
    <>
      <PageHeader title={t("nav.personaLab")} subtitle={t("agora.personaLab.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3 p-5 space-y-4">
            <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-accent" /><h3 className="text-sm font-semibold">{t("agora.personaLab.draft")}</h3></div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("table.name")}</label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.personaLab.archetype")}</label>
                <Input value={draft.archetype} onChange={(e) => setDraft({ ...draft, archetype: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.personaLab.systemPrompt")}</label>
              <Textarea
                value={draft.systemPrompt}
                onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                className="min-h-[100px] text-mono text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.personaLab.skills")}</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {skills.map((s) => {
                  const on = draft.skills.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggle("skills", s.id)}
                      className={`text-xs px-2 py-1 rounded border transition ${on ? "bg-accent text-accent-foreground border-accent" : "bg-background border-border hover:bg-muted"}`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.personaLab.tools")}</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tools.map((tl) => {
                  const on = draft.tools.includes(tl.id);
                  return (
                    <button
                      key={tl.id}
                      onClick={() => toggle("tools", tl.id)}
                      className={`text-xs px-2 py-1 rounded border transition font-mono ${on ? "bg-accent text-accent-foreground border-accent" : "bg-background border-border hover:bg-muted"}`}
                    >
                      {tl.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("agora.personaLab.memoryRoutes")}</label>
              <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                {draft.memoryRoutes.map((r) => (
                  <Badge key={r} variant="outline" className="gap-1">
                    {r}
                    <button onClick={() => setDraft((d) => ({ ...d, memoryRoutes: d.memoryRoutes.filter((x) => x !== r) }))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <RouteAdder onAdd={addRoute} />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => toast.success("Persona draft saved")}><Save className="h-4 w-4 mr-1" />{t("agora.personaLab.saveDraft")}</Button>
              <Button onClick={() => toast.success("Submitted for review")}>{t("agora.personaLab.submitReview")}</Button>
            </div>
          </Card>

          <Card className="lg:col-span-2 p-5 space-y-3">
            <h3 className="text-sm font-semibold">{t("agora.personaLab.testBench")}</h3>
            <Textarea value={testInput} onChange={(e) => setTestInput(e.target.value)} className="min-h-[80px]" />
            <Button onClick={runTest} className="w-full"><Play className="h-4 w-4 mr-1" />Run</Button>
            {testOutput && (
              <div className="rounded-md bg-muted/40 p-3 text-sm leading-relaxed">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("agora.personaLab.response")}</div>
                {testOutput}
              </div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
};

const RouteAdder = ({ onAdd }: { onAdd: (s: string) => void }) => {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2">
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={t("agora.personaLab.memoryRoutePh")} className="h-8 text-sm" />
      <Button size="sm" variant="outline" onClick={() => { onAdd(v); setV(""); }}><Plus className="h-3 w-3" /></Button>
    </div>
  );
};
