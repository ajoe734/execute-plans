// BFF Contract v1 — management shell summary façade (MGMT-LOAD-003).
// Wraps GET /bff/management/shell-summary: cheap badge counts + session +
// transport, so the global shell (TopBar) never has to fan out to the full
// approvals/alerts/jobs list endpoints just to render a count.

import { paths } from "./paths";
import { bffFetch } from "./client";
import { liveStatus } from "./liveStatus";

export interface ShellSummaryCounts {
  pendingApprovals: number;
  openAlerts: number;
  runningJobs: number;
}

export type ShellSummarySurfaceStatus = "ok" | "degraded" | "unavailable" | "unknown";

export interface ShellSummarySurface {
  status: ShellSummarySurfaceStatus;
  source?: string;
  message?: string;
}

export interface ShellSummaryResponse {
  counts: ShellSummaryCounts;
  session: Record<string, unknown>;
  transport: Record<string, unknown>;
  snapshotAt?: string;
  surfaces: Record<string, ShellSummarySurface>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSurfaceStatus(value: unknown): ShellSummarySurfaceStatus {
  const status = String(value ?? "").trim().toLowerCase();
  return status === "ok" || status === "degraded" || status === "unavailable" ? status : "unknown";
}

function normalizeSurface(value: unknown): ShellSummarySurface {
  const record = asRecord(value);
  return {
    status: normalizeSurfaceStatus(record?.status),
    source: typeof record?.source === "string" ? record.source : undefined,
    message: typeof record?.message === "string" ? record.message : undefined,
  };
}

/** Mock/offline shell summary — zeroed counts, unknown surface (never claims "ok"). */
function mockShellSummary(): ShellSummaryResponse {
  return {
    counts: { pendingApprovals: 0, openAlerts: 0, runningJobs: 0 },
    session: {},
    transport: { bffStatus: "mock", service: "execute-plans-mock-bff" },
    surfaces: { shell_summary: { status: "unknown", source: "mock" } },
  };
}

function adaptShellSummary(raw: unknown): ShellSummaryResponse {
  const record = asRecord(raw);
  const data = asRecord(record?.data) ?? {};
  const meta = asRecord(record?.meta) ?? {};
  const counts = asRecord(data.counts) ?? {};
  const rawSurfaces = asRecord(meta.surfaces) ?? {};

  const surfaces: Record<string, ShellSummarySurface> = {};
  for (const [key, value] of Object.entries(rawSurfaces)) surfaces[key] = normalizeSurface(value);

  return {
    counts: {
      pendingApprovals: numberOr(counts.pending_approvals),
      openAlerts: numberOr(counts.open_alerts),
      runningJobs: numberOr(counts.running_jobs),
    },
    session: asRecord(data.session) ?? {},
    transport: asRecord(data.transport) ?? {},
    snapshotAt: typeof meta.snapshot_at === "string" ? meta.snapshot_at : undefined,
    surfaces,
  };
}

// Deliberately NOT `withLiveOrMock`: this is one narrow badge-count read
// among many, and a transport hiccup here must not flip the shared
// `liveStatus` transport signal — other live reads (full approvals/alerts/
// jobs lists) may still be perfectly healthy even when shell-summary itself
// is down. Reporting through the shared signal would spuriously re-run
// every effect keyed on it (including this one), double-fetching on every
// transient blip. TopBar treats a failure here as a local "unknown"/
// "unavailable" signal and defers to the full-list fallback instead.
export async function fetchShellSummary(): Promise<ShellSummaryResponse> {
  if (liveStatus.get().mode !== "live") return mockShellSummary();
  try {
    const data = await bffFetch<unknown>({ method: "GET", path: paths.mgmtShellSummary(), mode: "live" });
    return adaptShellSummary(data);
  } catch {
    return mockShellSummary();
  }
}

/** Composed shell-summary health; only "ok" counts as truly live/cheap. */
export function shellSummaryStatus(summary: ShellSummaryResponse): ShellSummarySurfaceStatus {
  return summary.surfaces.shell_summary?.status ?? "unknown";
}
