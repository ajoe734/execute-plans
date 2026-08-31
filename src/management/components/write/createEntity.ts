import { createPersona } from "@/lib/bff-v1/personas";
import { buildEntity } from "@/lib/writeIntents/createDefaults";
import {
  durableCreateOwner,
  type CreatableEntity,
  type CreateInputMap,
} from "@/lib/writeIntents/types";

export type CreatePersistence = "bff";

export interface CreateEntityOptions {
  idempotencyKey?: string;
}

export interface CreateEntityResult {
  entity: CreatableEntity;
  data: Record<string, unknown>;
  persistence: CreatePersistence;
}

export type EntityMutationOperation = "create" | "update" | "delete";

export class UnsupportedEntityMutationError extends Error {
  readonly code = "DURABLE_WRITE_OWNER_REQUIRED";

  constructor(
    readonly entity: CreatableEntity,
    readonly operation: EntityMutationOperation,
  ) {
    super(
      `${operation} is disabled for ${entity}: no typed durable BFF owner is registered.`,
    );
    this.name = "UnsupportedEntityMutationError";
  }
}

export async function createEntityFromInput<K extends CreatableEntity>(
  entity: K,
  input: CreateInputMap[K],
  opts: CreateEntityOptions = {},
): Promise<CreateEntityResult> {
  if (durableCreateOwner(entity) === undefined || entity !== "persona") {
    throw new UnsupportedEntityMutationError(entity, "create");
  }

  const built = buildEntity(entity, input);
  const personaInput = input as CreateInputMap["persona"];
  const data = await createPersona({
    ...built,
    description: personaInput.description,
    memo: personaInput.memo,
    initialMode: personaInput.initialMode ?? "paper",
  }, { idempotencyKey: opts.idempotencyKey });
  return { entity, data: data as unknown as Record<string, unknown>, persistence: "bff" };
}

/**
 * Generic update remains unavailable until an entity-specific typed owner is
 * registered. In particular, the legacy Persona "edit" action is not a live
 * contract and must not degrade to an overlay patch.
 */
export async function updateEntityFromInput<K extends CreatableEntity>(
  entity: K,
  _id: string,
  _input: CreateInputMap[K],
  _opts: CreateEntityOptions = {},
): Promise<CreateEntityResult> {
  throw new UnsupportedEntityMutationError(entity, "update");
}

/** Soft-delete an entity.
 *  Persona is an audit entity per Pack D StateMachine Contract (D02) — physical delete is
 *  forbidden because it would break the audit evidence chain (D26 EvidenceKind.persona +
 *  v4/auditImmutability assertAppendOnly). Use the `retire` lifecycle action instead:
 *    runPersonaAction(id, "retire", { memo, confirmToken })
 *  This is wired into PersonaDetail's "Retire" button via HighRiskConfirm. */
export async function deleteEntity(
  entity: CreatableEntity,
  _id: string,
  _opts: CreateEntityOptions & { memo?: string; confirmToken?: string } = {},
): Promise<CreatePersistence> {
  if (entity === "persona") {
    throw new Error(
      "Persona is an audit entity and cannot be deleted. Use `runPersonaAction(id, 'retire', ...)` to archive it (terminal state, audit retained 7 years).",
    );
  }
  throw new UnsupportedEntityMutationError(entity, "delete");
}
