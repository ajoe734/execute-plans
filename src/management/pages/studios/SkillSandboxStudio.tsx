// Phase 12.3 — Skill Sandbox Studio: input surface; execution stays disabled until a governed runner exists.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader, PageBody } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bff } from "@/lib/bff-v1";
import type { Skill } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { Play } from "lucide-react";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";

const sampleInput = (skill: Skill | undefined) =>
  skill ? JSON.stringify({ skill: skill.id, input: { query: "Summarize macro outlook for Q3 2026", env: "research" } }, null, 2) : "{}";

export const SkillSandboxStudio = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(params.get("id") ?? undefined);
  const [input, setInput] = useState("");

  useEffect(() => {
    bff.skills.list().then((rows) => {
      setSkills(rows);
      if (rows[0]) setActiveId((current) => current ?? rows[0].id);
    });
  }, []);

  const active = useMemo(() => skills.find((s) => s.id === activeId), [skills, activeId]);
  useEffect(() => { setInput(sampleInput(active)); }, [active]);

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
              <NonProductionActionButton size="sm">
                <Play className="h-4 w-4 mr-1" />{t("studios.sandbox.run")}
              </NonProductionActionButton>
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={10} className="text-mono text-xs" />
          </Card>
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold">{t("studios.sandbox.trace")}</div>
            <div className="text-xs text-muted-foreground py-6 text-center">{t("studios.sandbox.emptyTrace")}</div>
          </Card>
        </div>
      </PageBody>
    </>
  );
};
