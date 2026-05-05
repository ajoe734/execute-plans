import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useT } from "@/platform/hooks";
import {
  Brain, Wand2, FlaskConical, Beaker, Radio, ArrowRight, GraduationCap,
  ArrowLeft, Plus, Play, Check, X,
} from "lucide-react";
import { bff } from "@/lib/bff/client";
import { mutations } from "@/lib/bff/mutations";
import type { Persona, MemoryUpdate, Skill, RoutePolicy } from "@/lib/bff/types";
import { toast } from "sonner";

type FeedbackSource =
  | "persona_response_incorrect"
  | "trader_correction"
  | "analyst_correction"
  | "signal_disagreement"
  | "committee_weak_argument"
  | "memory_conflict"
  | "bad_tool_use"
  | "policy_violation";

interface FeedbackItem {
  id: string;
  source: FeedbackSource;
  persona: string;
  summary: string;
  evidence: string;
  capturedAt: string;
}

const FEEDBACK_SOURCES: FeedbackSource[] = [
  "persona_response_incorrect", "trader_correction", "analyst_correction",
  "signal_disagreement", "committee_weak_argument", "memory_conflict",
  "bad_tool_use", "policy_violation",
];

const seedFeedback: FeedbackItem[] = [
  { id: "fb_01", source: "persona_response_incorrect", persona: "per_quant", summary: "Quant claimed 'no momentum signal' for SOL despite +12% week.", evidence: "Operator marked response as incorrect, attached chart screenshot.", capturedAt: new Date(Date.now() - 1800_000).toISOString() },
  { id: "fb_02", source: "trader_correction", persona: "per_risk", summary: "Trader corrected risk-off recommendation; macro context outweighed local drawdown.", evidence: "Slack thread #risk-desk, 4 thumbs-up reactions.", capturedAt: new Date(Date.now() - 7200_000).toISOString() },
  { id: "fb_03", source: "signal_disagreement", persona: "per_quant", summary: "Two signals on ETH conflict (long vs neutral); rationale unclear.", evidence: "Signal explanation lacks regime context; analysts disagree in review.", capturedAt: new Date(Date.now() - 14400_000).toISOString() },
  { id: "fb_04", source: "committee_weak_argument", persona: "per_macro", summary: "Macro persona's argument cited stale FOMC dot-plot from prior meeting.", evidence: "Committee transcript #cmt_88, two members objected.", capturedAt: new Date(Date.now() - 36000_000).toISOString() },
  { id: "fb_05", source: "memory_conflict", persona: "per_risk", summary: "Two memories disagree on max single-asset exposure (8% vs 12%).", evidence: "Memory ids mu_44 and mu_77 trigger conflict on rebalance run.", capturedAt: new Date(Date.now() - 50000_000).toISOString() },
  { id: "fb_06", source: "bad_tool_use", persona: "per_quant", summary: "Persona invoked backtest tool with overlapping windows, double-counted PnL.", evidence: "Tool log shows 2024-Q3 window passed twice; results inflated.", capturedAt: new Date(Date.now() - 86400_000).toISOString() },
  { id: "fb_07", source: "policy_violation", persona: "per_macro", summary: "Persona referenced disallowed external news source in rationale.", evidence: "Policy 'no-tier3-source' triggered by content scanner.", capturedAt: new Date(Date.now() - 100000_000).toISOString() },
  { id: "fb_08", source: "analyst_correction", persona: "per_quant", summary: "Analyst rewrote sector rotation thesis — persona conflated tech/comms.", evidence: "Edit diff captured in research notebook rn_91.", capturedAt: new Date(Date.now() - 130000_000).toISOString() },
];

