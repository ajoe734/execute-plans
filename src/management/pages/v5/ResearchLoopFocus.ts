import type { LoopRun } from "@/lib/v5";

const cleanText = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const containsToken = (needle: string, values: unknown[]): boolean => {
  const normalized = needle.trim().toLowerCase();
  return values
    .map((value) => cleanText(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value))
    .some((value) => value === normalized || value.includes(normalized));
};

export function filterResearchLoopRunsForFocus(
  items: LoopRun[],
  focus: { personaFocus?: string; projectFocus?: string },
): { items: LoopRun[]; matched: boolean } {
  let scoped = items;
  let matched = true;
  const projectFocus = focus.projectFocus?.trim() ?? "";
  const personaFocus = focus.personaFocus?.trim() ?? "";

  if (projectFocus) {
    const next = scoped.filter((r) => containsToken(projectFocus, [r.id, r.subjectId, r.subjectName, r.triggeredBy]));
    matched = matched && next.length > 0;
    scoped = next;
  }
  if (personaFocus) {
    const next = scoped.filter((r) => containsToken(personaFocus, [r.subjectId, r.subjectName, r.triggeredBy]));
    matched = matched && next.length > 0;
    scoped = next;
  }

  return { items: scoped, matched };
}
