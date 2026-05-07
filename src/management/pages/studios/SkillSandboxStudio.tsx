// Phase 12.3 — Skill Sandbox Studio: input → mock execute → trace + output.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { legacyBff as bff } from "@/lib/bff-v1";
import type { Skill } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { Play } from "lucide-react";
import { toast } from "sonner";

interface TraceEntry { ts: string; level: "info" | "warn"; msg: string; }

const sampleInput = (skill: Skill | undefined) =>
  skill ? JSON.stringify({ skill: skill.id, input: { query: "Summarize macro outlook for Q3 2026", env: "research" } }, null, 2) : "{}";

export const SkillSandboxStudio = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(params.get("id") ?? undefined);
  const [input, setInput] = useState("");
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    bff.skills.list().then((rows) => {
      setSkills(rows);
      if (!activeId && rows[0]) setActiveId(rows[0].id);
    });
  }, []);

  const active = useMemo(() => skills.find((s) => s.id === activeId), [skills, activeId]);
  useEffect(() => { setInput(sampleInput(active)); setTrace([]); setOutput(""); }, [active]);

  const run = async () => {
    if (!active) return;
    setRunning(true);
    setTrace([]);
    const steps: TraceEntry[] = [
      { ts: new Date().toISOString(), level: "info", msg: `route → skill:${active.id}` },
      { ts: new Date().toISOString(), level: "info", msg: `prompt assembled (${active.archetype})` },
      { ts: new Date().toISOString(), level: "info", msg: `mcp.tool research.search invoked` },
      { ts: new Date().toISOString(), level: "warn", msg: `partial citation missing — fallback to summary mode` },
      { ts: new Date().toISOString(), level: "info", msg: `response composed in 412ms` },
    ];
    for (const step of steps) {
      await new Promise((r) => setTimeout(r, 220));
      setTrace((cur) => [...cur, step]);
    }
    setOutput(JSON.stringify({
      ok: true,
      skillId: active.id,
      summary: "Macro outlook indicates moderate easing pressure with elevated dispersion across DM rates.",
      citations: ["mcp:research.search#a1", "mcp:research.search#b3"],
      latencyMs: 412,
    }, null, 2));
    setRunning(false);
    toast.success(t("studios.sandbox.executed"));
  };

  return (
    <>
      <PageHeader title={t("studios.skill")} subtitle={t("studios.skillSubtitle")} />
      <PageBody>
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <Select value={activeId} onValueChange={(v) => { setActiveId(v); setParams({ id: v }); }}>
            <SelectTrigger className="w-72"><SelectValue placeholder={t("studios.pickEntity")} /></SelectTrigger>
            <SelectContent>
              {skills.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · v{s.version}</SelectItem>)}
            </SelectContent>
          </Select>
          {active && <Badge variant="outline" className="text-[10px] uppercase">{active.archetype}</Badge>}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{t("studios.sandbox.input")}</div>
              <Button size="sm" disabled={running || !active} onClick={run}>
                <Play className="h-4 w-4 mr-1" />{running ? "…" : t("studios.sandbox.run")}
              </Button>
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={10} className="text-mono text-xs" />
          </Card>
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold">{t("studios.sandbox.trace")}</div>
            {trace.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">{t("studios.sandbox.emptyTrace")}</div>}
            <div className="space-y-1">
              {trace.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-mono text-[11px]">
                  <span className="text-muted-foreground">{new Date(entry.ts).toLocaleTimeString()}</span>
                  <Badge variant="outline" className={`text-[9px] uppercase ${entry.level === "warn" ? "border-status-warning/40 text-status-warning" : "border-border text-muted-foreground"}`}>
                    {entry.level}
                  </Badge>
                  <span>{entry.msg}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {output && (
          <Card className="p-4 space-y-2">
            <div className="text-sm font-semibold">{t("studios.sandbox.output")}</div>
            <pre className="text-mono text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">{output}</pre>
          </Card>
        )}
      </PageBody>
    </>
  );
};