const queues = [
  { to: "/agora/memory", icon: Brain, key: "memoryReview", count: 18, accent: "text-accent" },
  { to: "/agora/skill-coaching", icon: Wand2, key: "skillCoaching", count: 4, accent: "text-status-warning" },
  { to: "/agora/persona-lab", icon: FlaskConical, key: "personaLab", count: 2, accent: "text-status-success" },
  { to: "/agora/evaluations", icon: Beaker, key: "evaluations", count: 6, accent: "text-status-running" },
  { to: "/agora/channels", icon: Radio, key: "channels", count: 3, accent: "text-status-paused" },
];

const TrainerOverview = () => {
  const t = useT();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<Persona[]>([]);
  useEffect(() => { bff.personas.list().then(setPersonas); }, []);

  return (
    <>
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

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Train a specific persona</h3>
          <Badge variant="outline" className="text-[10px]">{personas.length} personas</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {personas.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/agora/trainer/${p.id}`)}
              className="rounded-md border border-border p-3 text-left hover:bg-muted/40 transition group"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{p.name}</div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" />
              </div>
              <div className="text-[10px] text-muted-foreground text-mono uppercase tracking-wider mt-1">
                {p.archetype} · {p.state}
              </div>
            </button>
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
    </>
  );
};

const PersonaTrainer = ({ personaId }: { personaId: string }) => {
  const navigate = useNavigate();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [memory, setMemory] = useState<MemoryUpdate[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [policy, setPolicy] = useState<RoutePolicy | undefined>();
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [evalRunning, setEvalRunning] = useState(false);
  const [evalScore, setEvalScore] = useState<number | null>(null);
  const [newMemory, setNewMemory] = useState("");

  useEffect(() => {
    bff.personas.get(personaId).then((p) => setPersona(p ?? null));
    bff.memoryUpdates.forPersona(personaId).then(setMemory);
    bff.skills.list().then(setSkills);
    bff.routePolicies.forPersona(personaId).then(setPolicy);
  }, [personaId]);

  if (!persona) {
    return (
      <Card className="p-12 text-center text-sm text-muted-foreground">
        Persona <code className="text-mono">{personaId}</code> not found.{" "}
        <Button variant="link" onClick={() => navigate("/agora/trainer")}>Back to studio</Button>
      </Card>
    );
  }

  const toggleSkill = (id: string) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runEval = () => {
    setEvalRunning(true);
    setEvalScore(null);
    setTimeout(() => {
      setEvalRunning(false);
      setEvalScore(0.7 + Math.random() * 0.25);
      toast.success("Evaluation suite finished (mock)");
    }, 1400);
  };

  const queueMemory = () => {
    if (!newMemory.trim()) return;
    const m: MemoryUpdate = {
      id: `mu_${Date.now().toString(36)}`,
      personaId,
      kind: "fact",
      source: "operator",
      proposedBy: "you",
      proposedAt: new Date().toISOString(),
      state: "queued",
      after: newMemory.trim(),
    };
    setMemory((prev) => [m, ...prev]);
    setNewMemory("");
    toast.success("Memory candidate queued for governance");
  };

  return (
    <>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/agora/trainer")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{persona.name}</h2>
                <Badge variant="outline">{persona.archetype}</Badge>
                <Badge variant="outline">{persona.state}</Badge>
              </div>
              <div className="text-xs text-muted-foreground text-mono mt-1">
                {persona.routedStrategies} routed · success {(persona.successRate * 100).toFixed(0)}%
              </div>
            </div>
          </div>
          <Link to={`/management/personas/${personaId}`} className="text-xs text-accent hover:underline">
            Open in Management →
          </Link>
        </div>
      </Card>

      <Tabs defaultValue="memory">
        <TabsList>
          <TabsTrigger value="memory">Memory ({memory.length})</TabsTrigger>
          <TabsTrigger value="skills">Skill assign ({skills.length})</TabsTrigger>
          <TabsTrigger value="routing">Routing ({policy?.rules.length ?? 0})</TabsTrigger>
          <TabsTrigger value="eval">Evaluation</TabsTrigger>
        </TabsList>

        <TabsContent value="memory" className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Add memory candidate</div>
            <Textarea
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              placeholder="e.g. Prefer 4d horizon for momentum signals."
              className="min-h-[60px]"
            />
            <div className="flex justify-end">
              <Button onClick={queueMemory} size="sm"><Plus className="h-4 w-4 mr-1" />Queue for review</Button>
            </div>
          </Card>
          <Card className="divide-y divide-border">
            {memory.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No memory updates.</div>}
            {memory.map((m) => (
              <div key={m.id} className="p-3 flex items-start gap-3">
                <Badge variant={m.state === "conflict" ? "destructive" : "outline"} className="text-[10px]">{m.state}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-mono text-muted-foreground uppercase">{m.kind} · {m.source}</div>
                  {m.before && <div className="text-xs line-through text-muted-foreground">{m.before}</div>}
                  <div className="text-sm">{m.after}</div>
                </div>
                <div className="text-[10px] text-muted-foreground text-mono whitespace-nowrap">{new Date(m.proposedAt).toLocaleDateString()}</div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="skills">
          <Card className="divide-y divide-border">
            {skills.map((s) => {
              const on = assigned.has(s.id);
              return (
                <div key={s.id} className="p-3 flex items-center gap-3">
                  <Button size="sm" variant={on ? "default" : "outline"} onClick={() => toggleSkill(s.id)}>
                    {on ? <Check className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                    {on ? "Assigned" : "Assign"}
                  </Button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{s.name} <span className="text-mono text-[10px] text-muted-foreground">v{s.version}</span></div>
                    <div className="text-xs text-muted-foreground">{s.description}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{s.archetype}</Badge>
                </div>
              );
            })}
          </Card>
        </TabsContent>

        <TabsContent value="routing">
          <Card className="p-4">
            {!policy && <div className="text-sm text-muted-foreground">No route policy bound to this persona.</div>}
            {policy && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold">{policy.name}</div>
                    <div className="text-[10px] text-mono text-muted-foreground uppercase">version {policy.version}</div>
                  </div>
                  <Badge variant="outline">{policy.state}</Badge>
                </div>
                <div className="divide-y divide-border border border-border rounded-md">
                  {policy.rules.map((r) => (
                    <div key={r.id} className="p-2 flex items-center gap-3 text-sm">
                      <span className="text-mono text-[10px] text-muted-foreground w-8">#{r.priority}</span>
                      <Badge variant="outline" className="text-[10px]">{r.intent}</Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-mono text-xs">{r.targetKind}:{r.targetId}</span>
                      <div className="ml-auto flex gap-1">
                        {r.envScope.map((e) => (
                          <Badge key={e} variant="outline" className="text-[9px]">{e}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="eval">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold">Run regression suite</div>
                <div className="text-xs text-muted-foreground">Replays the last 50 prompts and scores against expected outputs.</div>
              </div>
              <Button onClick={runEval} disabled={evalRunning}>
                <Play className="h-4 w-4 mr-1" />
                {evalRunning ? "Running…" : "Run eval"}
              </Button>
            </div>
            {evalScore !== null && (
              <div className="rounded-md border border-border p-4 mt-2">
                <div className="text-[10px] text-mono uppercase text-muted-foreground">Pass rate</div>
                <div className="text-3xl text-mono font-semibold">{(evalScore * 100).toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {evalScore > 0.85 ? <span className="text-status-success">Above release bar.</span> : <span className="text-status-warning">Below release bar — investigate.</span>}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
};

export const TrainerStudio = () => {
  const t = useT();
  const { personaId } = useParams();
  return (
    <>
      <PageHeader
        title={personaId ? `Persona Trainer · ${personaId}` : t("nav.trainerStudio")}
        subtitle={personaId ? "Persona-scoped memory, skill assignment, routing & evaluation." : "Convert operator behavior into AI personas, skills, and memories."}
      />
      <PageBody>
        {personaId ? <PersonaTrainer personaId={personaId} /> : <TrainerOverview />}
      </PageBody>
    </>
  );
};
