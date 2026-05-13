import { createPersona } from "@/lib/bff-v1/personas";
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
