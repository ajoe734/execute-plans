import { bff } from "@/lib/bff-v1";
import { writeOverlay } from "@/lib/bff/writeOverlay";
import type { Persona } from "@/lib/bff/types";

export const resolvePersonaForDetail = async (id: string): Promise<Persona | undefined> => {
  const overlayPersona = writeOverlay.get<Persona>("persona", id);
  if (overlayPersona) return overlayPersona;
  return bff.personas.get(id);
};
