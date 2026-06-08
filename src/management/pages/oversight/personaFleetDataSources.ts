import type { ManagementDataSource, ManagementPersonaFleetRow } from "@/lib/bff-v1/management";

function providerStatusPriority(source: ManagementDataSource): number {
  const status = String(source.status ?? "").toLowerCase();
  if (/read_ok|readback_ok|smoke_ok/.test(status)) return 0;
  if (/partial/.test(status)) return 1;
  if (/unavailable|credential/.test(status)) return 3;
  return 2;
}

export function visibleDataSources(r: ManagementPersonaFleetRow): ManagementDataSource[] {
  return [...(r.dataSources ?? [])]
    .map((source, index) => ({ source, index }))
    .sort((a, b) => (
      providerStatusPriority(a.source) - providerStatusPriority(b.source)
      || a.index - b.index
    ))
    .map(({ source }) => source)
    .slice(0, 4);
}
