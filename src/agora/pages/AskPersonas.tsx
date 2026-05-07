import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useT } from "@/platform/hooks";
import { Send, Paperclip, X, Users } from "lucide-react";
import { toast } from "sonner";

interface Msg { from: "you" | string; text: string; ts: string; }
interface Ctx { id: string; label: string; }

const personas = [
  { id: "per_quant", name: "Quant Architect", color: "bg-accent" },
  { id: "per_macro", name: "Macro Strategist", color: "bg-status-warning" },
  { id: "per_risk", name: "Risk Officer Bot", color: "bg-status-success" },
  { id: "per_red", name: "Red Team Adversary", color: "bg-destructive" },
];

export const AskPersonas = () => {
  const t = useT();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>(["per_quant"]);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [contexts, setContexts] = useState<Ctx[]>([]);
  const [ctxInput, setCtxInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    const ts = new Date().toISOString();
    const ctxNote = contexts.length ? ` (with ${contexts.length} context refs)` : "";
    const userMsg: Msg = { from: "you", text: input, ts };
    const responses: Msg[] = selected.map((id) => {
      const p = personas.find((x) => x.id === id)!;
      return { from: p.name, text: `(${p.name} mock response${ctxNote}) Considering "${input.slice(0, 60)}…", I would weight short-term momentum higher.`, ts };
    });
    setMsgs((m) => [...m, userMsg, ...responses]);
    setInput("");
  };

  const addCtx = () => {
    if (!ctxInput.trim()) return;
    setContexts((c) => [...c, { id: `ctx_${Date.now().toString(36)}`, label: ctxInput.trim() }]);
    setCtxInput("");
  };

  const handoffToCommittee = () => {
    if (selected.length < 2) {
      toast.error("Pick at least 2 personas to hand off to a committee session.");
      return;
    }
    if (msgs.length === 0) {
      toast.error("Conversation is empty.");
      return;
    }
    toast.success("Handing off to Committee Room…");
    const sessionId = `cs_${Date.now().toString(36)}`;
    navigate(`/agora/committee/${sessionId}`);
  };

  return (
    <>
      <PageHeader title={t("nav.askPersonas")} subtitle={t("agora.askPersonas.subtitle")} />
      <PageBody>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{t("agora.askPersonas.personas")}</div>
          <div className="flex flex-wrap gap-2">
            {personas.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition ${on ? "bg-accent text-accent-foreground border-accent" : "bg-background text-foreground border-border"}`}
                >
                  <span className={`h-2 w-2 rounded-full ${p.color}`} />
                  {p.name}
                </button>
              );
            })}
            {selected.length > 1 && <Badge variant="outline">{t("agora.askPersonas.committeeMode")}</Badge>}
            {selected.length > 1 && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={handoffToCommittee}>
                <Users className="h-4 w-4 mr-1" /> Handoff to Committee
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("common.contextAttachments")}</div>
          <div className="flex gap-2">
            <Input
              value={ctxInput}
              onChange={(e) => setCtxInput(e.target.value)}
              placeholder={t("agora.askPersonas.attachPh")}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCtx(); } }}
            />
            <Button variant="outline" size="sm" onClick={addCtx}><Paperclip className="h-4 w-4" /></Button>
          </div>
          {contexts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {contexts.map((c) => (
                <Badge key={c.id} variant="outline" className="gap-1 pr-1">
                  <Paperclip className="h-3 w-3" />
                  <span className="text-mono text-[11px]">{c.label}</span>
                  <button onClick={() => setContexts((all) => all.filter((x) => x.id !== c.id))} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 min-h-[300px] space-y-3">
          {msgs.length === 0 && <div className="text-sm text-muted-foreground text-center py-12">{t("agora.askPersonas.hint")}</div>}
          {msgs.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.from === "you" ? "justify-end" : ""}`}>
              {m.from !== "you" && <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{m.from.split(" ").map((w) => w[0]).join("")}</AvatarFallback></Avatar>}
              <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${m.from === "you" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.from !== "you" && <div className="text-xs font-semibold mb-1">{m.from}</div>}
                {m.text}
                {m.from !== "you" && (
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => toast.success("Feedback captured")}>👍</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => toast.success("Feedback captured")}>👎</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Card>

        <div className="flex gap-2">
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("agora.askPersonas.askPh")} className="min-h-[60px]" />
          <Button onClick={send}><Send className="h-4 w-4" /></Button>
        </div>
      </PageBody>
    </>
  );
};
