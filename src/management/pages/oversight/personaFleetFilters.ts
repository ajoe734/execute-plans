import type { ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

const KNOWN_DEMO_PERSONA_IDS = new Set([
  "persona-crypto",
  "persona-us-equity",
  "persona-tw-equity",
]);

const NON_PRODUCTION_PATTERNS = [
  /\bdemo\b/i,
  /\bmock\b/i,
  /\bfixture\b/i,
  /\bsample\b/i,
  /\btest\b/i,
  /dry[-_ ]?run/i,
  /deploy[-_ ]?smoke/i,
  /\bsmoke persona\b/i,
  /^dev[-_ ]?probe/i,
];

function nonProductionTokens(row: ManagementPersonaFleetRow): string[] {
  return [
    row.personaId,
    row.personaName,
    row.currentWork,
    row.state,
    ...(row.tags ?? []),
    ...(row.currentResearchProjects ?? []).flatMap((project) => [
      project.projectId,
      project.title,
      project.status,
    ]),
  ].filter((token): token is string => Boolean(token));
}

export function isNonProductionPersonaFleetRow(row: ManagementPersonaFleetRow): boolean {
  if (KNOWN_DEMO_PERSONA_IDS.has(row.personaId)) return true;

  const raw = row as ManagementPersonaFleetRow & { capital_mode?: string; capital_pool?: { mode?: string } };
  const capMode = String(row.capitalMode ?? raw.capital_mode ?? row.capitalPool?.mode ?? raw.capital_pool?.mode ?? "").trim().toLowerCase();
  if (capMode === "paper") return true;

  return nonProductionTokens(row).some((token) =>
    NON_PRODUCTION_PATTERNS.some((pattern) => pattern.test(token)),
  );
}

export function productionPersonaFleetRows(rows: ManagementPersonaFleetRow[]): ManagementPersonaFleetRow[] {
  return rows.filter((row) => !isNonProductionPersonaFleetRow(row));
}
