// HandoffDrawer — Spec Part 5 §21.
// Globally mounted via PlatformShell. Opens whenever any Agora surface calls
// `useHandoff().openHandoff(...)`. Captures the spec's 10 fields and posts.
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Send } from "lucide-react";
import { useHandoff, type HandoffType } from "@/lib/handoff";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const TYPES: HandoffType[] = [
  "insight", "strategy_idea", "research_task", "committee_memo",
  "training_feedback", "skill_draft", "mcp_tool_request", "alert_escalation",
];

export const HandoffDrawer = () => {
  const t = useT();
  const navigate = useNavigate();
  const open = useHandoff((s) => s.open);
  const draft = useHandoff((s) => s.draft);
  const close = useHandoff((s) => s.close);
  const submit = useHandoff((s) => s.submit);

  const [type, setType] = useState<HandoffType>("insight");
  const [summary, setSummary] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [owner, setOwner] = useState("");
  const [persona, setPersona] = useState("");
  const [notes, setNotes] = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);

  // Reset form whenever a new draft opens
  useEffect(() => {
    if (open && draft) {
      setType(draft.type);
      setSummary(draft.summary ?? "");
      setPriority(draft.priority ?? "normal");
      setOwner(draft.suggestedOwner ?? "");
      setPersona(draft.suggestedPersona ?? "");
      setNotes(draft.notes ?? "");
      setEvidence(draft.evidence ?? []);
      setEvidenceInput("");
    }
  }, [open, draft]);

  const addEvidence = () => {
    if (!evidenceInput.trim()) return;
    setEvidence((es) => [...es, evidenceInput.trim()]);
    setEvidenceInput("");
  };

  const onSubmit = () => {
    if (!draft || summary.trim().length < 8) {
      toast.error(t("handoff.summaryRequired"));
      return;
    }
    const rec = submit({
      type, source: draft.source, summary, evidence, priority,
      suggestedOwner: owner, suggestedPersona: persona, notes,
      targetRoute: draft.targetRoute,
    });
    toast.success(t("handoff.submitted", { id: rec.id }), {
      action: {
        label: t("handoff.openTarget"),
        onClick: () => navigate(`${rec.targetRoute}?from=handoff&handoff=${rec.id}`),
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-mono text-xs uppercase">{t("handoff.title")}</Badge>
            {draft && <span className="text-mono text-xs text-muted-foreground">{draft.source.kind}:{draft.source.id}</span>}
          </div>
          <SheetTitle>{t("handoff.heading")}</SheetTitle>
          <SheetDescription>{t("handoff.subtitle")}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <Label>{t("handoff.type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as HandoffType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((tp) => (
                  <SelectItem key={tp} value={tp}>{t(`handoff.types.${tp}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {draft && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t("handoff.source")}</div>
              <div className="flex items-center justify-between">
                <span className="font-medium">{draft.source.label ?? draft.source.kind}</span>
                <span className="text-mono text-xs text-muted-foreground">{draft.source.id}</span>
              </div>
            </div>
          )}

          <div>
            <Label>{t("handoff.summary")} <span className="text-status-failed">*</span></Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t("handoff.summaryPlaceholder")}
            />
            <p className="text-xs text-muted-foreground mt-1">{t("handoff.summaryHint")}</p>
          </div>

          <div>
            <Label>{t("handoff.evidence")}</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={evidenceInput}
                onChange={(e) => setEvidenceInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEvidence(); } }}
                placeholder={t("handoff.evidencePlaceholder")}
              />
              <Button type="button" variant="outline" onClick={addEvidence}>{t("handoff.add")}</Button>
            </div>
            {evidence.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {evidence.map((e, i) => (
                  <li key={i}>
                    <Badge variant="outline" className="cursor-pointer" onClick={() => setEvidence((es) => es.filter((_, j) => j !== i))}>
                      {e} ✕
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("handoff.priority")}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("handoff.priorityLevels.low")}</SelectItem>
                  <SelectItem value="normal">{t("handoff.priorityLevels.normal")}</SelectItem>
                  <SelectItem value="high">{t("handoff.priorityLevels.high")}</SelectItem>
                  <SelectItem value="urgent">{t("handoff.priorityLevels.urgent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("handoff.suggestedOwner")}</Label>
              <Input className="mt-1" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="capital" />
            </div>
          </div>

          <div>
            <Label>{t("handoff.suggestedPersona")}</Label>
            <Input className="mt-1" value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="per_quant" />
          </div>

          <div>
            <Label>{t("handoff.notes")}</Label>
            <Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("handoff.notesPlaceholder")} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={close}>{t("actions.cancel")}</Button>
            <Button onClick={onSubmit}>
              <Send className="h-4 w-4 mr-1" />
              {t("handoff.submit")}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
