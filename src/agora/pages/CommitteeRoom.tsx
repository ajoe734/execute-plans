// Committee Room — Spec Part 4 §11.
// Multi-persona structured deliberation. Supports session list at /agora/committee
// and detail view at /agora/committee/:sessionId.
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MessageCircle, FileText, Vote, Send, Users } from "lucide-react";
import { useT } from "@/platform/hooks";
import { bff } from "@/lib/bff/client";
import type { Persona } from "@/lib/bff/types";
import { useHandoff } from "@/lib/handoff";
import { toast } from "sonner";
import { useRef } from "react";
import {
  validateEvidenceUpload,
  COMMITTEE_EVIDENCE_ALLOWED_MIMES,
  COMMITTEE_EVIDENCE_ENDPOINTS,
  EVIDENCE_LIMITS,
  type EvidenceMime,
} from "@/lib/v3/committeeEvidence";

type SessionStatus = "open" | "discussing" | "memo_ready" | "submitted" | "closed";
type Template =
  | "signal_trust" | "strategy_promotion" | "incident_analysis"
  | "regime_debate" | "postmortem" | "alpha_redteam";

interface Round {
  id: string;
  question: string;
  responses: { personaId: string; stance: "agree" | "disagree" | "neutral"; argument: string }[];
}

interface Session {
  id: string;
  template: Template;
  objective: string;
  targetObject: string;
  participants: string[]; // persona ids
  status: SessionStatus;
  evidence: string[];
  rounds: Round[];
  memo?: string;
  followUps: { kind: "research_task" | "insight" | "governance"; label: string }[];
  createdAt: string;
}

const TEMPLATES: { id: Template; label: string }[] = [
  { id: "signal_trust", label: "Signal Trustworthiness Review" },
  { id: "strategy_promotion", label: "Strategy Promotion Debate" },
  { id: "incident_analysis", label: "Risk Incident Analysis" },
  { id: "regime_debate", label: "Market Regime Debate" },
  { id: "postmortem", label: "Postmortem Review" },
  { id: "alpha_redteam", label: "Alpha Idea Red-Team" },
];

const seed: Session[] = [
  {
    id: "cs_001", template: "incident_analysis",
    objective: "Determine whether stg_004 should remain paused after the FX Carry breach.",
    targetObject: "stg_004",
    participants: ["per_quant", "per_macro", "per_risk"],
    status: "discussing",
    evidence: ["alert al_501", "drawdown report Q1", "incident in_021 timeline"],
    rounds: [
      {
        id: "rd_1", question: "Was the drawdown event-driven or model-driven?",
        responses: [
          { personaId: "per_quant", stance: "agree", argument: "Model fired correctly given inputs; the drift was event-driven (JPY intervention)." },
          { personaId: "per_macro", stance: "disagree", argument: "The model failed to gate on VIX>22; this is a structural miss." },
          { personaId: "per_risk", stance: "neutral", argument: "Either way, our drawdown budget was breached; mitigation must include a hard gate." },
        ],
      },
    ],
    followUps: [{ kind: "governance", label: "Submit memo as evidence to ap_301" }],
    createdAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
  },
  {
    id: "cs_002", template: "strategy_promotion",
    objective: "Should Vol Surface Arb v4 be promoted to live?",
    targetObject: "stg_005", participants: ["per_quant", "per_risk"],
    status: "memo_ready", evidence: ["backtest report v4", "paper trading 30d log"],
    rounds: [],
    memo: "Quant supports promotion citing 2.1 Sharpe in paper. Risk requests a 30-day staged ramp with capital cap of $5M.",
    followUps: [], createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
  },
];

