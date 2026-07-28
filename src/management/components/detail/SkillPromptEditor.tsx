// Lightweight Skill prompt/spec editor surface; saving stays disabled until a governed command exists.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Skill } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";

const initialPrompt = (skill: Skill) => `# ${skill.name}
Archetype: ${skill.archetype}
Version: ${skill.version}

## Role
You are a ${skill.archetype.toLowerCase()} specialist. ${skill.description}

## Output format
- Concise, structured.
- Cite source URLs when referencing external data.
- Surface uncertainty explicitly.

## Guardrails
- Do not invoke destructive tools without operator confirmation.
- Prefer cached data when staleness < 5 minutes.
`;

export const SkillPromptEditor = ({ skill }: { skill: Skill }) => {
  const t = useT();
  const [draft, setDraft] = useState(() => initialPrompt(skill));
  const [original] = useState(() => initialPrompt(skill));
  const dirty = draft !== original;
  const lines = draft.split("\n").length;
  const chars = draft.length;

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{t("skill.prompt.title")}</div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">{skill.draft ? "draft" : "published"}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase">v{skill.version}</Badge>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">{t("skill.prompt.hint")}</div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={18}
          className="text-mono text-xs leading-relaxed"
        />
        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] text-mono text-muted-foreground">
            {lines} {t("skill.prompt.lines")} · {chars} {t("skill.prompt.chars")}
            {dirty && <span className="ml-2 text-status-warning">● {t("skill.prompt.unsaved")}</span>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setDraft(original); }} disabled={!dirty}>
              {t("actions.reset")}
            </Button>
            <NonProductionActionButton size="sm">
              {t("skill.prompt.saveDraft")}
            </NonProductionActionButton>
          </div>
        </div>
      </Card>
    </div>
  );
};
