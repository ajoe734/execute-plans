// Pack F F1/F2 + spec-conflict-G G03/G10/G11
// - G03: per-entity controlled components (Select / multi-select / Slider) instead of free-text everywhere.
// - G10: all labels / placeholders / hints / errors via `entityCreate.*` i18n keys.
// - G11: every field error wired with aria-describedby + role="alert" for D62 axe scope.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/platform/hooks";
import { PERSONA_ARCHETYPES } from "@/lib/writeIntents/types";
import type { CreatableEntity } from "@/lib/writeIntents/types";
import { validateCreate } from "@/lib/writeIntents/validation";
import { idempotencyKey } from "@/lib/bff-v1/headers";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createEntityFromInput, type CreateEntityResult } from "./createEntity";

// spec-conflict-G C3 — confirm cooldown (server-time would supersede in live mode).
const CONFIRM_COOLDOWN_MS = 1500;

interface Props {
  entity: CreatableEntity;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (created: Record<string, unknown>, result: CreateEntityResult) => void;
}

type FieldType =
  | "text" | "number" | "textarea"
  | "select" | "multi-tag" | "slider";

interface SelectOption { value: string; labelKey: string }

interface FieldDef {
  name: string;
  /** i18n key under entityCreate.field.* */
  labelKey: string;
  type: FieldType;
  required?: boolean;
  /** i18n key under entityCreate.placeholder.* */
  placeholderKey?: string;
  /** i18n key under entityCreate.hint.* */
  hintKey?: string;
  /** for select fields */
  options?: SelectOption[];
  /** for slider fields */
  min?: number; max?: number; step?: number;
}

// Validation error code → entityCreate.error.* key.
function mapErrorKey(raw: string): string {
  switch (raw) {
    case "required": return "entityCreate.error.required";
    case "name length must be 3-120": return "entityCreate.error.nameLength";
    case "must be slug format": return "entityCreate.error.slugFormat";
    case "at least 1 required": return "entityCreate.error.atLeastOnePersona";
    case "must be > 0": return "entityCreate.error.gtZero";
    case "must be in (0, 1]": return "entityCreate.error.riskBudgetRange";
    case "format YYYY-Qn": return "entityCreate.error.quarterFormat";
    case "invalid option": return "entityCreate.error.invalidOption";
    default: return raw; // surface raw if not mapped
  }
}