export const CommitteeRoom = () => {
  const t = useT();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [sessions, setSessions] = useState<Session[]>(seed);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { bff.personas.list().then(setPersonas); }, []);

  const active = useMemo(() => sessions.find((s) => s.id === sessionId) ?? null, [sessions, sessionId]);

  if (active) {
    return <CommitteeDetail
      session={active}
      personas={personas}
      onBack={() => navigate("/agora/committee")}
      onUpdate={(s) => setSessions((all) => all.map((x) => x.id === s.id ? s : x))}
    />;
  }

  return (
    <>
      <PageHeader
        title={t("nav.committee")}
        subtitle={t("committee.subtitle")}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t("committee.create")}
          </Button>
        }
      />
      <PageBody>
        {createOpen && (
          <CreateSessionCard
            personas={personas}
            onCancel={() => setCreateOpen(false)}
            onCreate={(s) => { setSessions((all) => [s, ...all]); setCreateOpen(false); navigate(`/agora/committee/${s.id}`); }}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sessions.map((s) => (
            <Card
              key={s.id}
              className="p-4 cursor-pointer hover:border-accent transition"
              onClick={() => navigate(`/agora/committee/${s.id}`)}
            >
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-mono text-[10px] uppercase">{s.template.replace(/_/g, " ")}</Badge>
                <Badge variant="outline" className={statusTone(s.status)}>{t(`committee.status.${s.status}`)}</Badge>
                <span className="text-mono text-[10px] text-muted-foreground ml-auto">{new Date(s.createdAt).toLocaleString()}</span>
              </div>
              <div className="font-semibold text-sm">{s.objective}</div>
              <div className="text-mono text-xs text-muted-foreground mt-1">target: {s.targetObject}</div>
              <div className="flex gap-1 mt-3">
                {s.participants.slice(0, 4).map((pid) => (
                  <Avatar key={pid} className="h-7 w-7"><AvatarFallback className="text-[10px]">{pid.replace("per_", "").slice(0, 3).toUpperCase()}</AvatarFallback></Avatar>
                ))}
                <span className="text-xs text-muted-foreground self-center ml-2">{s.rounds.length} {t("committee.rounds")}</span>
              </div>
            </Card>
          ))}
          {sessions.length === 0 && (
            <Card className="p-8 col-span-full text-center text-sm text-muted-foreground">{t("committee.empty")}</Card>
          )}
        </div>
      </PageBody>
    </>
  );
};

const statusTone = (s: SessionStatus) => {
  if (s === "submitted" || s === "closed") return "bg-status-success/15 text-status-success border-status-success/30";
  if (s === "memo_ready") return "bg-accent/15 text-accent border-accent/30";
  if (s === "discussing") return "bg-status-running/15 text-status-running border-status-running/30";
  return "bg-status-warning/15 text-status-warning border-status-warning/30";
};

// ─────────────────── Create ───────────────────

