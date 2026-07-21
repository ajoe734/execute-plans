import { useState } from "react";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Pin } from "lucide-react";
import { useT } from "@/platform/hooks";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";

export const PersonaWorkspaceTab = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const [draft, setDraft] = useState(`# ${personaId} scratchpad\n- watch FX carry vol\n- review macro briefing tone`);
  const pinned = [
    { id: "art_001", label: "model · momentum_v3.2.pkl" },
    { id: "art_002", label: "report · q1-postmortem.pdf" },
  ];
  const privateMem = [
    { id: "pm_01", text: "Prefers 1-line summaries before tables." },
    { id: "pm_02", text: "Treat FOMC weeks as elevated regime." },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title={t("phase13.persona.workspace.scratchpad")}>
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} placeholder={t("phase13.persona.workspace.scratchPlaceholder")} className="font-mono text-xs" />
        <NonProductionActionButton size="sm" variant="outline">
          {t("actions.save")}
        </NonProductionActionButton>
      </Section>
      <div className="space-y-4">
        <Section title={t("phase13.persona.workspace.pinned")}>
          <ul className="space-y-1.5">
            {pinned.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{p.label}</span>
                <Badge variant="outline" className="ml-auto text-[10px]">{p.id}</Badge>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={t("phase13.persona.workspace.privateMemory")}>
          <p className="text-[11px] text-muted-foreground">{t("phase13.persona.workspace.privateMemoryHint")}</p>
          <ul className="space-y-1 pt-1">
            {privateMem.map((m) => (
              <li key={m.id} className="text-sm rounded border border-border/60 px-2 py-1.5">{m.text}</li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
};
