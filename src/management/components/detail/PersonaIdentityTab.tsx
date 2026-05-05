import { Section, Field } from "@/management/pages/ObjectDetailLayout";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import type { Persona } from "@/lib/bff/types";

export const PersonaIdentityTab = ({ p }: { p: Persona }) => {
  const t = useT();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title={t("phase13.persona.identity.charter")}>
        <p className="text-sm leading-relaxed">{t("phase13.persona.identity.charterValue")}</p>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Field label={t("table.type")} value={p.archetype} />
          <Field label={t("phase13.persona.identity.roleTaxonomy")} value={
            <div className="flex gap-1 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{p.archetype}</Badge>
              <Badge variant="outline" className="text-[10px]">primary</Badge>
            </div>
          } />
        </div>
      </Section>
      <Section title={t("phase13.persona.identity.tone")}>
        <p className="text-sm">{t("phase13.persona.identity.toneValue")}</p>
        <Field label={t("phase13.persona.identity.riskAppetite")} value={p.risk} mono />
      </Section>
    </div>
  );
};