const blankInput = (entity: CreatableEntity): Record<string, unknown> => {
  const base = { name: "", owner: "you", memo: "" };
  switch (entity) {
    case "strategy": return { ...base, alpha: "", capitalPoolId: "", personaIds: [] as string[] };
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

const personaArchetypeOptions: SelectOption[] = PERSONA_ARCHETYPES.map((value) => ({
  value,
  labelKey: `personaArchetype.${value === "red_team" ? "redTeam" : value}`,
}));

function entityFields(entity: CreatableEntity): FieldDef[] {
  const baseName: FieldDef = { name: "name", labelKey: "name", type: "text", required: true };
  const owner: FieldDef = { name: "owner", labelKey: "owner", type: "text" };
  const memo: FieldDef = { name: "memo", labelKey: "memo", type: "textarea" };
  switch (entity) {
    case "strategy":
      return [
        baseName, owner,
        { name: "alpha", labelKey: "alpha", type: "text", required: true, placeholderKey: "alpha", hintKey: "alpha" },
        { name: "capitalPoolId", labelKey: "capitalPoolId", type: "text", required: true },
        { name: "personaIds", labelKey: "personaIds", type: "multi-tag", required: true, hintKey: "personaIds" },
        memo,
      ];
    case "persona":
      return [
        baseName, owner,
        { name: "archetype", labelKey: "archetype", type: "select", required: true, placeholderKey: "personaArchetype", hintKey: "archetype", options: personaArchetypeOptions },
        { name: "description", labelKey: "description", type: "textarea" },
        { name: "initialMode", labelKey: "initialMode", type: "select", hintKey: "initialMode", options: [
          { value: "shadow", labelKey: "initialMode.shadow" },
          { value: "suspended", labelKey: "initialMode.suspended" },
        ] },
        memo,
      ];
    case "capitalPool":
      return [
        baseName, owner,
        { name: "currency", labelKey: "currency", type: "select", required: true, options: [
          { value: "USD", labelKey: "currency.USD" },
          { value: "USDT", labelKey: "currency.USDT" },
          { value: "TWD", labelKey: "currency.TWD" },
        ] },
        { name: "allocated", labelKey: "allocated", type: "number", required: true },
        { name: "riskBudget", labelKey: "riskBudget", type: "slider", required: true,
          min: 0, max: 1, step: 0.01, hintKey: "riskBudget" },
        memo,
      ];
    case "rankingFormula":
      return [
        baseName, owner,
        { name: "expression", labelKey: "expression", type: "text", required: true, placeholderKey: "expression" },
        memo,
      ];
    case "rebalance":
      return [
        baseName, owner,
        { name: "quarter", labelKey: "quarter", type: "text", required: true, placeholderKey: "quarter", hintKey: "quarter" },
        { name: "targetPoolId", labelKey: "targetPoolId", type: "text", required: true },
        { name: "proposedDelta", labelKey: "proposedDelta", type: "number" },
        memo,
      ];
    case "deployment":
      return [
        baseName, owner,
        { name: "strategyId", labelKey: "strategyId", type: "text", required: true },
        { name: "artifactId", labelKey: "artifactId", type: "text", required: true },
        { name: "target", labelKey: "target", type: "select", required: true, options: [
          { value: "research", labelKey: "target.research" },
          { value: "paper", labelKey: "target.paper" },
          { value: "live", labelKey: "target.live" },
        ] },
        { name: "version", labelKey: "version", type: "text", required: true, placeholderKey: "version" },
        { name: "previousVersion", labelKey: "previousVersion", type: "text" },
        memo,
      ];
    case "evolutionProgram":
      return [
        baseName, owner,
        { name: "parentAlpha", labelKey: "parentAlpha", type: "text", required: true },
        { name: "population", labelKey: "population", type: "number", required: true },
        memo,
      ];
    case "researchExperiment":
      return [
        baseName, owner,
        { name: "hypothesis", labelKey: "hypothesis", type: "textarea", required: true },
        { name: "metric", labelKey: "metric", type: "text", required: true },
        memo,
      ];
    case "artifact":
      return [
        baseName, owner,
        { name: "kind", labelKey: "kind", type: "select", required: true, options: [
          { value: "model", labelKey: "kind.model" },
          { value: "dataset", labelKey: "kind.dataset" },
          { value: "report", labelKey: "kind.report" },
          { value: "container", labelKey: "kind.container" },
        ] },
        { name: "version", labelKey: "version", type: "text", required: true, placeholderKey: "version" },
        { name: "sourceExperimentId", labelKey: "sourceExperimentId", type: "text" },
        memo,
      ];
  }
}

export const EntityCreateDrawer = ({ entity, open, onOpenChange, onCreated }: Props) => {
  const t = useT();
  const { toast } = useToast();
  const errIdBase = useId();
  const [form, setForm] = useState<Record<string, unknown>>(() => blankInput(entity));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // C3 — stable idempotencyKey per drawer-open; reset when drawer reopens.
  const idemRef = useRef<string>(idempotencyKey());
  const lastSubmitAtRef = useRef<number>(0);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(blankInput(entity));
      setErrors({});
      idemRef.current = idempotencyKey();
      lastSubmitAtRef.current = 0;
      setCooldownMs(0);
      setSubmitting(false);
    }
  }, [open, entity]);

  // tick cooldown countdown
  useEffect(() => {
    if (cooldownMs <= 0) return;
    const h = setTimeout(() => setCooldownMs((v) => Math.max(0, v - 250)), 250);
    return () => clearTimeout(h);
  }, [cooldownMs]);

  const fields = useMemo(() => entityFields(entity), [entity]);
  const setField = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (submitting) return;
    const now = Date.now();
    const sinceLast = now - lastSubmitAtRef.current;
    if (lastSubmitAtRef.current > 0 && sinceLast < CONFIRM_COOLDOWN_MS) {
      const remain = CONFIRM_COOLDOWN_MS - sinceLast;
      setCooldownMs(remain);
      toast({
        title: t("entityCreate.cooldown.title"),
        description: t("entityCreate.cooldown.desc", { ms: remain }),
      });
      return;
    }
    // numbers already coerced via slider/number handlers; multi-tag already array.
    const r = validateCreate(entity, form as never);
    if (!r.ok) {
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.errors)) mapped[k] = mapErrorKey(v);
      setErrors(mapped);
      return;
    }
    setSubmitting(true);
    try {
      const result = await createEntityFromInput(entity, form as never, { idempotencyKey: idemRef.current });
      lastSubmitAtRef.current = now;
      setCooldownMs(CONFIRM_COOLDOWN_MS);
      toast({
        title: `${t("actions.create")} — ${t(`entityCreate.entity.${entity}`)}`,
        description: String(result.data.name ?? result.data.id),
      });
      onCreated?.(result.data, result);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: t("errors.UNKNOWN_ERROR"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (f: FieldDef) => {
    const inputId = `${errIdBase}-${f.name}`;
    const errorId = `${inputId}-err`;
    const hintId = f.hintKey ? `${inputId}-hint` : undefined;
    const errKey = errors[f.name];
    const describedBy = [errKey ? errorId : null, hintId].filter(Boolean).join(" ") || undefined;
    const value = form[f.name];

    const labelNode = (
      <Label htmlFor={inputId} className="text-xs">
        {t(`entityCreate.field.${f.labelKey}`)}
        {f.required && (
          <span className="text-status-failed" aria-label={t("entityCreate.required")}> *</span>
        )}
      </Label>
    );

    let control: React.ReactNode;
    switch (f.type) {
      case "textarea":
        control = (
          <Textarea id={inputId} rows={2}
            aria-invalid={!!errKey} aria-describedby={describedBy}
            value={String(value ?? "")}
            onChange={(e) => setField(f.name, e.target.value)} />
        );
        break;
      case "number":
        control = (
          <Input id={inputId} type="number" inputMode="decimal"
            aria-invalid={!!errKey} aria-describedby={describedBy}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => setField(f.name, e.target.value === "" ? "" : Number(e.target.value))} />
        );
        break;
      case "select":
        control = (
          <Select value={String(value ?? "")} onValueChange={(v) => setField(f.name, v)}>
            <SelectTrigger id={inputId} aria-invalid={!!errKey} aria-describedby={describedBy}>
              <SelectValue placeholder={f.placeholderKey ? t(`entityCreate.placeholder.${f.placeholderKey}`) : undefined} />
            </SelectTrigger>
            <SelectContent>
              {f.options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(`entityCreate.select.${o.labelKey}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        break;
      case "slider": {
        const num = typeof value === "number" ? value : Number(value ?? 0);
        control = (
          <div className="space-y-2">
            <Slider
              id={inputId}
              min={f.min ?? 0} max={f.max ?? 1} step={f.step ?? 0.01}
              value={[num]}
              onValueChange={(v) => setField(f.name, v[0])}
              aria-describedby={describedBy}
              aria-label={t(`entityCreate.field.${f.labelKey}`)}
            />
            <div className="text-xs text-muted-foreground tabular-nums">{num.toFixed(2)}</div>
          </div>
        );
        break;
      }
      case "multi-tag": {
        const tags: string[] = Array.isArray(value) ? (value as string[]) : [];
        control = (
          <MultiTagInput
            id={inputId}
            value={tags}
            onChange={(v) => setField(f.name, v)}
            describedBy={describedBy}
            invalid={!!errKey}
          />
        );
        break;
      }
      default:
        control = (
          <Input id={inputId} type="text"
            aria-invalid={!!errKey} aria-describedby={describedBy}
            value={String(value ?? "")}
            placeholder={f.placeholderKey ? t(`entityCreate.placeholder.${f.placeholderKey}`) : undefined}
            onChange={(e) => setField(f.name, e.target.value)} />
        );
    }

    return (
      <div key={f.name} className="space-y-1">
        {labelNode}
        {control}
        {hintId && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {t(`entityCreate.hint.${f.hintKey}`)}
          </p>
        )}
        {errKey && (
          <p id={errorId} role="alert" className="text-xs text-status-failed">
            {t(errKey, { defaultValue: errKey })}
          </p>
        )}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {t("actions.create")} — {t(`entityCreate.entity.${entity}`)}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {t("entityCreate.footerNote")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 py-4">
          {fields.map(renderField)}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={submit} disabled={cooldownMs > 0 || submitting} aria-describedby={cooldownMs > 0 ? `${errIdBase}-cooldown` : undefined}>
            {submitting ? t("common.loading") : cooldownMs > 0 ? t("entityCreate.cooldown.button", { s: (cooldownMs / 1000).toFixed(1) }) : t("actions.create")}
          </Button>
          {cooldownMs > 0 && (
            <span id={`${errIdBase}-cooldown`} className="sr-only" role="status">
              {t("entityCreate.cooldown.desc", { ms: cooldownMs })}
            </span>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

// --- helpers -------------------------------------------------------------

interface MultiTagInputProps {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  describedBy?: string;
  invalid?: boolean;
}

const MultiTagInput = ({ id, value, onChange, describedBy, invalid }: MultiTagInputProps) => {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    if (value.includes(t)) { setDraft(""); return; }
    onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className={cn("rounded-md border bg-background px-2 py-1.5 flex flex-wrap items-center gap-1",
      invalid && "border-status-failed")}>
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1">
          <span className="text-xs">{tag}</span>
          <button
            type="button"
            aria-label={`remove ${tag}`}
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="flex-1 min-w-[8ch] bg-transparent text-sm outline-none px-1 py-0.5"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
      />
    </div>
  );
};