const CreateSessionCard = ({ personas, onCreate, onCancel }: {
  personas: Persona[];
  onCreate: (s: Session) => void;
  onCancel: () => void;
}) => {
  const t = useT();
  const [template, setTemplate] = useState<Template>("signal_trust");
  const [objective, setObjective] = useState("");
  const [target, setTarget] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const create = () => {
    if (!objective.trim() || selected.length === 0) {
      toast.error(t("committee.requireFields"));
      return;
    }
    onCreate({
      id: `cs_${Date.now().toString(36)}`,
      template, objective, targetObject: target || "—",
      participants: selected, status: "open", evidence: [], rounds: [], followUps: [],
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <Card className="p-4 space-y-3 border-accent/40">
      <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("committee.create")}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">{t("committee.template")}</label>
          <Select value={template} onValueChange={(v) => setTemplate(v as Template)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{TEMPLATES.map((tp) => <SelectItem key={tp.id} value={tp.id}>{tp.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t("committee.targetObject")}</label>
          <Input className="mt-1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="stg_001 / al_500 / rx_201" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">{t("committee.objective")}</label>
        <Textarea className="mt-1" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder={t("committee.objectivePlaceholder")} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">{t("committee.participants")}</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {personas.map((p) => {
            const on = selected.includes(p.id);
            return (
              <Button key={p.id} type="button" size="sm" variant={on ? "default" : "outline"}
                onClick={() => setSelected((s) => on ? s.filter((x) => x !== p.id) : [...s, p.id])}>
                {p.name}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>{t("actions.cancel")}</Button>
        <Button onClick={create}>{t("committee.create")}</Button>
      </div>
    </Card>
  );
};

// ─────────────────── Detail ───────────────────

const CommitteeDetail = ({ session, personas, onBack, onUpdate }: {
  session: Session;
  personas: Persona[];
  onBack: () => void;
  onUpdate: (s: Session) => void;
}) => {
  const t = useT();
  const openHandoff = useHandoff((s) => s.openHandoff);
  const [question, setQuestion] = useState("");
  const [memo, setMemo] = useState(session.memo ?? "");

  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  const startRound = () => {
    if (!question.trim()) { toast.error(t("committee.questionRequired")); return; }
    const newRound: Round = {
      id: `rd_${Date.now().toString(36)}`,
      question,
      // Mocked persona responses for demo realism
      responses: session.participants.map((pid, idx) => ({
        personaId: pid,
        stance: (["agree", "disagree", "neutral"] as const)[idx % 3],
        argument: `${personaName(pid)} weighs in on "${question.slice(0, 40)}…" with their view.`,
      })),
    };
    onUpdate({ ...session, status: "discussing", rounds: [...session.rounds, newRound] });
    setQuestion("");
  };

  const generateMemo = () => {
    const draft = `Committee Memo — ${session.objective}\n\nParticipants: ${session.participants.map(personaName).join(", ")}\nRounds: ${session.rounds.length}\n\nKey objections:\n${session.rounds.flatMap((r) => r.responses.filter((x) => x.stance === "disagree").map((x) => `- ${personaName(x.personaId)}: ${x.argument}`)).join("\n") || "—"}\n\nRecommendation: pending consensus.`;
    setMemo(draft);
    onUpdate({ ...session, status: "memo_ready", memo: draft });
    toast.success(t("committee.memoGenerated"));
  };

  const submitGovernance = () => {
    openHandoff({
      type: "committee_memo",
      source: { kind: "CommitteeSession", id: session.id, label: session.objective },
      summary: `Committee memo for ${session.targetObject}`,
      evidence: [...session.evidence, `committee:${session.id}`],
      notes: memo,
      priority: session.status === "memo_ready" ? "high" : "normal",
    });
  };

  return (
    <>
      <PageHeader
        title={session.objective}
        subtitle={`${session.id} · ${session.template.replace(/_/g, " ")} · target ${session.targetObject}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onBack}>{t("common.back")}</Button>
            {session.status !== "submitted" && session.status !== "closed" && (
              <Button size="sm" onClick={submitGovernance}>
                <Send className="h-4 w-4 mr-1" />
                {t("committee.submitGovernance")}
              </Button>
            )}
          </div>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: agenda + evidence + participants */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
                <Users className="h-3 w-3" /> {t("committee.participants")}
              </div>
              <ul className="space-y-2">
                {session.participants.map((pid) => (
                  <li key={pid} className="flex items-center gap-2 text-sm">
                    <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{pid.replace("per_", "").slice(0, 3).toUpperCase()}</AvatarFallback></Avatar>
                    {personaName(pid)}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("committee.evidence")}</div>
              <ul className="text-mono text-xs space-y-1 mb-2">
                {session.evidence.map((e, i) => <li key={i}>· {e}</li>)}
                {session.evidence.length === 0 && <li className="text-muted-foreground">—</li>}
              </ul>
              <EvidencePackUploader
                sessionId={session.id}
                existingCount={session.evidence.length}
                onUploaded={(label) => onUpdate({ ...session, evidence: [...session.evidence, label] })}
              />
            </Card>
          </div>

          {/* Center: rounds */}
          <div className="lg:col-span-6 space-y-4">
            <Tabs defaultValue="rounds">
              <TabsList>
                <TabsTrigger value="rounds"><MessageCircle className="h-3 w-3 mr-1" />{t("committee.tab.rounds")}</TabsTrigger>
                <TabsTrigger value="vote"><Vote className="h-3 w-3 mr-1" />{t("committee.tab.vote")}</TabsTrigger>
                <TabsTrigger value="memo"><FileText className="h-3 w-3 mr-1" />{t("committee.tab.memo")}</TabsTrigger>
              </TabsList>

              <TabsContent value="rounds" className="mt-4 space-y-3">
                {session.rounds.map((r) => (
                  <Card key={r.id} className="p-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Q · {r.question}</div>
                    <ul className="space-y-3">
                      {r.responses.map((resp, i) => (
                        <li key={i} className="flex gap-3 items-start">
                          <Avatar className="h-8 w-8"><AvatarFallback className="text-[10px]">{resp.personaId.replace("per_", "").slice(0, 3).toUpperCase()}</AvatarFallback></Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium">{personaName(resp.personaId)}</span>
                              <Badge variant="outline" className={`text-[10px] uppercase ${stanceTone(resp.stance)}`}>{t(`committee.stance.${resp.stance}`)}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{resp.argument}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
                <Card className="p-4 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("committee.askQuestion")}</div>
                  <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("committee.questionPlaceholder")} />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={startRound}>{t("committee.startRound")}</Button>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="vote" className="mt-4">
                <Card className="p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{t("committee.tab.vote")}</div>
                  <VoteSummary session={session} />
                </Card>
              </TabsContent>

              <TabsContent value="memo" className="mt-4">
                <Card className="p-4 space-y-3">
                  <Textarea rows={10} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t("committee.memoPlaceholder")} />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={generateMemo}>{t("committee.generateMemo")}</Button>
                    <Button onClick={() => { onUpdate({ ...session, memo }); toast.success(t("committee.memoSaved")); }}>{t("actions.save")}</Button>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: decision / follow-ups */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="p-4 space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("committee.followUps")}</div>
              <Button size="sm" variant="outline" className="w-full justify-start"
                onClick={() => openHandoff({ type: "research_task", source: { kind: "CommitteeSession", id: session.id, label: session.objective }, summary: `Research follow-up: ${session.objective}` })}>
                {t("committee.createResearchTask")}
              </Button>
              <Button size="sm" variant="outline" className="w-full justify-start"
                onClick={() => openHandoff({ type: "insight", source: { kind: "CommitteeSession", id: session.id, label: session.objective }, summary: session.objective })}>
                {t("committee.createInsight")}
              </Button>
              <Button size="sm" variant="outline" className="w-full justify-start"
                onClick={() => { onUpdate({ ...session, status: "closed" }); toast.success(t("committee.closed")); }}>
                {t("committee.closeSession")}
              </Button>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
};

const stanceTone = (s: "agree" | "disagree" | "neutral") =>
  s === "agree" ? "bg-status-success/15 text-status-success border-status-success/30"
  : s === "disagree" ? "bg-status-failed/15 text-status-failed border-status-failed/30"
  : "bg-muted text-muted-foreground border-border";

const VoteSummary = ({ session }: { session: Session }) => {
  const t = useT();
  const all = session.rounds.flatMap((r) => r.responses);
  const tally = { agree: 0, disagree: 0, neutral: 0 };
  all.forEach((r) => { tally[r.stance] += 1; });
  const total = all.length || 1;
  return (
    <div className="space-y-2 text-sm">
      {(["agree", "disagree", "neutral"] as const).map((k) => {
        const pct = Math.round((tally[k] / total) * 100);
        return (
          <div key={k}>
            <div className="flex justify-between">
              <span>{t(`committee.stance.${k}`)}</span>
              <span className="text-mono text-xs text-muted-foreground">{tally[k]} ({pct}%)</span>
            </div>
            <div className="mt-1 h-1.5 bg-muted rounded overflow-hidden">
              <div className={`h-full ${k === "agree" ? "bg-status-success" : k === "disagree" ? "bg-status-failed" : "bg-muted-foreground/40"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {all.length === 0 && <div className="text-xs text-muted-foreground">{t("common.noResults")}</div>}
    </div>
  );
};
