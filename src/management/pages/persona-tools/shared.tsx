// FE-MGMT-PERSONA-TOOLS-FROM-AGORA-20261127 — shared Management chrome for the
// persona operator tools (memory review, persona lab, persona feedback) that
// moved out of Agora. BFF reads/writes and the write gate are unchanged and
// still come from the Agora learning client and `useLearningWriteAccess`.
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { bffV1 } from "@/lib/bff-v1";
import type { Persona } from "@/lib/bff-v1";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { PersonaIdField, textInput } from "@/agora/pages/learning/shared";
import { classifyCurrentFirstScope, PERSONA_SCOPE_TABS } from "@/management/pages/Lists";

/** `snake_case` / `kebab-case` owner codes rendered as words. */
export function humanizeCode(value: string): string {
  return value.replace(/[_-]+/g, " ").trim();
}

export type EnumGroup = "scope" | "memoryType" | "state" | "decision" | "evidenceType";

/** Enum values in words: a translated label when known, otherwise the code humanized. */
export function useEnumLabel() {
  const { t } = useTranslation();
  return (group: EnumGroup, value: unknown): string => {
    if (value === null || value === undefined || value === "") return t("agora.learning.notReported");
    const raw = String(value);
    return t(`personaTools.enum.${group}.${raw}`, { defaultValue: humanizeCode(raw) });
  };
}

/** A state label that keeps the owner code as a machine-readable attribute. */
export function EnumText({ group, value }: { group: EnumGroup; value: unknown }) {
  const label = useEnumLabel();
  return <span data-state={value === null || value === undefined ? undefined : String(value)}>{label(group, value)}</span>;
}

export function ToolPageShell({ title, subtitle, testId, children }: { title: string; subtitle: string; testId: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageBody>
        <div data-testid={testId} className="space-y-6">
          <p className="text-xs text-muted-foreground">{t("agora.learning.paperBoundary")}</p>
          {children}
        </div>
      </PageBody>
    </>
  );
}

type PersonaList = { state: "loading" } | { state: "ok"; items: Persona[] } | { state: "unavailable" };

function usePersonaRegistry(): PersonaList {
  const [list, setList] = useState<PersonaList>({ state: "loading" });
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => bffV1.personas.list())
      .then((items) => { if (live) setList({ state: "ok", items: Array.isArray(items) ? items : [] }); })
      .catch(() => { if (live) setList({ state: "unavailable" }); });
    return () => { live = false; };
  }, []);
  return list;
}

/**
 * Persona picker by name from the persona registry. Typing an id stays
 * available under an advanced disclosure, but is never the only way in.
 */
export function PersonaPicker({ personaId, onChange }: { personaId: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const registry = usePersonaRegistry();
  const items = registry.state === "ok"
    ? registry.items.filter((row) => classifyCurrentFirstScope(row, PERSONA_SCOPE_TABS) === "current")
    : [];
  const listed = items.some((p) => p.id === personaId);
  return (
    <div className="flex flex-wrap items-end gap-4" data-testid="persona-tools-picker">
      <label className="flex min-w-[16rem] flex-col text-xs text-muted-foreground">
        {t("personaTools.picker.label")}
        <select
          className={`${textInput} mt-1`}
          value={personaId}
          onChange={(e) => onChange(e.target.value)}
          disabled={registry.state === "loading"}
        >
          <option value="">
            {registry.state === "loading"
              ? t("personaTools.picker.loading")
              : registry.state === "unavailable"
                ? t("personaTools.picker.unavailable")
                : items.length === 0 ? t("personaTools.picker.empty") : t("personaTools.picker.placeholder")}
          </option>
          {items.map((p) => (
            <option key={p.id} value={p.id}>{p.name || t("personaTools.picker.unnamed")}{p.archetype ? ` · ${p.archetype}` : ""}</option>
          ))}
          {personaId && !listed ? <option value={personaId}>{t("personaTools.picker.unlisted")}</option> : null}
        </select>
      </label>
      <details className="text-xs text-muted-foreground" data-testid="persona-tools-manual-id">
        <summary className="cursor-pointer">{t("personaTools.picker.manual")}</summary>
        <div className="mt-2"><PersonaIdField personaId={personaId} onChange={onChange} /></div>
      </details>
    </div>
  );
}
