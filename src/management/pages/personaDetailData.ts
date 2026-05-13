import type { Persona } from "@/lib/bff/types";
import { getPersona } from "@/lib/bff-v1/personas";

export const resolvePersonaForDetail = async (id: string): Promise<Persona | undefined> => {
  return getPersona(id);
};
