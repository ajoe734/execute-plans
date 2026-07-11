import { createPersona, runPersonaAction } from "@/lib/bff-v1/personas";
import { writeOverlay } from "@/lib/bff/writeOverlay";
import { buildEntity } from "@/lib/writeIntents/createDefaults";
import type { CreatableEntity, CreateInputMap } from "@/lib/writeIntents/types";

export type CreatePersistence = "bff" | "overlay";

export interface CreateEntityOptions {
  idempotencyKey?: string;
}

export interface CreateEntityResult {
  entity: CreatableEntity;
  data: Record<string, unknown>;
  persistence: CreatePersistence;
  /** True when BFF write failed and we fell back to overlay. */
  degraded?: boolean;
  /** When degraded, holds the typed error envelope for drawer display. */
  error?: { status?: number; code?: string; message?: string };
}

export async function createEntityFromInput<K extends CreatableEntity>(
  entity: K,
  input: CreateInputMap[K],
  opts: CreateEntityOptions = {},
): Promise<CreateEntityResult> {
  const built = buildEntity(entity, input);

  if (entity === "persona") {
    const personaInput = input as CreateInputMap["persona"];
    const data = await createPersona({
      ...built,
      description: personaInput.description,
      memo: personaInput.memo,
      initialMode: personaInput.initialMode,
    }, { idempotencyKey: opts.idempotencyKey });
    return { entity, data: data as unknown as Record<string, unknown>, persistence: "bff" };
  }

  writeOverlay.add(entity, built, { idempotencyKey: opts.idempotencyKey });
  return { entity, data: built, persistence: "overlay" };
}


/** Update an entity. For persona, tries BFF "edit" action then falls back to overlay patch.
 *  All other entities are overlay-only for now (pending BFF endpoints). */
export async function updateEntityFromInput<K extends CreatableEntity>(
  entity: K,
  id: string,
  input: CreateInputMap[K],
  opts: CreateEntityOptions = {},
): Promise<CreateEntityResult> {
  const patch = buildEntity(entity, input);
  // Strip auto-generated id from create defaults so we patch the actual entity id.
  const { id: _ignore, createdAt: _c, ...clean } = patch as Record<string, unknown>;
  void _ignore; void _c;

  if (entity === "persona") {
    if (!(input as CreateInputMap["persona"]).initialMode) {
      delete clean.state;
      delete clean.lifecycleStatus;
      delete clean.executionMode;
      delete clean.capitalMode;
      delete clean.deploymentStage;
      delete clean.liveCapitalEnabled;
      delete clean.orderSideEffectsAllowed;
      delete clean.capitalSideEffectsAllowed;
    }
    try {
      const data = await runPersonaAction(id, "edit", clean, { idempotencyKey: opts.idempotencyKey });
      writeOverlay.update(entity, id, clean, { idempotencyKey: opts.idempotencyKey });
      return { entity, data: { id, ...clean, ...(data as Record<string, unknown>) }, persistence: "bff" };
    } catch {
      // BFF edit not available — fall through to overlay patch.
    }
  }

  writeOverlay.update(entity, id, clean, { idempotencyKey: opts.idempotencyKey });
  return { entity, data: { id, ...clean }, persistence: "overlay" };
}

/** Soft-delete an entity.
 *  Persona is an audit entity per Pack D StateMachine Contract (D02) — physical delete is
 *  forbidden because it would break the audit evidence chain (D26 EvidenceKind.persona +
 *  v4/auditImmutability assertAppendOnly). Use the `retire` lifecycle action instead:
 *    runPersonaAction(id, "retire", { memo, confirmToken })
 *  This is wired into PersonaDetail's "Retire" button via HighRiskConfirm. */
export async function deleteEntity(
  entity: CreatableEntity,
  id: string,
  opts: CreateEntityOptions & { memo?: string; confirmToken?: string } = {},
): Promise<CreatePersistence> {
  if (entity === "persona") {
    throw new Error(
      "Persona is an audit entity and cannot be deleted. Use `runPersonaAction(id, 'retire', ...)` to archive it (terminal state, audit retained 7 years).",
    );
  }
  writeOverlay.softDelete(entity, id, { idempotencyKey: opts.idempotencyKey });
  return "overlay";
}
