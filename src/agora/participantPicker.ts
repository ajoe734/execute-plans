import type { PersonaEligibility } from "@/lib/bff-v1/agora/interaction";

export type WorkshopParticipantPicker = "named" | "recommended" | "eligible-one" | "eligible-two" | "eligible-three";

export function pickerParticipants(
  picker: WorkshopParticipantPicker,
  included: PersonaEligibility[],
  preferred: string[] = [],
): string[] {
  const eligibleIds = new Set(included.map((item) => item.persona_id));
  const preserved = preferred.filter((id) => eligibleIds.has(id));
  if (picker === "named") return preserved;
  const recommended = included.filter((item) => item.recommended).map((item) => item.persona_id);
  const eligible = included.map((item) => item.persona_id);
  const candidates = picker === "recommended" && recommended.length ? recommended : eligible;
  if (picker === "eligible-one") return candidates.slice(0, 1);
  if (picker === "eligible-two") return candidates.slice(0, 2);
  return candidates.slice(0, 3);
}
