// Pack F F1/F2 — unified Entity Create Drawer.
// Renders per-entity field set, validates via writeIntents/validation,
// writes to writeOverlay (mock), emits toast + audit + realtime.

import { useEffect, useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/platform/hooks";
import type { CreatableEntity, CreateInputMap } from "@/lib/writeIntents/types";
import { validateCreate } from "@/lib/writeIntents/validation";
import { buildEntity } from "@/lib/writeIntents/createDefaults";
import { writeOverlay } from "@/lib/bff/writeOverlay";

interface Props {
  entity: CreatableEntity;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const ENTITY_LABELS: Record<CreatableEntity, string> = {
  strategy: "Strategy",
  persona: "Persona",
  capitalPool: "Capital Pool",
  rankingFormula: "Ranking Formula",
  rebalance: "Rebalance",
  deployment: "Deployment",
  evolutionProgram: "Evolution Program",
  researchExperiment: "Research Experiment",
  artifact: "Artifact",
};

const blankInput = (entity: CreatableEntity): Record<string, unknown> => {
  const base = { name: "", owner: "you", memo: "" };
  switch (entity) {
    case "strategy": return { ...base, alpha: "", capitalPoolId: "", personaIds: "" };
    case "persona": return { ...base, archetype: "", description: "", initialMode: "shadow" };
    case "capitalPool": return { ...base, currency: "USD", allocated: 0, riskBudget: 0.1 };
    case "rankingFormula": return { ...base, expression: "" };
    case "rebalance": return { ...base, quarter: "", targetPoolId: "", proposedDelta: 0 };
    case "deployment": return { ...base, strategyId: "", artifactId: "", target: "research", version: "" };
    case "evolutionProgram": return { ...base, parentAlpha: "", population: 10 };
    case "researchExperiment": return { ...base, hypothesis: "", metric: "" };
    case "artifact": return { ...base, kind: "model", version: "" };
  }
};

function coerce(entity: CreatableEntity, raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw } as Record<string, unknown>;
  if (entity === "strategy" && typeof out.personaIds === "string") {
    out.personaIds = (out.personaIds as string).split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (entity === "capitalPool") {
    out.allocated = Number(out.allocated);
    out.riskBudget = Number(out.riskBudget);
  }
  if (entity === "rebalance") out.proposedDelta = Number(out.proposedDelta);
  if (entity === "evolutionProgram") out.population = Number(out.population);
  if (entity === "artifact" && out.sizeMb !== undefined && out.sizeMb !== "") out.sizeMb = Number(out.sizeMb);
  return out;
}

export const EntityCreateDrawer = ({ entity, open, onOpenChange }: Props) => {
  const t = useT();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, unknown>>(() => blankInput(entity));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) { setForm(blankInput(entity)); setErrors({}); }
  }, [open, entity]);

  const fields = useMemo(() => entityFields(entity), [entity]);

  const setField = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const input = coerce(entity, form);
    const r = validateCreate(entity, input as never);
    if (!r.ok) { setErrors(r.errors); return; }
    const built = buildEntity(entity, input as never);
    writeOverlay.add(entity, built);
    toast({
      title: t("actions.create") + " — " + ENTITY_LABELS[entity],
      description: String(built.name ?? built.id),
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("actions.create")} — {ENTITY_LABELS[entity]}</SheetTitle>
          <SheetDescription className="text-xs">
            v0 mock create · 30-min overlay TTL · not persisted to seed
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 py-4">
          {fields.map((f) => (
            <div key={f.name} className="space-y-1">
              <Label htmlFor={f.name} className="text-xs">
                {f.label}{f.required && <span className="text-status-failed"> *</span>}
              </Label>
              {f.type === "textarea" ? (
                <Textarea
                  id={f.name}
                  value={String(form[f.name] ?? "")}
                  onChange={(e) => setField(f.name, e.target.value)}
                  rows={2}
                />
              ) : (
                <Input
                  id={f.name}
                  type={f.type === "number" ? "number" : "text"}
                  step={f.step}
                  value={String(form[f.name] ?? "")}
                  onChange={(e) => setField(f.name, e.target.value)}
                  placeholder={f.placeholder}
                />
              )}
              {errors[f.name] && (
                <p className="text-xs text-status-failed">{errors[f.name]}</p>
              )}
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", { defaultValue: "Cancel" })}</Button>
          <Button onClick={submit}>{t("actions.create")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  step?: string;
}

function entityFields(entity: CreatableEntity): FieldDef[] {
  const baseName: FieldDef = { name: "name", label: "Name", required: true };
  const owner: FieldDef = { name: "owner", label: "Owner" };
  const memo: FieldDef = { name: "memo", label: "Memo", type: "textarea" };
  switch (entity) {
    case "strategy":
      return [
        baseName, owner,
        { name: "alpha", label: "Alpha (slug)", required: true, placeholder: "alpha-momentum" },
        { name: "capitalPoolId", label: "Capital Pool ID", required: true },
        { name: "personaIds", label: "Persona IDs (comma-separated)", required: true, hint: "≥ 1 persona id" },
        memo,
      ];
    case "persona":
      return [
        baseName, owner,
        { name: "archetype", label: "Archetype", required: true, placeholder: "trader / analyst" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "initialMode", label: "Initial mode (shadow|suspended)", placeholder: "shadow" },
        memo,
      ];
    case "capitalPool":
      return [
        baseName, owner,
        { name: "currency", label: "Currency (USD|USDT|TWD)", required: true, placeholder: "USD" },
        { name: "allocated", label: "Allocated", type: "number", required: true },
        { name: "riskBudget", label: "Risk budget (0..1]", type: "number", step: "0.01", required: true },
        memo,
      ];
    case "rankingFormula":
      return [
        baseName, owner,
        { name: "expression", label: "Expression", required: true, placeholder: "0.6*sharpe-0.3*|dd|" },
        memo,
      ];
    case "rebalance":
      return [
        baseName, owner,
        { name: "quarter", label: "Quarter (YYYY-Qn)", required: true, placeholder: "2026-Q2" },
        { name: "targetPoolId", label: "Target Pool ID", required: true },
        { name: "proposedDelta", label: "Proposed Delta", type: "number", step: "0.01" },
        memo,
      ];
    case "deployment":
      return [
        baseName, owner,
        { name: "strategyId", label: "Strategy ID", required: true },
        { name: "artifactId", label: "Artifact ID", required: true },
        { name: "target", label: "Target (research|paper|live)", required: true, placeholder: "research" },
        { name: "version", label: "Version", required: true, placeholder: "v1.0.0" },
        { name: "previousVersion", label: "Previous Version" },
        memo,
      ];
    case "evolutionProgram":
      return [
        baseName, owner,
        { name: "parentAlpha", label: "Parent Alpha", required: true },
        { name: "population", label: "Population", type: "number", required: true },
        memo,
      ];
    case "researchExperiment":
      return [
        baseName, owner,
        { name: "hypothesis", label: "Hypothesis", type: "textarea", required: true },
        { name: "metric", label: "Metric", required: true, placeholder: "sharpe" },
        memo,
      ];
    case "artifact":
      return [
        baseName, owner,
        { name: "kind", label: "Kind (model|dataset|report|container)", required: true, placeholder: "model" },
        { name: "version", label: "Version", required: true, placeholder: "v1.0.0" },
        { name: "sourceExperimentId", label: "Source Experiment ID" },
        memo,
      ];
  }
}
