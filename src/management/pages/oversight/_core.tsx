// 2026-05-20 revamp §6 — Core 7 Oversight pages (Phase 1).
// Cockpit renders the canonical BFF aggregate; missing Loops/OODA projections
// stay unavailable instead of being filled from the legacy seed view model.
//
// PersonaIntent + readiness pages live in their own files.

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { agentPanel } from "@/management/components/agent/useAgentPanel";
import type { QuarterlyRankingFormula, QuarterlyRankingRow, QuarterlySnapshot } from "@/lib/v5/management/quarterlyRanking";
import { TotalCapitalSnapshot } from "@/management/components/cockpit/TotalCapitalSnapshot";
import { PersonaLeagueSnapshot } from "@/management/components/cockpit/PersonaLeagueSnapshot";
import { QuarterlyRankingCountdown } from "@/management/components/cockpit/QuarterlyRankingCountdown";
import { DataSourceHealthSnapshot } from "@/management/components/cockpit/DataSourceHealthSnapshot";
import { OpenClawLlmAuthPanel } from "@/management/components/openclaw/OpenClawLlmAuthPanel";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";
import { tradeJourneyHref } from "@/management/navigation/tradeJourneyLinks";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import {
  formatLocalizedIncidentSummary,
  isRawEvidenceSummaryText,
  reasonCodeDisplay,
  resolveBffSubjectDisplay,
  resolveEnumLabel,
  statusLabel,
} from "@/lib/enumLabels";
import {
  HUMAN_INBOX_KINDS,
  humanInboxRank,
  type HumanInboxItem,
  type HumanInboxList,
  type HumanInboxMeetingAction,
} from "@/lib/v5/management/humanInbox";
import type { MeetingActionItem } from "@/lib/bff-v1/meetings";
import { MeetingActionResponseCard } from "@/management/pages/meetings/MeetingActionCards";
import { mgmt } from "@/lib/bff-v1";
import {
  adaptEvolutionJournalList,
  type ManagementEvidenceDetail,
  type ManagementEvidenceAllowedActions,
  type ManagementEvidenceAuditEvent,
  type ManagementEvidenceChain,
  type ManagementEvidenceLinkedDecision,
  type ManagementEvidenceListItem,
  type ManagementEvidenceMeta,
  type ManagementEvidenceOperation,
  type ManagementEvidenceOverview,
  type ManagementEvidenceRelationships,
  type ManagementEvidenceResolvedLink,
  type ManagementEvidenceTask,
  type ManagementEvolutionJournalAutoProposalCounts,
  type ManagementEvolutionJournalMeta,
  type ManagementEvolutionJournalPageInfo,
  type ManagementEvolutionJournalSummary,
  type ManagementPersonaFleetRow,
  type ManagementTradingPulseLatestOutcome,
  type ManagementTradingPulseModel,
  type ManagementTradingPulsePnlGroup,
  type ManagementTradingPulseRuntimeRow,
  type TradingPulseComparisonScope,
  type TradingPulseRankBlock,
  type TradingPulseRankRow,
} from "@/lib/bff-v1/management";
import {
  submitEvidenceOperation,
  type EvidenceOperationAction,
} from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { isNotFoundError } from "@/lib/bff-v1/useLiveDetail";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  dataSourceLiveEnabled,
  dataSourceOrderSideEffectsAllowed,
  dataSourceProviderCount,
  dataSourceProviderStatusCounts,
  dataSourceProviderStatuses,
  dataSourceState,
  visibleDataSources,
} from "./personaFleetDataSources";
import {
  PERSONA_FLEET_PAGE_SIZE,
  personaFleetArchivedFromParams,
  personaFleetPurposeFromParams,
  personaFleetDataFilterFromParams,
  personaFleetQuery,
  productionPersonaFleetRows,
} from "./personaFleetFilters";
import {
  personaFleetArtifactHref,
  personaFleetCapitalHref,
  personaFleetDataSourcesHref,
  personaFleetHumanGateHref,
  personaFleetMutationHref,
  personaFleetOodaHref,
  personaFleetOnboardingHref,
  personaFleetPerformanceHref,
  personaFleetPersonaHref,
  personaFleetRankHref,
  personaFleetResearchHref,
  personaFleetResearchLoopHref,
  personaFleetResearchItems,
  personaFleetRuntimeHref,
  type PersonaFleetResearchItem,
} from "./personaFleetLinks";
import {
  cleanJournalFieldText,
  diffPoolMembers,
  filterEvolutionJournalRowsForFocus,
  journalFieldText,
  normalizePoolMembers,
  normalizeEvolutionFocusToken,
  normalizeEvolutionJournalView,
  type EvolutionJournalView,
} from "./evolutionJournalFocus";
import { safeDateTime } from "@/lib/utils";
import { markRoutePrimaryReady } from "@/platform/routePrimaryReady";

// =====================================================================
// Pathreon Management Cockpit (PM-3)
// =====================================================================

function LiveOnlyNotice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
        {action}
      </div>
    </Card>
  );
}

function currentQuarterId(today = new Date()): string {
  const year = today.getFullYear();
  const quarter = Math.floor(today.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

function quarterCutoffDate(quarterId: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarterId);
  if (!match) return "—";
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const cutoff = new Date(Date.UTC(year, quarter * 3, 0));
  return cutoff.toISOString().slice(0, 10);
}

function daysUntil(dateText: string): number {
  const cutoff = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(cutoff.getTime())) return 0;
  const now = new Date();
  return Math.max(0, Math.ceil((cutoff.getTime() - now.getTime()) / 86_400_000));
}

function quarterlySnapshotFromLive(
  rows: QuarterlyRankingRow[] | undefined,
  formula: QuarterlyRankingFormula | undefined,
): QuarterlySnapshot | undefined {
  // Rows are the only source of counts; a formula arriving first must not look like 0/0/0.
  if (!rows) return undefined;
  const rowList = rows;
  const quarter = rowList.find((row) => row.quarter)?.quarter ?? currentQuarterId();
  const cutoffDate = quarterCutoffDate(quarter);
  return {
    quarter,
    cutoffDate,
    daysRemaining: daysUntil(cutoffDate),
    eligiblePersonas: rowList.filter((row) => row.eligibility === "eligible").length,
    disqualifiedPersonas: rowList.filter((row) => row.eligibility === "disqualified" || row.eligibility === "insufficient_data").length,
    pendingEvidenceGaps: rowList.filter((row) => (row.evidenceRefs ?? []).length === 0).length,
    formulaVersion: formula?.version ?? "—",
  };
}

export const OneRingCockpitPage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: model, loading } = useV5Live((signal) => mgmt.cockpit.getLiveOnly({ signal }), [], { cacheKey: "oversight.cockpit" });
  const { data: pSummary, loading: pSummaryLoading, error: pSummaryError = null } = useV5Live((signal) => mgmt.portfolioBook.summaryLiveOnly({ signal }), [], { cacheKey: "oversight.portfolioBook.summary" });
  const { data: league, loading: leagueLoading, error: leagueError = null } = useV5Live((signal) => mgmt.personaLeague.rankingsLiveOnly({ signal, criteria: "overall", limit: 200 }), [], { cacheKey: "oversight.personaLeague.rankings" });
  const { data: leagueInventory, loading: inventoryLoading, error: inventoryError = null } = useV5Live((signal) => mgmt.personaLeague.inventoryLiveOnly({ signal }), [], { cacheKey: "oversight.personaLeague.inventory" });
  const { data: quarterlyRows, loading: quarterlyRowsLoading, error: quarterlyRowsError = null } = useV5Live((signal) => mgmt.quarterlyRanking.listLiveOnly(undefined, undefined, { signal }), [], { cacheKey: "oversight.quarterlyRanking.list" });
  const { data: quarterlyFormula, error: quarterlyFormulaError = null } = useV5Live((signal) => mgmt.quarterlyRanking.formulaLiveOnly({ signal }), [], { cacheKey: "oversight.quarterlyRanking.formula" });
  const { data: fleetRows, loading: fleetLoading, error: fleetError = null } = useV5Live((signal) => mgmt.personaFleet.get({}, { signal }), [], { cacheKey: "oversight.personaFleet" });
  const productionFleetRows = useMemo(() => productionPersonaFleetRows(fleetRows ?? []), [fleetRows]);
  const quarterlySnapshot = useMemo(
    () => quarterlySnapshotFromLive(quarterlyRows, quarterlyFormula),
    [quarterlyFormula, quarterlyRows],
  );

  const staleNote = (testId: string, error: unknown) =>
    error ? (
      <p className="text-xs text-status-warning" data-testid={testId}>
        Latest read failed; the values above are retained from an earlier successful read and may be stale.
      </p>
    ) : null;
  const loadingBody = t("mgmt.liveOnly.loadingBody", { defaultValue: "Waiting for live BFF data." });
  const unavailableTitle = t("mgmt.liveOnly.unavailableTitle", { defaultValue: "Live data unavailable" });
  const unavailableBody = t("mgmt.liveOnly.unavailableBody", {
    defaultValue: "This page does not render seed, demo, or non-production fallback data.",
  });

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.cockpit.title")}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.cockpit.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.cockpit.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link aria-label="cockpit trade journeys" to={tradeJourneyHref(location, {}, t("mgmt.cockpit.title"))}>
              {t("nav.tradeJourneys", { defaultValue: "Trade Journeys" })}
            </Link>
          </Button>
          <Button size="sm" variant="default" onClick={() => agentPanel.open()}>
            💬 詢問 AI Management
          </Button>
        </div>
      </header>
      {!model && (
        <LiveOnlyNotice
          title={loading ? t("common.loading", { defaultValue: "Loading..." }) : unavailableTitle}
          body={loading ? t("mgmt.liveOnly.loadingBody", { defaultValue: "Waiting for live BFF data." }) : unavailableBody}
        />
      )}
      {model && (
        <div className="space-y-3" data-testid="cockpit-live-aggregate">
          <Card className="p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{model.health.headline ?? unavailableTitle}</h2>
              <Badge variant="outline">{model.status}</Badge>
            </div>
            {model.health.message && <p className="text-sm text-muted-foreground">{model.health.message}</p>}
            {model.message && <p className="text-sm text-status-warning">{model.message}</p>}
            {model.snapshotAt && <time className="text-xs text-muted-foreground" dateTime={model.snapshotAt}>{safeDateTime(model.snapshotAt)}</time>}
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {model.cards.map((card) => (
              <Card key={card.id} className="p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{card.label}</h3>
                  <Badge variant="outline">{card.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{card.summary ?? "—"}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
      <OpenClawLlmAuthPanel mode="summary" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {pSummary ? (
          <div className="space-y-1">
            <TotalCapitalSnapshot summary={pSummary} />
            {staleNote("capital-stale", pSummaryError)}
          </div>
        ) : (
          <LiveOnlyNotice
            title={t("mgmt.cockpit.totalCapital")}
            body={pSummaryLoading ? loadingBody : unavailableBody}
            action={<Link to={canonicalCenterUrl("performance", "overview")} className="text-xs text-primary hover:underline">{t("mgmt.actions.openDetail")} →</Link>}
          />
        )}
        {!league || (league.length === 0 && !leagueInventory && inventoryLoading) ? (
          <LiveOnlyNotice
            title={t("mgmt.cockpit.personaLeague")}
            body={leagueLoading || (league && inventoryLoading) ? loadingBody : unavailableBody}
            action={<Link to={canonicalCenterUrl("rankings", "rolling")} className="text-xs text-primary hover:underline">{t("mgmt.actions.openDetail")} →</Link>}
          />
        ) : (
          <div className="space-y-1">
            <PersonaLeagueSnapshot rows={league} inventory={leagueInventory ?? []} />
            {staleNote("persona-league-stale", leagueError ?? inventoryError)}
            {!leagueInventory && inventoryLoading && (
              <p className="text-xs text-muted-foreground" data-testid="persona-league-inventory-pending">
                Population coverage: waiting for inventory (unknown). Showing {league.length} ranked rows loaded.
              </p>
            )}
          </div>
        )}
        {quarterlySnapshot && quarterlyRows ? (
          <div className="space-y-1">
            <QuarterlyRankingCountdown snap={quarterlySnapshot} />
            <p className="text-xs text-muted-foreground" data-testid="quarterly-loaded-scope">
              已載入項目 (current returned page): {quarterlyRows.length} rows. Disqualified / Insufficient data includes insufficient_data rows; counts cover loaded items only.
            </p>
            {staleNote("quarterly-stale", quarterlyRowsError ?? quarterlyFormulaError)}
          </div>
        ) : (
          <LiveOnlyNotice
            title={t("mgmt.cockpit.quarterlyCountdown")}
            body={quarterlyRowsLoading ? `${loadingBody}${quarterlyFormula ? ` Formula ${quarterlyFormula.version} loaded; waiting for ranking rows.` : ""}` : `${unavailableBody}${quarterlyFormula ? ` Formula ${quarterlyFormula.version} loaded; ranking rows unavailable.` : ""}`}
            action={<Link to={canonicalCenterUrl("rankings", "quarterly")} className="text-xs text-primary hover:underline">{t("mgmt.actions.openDetail")} →</Link>}
          />
        )}
        {!fleetRows ? (
          <LiveOnlyNotice
            title={t("mgmt.dataSources.cockpitTitle")}
            body={fleetLoading ? loadingBody : unavailableBody}
          />
        ) : productionFleetRows.length === 0 ? (
          <LiveOnlyNotice
            title={t("mgmt.dataSources.cockpitTitle")}
            body={`已載入項目 (current returned page): ${fleetRows.length} fleet rows; none match the current production filter, so no source health is claimed.${fleetError ? " Latest read failed; this is retained from an earlier read and may be stale." : ""}`}
          />
        ) : (
          <div className="space-y-1">
            <DataSourceHealthSnapshot rows={productionFleetRows} />
            <p className="text-xs text-muted-foreground" data-testid="fleet-loaded-scope">
              已載入項目 (current returned page): {fleetRows.length} fleet rows, {productionFleetRows.length} match the current production filter.
            </p>
            {staleNote("fleet-stale", fleetError)}
          </div>
        )}
      </div>
      {model && (
        <>
          <p className="text-sm text-muted-foreground" data-testid="cockpit-projection-unavailable">
            {t("mgmt.cockpit.projectionUnavailable", { defaultValue: "Loops / OODA: the BFF has not supplied these projections. No completion counts are inferred from service health." })}
          </p>
        </>
      )}
    </section>
  );
};



// =====================================================================
// Persona Fleet
// =====================================================================

const HIDDEN_STATES = new Set(["retired", "deprecated", "archived"]);

function formatPerfDelta(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";
}

function formatToken(value?: string): string {
  return value ? value.replace(/_/g, " ") : "—";
}

function fleetCapitalMode(r: ManagementPersonaFleetRow): string {
  const raw = r as ManagementPersonaFleetRow & { capital_mode?: string; capital_pool?: { mode?: string } };
  return String(r.capitalMode ?? raw.capital_mode ?? r.capitalPool?.mode ?? raw.capital_pool?.mode ?? "").trim().toLowerCase();
}

function displayFleetState(r: ManagementPersonaFleetRow): string {
  const state = String(r.state ?? "").trim().toLowerCase();
  if (["paper_running", "canary_running", "live_running"].includes(state)) return state;
  if (["deployed", "active", "running", "ready"].includes(state)) {
    const mode = fleetCapitalMode(r) || String(r.deploymentStage ?? "").trim().toLowerCase();
    if (["paper", "canary", "live"].includes(mode)) return `${mode}_running`;
    return "paper_running";
  }
  return state;
}

type FleetCapitalBinding = {
  kind: "paper_ledger" | "canary_sleeve" | "real_sleeve" | "capital_pool" | "unbound";
  label: string;
  id?: string;
};

function fleetCapitalBinding(r: ManagementPersonaFleetRow): FleetCapitalBinding {
  const raw = r as ManagementPersonaFleetRow & {
    capital_pool_id?: string;
    paper_capital_pool_id?: string;
    legacy_paper_capital_pool_id?: string;
    paper_ledger_id?: string;
    paper_ledger?: { id?: string };
    paperLedger?: { id?: string };
  };
  const mode = fleetCapitalMode(r);
  const declaredScope = String(r.capitalScope ?? "").trim().toLowerCase();
  if (mode === "paper" || declaredScope === "paper_ledger") {
    return { kind: "paper_ledger", label: "Paper ledger", id: r.capitalScopeId
      ?? r.paperLedgerId
      ?? raw.paper_ledger_id
      ?? r.paperLedger?.id
      ?? raw.paper_ledger?.id
      ?? r.paperCapitalPoolId
      ?? raw.paper_capital_pool_id
      ?? raw.legacy_paper_capital_pool_id
      ?? r.capitalPoolId
      ?? raw.capital_pool_id };
  }
  if (mode === "canary" || declaredScope === "canary_sleeve") {
    return { kind: "canary_sleeve", label: "Canary sleeve", id: r.capitalScopeId ?? r.capitalSleeveId ?? r.capitalPoolId ?? raw.capital_pool_id ?? r.capitalPool?.id };
  }
  if (mode === "live" || declaredScope === "live_sleeve") {
    return { kind: "real_sleeve", label: "Real sleeve", id: r.capitalScopeId ?? r.capitalSleeveId ?? r.capitalPoolId ?? raw.capital_pool_id ?? r.capitalPool?.id };
  }
  const id = r.capitalScopeId ?? r.capitalPoolId ?? raw.capital_pool_id ?? r.capitalPool?.id;
  return id ? { kind: "capital_pool", label: "Capital pool", id } : { kind: "unbound", label: "Unbound" };
}

function fleetRuntimeHealth(r: ManagementPersonaFleetRow): string | undefined {
  const raw = r as ManagementPersonaFleetRow & { runtime_health?: Record<string, unknown> };
  const health = r.runtimeHealth ?? raw.runtime_health;
  if (health && typeof health.status === "string") return health.status;
  return r.runtimeBinding?.health ?? r.runtimeBinding?.state;
}

function fleetLeagueRank(r: ManagementPersonaFleetRow): number | undefined {
  const raw = r as ManagementPersonaFleetRow & { league_rank?: number; rank?: { league_rank?: number } };
  return r.leagueRank ?? raw.league_rank ?? r.rank?.leagueRank ?? raw.rank?.league_rank;
}

function fleetLeagueScore(r: ManagementPersonaFleetRow): number | undefined {
  const raw = r as ManagementPersonaFleetRow & { league_score?: number; rank?: { league_score?: number } };
  return r.leagueScore ?? raw.league_score ?? r.rank?.leagueScore ?? raw.rank?.league_score;
}

function normalizeReviewToken(value?: string | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return undefined;
  return trimmed;
}

function fleetReviewToken(r: ManagementPersonaFleetRow): string | undefined {
  const raw = r as ManagementPersonaFleetRow & {
    review_type?: string;
    review_status?: string;
    review?: { type?: string; status?: string };
  };
  return (
    normalizeReviewToken(r.reviewType ?? raw.review_type ?? raw.review?.type) ??
    normalizeReviewToken(r.reviewStatus ?? raw.review_status ?? raw.review?.status)
  );
}

function fieldLinkClass(className?: string): string {
  return [
    "font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80",
    className,
  ].filter(Boolean).join(" ");
}

function badgeLinkClass(className?: string): string {
  return [
    "cursor-pointer transition-colors",
    className,
  ].filter(Boolean).join(" ");
}

function badgeUnavailableClass(className?: string): string {
  return [
    "cursor-default border-muted text-muted-foreground",
    className,
  ].filter(Boolean).join(" ");
}

function OptionalFleetLink({
  href,
  ariaLabel,
  className,
  children,
}: {
  href?: string | null;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  if (href) {
    return (
      <Link to={href} aria-label={ariaLabel} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <span aria-label={ariaLabel} className={className}>
      {children}
    </span>
  );
}

function dataSourceTone(state?: string): string {
  const token = String(state ?? "").toLowerCase();
  if (token.includes("read_ok") || token.includes("readback_ok") || token.includes("smoke_ok")) {
    return "bg-status-success/10 text-status-success border-status-success/30";
  }
  if (token.includes("partial") || token.includes("unavailable")) {
    return "bg-status-warning/15 text-status-warning border-status-warning/30";
  }
  return "bg-muted text-muted-foreground";
}

function providerOkCount(r: ManagementPersonaFleetRow): { ok: number; total: number } {
  const sources = visibleDataSources(r);
  if (sources.length === 0) return { ok: 0, total: 0 };

  const summaryCounts = dataSourceProviderStatusCounts(r);
  if (Object.keys(summaryCounts).length > 0) {
    const ok = Object.entries(summaryCounts)
      .filter(([status]) => /read_ok|readback_ok|smoke_ok|quote_readback_ok/i.test(status))
      .reduce((total, [, count]) => total + count, 0);
    return { ok, total: Math.max(dataSourceProviderCount(r), sources.length) };
  }

  const statuses = dataSourceProviderStatuses(r);
  const values = Object.values(statuses);
  const total = values.length || sources.length;
  const ok = values.length
    ? values.filter((status) => /read_ok|smoke_ok|quote_readback_ok/i.test(status)).length
    : sources.filter((source) => /read_ok|smoke_ok|quote_readback_ok/i.test(source.status)).length;
  return { ok, total };
}

function frameworkText(item?: PersonaFleetResearchItem): string {
  if (!item) return "";
  const visible = item.frameworks;
  const declared = item.frameworkCount ?? visible.length;
  const missing = Math.max(0, declared - visible.length);
  const parts = [...visible];
  if (missing > 0) {
    parts.push(`${missing} more framework${missing === 1 ? "" : "s"}`);
  }
  return parts.join(" / ");
}

type PersonaFleetPrimaryAction = {
  href: string | null;
  labelKey: string;
  ariaLabelKey: string;
  className?: string;
};

const RUNTIME_ACTION_STATES = new Set([
  "paper_running",
  "live_running",
  "canary_running",
  "running",
  "deployed",
  "runtime_active",
  "active_runtime",
  "stopped",
  "paused",
  "rollback_required",
  "failed",
]);

const ONBOARDING_ACTION_STATES = new Set(["draft"]);

function normalizedFleetState(r: ManagementPersonaFleetRow): string {
  return displayFleetState(r);
}

function personaFleetPrimaryAction(
  r: ManagementPersonaFleetRow,
  links: {
    personaHref: string | null;
    researchHref: string | null;
    humanGateHref: string | null;
    onboardingHref: string | null;
    runtimeHref: string | null;
  },
): PersonaFleetPrimaryAction {
  const state = normalizedFleetState(r);

  if (state === "needs_human_approval" || r.humanNeeded) {
    return {
      href: links.humanGateHref,
      labelKey: "mgmt.fleet.primaryAction.reviewHumanGate",
      ariaLabelKey: "mgmt.fleet.primaryAction.reviewHumanGateAriaFmt",
      className: links.humanGateHref
        ? "border-status-warning/40 text-status-warning hover:text-status-warning"
        : "border-muted text-muted-foreground",
    };
  }

  if (RUNTIME_ACTION_STATES.has(state) || state.endsWith("_running")) {
    return {
      href: links.runtimeHref,
      labelKey: links.runtimeHref
        ? "mgmt.fleet.primaryAction.viewRuntime"
        : "mgmt.fleet.primaryAction.viewPersona",
      ariaLabelKey: links.runtimeHref
        ? "mgmt.fleet.primaryAction.viewRuntimeAriaFmt"
        : "mgmt.fleet.primaryAction.viewPersonaAriaFmt",
      className: links.runtimeHref
        ? "border-status-success/40 text-status-success hover:text-status-success"
        : "border-muted text-muted-foreground",
    };
  }

  if (ONBOARDING_ACTION_STATES.has(state)) {
    const isDraft = state === "draft";
    return {
      href: links.onboardingHref,
      labelKey: isDraft ? "mgmt.fleet.primaryAction.startOnboarding" : "mgmt.fleet.primaryAction.continueOnboarding",
      ariaLabelKey: isDraft
        ? "mgmt.fleet.primaryAction.startOnboardingAriaFmt"
        : "mgmt.fleet.primaryAction.continueOnboardingAriaFmt",
    };
  }

  if (state === "researching" && links.researchHref) {
    return {
      href: links.researchHref,
      labelKey: "mgmt.fleet.primaryAction.viewResearch",
      ariaLabelKey: "mgmt.fleet.primaryAction.viewResearchAriaFmt",
    };
  }

  return {
    href: links.personaHref,
    labelKey: "mgmt.fleet.primaryAction.viewPersona",
    ariaLabelKey: "mgmt.fleet.primaryAction.viewPersonaAriaFmt",
  };
}

export const PersonaFleetPage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const personaFocus = (searchParams.get("persona_id") ?? searchParams.get("persona"))?.trim() ?? "";
  const dataFilter = personaFleetDataFilterFromParams(searchParams);
  const archivedOnly = personaFleetArchivedFromParams(searchParams);
  const purposeFilter = personaFleetPurposeFromParams(searchParams);
  const urlQ = searchParams.get("q")?.trim() ?? "";
  const [searchText, setSearchText] = useState(urlQ);
  // URL-driven q changes (same-route navigation, clearing) replace the input instead of being overwritten by it.
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ);
  if (seenUrlQ !== urlQ) {
    setSeenUrlQ(urlQ);
    setSearchText(urlQ);
  }
  const [refreshing, setRefreshing] = useState(false);

  // Debounced search -> URL (which resets pagination through the scope key below).
  useEffect(() => {
    if (searchText.trim() === urlQ) return undefined;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (searchText.trim()) next.set("q", searchText.trim());
      else next.delete("q");
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, urlQ, searchParams, setSearchParams]);

  const filters = useMemo(
    () => ({ purpose: purposeFilter, dataScope: dataFilter, archived: archivedOnly, q: urlQ }),
    [purposeFilter, dataFilter, archivedOnly, urlQ],
  );
  const scopeKey = personaFocus
    ? `focus:${personaFocus}`
    : `${filters.purpose}|${filters.dataScope}|${filters.archived ? "archived" : "active"}|${filters.q}`;

  // Page-token stack: index 0 is the first page. A scope change drops the stack (reset to page 1).
  const [pager, setPager] = useState<{ scopeKey: string; tokens: string[] }>({ scopeKey, tokens: [""] });
  if (pager.scopeKey !== scopeKey) setPager({ scopeKey, tokens: [""] });
  const tokens = pager.scopeKey === scopeKey ? pager.tokens : [""];
  const pageIndex = tokens.length - 1;
  const pageToken = tokens[pageIndex] || undefined;

  const { data, loading, error = null, refresh } = useV5Live(
    async (signal) => {
      if (!personaFocus) return mgmt.personaFleet.page(personaFleetQuery(filters, "", pageToken), { signal });
      // Focus lookup: the server only offers substring search, so walk the matching
      // pages (cancellable) until the exact authorized id is found or pages run out.
      let token: string | undefined;
      for (;;) {
        const result = await mgmt.personaFleet.page(personaFleetQuery(filters, personaFocus, token), { signal });
        if (result.rows.some((r) => r.personaId === personaFocus) || !result.nextPageToken || result.nextPageToken === token) {
          return result;
        }
        token = result.nextPageToken;
      }
    },
    [scopeKey, pageToken ?? ""],
    { cacheKey: "oversight.personaFleet.page" },
  );
  // Scoped archived count comes from the page metadata; archived rows are only fetched on explicit request.
  const scopedArchivedCount = data?.filteredArchivedTotal;
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.personaPurpose !== "advisory_assistant"), [data]);
  const visibleRows = useMemo(
    () => (personaFocus ? rows.filter((r) => r.personaId === personaFocus) : rows),
    [rows, personaFocus],
  );
  const population = data?.population;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    // Persist the legacy ?tab= mapping as explicit ?data= before dropping tab.
    if (key !== "data" && next.has("tab") && !next.has("data")) next.set("data", dataFilter);
    next.delete("tab");
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const goNext = () => {
    if (!data?.nextPageToken) return;
    setPager({ scopeKey, tokens: [...tokens, data.nextPageToken] });
  };
  const goPrev = () => {
    if (pageIndex === 0) return;
    setPager({ scopeKey, tokens: tokens.slice(0, -1) });
  };
  const runRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const isInitialLoading = loading && !data;
  const isOwnerError = !data && !loading;
  const isRefreshFailed = Boolean(error) && Boolean(data);
  const isTrueEmpty = !personaFocus && !!data && population?.authorizedTotal === 0;
  const isFilteredEmpty = !personaFocus && !!data && !isTrueEmpty && visibleRows.length === 0;
  const isPersonaFocusLoading = Boolean(personaFocus && isInitialLoading);
  const hasPersonaFocusMatch = !personaFocus || visibleRows.length > 0;
  const rangeStart = pageIndex * PERSONA_FLEET_PAGE_SIZE + 1;
  const rangeEnd = pageIndex * PERSONA_FLEET_PAGE_SIZE + visibleRows.length;

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6" aria-label={t("mgmt.fleet.title")}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.fleet.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.fleet.subtitle")}</p>
        </div>
      </header>
      {!personaFocus && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <ToggleGroup
            type="single"
            value={dataFilter}
            onValueChange={(val) => {
              if (val === "regular" || val === "test" || val === "unknown") setParam("data", val);
            }}
            aria-label={t("mgmt.fleet.filter.dataScope")}
            className="grid w-full max-w-[520px] grid-cols-3 rounded-md bg-muted p-1 text-muted-foreground"
          >
            {(["regular", "test", "unknown"] as const).map((value) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-auto rounded-sm px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
              >
                {t(`mgmt.fleet.data.${value}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            size="sm"
            variant={purposeFilter === "unknown" ? "default" : "outline"}
            onClick={() => setParam("purpose", purposeFilter === "unknown" ? null : "unknown")}
            aria-pressed={purposeFilter === "unknown"}
          >
            {t("mgmt.fleet.filter.unknownPurpose")}
          </Button>
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t("mgmt.fleet.filter.searchPlaceholder")}
            aria-label={t("mgmt.fleet.filter.searchPlaceholder")}
            className="h-8 w-56 rounded-md border border-border bg-background px-2 text-xs"
          />
          <div className="flex items-center gap-2 text-xs">
            <Button
              size="sm"
              variant={archivedOnly ? "default" : "outline"}
              onClick={() => setParam("archived", archivedOnly ? null : "only")}
              aria-pressed={archivedOnly}
            >
              {archivedOnly
                ? t("mgmt.fleet.filter.hideArchived")
                : t("mgmt.fleet.filter.showArchivedFmt", { count: scopedArchivedCount ?? "?" })}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void runRefresh()} disabled={refreshing}>
              {refreshing ? t("mgmt.fleet.refreshing") : t("mgmt.actions.refresh")}
            </Button>
          </div>
        </div>
      )}
      {personaFocus && (
        <Card className={"p-3 text-sm " + (isPersonaFocusLoading || hasPersonaFocusMatch
          ? "border-primary/30 bg-primary/5"
          : "border-status-warning/30 bg-status-warning/10")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              {isPersonaFocusLoading
                ? t("mgmt.fleet.focusLoadingPersonaFmt", { persona: personaFocus })
                : isOwnerError
                ? t("mgmt.fleet.focusUnavailablePersonaFmt", { persona: personaFocus })
                : hasPersonaFocusMatch
                ? t("mgmt.fleet.focusedPersonaFmt", { persona: personaFocus })
                : t("mgmt.fleet.focusMissingPersonaFmt", { persona: personaFocus })}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/management/persona-fleet">{t("mgmt.fleet.showAllPersonas")}</Link>
            </Button>
          </div>
        </Card>
      )}
      {isInitialLoading && !personaFocus && (
        <Card className="p-4 text-sm text-muted-foreground" role="status">
          {t("mgmt.fleet.loadingLive")}
        </Card>
      )}
      {isOwnerError && (
        <Card className="p-4 text-sm" role="alert">
          <div className="font-medium text-foreground">{t("mgmt.fleet.liveDataUnavailableTitle")}</div>
          <p className="mt-1 text-muted-foreground">{t("mgmt.fleet.liveDataUnavailableBody")}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void runRefresh()}>
            {t("mgmt.actions.refresh")}
          </Button>
        </Card>
      )}
      {isRefreshFailed && (
        <Card className="border-status-warning/30 bg-status-warning/10 p-3 text-sm" role="alert">
          {t("mgmt.fleet.refreshFailedFmt", { at: data?.asOf ?? "—" })}
        </Card>
      )}
      {isTrueEmpty && (
        <Card className="p-4 text-sm">
          <div className="font-medium text-foreground">{t("mgmt.fleet.trueEmptyTitle")}</div>
          <p className="mt-1 text-muted-foreground">{t("mgmt.fleet.trueEmptyBody")}</p>
        </Card>
      )}
      {isFilteredEmpty && (
        <Card className="p-4 text-sm">
          <span className="text-muted-foreground">{t("mgmt.fleet.filter.allFilteredHint")}</span>
        </Card>
      )}
      {visibleRows.length > 0 && (
      <Card className="flex min-h-0 flex-1 overflow-hidden">
        <ManagementTableScroll
          className="min-h-0 flex-1"
          testId="persona-fleet-table-scroll"
          minScrollWidth={1840}
          showPinnedScrollbar={false}
          contentClassName="pb-4 pr-4"
          viewportClassName="h-full min-h-0 overflow-auto pb-4"
        >
        <table className="w-full min-w-[1840px] text-sm">
          <thead className="sticky top-0 z-30 border-b border-border bg-card text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-40 min-w-[280px] whitespace-nowrap bg-card px-3 py-2 border-r border-border/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]">{t("mgmt.fleet.persona")}</th><th className="min-w-[180px] whitespace-nowrap px-3 py-2">{t("mgmt.fleet.owner")}</th>
              <th className="whitespace-nowrap px-3 py-2">{t("mgmt.fleet.ooda")}</th><th className="whitespace-nowrap px-3 py-2">{t("mgmt.fleet.autonomy")}</th>
              <th className="whitespace-nowrap px-3 py-2">{t("mgmt.fleet.capital")}</th><th className="whitespace-nowrap px-3 py-2">{t("mgmt.fleet.rank")}</th>
              <th className="whitespace-nowrap px-3 py-2">{t("mgmt.fleet.dataSources")}</th><th className="whitespace-nowrap px-3 py-2">{t("mgmt.fleet.research")}</th>
              <th className="min-w-[110px] whitespace-nowrap px-3 py-2">{t("mgmt.fleet.perfDelta")}</th><th className="min-w-[130px] whitespace-nowrap px-3 py-2">{t("mgmt.fleet.lastMutation")}</th>
              <th className="min-w-[110px] whitespace-nowrap px-3 py-2">{t("mgmt.fleet.humanNeeded")}</th>
              <th className="whitespace-nowrap px-3 py-2">{t("mgmt.fleet.state")}</th>
              <th className="whitespace-nowrap px-3 py-2">{t("mgmt.fleet.cycleHealth", { defaultValue: "循環健康" })}</th>
              <th className="min-w-[140px] whitespace-nowrap py-2 pl-3 pr-7 text-right">{t("mgmt.fleet.actions")}</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((r) => {
              const retired = r.state && HIDDEN_STATES.has(r.state);
              const sourceCount = providerOkCount(r);
              const sourceBadges = visibleDataSources(r);
              const sourceStatus = dataSourceState(r);
              const researchItems = personaFleetResearchItems(r);
              const primaryResearch = researchItems[0];
              const frameworkSummary = frameworkText(primaryResearch);
              const personaHref = personaFleetPersonaHref(r);
              const researchHref = personaFleetResearchHref(r, primaryResearch);
              const dataSourcesHref = sourceBadges.length > 0 ? personaFleetDataSourcesHref(r) : null;
              const performanceHref = personaFleetPerformanceHref(r);
              const rankHref = personaFleetRankHref(r);
              const mutationHref = personaFleetMutationHref(r);
              const humanGateHref = personaFleetHumanGateHref(r);
              const onboardingHref = personaFleetOnboardingHref(r);
              const runtimeHref = personaFleetRuntimeHref(r);
              const primaryAction = personaFleetPrimaryAction(r, {
                personaHref,
                researchHref,
                humanGateHref,
                onboardingHref,
                runtimeHref,
              });
              const artifactHref = personaFleetArtifactHref(r, primaryResearch);
              const artifactLabel = primaryResearch?.artifactId;
              const oodaHref = personaFleetOodaHref(r, primaryResearch);
              const capitalMode = fleetCapitalMode(r);
              const capitalBinding = fleetCapitalBinding(r);
              const capitalHref = personaFleetCapitalHref(r);
              const runtimeHealth = fleetRuntimeHealth(r);
              const leagueRank = fleetLeagueRank(r);
              const leagueScore = fleetLeagueScore(r);
              const reviewToken = fleetReviewToken(r);
              const stateLabel = displayFleetState(r);
              const focused = personaFocus === r.personaId;
              return (
                <tr
                  key={r.personaId}
                  className={"group border-b border-border/50 hover:bg-muted/30 " + (retired ? "opacity-60 " : "") + (focused ? "bg-primary/5" : "")}
                >
                  <td className={"sticky left-0 z-10 min-w-[280px] border-r border-border/50 px-3 py-2 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] transition-colors " + (focused ? "bg-[color-mix(in_oklab,hsl(var(--primary))_10%,hsl(var(--card)))] group-hover:bg-[color-mix(in_oklab,hsl(var(--primary))_15%,hsl(var(--card)))]" : "bg-card group-hover:bg-[color-mix(in_oklab,hsl(var(--muted))_40%,hsl(var(--card)))]")}>
                    {personaHref ? (
                      <Link
                        to={personaHref}
                        className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                      >
                        {r.personaName || r.personaId}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{r.personaName || r.personaId}</span>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground">
                      <span className="whitespace-nowrap">{r.personaId}</span>
                      <Badge
                        variant="outline"
                        data-testid={`fleet-data-scope-${r.personaId}`}
                        className={
                          "shrink-0 whitespace-nowrap text-[10px] " +
                          (r.dataScope === "test" || r.dataScope === "unknown"
                            ? "border-status-warning/40 text-status-warning"
                            : "text-muted-foreground")
                        }
                      >
                        {t(`mgmt.fleet.data.${r.dataScope ?? "unknown"}`)}
                        {r.classificationConfirmed === false ? ` · ${t("mgmt.fleet.toConfirm")}` : ""}
                      </Badge>
                      {r.personaPurpose === "unknown" && (
                        <Badge
                          variant="outline"
                          data-testid={`fleet-purpose-${r.personaId}`}
                          className="shrink-0 whitespace-nowrap border-status-warning/40 text-[10px] text-status-warning"
                        >
                          {t("mgmt.fleet.purposeUnknown")}
                        </Badge>
                      )}
                      {(r.is_market_persona_default || r.isMarketPersonaDefault || r.seed_row || r.seedRow) && (
                        <Badge variant="outline" className="shrink-0 whitespace-nowrap border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
                          Seed Fixture
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="min-w-[180px] whitespace-nowrap px-3 py-2 text-muted-foreground">{r.owner}</td>
                  <td className="px-3 py-2">
                    <OptionalFleetLink
                      href={oodaHref}
                      ariaLabel={`${r.personaId} OODA ${r.ooda} stage`}
                      className="inline-flex"
                    >
                      <Badge
                        variant="outline"
                        className={oodaHref
                          ? badgeLinkClass("border-primary/40 text-primary hover:border-primary/60 hover:bg-primary/5")
                          : badgeUnavailableClass()}
                      >
                        {r.ooda}
                      </Badge>
                    </OptionalFleetLink>
                  </td>
	                  <td className="px-3 py-2"><Badge variant="outline">{r.autonomy}</Badge></td>
	                  <td className="px-3 py-2 min-w-[170px]">
	                      <div className="flex flex-wrap gap-1">
	                        <Badge
	                          variant="outline"
	                          className={capitalMode === "live"
	                            ? "border-status-failed/40 text-status-failed"
	                            : capitalMode === "canary"
	                            ? "border-status-warning/40 text-status-warning"
	                            : "border-status-success/40 text-status-success"}
	                        >
	                          {formatToken(capitalMode || "none")}
	                        </Badge>
	                        {runtimeHealth && (
	                          <Badge variant="outline" className={statusTone(runtimeHealth)}>
	                            {formatToken(runtimeHealth)}
	                          </Badge>
	                        )}
	                      </div>
	                      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{capitalBinding.label}</div>
	                      {capitalBinding.id && (
	                        capitalHref ? (
	                          <Link
	                            to={capitalHref}
	                            aria-label={`Open capital for ${r.personaId}`}
	                            className={fieldLinkClass("mt-1 flex max-w-[210px] items-center gap-1 truncate font-mono text-xs text-muted-foreground hover:text-primary")}
	                            title={`${capitalBinding.label}: ${capitalBinding.id}`}
	                          >
	                            <span className="truncate">{capitalBinding.id}</span>
	                            <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
	                          </Link>
	                        ) : (
	                          <div className="mt-1 max-w-[190px] truncate font-mono text-xs text-muted-foreground" title={`${capitalBinding.label}: ${capitalBinding.id}`}>
	                            {capitalBinding.id}
	                          </div>
	                        )
	                      )}
	                  </td>
	                  <td className="px-3 py-2 min-w-[120px]">
	                    {leagueRank ? (
	                      rankHref ? (
	                        <Link
	                          to={rankHref}
	                          aria-label={`${r.personaId} persona league ranking`}
	                          className={fieldLinkClass("font-medium text-foreground hover:text-primary")}
	                        >
	                          {t("mgmt.fleet.rankFmt", { rank: leagueRank })}
	                        </Link>
	                      ) : (
	                        <div className="font-medium text-foreground">
	                          {t("mgmt.fleet.rankFmt", { rank: leagueRank })}
	                        </div>
	                      )
	                    ) : (
	                      <span className="text-muted-foreground">—</span>
	                    )}
	                    {typeof leagueScore === "number" && Number.isFinite(leagueScore) && (
	                      <div className="text-xs text-muted-foreground">
	                        {t("mgmt.fleet.scoreFmt", { score: leagueScore.toFixed(1) })}
	                      </div>
	                    )}
	                    {reviewToken && (
	                      <span className="mt-1 block text-xs text-muted-foreground">
	                        {formatToken(reviewToken)}
	                      </span>
	                    )}
	                  </td>
	                  <td className="px-3 py-2 min-w-[240px]">
	                    <div className="flex max-w-[360px] flex-wrap gap-1">
	                      {sourceBadges.length > 0
	                        ? sourceBadges.map((source) => {
	                          const sourceHref = personaFleetDataSourcesHref(r, source);
	                          return (
	                            <OptionalFleetLink
	                              key={source.providerKey}
	                              href={sourceHref}
	                              ariaLabel={`${r.personaId} data source ${source.providerKey}`}
	                              className="inline-flex"
	                            >
	                              <Badge
	                                variant="outline"
	                                className={sourceHref
	                                  ? badgeLinkClass(`${dataSourceTone(source.status)} hover:border-primary/60`)
	                                  : `${dataSourceTone(source.status)} cursor-default`}
	                              >
	                                {source.providerKey}: {formatToken(source.status)}
	                              </Badge>
	                            </OptionalFleetLink>
	                          );
	                        })
	                        : (
	                          dataSourcesHref ? (
	                            <Link
	                              to={dataSourcesHref}
	                              aria-label={`${r.personaId} data sources`}
	                              className={fieldLinkClass("text-xs text-muted-foreground hover:text-primary")}
	                            >
	                              —
	                            </Link>
	                          ) : (
	                            <span className="text-xs text-muted-foreground">—</span>
	                          )
	                        )}
	                    </div>
	                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
	                      {sourceCount.total > 0 && (
	                        <span>{t("mgmt.fleet.providersFmt", { ok: sourceCount.ok, total: sourceCount.total })}</span>
	                      )}
	                      {sourceStatus && sourceBadges.length > 0 && dataSourcesHref && (
	                        <Link
	                          to={dataSourcesHref}
	                          aria-label={`${r.personaId} data source status`}
	                          className={fieldLinkClass("text-xs text-muted-foreground hover:text-primary")}
	                        >
	                          {formatToken(sourceStatus)}
	                        </Link>
	                      )}
	                    </div>
	                    <div className="mt-1 text-xs text-muted-foreground">
	                      {dataSourceLiveEnabled(r)
	                        ? t("mgmt.fleet.liveOn")
	                        : t("mgmt.fleet.liveOff")}
	                      {" · "}
	                      {dataSourceOrderSideEffectsAllowed(r)
	                        ? t("mgmt.fleet.sideEffectsOn")
	                        : t("mgmt.fleet.sideEffectsOff")}
	                    </div>
	                  </td>
	                  <td className="px-3 py-2 min-w-[260px]">
	                    <div className="flex flex-wrap items-center gap-1">
	                      <OptionalFleetLink
	                        href={researchHref}
	                        ariaLabel={`${r.personaId} research detail`}
	                        className="inline-flex"
	                      >
	                        <Badge
	                          variant="outline"
	                          className={researchHref
	                            ? badgeLinkClass("border-primary/40 text-primary hover:border-primary/60 hover:bg-primary/5")
	                            : badgeUnavailableClass()}
	                        >
	                          {primaryResearch?.stage ? formatToken(primaryResearch.stage) : "—"}
	                        </Badge>
	                      </OptionalFleetLink>
	                      {primaryResearch?.canDeploy === false && (
	                        <Badge variant="outline" className="bg-status-warning/15 text-status-warning border-status-warning/30">
	                          {t("mgmt.fleet.governed")}
	                        </Badge>
	                      )}
	                    </div>
	                    <div className="mt-1 max-w-[360px] space-y-0.5">
	                      {researchItems.length > 0
	                        ? researchItems.slice(0, 3).map((item) => {
	                          const itemHref = personaFleetResearchHref(r, item);
	                          const loopHref = personaFleetResearchLoopHref(r, item);
	                          return (
	                            <div key={item.key} className="space-y-0.5">
	                              {itemHref ? (
	                                <Link
	                                  to={itemHref}
	                                  className="block truncate font-medium text-primary underline underline-offset-4 hover:text-primary/80"
	                                >
	                                  {item.title || "—"}
	                                </Link>
	                              ) : (
	                                <span
	                                  className="block truncate font-medium text-foreground"
	                                >
	                                  {item.title || "—"}
	                                </span>
	                              )}
	                              {!itemHref && loopHref && (
	                                <div className="mt-0.5">
	                                  <Link
	                                    to={loopHref}
	                                    className="inline-flex items-center text-[10px] text-muted-foreground hover:text-primary underline underline-offset-2"
	                                  >
	                                    {t("mgmt.fleet.viewResearchLoop")} →
	                                  </Link>
	                                </div>
	                              )}
	                            </div>
	                          );
	                        })
	                        : (() => {
	                          const loopHref = personaFleetResearchLoopHref(r);
	                          return researchHref ? (
	                            <Link
	                              to={researchHref}
	                              className={fieldLinkClass("block text-muted-foreground hover:text-primary")}
	                            >
	                              —
	                            </Link>
	                          ) : (
	                            <div className="space-y-1">
	                              <span className="block text-muted-foreground">—</span>
	                              {loopHref && (
	                                <Link
	                                  to={loopHref}
	                                  className="inline-flex items-center text-[10px] text-muted-foreground hover:text-primary underline underline-offset-2"
	                                >
	                                  {t("mgmt.fleet.viewResearchLoop")} →
	                                </Link>
	                              )}
	                            </div>
	                          );
	                        })()}
	                    </div>
	                    {(frameworkSummary || artifactLabel) && (
	                    <div className="mt-0.5 max-w-[360px] truncate text-xs text-muted-foreground">
	                      {frameworkSummary}
	                      {artifactLabel && (
	                        <>
	                          {frameworkSummary ? " · " : ""}
	                          {artifactHref ? (
	                            <Link
	                              to={artifactHref}
                              className="font-mono font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                            >
                              Artifact: {artifactLabel}
                            </Link>
                          ) : (
                            artifactLabel
	                          )}
	                        </>
	                      )}
	                    </div>
	                    )}
	                  </td>
                  <td className={"min-w-[110px] whitespace-nowrap px-3 py-2 " + (
                    Number.isFinite(r.perfDelta)
                      ? (r.perfDelta >= 0 ? "text-status-success" : "text-status-failed")
                      : "text-muted-foreground"
                  )}>
                    {performanceHref ? (
                      <Link
                        to={performanceHref}
                        aria-label={`${r.personaId} performance attribution`}
                        className={fieldLinkClass(
                          Number.isFinite(r.perfDelta)
                            ? (r.perfDelta >= 0
                                ? "text-status-success hover:text-status-success"
                                : "text-status-failed hover:text-status-failed")
                            : "text-muted-foreground hover:text-muted-foreground",
                        )}
                      >
                        {formatPerfDelta(r.perfDelta)}
                      </Link>
                    ) : (
                      <span
                        aria-label={`${r.personaId} performance attribution unavailable`}
                        className="font-medium"
                      >
                        {formatPerfDelta(r.perfDelta)}
                      </span>
                    )}
                  </td>
                  <td className="min-w-[130px] whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {mutationHref ? (
                      <Link
                        to={mutationHref}
                        aria-label={`${r.personaId} mutation history`}
                        className={fieldLinkClass("whitespace-nowrap text-muted-foreground hover:text-primary")}
                      >
                        {r.lastMutationKind === "fleet_summary" ? (r.lastMutationLabel || r.lastMutation || "無正式 mutation") : (r.lastMutationLabel || r.lastMutation || "—")}
                      </Link>
                    ) : (
                      <span className="whitespace-nowrap text-muted-foreground">
                        {r.lastMutationKind === "unavailable" ? "無資料" : (r.lastMutation || "—")}
                      </span>
                    )}
                  </td>
                  <td className="min-w-[110px] whitespace-nowrap px-3 py-2">
                    {r.humanNeeded
                      ? (
                        <OptionalFleetLink
                          href={humanGateHref}
                          ariaLabel={`${r.personaId} human gate`}
                          className="inline-flex"
                        >
                          <Badge
                            variant="outline"
                            className={humanGateHref
                              ? badgeLinkClass("bg-status-warning/15 text-status-warning border-status-warning/30 hover:border-status-warning/60 hover:bg-status-warning/20")
                              : "bg-status-warning/15 text-status-warning border-status-warning/30 cursor-default"}
                          >
                            {t("mgmt.fleet.yes")}
                          </Badge>
                        </OptionalFleetLink>
                      )
                      : (
                        humanGateHref ? (
                          <Link
                            to={humanGateHref}
                            aria-label={`${r.personaId} human gate`}
                            className={fieldLinkClass("text-xs text-muted-foreground hover:text-primary")}
                          >
                            {t("mgmt.fleet.no")}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("mgmt.fleet.no")}</span>
                        )
                      )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {stateLabel && (() => {
                      const stateHref = r.humanNeeded ? humanGateHref : personaHref;
                      return (
                      <OptionalFleetLink
                        href={stateHref}
                        ariaLabel={`${r.personaId} status detail`}
                        className="inline-flex"
                      >
                        <Badge
                          variant="outline"
                          className={retired
                            ? stateHref
                              ? badgeLinkClass("bg-muted text-muted-foreground hover:border-primary/60")
                              : badgeUnavailableClass("bg-muted")
                            : stateHref
                            ? badgeLinkClass("border-primary/40 text-primary hover:border-primary/60 hover:bg-primary/5")
                            : badgeUnavailableClass()}
                        >
                          {stateLabel}
                        </Badge>
                      </OptionalFleetLink>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2" data-testid={`fleet-cycle-health-${r.personaId}`}>
                    {r.personaCycleHealth && r.personaCycleHealth.status !== "unavailable" ? (() => {
                      const cycleStatus = resolveEnumLabel("status", r.personaCycleHealth.status, t);
                      const cycleStage = r.personaCycleHealth.stage
                        ? statusLabel(r.personaCycleHealth.stage, t)
                        : "";
                      const failureReason = r.personaCycleHealth.failureReason
                        ? reasonCodeDisplay(r.personaCycleHealth.failureReason, t)
                        : null;
                      return (
                        <span title={r.personaCycleHealth.failureReason ?? undefined}>
                          <Badge variant="outline" className={cycleStatus.badgeClass}>
                            {cycleStatus.label}
                          </Badge>
                          {cycleStage ? (
                            <>
                              {" "}
                              <span className="ml-1 text-xs text-muted-foreground">{cycleStage}</span>
                            </>
                          ) : null}
                          {failureReason ? (
                            <>
                              {" "}
                              <span className="ml-1 text-xs text-destructive">{failureReason.text}</span>
                              {failureReason.code && (
                                <>
                                  {" "}
                                  <code className="ml-1 font-mono text-[11px] text-muted-foreground">
                                    ({failureReason.code})
                                  </code>
                                </>
                              )}
                            </>
                          ) : null}
                        </span>
                      );
                    })() : (
                      <span className="text-xs text-muted-foreground">
                        {t("mgmt.fleet.cycleUnavailable", { defaultValue: "無法讀取" })}
                        {r.personaCycleHealth?.failureReason ? (() => {
                          const failureReason = reasonCodeDisplay(r.personaCycleHealth.failureReason, t);
                          return (
                            <>
                              {" "}
                              <span className="ml-1">{failureReason.text}</span>
                              {failureReason.code && (
                                <>
                                  {" "}
                                  <code className="ml-1 font-mono text-[11px]">({failureReason.code})</code>
                                </>
                              )}
                            </>
                          );
                        })() : null}
                      </span>
                    )}
                  </td>
                  <td className="min-w-[140px] whitespace-nowrap py-2 pl-3 pr-7 text-right">
                    {!retired && (
                      primaryAction.href ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className={primaryAction.className}
                        >
                          <Link
                            to={primaryAction.href}
                            aria-label={t(primaryAction.ariaLabelKey, { persona: r.personaId })}
                          >
                            {t(primaryAction.labelKey)}
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          className={primaryAction.className}
                          aria-label={t(primaryAction.ariaLabelKey, { persona: r.personaId })}
                        >
                          {t(primaryAction.labelKey)}
                        </Button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </ManagementTableScroll>
      </Card>
      )}
      {data && !isOwnerError && (visibleRows.length > 0 || pageIndex > 0) && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pr-16 text-xs text-muted-foreground" data-testid="persona-fleet-pager">
          <span>
            {data.total !== undefined && !personaFocus
              ? t("mgmt.fleet.pager.rangeFmt", { start: rangeStart, end: rangeEnd, total: data.total })
              : t("mgmt.fleet.pager.rangeNoTotalFmt", { start: rangeStart, end: rangeEnd })}
            {data.asOf ? ` · ${t("mgmt.fleet.asOfFmt", { at: data.asOf })}` : ""}
          </span>
          {!personaFocus && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={goPrev} disabled={pageIndex === 0 || loading}>
                {t("mgmt.fleet.pager.previous")}
              </Button>
              <span>{t("mgmt.fleet.pager.pageFmt", { page: pageIndex + 1 })}</span>
              <Button size="sm" variant="outline" onClick={goNext} disabled={!data.nextPageToken || loading}>
                {t("mgmt.fleet.pager.next")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export function extractAttributionHiddenTestCounts(input: {
  hiddenTestPersonaCount?: number;
  hiddenTestStrategyCount?: number;
  includeTestPersonas?: boolean;
  summary?: unknown;
  meta?: unknown;
} | null | undefined): {
  hiddenPersonaCount: number;
  hiddenStrategyCount: number;
  includeTestPersonas: boolean;
} {
  if (!input || typeof input !== "object") {
    return { hiddenPersonaCount: 0, hiddenStrategyCount: 0, includeTestPersonas: false };
  }
  const summary =
    input.summary && typeof input.summary === "object"
      ? (input.summary as Record<string, unknown>)
      : {};
  const meta =
    input.meta && typeof input.meta === "object"
      ? (input.meta as Record<string, unknown>)
      : {};
  const rawStrategyCount =
    input.hiddenTestStrategyCount ??
    summary.hidden_test_strategy_count ??
    summary.hiddenTestStrategyCount ??
    meta.hidden_test_strategy_count ??
    meta.hiddenTestStrategyCount ??
    input.hiddenTestPersonaCount ??
    summary.hidden_test_persona_count ??
    summary.hiddenTestPersonaCount ??
    meta.hidden_test_persona_count ??
    meta.hiddenTestPersonaCount ??
    0;
  const rawPersonaCount =
    input.hiddenTestPersonaCount ??
    summary.hidden_test_persona_count ??
    summary.hiddenTestPersonaCount ??
    meta.hidden_test_persona_count ??
    meta.hiddenTestPersonaCount ??
    rawStrategyCount;
  const hiddenStrategyCount = Number.isFinite(Number(rawStrategyCount))
    ? Math.max(0, Number(rawStrategyCount))
    : 0;
  const hiddenPersonaCount = Number.isFinite(Number(rawPersonaCount))
    ? Math.max(0, Number(rawPersonaCount))
    : 0;
  const includeTestPersonas = Boolean(
    input.includeTestPersonas ??
    summary.include_test_personas ??
    summary.includeTestPersonas ??
    meta.include_test_personas ??
    meta.includeTestPersonas,
  );
  return { hiddenPersonaCount, hiddenStrategyCount, includeTestPersonas };
}

export function PerformanceAttributionTestPersonaBanner({
  attribution,
  includeTestPersonas: includeOverride,
  onToggleIncludeTestPersonas,
}: {
  attribution?: {
    hiddenTestPersonaCount?: number;
    hiddenTestStrategyCount?: number;
    includeTestPersonas?: boolean;
    summary?: unknown;
    meta?: unknown;
  } | null;
  includeTestPersonas?: boolean;
  onToggleIncludeTestPersonas?: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const counts = extractAttributionHiddenTestCounts(attribution);
  const showing = includeOverride ?? counts.includeTestPersonas;
  const hiddenStrategies = counts.hiddenStrategyCount || counts.hiddenPersonaCount;
  if (!showing && hiddenStrategies <= 0) return null;

  return (
    <Card
      className="p-3 text-xs flex flex-wrap items-center justify-between gap-2 border-border bg-muted/20"
      data-testid="attribution-test-personas-banner"
    >
      <span className="text-muted-foreground" data-testid="attribution-test-personas-count">
        {showing
          ? t("mgmt.attribution.showingTestPersonasNotice")
          : counts.hiddenPersonaCount > 0 && counts.hiddenStrategyCount > 0
            ? t("mgmt.attribution.hiddenTestPersonaStrategiesFmt", {
                count: counts.hiddenStrategyCount,
                strategyCount: counts.hiddenStrategyCount,
                personaCount: counts.hiddenPersonaCount,
              })
            : t("mgmt.attribution.hiddenTestPersonaStrategiesOnlyFmt", {
                count: hiddenStrategies,
                strategyCount: hiddenStrategies,
              })}
      </span>
      {onToggleIncludeTestPersonas ? (
        <Button
          type="button"
          size="sm"
          variant={showing ? "default" : "outline"}
          data-testid="attribution-toggle-test-personas-button"
          aria-pressed={showing}
          onClick={() => onToggleIncludeTestPersonas(!showing)}
        >
          {showing
            ? t("mgmt.attribution.hideTestPersonas")
            : hiddenStrategies > 0
              ? t("mgmt.attribution.showTestPersonasFmt", { count: hiddenStrategies })
              : t("mgmt.attribution.showTestPersonas")}
        </Button>
      ) : null}
    </Card>
  );
}

// =====================================================================
// Human Inbox — governance work queue
// =====================================================================

export const HumanInboxPage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});
  const [continuedActions, setContinuedActions] = useState<
    Record<string, { work: HumanInboxMeetingAction; ticket: MeetingActionItem | null }>
  >({});
  const toggleSummary = (id: string) =>
    setExpandedSummaries((prev) => ({ ...prev, [id]: !prev[id] }));
  const personaFocus = (searchParams.get("persona_id") ?? searchParams.get("persona"))?.trim() ?? "";
  const targetFocus = (searchParams.get("target_id") ?? searchParams.get("holding_id"))?.trim() ?? "";
  const runtimeFocus = searchParams.get("runtime_id")?.trim() ?? "";
  const targetTypeFocus = searchParams.get("target_type")?.trim() ?? (targetFocus ? "target" : "");
  const { data, loading, error = null, refresh } = useV5Live<HumanInboxList>((signal) => {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) {
      controller.abort(signal.reason);
    } else {
      signal?.addEventListener("abort", onOuterAbort, { once: true });
    }
    const timer = setTimeout(
      () => controller.abort(new DOMException("Human inbox request timed out", "TimeoutError")),
      5000,
    );
    return mgmt.humanInbox.list({ signal: controller.signal }).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    });
  }, [], { cacheKey: "oversight.humanInbox" });
  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => humanInboxRank(b.kind) - humanInboxRank(a.kind)),
    [data],
  );
  const surfaces = data?.meta?.surfaces ?? {};
  const isDegraded = Object.values(surfaces).some(
    (surface) =>
      surface.status === "degraded" ||
      surface.status === "unavailable" ||
      surface.status === "denied",
  );
  const isInitialPending = loading && !data && !error;
  const isTransportUnavailable = Boolean(error);
  const isDegradedQueue = !loading && !error && isDegraded;
  const returnedCount = (data ?? []).length;
  const pageTotal = data?.page_info?.total ?? data?.pageInfo?.total;
  const hasPartialTotal =
    !loading &&
    !error &&
    typeof pageTotal === "number" &&
    Number.isFinite(pageTotal) &&
    pageTotal > returnedCount;

  const hasTargetContext = Boolean(targetFocus || runtimeFocus);
  const focusTokens = useMemo(
    () => (hasTargetContext
      ? [targetFocus, runtimeFocus].filter(Boolean)
      : [personaFocus].filter(Boolean)),
    [hasTargetContext, personaFocus, runtimeFocus, targetFocus],
  );
  const matchingItems = useMemo(() => {
    if (focusTokens.length === 0) return sorted;
    return sorted.filter((it) => [
      it.id,
      it.title,
      it.titleDisplay,
      it.rawTitle,
      it.summary,
      it.personaId,
      it.personaDisplayName,
      it.strategyId,
      it.strategyDisplayName,
      it.bindingId,
      it.sourceId,
      it.reviewId,
      it.detailHref,
      it.links?.manageHref,
      it.links?.recommendedActionHref,
      it.links?.evidenceHref,
    ].some((value) => focusTokens.some((token) => {
      const encoded = encodeURIComponent(token);
      return value?.includes(token) || value?.includes(encoded);
    })));
  }, [focusTokens, sorted]);
  const visibleItems = hasTargetContext && matchingItems.length === 0 ? sorted : matchingItems;
  const isPersonaFocusLoading = Boolean(personaFocus && !hasTargetContext && loading && data === undefined);
  const hasPersonaFocusMatch = !personaFocus || matchingItems.length > 0;
  const targetContextParts = [
    targetTypeFocus && targetFocus ? `${targetTypeFocus}: ${targetFocus}` : targetFocus,
    personaFocus ? `persona: ${personaFocus}` : "",
    runtimeFocus ? `runtime: ${runtimeFocus}` : "",
  ].filter(Boolean);
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.inbox.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.inbox.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("mgmt.inbox.subtitleFmt", { count: HUMAN_INBOX_KINDS.length })}
        </p>
        {hasPartialTotal && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="inbox-partial-count">
            {t("mgmt.inbox.shownOfTotalFmt", { shown: returnedCount, total: pageTotal })}
          </p>
        )}
      </header>
      {hasTargetContext && (
        <Card className="border-primary/30 bg-primary/5 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              Target context: {targetContextParts.join(" · ")}
              {matchingItems.length > 0
                ? ` · ${matchingItems.length} matching inbox item(s)`
                : " · no direct inbox item matched; showing live queue"}
            </span>
            <div className="flex flex-wrap gap-2">
              {personaFocus && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/management/personas/${encodeURIComponent(personaFocus)}`}>
                    {t("mgmt.inbox.backToPersona")}
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link to="/management/human-inbox">{t("mgmt.inbox.showAllItems")}</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}
      {personaFocus && !hasTargetContext && (
        <Card className={"p-3 text-sm " + (isPersonaFocusLoading || hasPersonaFocusMatch
          ? "border-primary/30 bg-primary/5"
          : "border-status-warning/30 bg-status-warning/10")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              {isPersonaFocusLoading
                ? t("mgmt.inbox.focusLoadingPersonaFmt", { persona: personaFocus })
                : hasPersonaFocusMatch
                ? t("mgmt.inbox.focusedPersonaFmt", { persona: personaFocus, count: visibleItems.length })
                : t("mgmt.inbox.focusMissingPersonaFmt", { persona: personaFocus })}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to={`/management/personas/${encodeURIComponent(personaFocus)}`}>
                  {t("mgmt.inbox.backToPersona")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/management/human-inbox">{t("mgmt.inbox.showAllItems")}</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}
      {isInitialPending && (
        <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{t("mgmt.inbox.loadingQueue", "Loading live queue...")}</span>
        </div>
      )}
      {isTransportUnavailable && (
        <Card className="border-status-failed/30 bg-status-failed/10 p-4 text-sm flex flex-col gap-2">
          <div className="flex items-center gap-2 text-status-failed">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">{t("mgmt.inbox.transportErrorTitle", "Transport Unavailable")}</span>
          </div>
          <p className="text-muted-foreground">
            {t("mgmt.inbox.transportErrorDesc", "Unable to retrieve live queue items because the server is unreachable or returned an error.")}
          </p>
          <div>
            <Button size="sm" variant="outline" onClick={() => refresh?.()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              {t("mgmt.inbox.retry", "Retry")}
            </Button>
          </div>
        </Card>
      )}
      {isDegradedQueue && (
        <Card className="border-status-warning/30 bg-status-warning/10 p-3 text-sm flex items-center justify-between gap-2">
          <span className="text-foreground">
            {t("mgmt.inbox.degradedQueueDesc", "Live queue status is degraded. Some items might be missing or delayed due to a downstream timeout.")}
          </span>
          <Button size="sm" variant="outline" onClick={() => refresh?.()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            {t("mgmt.inbox.refresh", "Refresh")}
          </Button>
        </Card>
      )}
      {!loading && !error && visibleItems.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          {isDegraded
            ? t("mgmt.inbox.degradedEmptyBody", "No items visible in this degraded view. Try refreshing.")
            : personaFocus
            ? t("mgmt.inbox.focusEmptyBodyFmt", { persona: personaFocus })
            : t("mgmt.inbox.emptyBody")}
        </Card>
      )}
      {visibleItems.map((it) => {
        const evidenceRefs = it.evidenceRefs ?? [];
        const evidenceHref = evidenceRefs.length > 0 && it.detailHref
          ? `${it.detailHref}#evidence`
          : it.links?.evidenceHref;
        const primaryTitle = it.titleDisplay || it.title;
        const secondaryId =
          it.rawTitle && it.rawTitle !== primaryTitle
            ? it.rawTitle
            : it.sourceId && it.sourceId !== primaryTitle
              ? it.sourceId
              : undefined;
        const personaDisplay = resolveBffSubjectDisplay(
          {
            id: it.personaId,
            displayName: it.personaDisplayName,
            nameMissing: it.personaNameMissing,
          },
          t,
        );
        const strategyDisplay = resolveBffSubjectDisplay(
          {
            id: it.strategyId,
            displayName: it.strategyDisplayName,
            nameMissing: it.strategyNameMissing,
          },
          t,
        );
        const hasIncidentSummaryInputs = Boolean(
          it.summaryKey ||
          it.kind === "incident" ||
          it.occurrenceCount !== undefined ||
          (it.observed !== undefined && it.threshold !== undefined),
        );
        const localizedIncidentSummary = hasIncidentSummaryInputs
          ? formatLocalizedIncidentSummary(it, t)
          : "";
        const safeFallbackSummary =
          it.summary &&
          it.summary !== it.evidenceSummary &&
          !isRawEvidenceSummaryText(it.summary)
            ? it.summary
            : "";
        const cardSummary = localizedIncidentSummary || safeFallbackSummary;

        return (
        <Card key={it.id} className="p-4" data-testid={`inbox-card-${it.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{it.kind}</Badge>
              <span className="text-sm font-medium text-foreground" data-testid={`inbox-title-${it.id}`}>
                {primaryTitle}
              </span>
              {secondaryId ? (
                <code
                  className="text-xs font-mono text-muted-foreground"
                  data-testid={`inbox-secondary-id-${it.id}`}
                >
                  {secondaryId}
                </code>
              ) : null}
              {!it.canProceed && (
                <Badge variant="outline" className="bg-status-failed/15 text-status-failed border-status-failed/30">
                  {t("mgmt.inbox.cannotProceedBadge")}
                </Badge>
              )}
            </div>
            {it.requiredRole && (
              <Badge variant="outline">{t("mgmt.inbox.requiredRoleFmt", { role: it.requiredRole })}</Badge>
            )}
          </div>
          {(personaDisplay.primaryText !== "—" || strategyDisplay.primaryText !== "—" || it.bindingId) && (
            <div
              className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
              data-testid={`inbox-subjects-${it.id}`}
            >
              {personaDisplay.primaryText !== "—" && (
                <span className="inline-flex flex-wrap items-center gap-1" data-testid={`inbox-persona-${it.id}`}>
                  <span className="font-medium text-foreground">{personaDisplay.primaryText}</span>
                  {personaDisplay.secondaryId && (
                    <code className="font-mono text-[11px] text-muted-foreground">
                      ({personaDisplay.secondaryId})
                    </code>
                  )}
                  {personaDisplay.nameMissing && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1"
                      data-name-missing="true"
                      data-testid={`inbox-persona-name-missing-${it.id}`}
                    >
                      {personaDisplay.nameMissingBadgeLabel}
                    </Badge>
                  )}
                </span>
              )}
              {strategyDisplay.primaryText !== "—" && (
                <span className="inline-flex flex-wrap items-center gap-1" data-testid={`inbox-strategy-${it.id}`}>
                  <span className="font-medium text-foreground">{strategyDisplay.primaryText}</span>
                  {strategyDisplay.secondaryId && (
                    <code className="font-mono text-[11px] text-muted-foreground">
                      ({strategyDisplay.secondaryId})
                    </code>
                  )}
                  {strategyDisplay.nameMissing && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1"
                      data-name-missing="true"
                      data-testid={`inbox-strategy-name-missing-${it.id}`}
                    >
                      {strategyDisplay.nameMissingBadgeLabel}
                    </Badge>
                  )}
                </span>
              )}
              {it.bindingId && (
                <code className="font-mono text-[11px] text-muted-foreground">
                  {it.bindingId}
                </code>
              )}
            </div>
          )}
          {cardSummary && (() => {
            const isExpanded = Boolean(expandedSummaries[it.id]);
            return (
              <div className="mt-2">
                <p
                  data-testid={`inbox-summary-${it.id}`}
                  className={`text-sm text-muted-foreground break-words ${isExpanded ? "" : "line-clamp-3"}`}
                >
                  {cardSummary}
                </p>
                <button
                  type="button"
                  data-testid={`inbox-summary-toggle-${it.id}`}
                  aria-expanded={isExpanded}
                  onClick={() => toggleSummary(it.id)}
                  className="mt-1 text-xs font-medium text-primary hover:underline"
                >
                  {isExpanded
                    ? t("mgmt.inbox.collapseSummary", { defaultValue: "Show less" })
                    : t("mgmt.inbox.expandSummary", { defaultValue: "Show more" })}
                </button>
              </div>
            );
          })()}
          {/* The consequence triplet only exists on the legacy shape; live
              governance items carry a summary instead. */}
          {(it.consequenceIfApproved || it.consequenceIfRejected || it.consequenceIfIgnored) && (
            <dl className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
              <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifApproved")}</dt><dd className="text-foreground">{it.consequenceIfApproved}</dd></div>
              <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifRejected")}</dt><dd className="text-foreground">{it.consequenceIfRejected}</dd></div>
              <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifIgnored")}</dt><dd className="text-foreground">{it.consequenceIfIgnored}</dd></div>
            </dl>
          )}
          {it.kind === "meeting_action" && it.meetingAction ? (
            <div className="mt-3">
              <MeetingActionResponseCard
                work={it.meetingAction}
                meetingHref={it.meetingAction.meetingHref ?? it.links?.manageHref}
                initialContinuation={continuedActions[it.meetingAction.ticketId]?.ticket ?? null}
                onSaved={(_, canonicalTicket) => {
                  const actionWork = it.meetingAction!;
                  setContinuedActions((prev) => ({
                    ...prev,
                    [actionWork.ticketId]: {
                      work: { ...actionWork, canRespond: false },
                      ticket: canonicalTicket,
                    },
                  }));
                  void refresh?.();
                }}
              />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Live BFF inbox items lack the FE-composed detailHref/links; guard
                so a degraded/real payload renders instead of crashing the page. */}
            {it.detailHref && (
              <Button asChild size="sm" variant="outline">
                <Link to={`${it.detailHref}?returnUrl=${encodeURIComponent(location.pathname + location.search)}`}>
                  {t("mgmt.actions.openDetail")}
                </Link>
              </Button>
            )}
            {it.links?.manageHref && (
              <Button asChild size="sm" variant="outline"><Link to={it.links.manageHref}>{t("mgmt.actions.openActionPage")}</Link></Button>
            )}
            {it.personaId && (
              <Button asChild size="sm" variant="outline">
                <Link aria-label={`${it.personaId} trade journeys`} to={tradeJourneyHref(location, { personaId: it.personaId }, "Human Inbox")}>
                  {t("nav.tradeJourneys", { defaultValue: "Trade Journeys" })}
                </Link>
              </Button>
            )}
            {evidenceHref ? (
              <Button asChild size="sm" variant="outline">
                <Link to={evidenceHref}>
                  {evidenceRefs.length > 0
                    ? t("mgmt.inbox.evidenceCountFmt", { count: evidenceRefs.length })
                    : t("mgmt.actions.viewEvidence")}
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground self-center">{t("mgmt.actions.evidenceMissing")}</span>
            )}
          </div>
        </Card>
        );
      })}
      {Object.values(continuedActions)
        .filter(
          (entry) =>
            !visibleItems.some(
              (it) =>
                it.kind === "meeting_action" &&
                it.meetingAction?.ticketId === entry.work.ticketId,
            ),
        )
        .map((entry) => (
          <div
            key={`continued-${entry.work.ticketId}`}
            data-testid={`inbox-continued-ticket-${entry.work.ticketId}`}
          >
            <MeetingActionResponseCard
              work={entry.work}
              meetingHref={entry.work.meetingHref}
              initialContinuation={entry.ticket}
            />
          </div>
        ))}
    </section>
  );
};

// =====================================================================
// Trading Pulse
// =====================================================================

const statusTone = (status: unknown): string => {
  const normalized = String(status ?? "").toLowerCase();
  if (["ok", "live", "fresh", "active", "verified", "available"].includes(normalized)) {
    return "bg-status-success/15 text-status-success border-status-success/30";
  }
  if (["watch", "degraded", "missing", "unavailable", "unverifiable", "unverified", "partial", "stale"].includes(normalized)) {
    return "bg-status-warning/15 text-status-warning border-status-warning/30";
  }
  if (["breached", "failed", "error"].includes(normalized)) {
    return "bg-status-failed/15 text-status-failed border-status-failed/30";
  }
  return "bg-muted text-muted-foreground border-border";
};

const pulseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const PULSE_TECHNICAL_ID_RE =
  /^(?:rt|rb|persona|strategy|runtime|binding|tj|dec|ord)_[a-z0-9_-]+$|^(?:rt|rb|persona|strategy|runtime|binding|tj|dec|ord)-[a-z0-9_-]+$/i;

const isPulseTechnicalId = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return PULSE_TECHNICAL_ID_RE.test(trimmed);
};

const formatPulseInt = (value: unknown): string => {
  const n = pulseNumber(value);
  if (n === null) return "—";
  return Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
};

const formatPulseCurrencyAmount = (value: unknown, currency?: string | null): string => {
  const n = pulseNumber(value);
  if (n === null) return "—";
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const cur = typeof currency === "string" && currency.trim() ? currency.trim() : "";
  return cur ? `${cur} ${formatted}` : formatted;
};

const formatPulsePercentFromFraction = (fraction: unknown): string | null => {
  const n = pulseNumber(fraction);
  if (n === null) return null;
  const pct = n * 100;
  if (Math.abs(pct - Math.round(pct)) < 1e-7) {
    return `${Math.round(pct)}%`;
  }
  const fixed = Number(pct.toFixed(2));
  const minDec = Math.abs(fixed * 10 - Math.round(fixed * 10)) < 1e-7 ? 1 : 2;
  return `${fixed.toLocaleString("en-US", {
    minimumFractionDigits: minDec,
    maximumFractionDigits: 2,
  })}%`;
};

const formatPulseBps = (value: unknown): string | null => {
  const n = pulseNumber(value);
  if (n === null) return null;
  if (Math.abs(n - Math.round(n)) < 1e-7) {
    return Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return Number(n.toFixed(2)).toLocaleString("en-US", { maximumFractionDigits: 2 });
};

const formatPulseRatio = (value: unknown): string => {
  const n = pulseNumber(value);
  if (n === null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
};

type PulseTranslate = (key: string, options?: Record<string, unknown>) => string;

const formatPulseStage = (stage: unknown, t: PulseTranslate): string => {
  const s = String(stage ?? "").trim().toLowerCase();
  if (s === "paper" || s === "paper_running") return t("mgmt.pulse.stagePaper");
  if (s === "canary" || s === "canary_running") return t("mgmt.pulse.stageCanary");
  if (s === "live" || s === "live_running") return t("mgmt.pulse.stageLive");
  return t("mgmt.pulse.stageUnknown");
};

const formatPulseExecutionStatus = (status: unknown, t: PulseTranslate): string => {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "active") return t("mgmt.pulse.statusActive");
  if (["running", "paper_running", "canary_running", "live_running"].includes(s)) {
    return t("mgmt.pulse.statusRunning");
  }
  if (s === "paused") return t("mgmt.pulse.statusPaused");
  if (s === "stopped") return t("mgmt.pulse.statusStopped");
  if (s === "degraded" || s === "watch") return t("mgmt.pulse.statusDegraded");
  if (["failed", "error", "breached"].includes(s)) return t("mgmt.pulse.statusFailed");
  if (s === "idle" || s === "ready") return t("mgmt.pulse.statusIdle");
  return t("mgmt.pulse.statusUnknown");
};

const formatPulsePnlDefinition = (def: unknown, t: PulseTranslate): string => {
  const d = String(def ?? "").trim().toLowerCase();
  if (["realized_plus_unrealized", "combined", "total", "realized_and_unrealized"].includes(d)) {
    return t("mgmt.pulse.pnlDefCombined");
  }
  if (d === "realized" || d === "realized_only") return t("mgmt.pulse.pnlDefRealized");
  if (d === "unrealized" || d === "unrealized_only") return t("mgmt.pulse.pnlDefUnrealized");
  return t("mgmt.pulse.pnlDefUnverified");
};

const isVerifiedTwEquitySymbol = (symbol: unknown): boolean => {
  if (typeof symbol !== "string") return false;
  const trimmed = symbol.trim();
  return Boolean(trimmed) && !isPulseTechnicalId(trimmed) && /^[A-Za-z0-9]+\.(?:TWSE|TPEX)$/i.test(trimmed);
};

const formatPulseQuantityUnit = (
  unit: unknown,
  t: PulseTranslate,
  symbol?: unknown,
): { localized: string; isKnownUnit: boolean } => {
  const raw = typeof unit === "string" && unit.trim() && !isPulseTechnicalId(unit) ? unit.trim() : null;
  const norm = (raw ?? "").toLowerCase();
  if (["shares", "share", "股"].includes(norm)) {
    return { localized: t("mgmt.pulse.unitShares"), isKnownUnit: true };
  }
  if (["lots", "lot", "張"].includes(norm)) {
    return { localized: t("mgmt.pulse.unitLots"), isKnownUnit: true };
  }
  if (["contracts", "contract", "口"].includes(norm)) {
    return { localized: t("mgmt.pulse.unitContracts"), isKnownUnit: true };
  }
  if (
    (!norm || ["absolute_order_quantity", "order_quantity", "quantity"].includes(norm))
    && isVerifiedTwEquitySymbol(symbol)
  ) {
    return { localized: t("mgmt.pulse.unitShares"), isKnownUnit: true };
  }
  return { localized: t("mgmt.pulse.unitNeutral"), isKnownUnit: false };
};

const formatPulseMetricReason = (reason: unknown, t: PulseTranslate): string => {
  const r = String(reason ?? "").trim().toLowerCase();
  if (r === "no_fills") return t("mgmt.pulse.reasonNoFills");
  if (r === "min_10_daily_returns_required") {
    return t("mgmt.pulse.reasonMin10DailyReturns");
  }
  if (["insufficient_samples", "insufficient_data"].includes(r)) {
    return t("mgmt.pulse.reasonInsufficientSamples");
  }
  if (["zero_return_variance", "zero_variance"].includes(r)) {
    return t("mgmt.pulse.reasonZeroVariance");
  }
  if (r === "no_submitted_orders") return t("mgmt.pulse.reasonNoSubmittedOrders");
  if (["source_unavailable", "telemetry_unavailable", "unavailable"].includes(r)) {
    return t("mgmt.pulse.reasonSourceUnavailable");
  }
  if (["stale", "telemetry_stale"].includes(r)) return t("mgmt.pulse.reasonStale");
  if (["uncomparable_pnl", "missing_pnl_scope"].includes(r)) {
    return t("mgmt.pulse.reasonUncomparablePnl");
  }
  return t("mgmt.pulse.reasonUnknown");
};

const formatPulseOutcomeReason = (reasonCode: unknown, t: PulseTranslate): string => {
  const raw = typeof reasonCode === "string" ? reasonCode.trim() : "";
  const r = raw.toLowerCase();
  if (["insufficient_cash", "insufficient_buying_power", "insufficient_funds"].includes(r)) {
    return t("mgmt.pulse.eventReasonInsufficientCash");
  }
  if (r === "reason_not_recorded") return t("mgmt.pulse.eventReasonNotRecorded");
  if (["risk_limit_exceeded", "max_position_exceeded", "exposure_limit_exceeded"].includes(r)) {
    return t("mgmt.pulse.eventReasonRiskLimit");
  }
  if (raw) {
    const resolved = reasonCodeDisplay(raw, t);
    if (resolved.isKnown && resolved.text && !isPulseTechnicalId(resolved.text)) {
      return resolved.text;
    }
  }
  return t("mgmt.pulse.eventReasonUnavailable");
};

const resolvePulsePersonaDisplayName = (
  row: {
    personaName?: string | null;
    strategyName?: string | null;
    subjectLabel?: string | null;
  },
  t: PulseTranslate,
): string => {
  const candidates = [row.personaName, row.subjectLabel, row.strategyName];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() && !isPulseTechnicalId(candidate)) {
      return candidate.trim();
    }
  }
  return t("mgmt.pulse.unnamedPersona");
};

const resolvePulseStrategyDisplayName = (
  row: ManagementTradingPulseRuntimeRow,
  personaDisplayName: string,
): string | null => {
  const raw = row.strategyName;
  if (typeof raw !== "string" || !raw.trim() || isPulseTechnicalId(raw)) return null;
  const trimmed = raw.trim();
  return trimmed !== personaDisplayName ? trimmed : null;
};

const resolvePulseRowSymbol = (row: {
  underlyingSymbol?: string | null;
  latestOutcome?: ManagementTradingPulseLatestOutcome | Record<string, unknown> | null;
}): string | null => {
  const sym = row.underlyingSymbol;
  if (typeof sym === "string" && sym.trim() && !isPulseTechnicalId(sym)) {
    return sym.trim();
  }
  const outcomeSym = row.latestOutcome && typeof row.latestOutcome === "object"
    ? (row.latestOutcome as { symbol?: unknown }).symbol
    : null;
  if (typeof outcomeSym === "string" && outcomeSym.trim() && !isPulseTechnicalId(outcomeSym)) {
    return outcomeSym.trim();
  }
  return null;
};

const resolvePulseRowFillCount = (row: ManagementTradingPulseRuntimeRow): number | null => {
  const perf = row.performanceContext;
  const sourceStatus = String(perf?.sourceStatus ?? "").toLowerCase();
  const ledgerFills = pulseNumber(perf?.ledgerFillCount);
  if (ledgerFills !== null && ledgerFills >= 0) return ledgerFills;
  if (sourceStatus === "unavailable") return null;
  const executed = pulseNumber(row.executedTradeCount);
  if (executed !== null && executed >= 0) return executed;
  const total = pulseNumber(row.totalTrades);
  return total !== null && total >= 0 ? total : null;
};

export const TradingPulsePage = () => {
  const { t } = useTranslation();
  const { data: model, loading } = useV5Live((signal) => mgmt.tradingPulse.getLiveOnly({ signal }), [], {
    cacheKey: "oversight.tradingPulse",
  });
  if (!model) {
    return (
      <section className="p-4 sm:p-6 space-y-4" aria-label={t("mgmt.pulse.title")}>
        <header>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.pulse.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.pulse.subtitle")}</p>
        </header>
        <LiveOnlyNotice
          title={loading
            ? t("common.loading", { defaultValue: "Loading..." })
            : t("mgmt.liveOnly.unavailableTitle", { defaultValue: "Live data unavailable" })}
          body={loading
            ? t("mgmt.liveOnly.loadingBody", { defaultValue: "Waiting for live BFF data." })
            : t("mgmt.liveOnly.unavailableBody", { defaultValue: "This page does not render seed, demo, or non-production fallback data." })}
        />
      </section>
    );
  }

  const rows = model.runtimeRows;
  const snapshotAt = model.summary.snapshotAt ?? model.meta.snapshotAt;

  return (
    <section className="p-4 sm:p-6 space-y-4" aria-label={t("mgmt.pulse.title")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.pulse.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.pulse.subtitle")}</p>
        </div>
        {snapshotAt && (
          <div className="text-xs text-muted-foreground">
            {t("mgmt.pulse.snapshotAt")}：{safeDateTime(snapshotAt)}
          </div>
        )}
      </header>

      <TradingPulseOperatorScopeSection model={model} rows={rows} />

      <TradingPulsePnlGroupsSection model={model} rows={rows} />

      <TradingPulseNotableEventsSection rows={rows} />

      <TradingPulsePersonaDetailsSection model={model} rows={rows} />

      <TradingPulseRankingsSection runtimeRows={rows} />

      <TradingPulseDiagnosticsSection model={model} rows={rows} />
    </section>
  );
};

const isVerifiedAllPaperBaselineNotRequired = (
  model: ManagementTradingPulseModel,
  rows: ManagementTradingPulseRuntimeRow[],
): boolean => {
  if (rows.length === 0) return false;
  const scope = model.summary.operatorScope;
  const scopeStatus = String(scope.status ?? "unverified").trim().toLowerCase();
  if (scopeStatus !== "verified") return false;

  const personaCount = pulseNumber(scope.personaCount);
  const runtimeCount = pulseNumber(scope.runtimeCount ?? model.summary.runtimeCount);
  if ((personaCount === null || personaCount <= 0) && (runtimeCount === null || runtimeCount <= 0)) {
    return false;
  }

  if (!rows.every((r) => String(r.deploymentStage ?? "").trim().toLowerCase() === "paper")) {
    return false;
  }

  const scopeStageEntries = Object.entries(scope.byStage ?? {});
  const summaryStageEntries = Object.entries(model.summary.byStage ?? {});
  if (scopeStageEntries.length === 0 && summaryStageEntries.length === 0) {
    return false;
  }

  let confirmedPaperInScope = false;
  for (const [stageKey, entry] of scopeStageEntries) {
    const normalizedStage = stageKey.trim().toLowerCase();
    const pc = pulseNumber(entry.personaCount);
    const rc = pulseNumber(entry.runtimeCount);
    if (normalizedStage === "paper") {
      if ((pc !== null && pc > 0) || (rc !== null && rc > 0)) {
        confirmedPaperInScope = true;
      }
      if (personaCount !== null && pc !== null && pc !== personaCount) return false;
      if (runtimeCount !== null && rc !== null && rc !== runtimeCount) return false;
    } else {
      if (pc === null && rc === null) return false;
      if ((pc !== null && pc > 0) || (rc !== null && rc > 0)) return false;
    }
  }

  let confirmedPaperInSummary = false;
  for (const [stageKey, count] of summaryStageEntries) {
    const normalizedStage = stageKey.trim().toLowerCase();
    const rc = pulseNumber(count);
    if (normalizedStage === "paper") {
      if (rc !== null && rc > 0) {
        confirmedPaperInSummary = true;
      }
      if (runtimeCount !== null && rc !== null && rc !== runtimeCount) return false;
    } else {
      if (rc === null || rc > 0) return false;
    }
  }

  if (!confirmedPaperInScope && !confirmedPaperInSummary) {
    return false;
  }

  const baselineRequired = pulseNumber(
    model.summary.baselineRequiredCount ?? model.summary.coverage?.baselineRequiredCount,
  );
  if (baselineRequired !== null && baselineRequired > 0) return false;
  if ((pulseNumber(model.summary.baselineComparisonCount) ?? 0) > 0) return false;
  if ((pulseNumber(model.summary.baselineWatchCount) ?? 0) > 0) return false;
  if ((pulseNumber(model.summary.baselineBreachedCount) ?? 0) > 0) return false;
  if ((model.summary.missingBaselineRuntimeIds?.length ?? 0) > 0) return false;

  const hasConflictingRowBaseline = rows.some((r) => {
    if (!r.baselineComparison) return false;
    return String(r.baselineComparison.status ?? "").trim().toLowerCase() !== "not_required";
  });
  if (hasConflictingRowBaseline) return false;

  const allRowsConfirmNotRequired = rows.every(
    (r) =>
      Boolean(r.baselineComparison)
      && String(r.baselineComparison?.status ?? "").trim().toLowerCase() === "not_required",
  );

  const byBaselineEntries = Object.entries(model.summary.byBaselineStatus ?? {});
  const byBaselineNotRequiredCount = pulseNumber(model.summary.byBaselineStatus?.not_required);
  const summaryByBaselineConfirmsNotRequired =
    byBaselineEntries.length > 0
    && byBaselineNotRequiredCount !== null
    && byBaselineNotRequiredCount >= rows.length
    && byBaselineEntries.every(([k, v]) => k.trim().toLowerCase() === "not_required" || (pulseNumber(v) ?? 0) === 0);

  return baselineRequired === 0 || allRowsConfirmNotRequired || summaryByBaselineConfirmsNotRequired;
};

const TradingPulseOperatorScopeSection = ({
  model,
  rows,
}: {
  model: ManagementTradingPulseModel;
  rows: ManagementTradingPulseRuntimeRow[];
}) => {
  const { t } = useTranslation();
  const scope = model.summary.operatorScope;
  const scopeStatus = String(scope.status ?? "unverified").trim().toLowerCase();
  const personaCount = pulseNumber(scope.personaCount);
  const runtimeCount = pulseNumber(scope.runtimeCount ?? model.summary.runtimeCount);

  const badgeLabel =
    scopeStatus === "verified"
      ? t("mgmt.pulse.scopeVerifiedBadge")
      : scopeStatus === "partial"
        ? t("mgmt.pulse.scopePartialBadge")
        : scopeStatus === "unavailable"
          ? t("mgmt.pulse.scopeUnavailableBadge")
          : t("mgmt.pulse.scopeUnverifiedBadge");

  const stageChips: string[] = [];
  for (const [stageKey, entry] of Object.entries(scope.byStage)) {
    const pc = pulseNumber(entry.personaCount);
    const rc = pulseNumber(entry.runtimeCount);
    const stageLabel = formatPulseStage(stageKey, t);
    if (pc !== null) {
      stageChips.push(t("mgmt.pulse.scopeStagePersonaCountFmt", { stage: stageLabel, count: formatPulseInt(pc) }));
    } else if (rc !== null) {
      stageChips.push(t("mgmt.pulse.scopeStageRuntimeOnlyFmt", { stage: stageLabel, count: formatPulseInt(rc) }));
    }
  }
  if (stageChips.length === 0 && scopeStatus !== "unavailable") {
    for (const [stageKey, count] of Object.entries(model.summary.byStage)) {
      const rc = pulseNumber(count);
      if (rc !== null) {
        stageChips.push(
          t("mgmt.pulse.scopeStageRuntimeOnlyFmt", {
            stage: formatPulseStage(stageKey, t),
            count: formatPulseInt(rc),
          }),
        );
      }
    }
  }

  const excludedProbeCount = pulseNumber(scope.excludedProbeCount);
  const scopeReason = String(scope.reason ?? "").trim().toLowerCase();
  const isAllProbesEmpty =
    rows.length === 0
    && personaCount === 0
    && ((excludedProbeCount !== null && excludedProbeCount > 0) || /probe|test/.test(scopeReason));

  const baselineRequired = pulseNumber(
    model.summary.baselineRequiredCount ?? model.summary.coverage?.baselineRequiredCount,
  );
  const allPaperBaselineNotRequired = isVerifiedAllPaperBaselineNotRequired(model, rows);

  const surfaces = Object.entries(model.meta.surfaces ?? {});
  const isHealthySurface = (status: unknown): boolean =>
    ["ok", "live", "fresh", "available", "verified", "not_required"].includes(
      String(status ?? "").trim().toLowerCase(),
    );
  const extractRowDegradedChecks = (row: ManagementTradingPulseRuntimeRow): string[] => {
    const rawRow = row as Record<string, unknown>;
    const rowHealth =
      row.rowHealth && typeof row.rowHealth === "object"
        ? (row.rowHealth as Record<string, unknown>)
        : row.row_health && typeof row.row_health === "object"
          ? (row.row_health as Record<string, unknown>)
          : null;
    const candidates = [
      rowHealth?.degradedChecks,
      rowHealth?.degraded_checks,
      rawRow.rowHealthDegradedChecks,
      rawRow.row_health_degraded_checks,
      rawRow.degradedChecks,
      rawRow.degraded_checks,
    ];
    const out: string[] = [];
    for (const list of candidates) {
      if (Array.isArray(list)) {
        for (const item of list) {
          if (typeof item === "string" && item.trim()) {
            out.push(item.trim().toLowerCase());
          }
        }
      }
    }
    return Array.from(new Set(out));
  };
  const extractRowHealthStatus = (row: ManagementTradingPulseRuntimeRow): string => {
    const rawRow = row as Record<string, unknown>;
    const rowHealth =
      row.rowHealth && typeof row.rowHealth === "object"
        ? (row.rowHealth as Record<string, unknown>)
        : row.row_health && typeof row.row_health === "object"
          ? (row.row_health as Record<string, unknown>)
          : null;
    return String(rowHealth?.status ?? rawRow.rowHealthStatus ?? rawRow.row_health_status ?? "")
      .trim()
      .toLowerCase();
  };
  const hasSurfaceIssue = surfaces.some(([, s]) => !isHealthySurface(s.status));
  const hasRowSourceIssue = rows.some((r) => {
    const st = String(r.performanceContext?.sourceStatus ?? "").trim().toLowerCase();
    return st === "unavailable" || st === "stale";
  });
  const hasRowHealthIssue = rows.some((r) => {
    const rhStatus = extractRowHealthStatus(r);
    const checks = extractRowDegradedChecks(r);
    return checks.length > 0 || (Boolean(rhStatus) && !isHealthySurface(rhStatus));
  });
  const showSourceIssueReminder =
    hasSurfaceIssue || hasRowSourceIssue || hasRowHealthIssue || scopeStatus === "partial" || scopeStatus === "unavailable";
  const isOnlyPaperMonitoringIssue = (() => {
    if (!showSourceIssueReminder || scopeStatus !== "verified" || hasRowSourceIssue) return false;
    if (rows.length === 0 || !rows.every((r) => isPulseSourceVerifiedAvailable(r.performanceContext?.sourceStatus))) {
      return false;
    }
    if ((model.summary.missingTelemetryRuntimeIds?.length ?? 0) > 0) return false;
    if ((model.summary.missingBaselineRuntimeIds?.length ?? 0) > 0) return false;
    const surfaceMap = model.meta.surfaces ?? {};
    const monitoringSurface = surfaceMap.paper_runtime_monitoring;
    if (!monitoringSurface || isHealthySurface(monitoringSurface.status)) return false;
    const hasVerifiedTradingSurface = ["runtime_roster", "telemetry_summary"].some((key) =>
      isHealthySurface(surfaceMap[key]?.status),
    );
    if (!hasVerifiedTradingSurface) return false;
    const allowedNonOkSurfaces = new Set([
      "paper_runtime_monitoring",
      "runtime_row_health",
      "management_trading_pulse",
      "management_trading_pulse_rankings",
    ]);
    for (const [key, surface] of surfaces) {
      if (!isHealthySurface(surface?.status) && !allowedNonOkSurfaces.has(key)) {
        return false;
      }
    }
    return rows.every((row) => {
      const checks = extractRowDegradedChecks(row);
      const rhStatus = extractRowHealthStatus(row);
      if (Boolean(rhStatus) && !isHealthySurface(rhStatus) && checks.length === 0) {
        return false;
      }
      return checks.every((check) => check === "paper_runtime_monitoring");
    });
  })();

  return (
    <Card className="p-4 space-y-3" data-testid="trading-pulse-operator-scope">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.scopeSectionTitle")}</h2>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground">
              {personaCount !== null && scopeStatus !== "unavailable"
                ? t("mgmt.pulse.scopePersonaCountFmt", { count: formatPulseInt(personaCount) })
                : t("mgmt.pulse.scopePersonaCountUnknown")}
            </span>
            {runtimeCount !== null && personaCount !== null && runtimeCount !== personaCount && (
              <span className="text-xs text-muted-foreground">
                {t("mgmt.pulse.scopeRuntimeCountDiffFmt", { count: formatPulseInt(runtimeCount) })}
              </span>
            )}
          </div>
        </div>
        <Badge variant="outline" className={statusTone(scopeStatus)}>
          {badgeLabel}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{t("mgmt.pulse.scopeStageBreakdownLabel")}：</span>
        {stageChips.length > 0 ? (
          stageChips.map((chip) => (
            <Badge key={chip} variant="secondary">
              {chip}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">{t("mgmt.pulse.scopeNoStageBreakdown")}</span>
        )}
      </div>

      {scopeStatus === "unverified" && (
        <p className="text-xs text-status-warning" data-testid="trading-pulse-scope-unverified">
          {t("mgmt.pulse.scopeUnverifiedNotice")}
        </p>
      )}
      {scopeStatus === "unavailable" && (
        <p className="text-xs text-status-warning" data-testid="trading-pulse-scope-unavailable">
          {t("mgmt.pulse.scopeUnavailableNotice")}
        </p>
      )}
      {scopeStatus === "partial" && (
        <p className="text-xs text-status-warning" data-testid="trading-pulse-scope-partial">
          {t("mgmt.pulse.scopePartialNotice")}
        </p>
      )}
      {scopeStatus === "verified" && personaCount === 0 && rows.length === 0 && (
        <p className="text-xs text-muted-foreground" data-testid="trading-pulse-scope-empty">
          {isAllProbesEmpty ? t("mgmt.pulse.scopeEmptyAllProbesNotice") : t("mgmt.pulse.scopeEmptyNormalNotice")}
        </p>
      )}

      {allPaperBaselineNotRequired && (
        <p className="text-xs text-muted-foreground">
          {t("mgmt.pulse.scopePaperBaselineSummary")}
        </p>
      )}
      {!allPaperBaselineNotRequired && baselineRequired !== null && baselineRequired > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("mgmt.pulse.scopeBaselineSummaryFmt", {
            covered: formatPulseInt(model.summary.baselineComparisonCount),
            required: formatPulseInt(baselineRequired),
            watch: formatPulseInt(model.summary.baselineWatchCount),
            breached: formatPulseInt(model.summary.baselineBreachedCount),
          })}
        </p>
      )}

      {showSourceIssueReminder && (
        <p className="text-xs text-status-warning" data-testid="trading-pulse-source-issue-reminder">
          {isOnlyPaperMonitoringIssue
            ? t("mgmt.pulse.paperMonitoringOnlySummaryAlert")
            : t("mgmt.pulse.sourceIssueSummaryAlert")}
        </p>
      )}
    </Card>
  );
};

const TradingPulsePnlGroupsSection = ({
  model,
  rows,
}: {
  model: ManagementTradingPulseModel;
  rows: ManagementTradingPulseRuntimeRow[];
}) => {
  const { t } = useTranslation();
  const groups: ManagementTradingPulsePnlGroup[] = model.summary.pnlGroups;
  const hasAnyRowPnl = rows.some((r) => pulseNumber(r.metrics?.pnl) !== null);

  return (
    <Card className="p-4 space-y-3" data-testid="trading-pulse-pnl-groups">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.pnlSectionTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("mgmt.pulse.pnlSectionSubtitle")}</p>
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="trading-pulse-pnl-groups-empty">
          {hasAnyRowPnl ? t("mgmt.pulse.pnlEmptyUncomparable") : t("mgmt.pulse.pnlEmptyNoFills")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g, idx) => {
            const val = pulseNumber(g.value);
            const covP = pulseNumber(g.coveredPersonaCount);
            const eligP = pulseNumber(g.eligiblePersonaCount);
            const covR = pulseNumber(g.coveredRuntimeCount);
            const eligR = pulseNumber(g.eligibleRuntimeCount);
            const startAt = g.periodStartAt;
            const endAt = g.periodEndAt;
            const asOf = g.asOf;
            const rawPeriodTokens = Array.from(
              new Set(
                [g.periodLabel, startAt, endAt]
                  .filter((x): x is string => typeof x === "string" && Boolean(x.trim()) && !isPulseTechnicalId(x))
                  .map((x) => x.trim()),
              ),
            );

            return (
              <div
                key={`${g.stage ?? "stage"}-${g.currency ?? "cur"}-${startAt ?? idx}`}
                role="group"
                className="rounded-md border border-border bg-background p-3 space-y-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{formatPulseStage(g.stage, t)}</Badge>
                    <Badge variant="secondary">
                      {g.currency || t("mgmt.pulse.pnlCurrencyUnverified")}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">
                    {formatPulsePnlDefinition(g.pnlDefinition, t)}
                  </span>
                </div>

                <div className="text-lg font-semibold text-foreground">
                  {val !== null ? (
                    <>
                      {formatPulseCurrencyAmount(val, g.currency)}
                      {val < 0 ? `（${t("mgmt.pulse.pnlLossTag")}）` : val === 0 ? `（${t("mgmt.pulse.pnlFlatTag")}）` : ""}
                    </>
                  ) : (
                    t("mgmt.pulse.pnlUnknown")
                  )}
                </div>

                <div className="font-medium text-foreground">
                  {covP !== null && eligP !== null
                    ? t("mgmt.pulse.pnlCoveragePersonaFmt", {
                        covered: formatPulseInt(covP),
                        eligible: formatPulseInt(eligP),
                      })
                    : covR !== null && eligR !== null
                      ? t("mgmt.pulse.pnlCoverageRuntimeFmt", {
                          covered: formatPulseInt(covR),
                          eligible: formatPulseInt(eligR),
                        })
                      : t("mgmt.pulse.pnlCoverageUnconfirmed")}
                </div>

                {covP !== null && eligP !== null && eligP > covP && (
                  <div className="text-[11px] text-muted-foreground">
                    {t("mgmt.pulse.pnlUncoveredHintFmt", { missing: formatPulseInt(eligP - covP) })}
                  </div>
                )}

                <div className="text-[11px] text-muted-foreground">
                  {startAt && (endAt || asOf)
                    ? t("mgmt.pulse.pnlPeriodRangeFmt", {
                        start: safeDateTime(startAt),
                        end: safeDateTime(endAt ?? asOf),
                      })
                    : startAt
                      ? t("mgmt.pulse.pnlPeriodStartOnlyFmt", { start: safeDateTime(startAt) })
                      : t("mgmt.pulse.pnlPeriodUnverified")}
                </div>

                {asOf && (
                  <div className="text-[11px] text-muted-foreground">
                    {t("mgmt.pulse.pnlAsOfFmt", { asOf: safeDateTime(asOf) })}
                  </div>
                )}

                {rawPeriodTokens.length > 0 && (
                  <div className="text-[11px] font-mono text-muted-foreground break-all">
                    {rawPeriodTokens.join(" · ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

const isPulseSourceAvailable = (sourceStatus: unknown): boolean => {
  const s = String(sourceStatus ?? "").trim().toLowerCase();
  return !s || ["available", "ok", "live", "fresh", "verified"].includes(s);
};

const isPulseSourceVerifiedAvailable = (sourceStatus: unknown): boolean => {
  const s = String(sourceStatus ?? "").trim().toLowerCase();
  return ["available", "ok", "live", "fresh", "verified"].includes(s);
};

const resolvePulseMissingFillRateKind = (
  row: ManagementTradingPulseRuntimeRow,
): "unavailable" | "stale" | "no_orders" | "unknown" => {
  const perf = row.performanceContext;
  const sourceStatus = String(perf?.sourceStatus ?? "").trim().toLowerCase();
  const fillDetails = perf?.fillRateDetails;
  const fillDetailsStatus = String(fillDetails?.status ?? "").trim().toLowerCase();
  const metricReason = String(perf?.metricReasons?.fill_rate ?? "").trim().toLowerCase();
  const detailsReason = String(fillDetails?.reason ?? "").trim().toLowerCase();
  const reasons = [metricReason, detailsReason].filter(Boolean);

  if (
    sourceStatus === "unavailable"
    || fillDetailsStatus === "unavailable"
    || reasons.includes("source_unavailable")
    || reasons.includes("telemetry_unavailable")
  ) {
    return "unavailable";
  }

  if (
    sourceStatus === "stale"
    || fillDetailsStatus === "stale"
    || reasons.includes("stale")
    || reasons.includes("telemetry_stale")
  ) {
    return "stale";
  }

  if (
    sourceStatus === "unknown"
    || sourceStatus === "unverified"
    || (fillDetailsStatus === "unknown" && !reasons.includes("no_submitted_orders"))
    || reasons.includes("unknown")
    || reasons.includes("unverified")
  ) {
    return "unknown";
  }

  const sourceVerified = isPulseSourceVerifiedAvailable(sourceStatus);
  const detailsStatusVerified = ["known", "available", "ok", "verified"].includes(fillDetailsStatus);
  const num = pulseNumber(fillDetails?.numerator);
  const den = pulseNumber(fillDetails?.denominator);

  if (
    sourceVerified
    && (
      reasons.includes("no_submitted_orders")
      || (detailsStatusVerified && reasons.length === 0 && den !== null && den === 0 && (num === null || num === 0))
    )
  ) {
    return "no_orders";
  }

  return "unknown";
};

const isPulseFillRateDetailsVerified = (row: ManagementTradingPulseRuntimeRow): boolean => {
  const perf = row.performanceContext;
  if (!isPulseSourceAvailable(perf?.sourceStatus)) return false;
  if (perf?.metricReasons?.fill_rate) return false;
  const details = perf?.fillRateDetails;
  if (!details) return false;
  if (details.reason) return false;
  const detailsStatus = String(details.status ?? "").trim().toLowerCase();
  if (detailsStatus && !["known", "available", "ok", "verified"].includes(detailsStatus)) {
    return false;
  }
  const num = pulseNumber(details.numerator);
  const den = pulseNumber(details.denominator);
  return num !== null && den !== null && den > 0 && num >= 0;
};

const resolvePulseVerifiedFillRate = (row: ManagementTradingPulseRuntimeRow): number | null => {
  const perf = row.performanceContext;
  if (!isPulseSourceAvailable(perf?.sourceStatus)) return null;
  if (perf?.metricReasons?.fill_rate) return null;
  const details = perf?.fillRateDetails;
  if (details && !isPulseFillRateDetailsVerified(row)) return null;
  return pulseNumber(row.metrics?.fill_rate);
};

const hasActionablePulseOutcomeReason = (reasonCode: unknown): boolean => {
  if (typeof reasonCode !== "string") return false;
  const normalized = reasonCode.trim().toLowerCase();
  return Boolean(normalized) && normalized !== "reason_not_recorded";
};

// A generated intent quantity on a hold is not an order. Never use period
// telemetry to establish whether this latest decision placed or filled one.
const isNormalPulseHold = (outcome: ManagementTradingPulseLatestOutcome | undefined): boolean => {
  if (outcome?.status !== "available" || outcome.reasonCode !== "hold_signal") return false;
  const kind = outcome.kind ?? outcome.outcome_kind;
  if (kind && kind !== "no_trade") return false;
  if (outcome.submittedToBroker === true || outcome.side || outcome.orderId || outcome.brokerOrderId) return false;
  const filled = pulseNumber(outcome.filledQuantity);
  if (filled !== null && filled !== 0) return false;
  const required = pulseNumber(outcome.required);
  const available = pulseNumber(outcome.available);
  return !(required !== null && available !== null && required > available);
};

const isPulsePreBrokerRejection = (outcome: ManagementTradingPulseLatestOutcome | undefined): boolean => {
  if (outcome?.status !== "available" || outcome.submittedToBroker !== false) return false;
  // Recorded fills and non-rejection outcomes contradict a pre-broker refusal.
  if ((pulseNumber(outcome.filledQuantity) ?? 0) > 0) return false;
  const rejectionMarkers = ["rejected", "rejection", "pre_broker_rejected", "pre_broker_rejection"];
  const kind = String(outcome.kind ?? outcome.outcome_kind ?? "").trim().toLowerCase();
  if (kind && !rejectionMarkers.includes(kind)) return false;
  const hasRejectionMarker = [kind, outcome.focusStage]
    .some((value) => typeof value === "string" && rejectionMarkers.includes(value.trim().toLowerCase()));
  const reason = String(outcome.reasonCode ?? "").trim().toLowerCase();
  if ([
    "hold_signal", "partially_filled", "runtime_unhealthy_at_reconciliation", "reconciliation_deferred_runtime_unhealthy",
    "reconciliation_identity_unverified", "reconciliation_evidence_incomplete", "reconciliation_check_failed",
    "broker_record_missing", "broker_fill_mismatch", "position_variance", "cash_variance",
    "broker_unavailable_at_reconciliation", "reconciliation_deferred_broker_unavailable",
    "long_cash", "long_lever", "short_via_future", "close_leg",
  ].includes(reason)) return false;
  const hasRejectionReason = [
    "insufficient_cash", "insufficient_buying_power", "insufficient_initial_margin", "insufficient_funds",
    "insufficient_position", "sell_without_holdings", "kill_switch", "risk_limit_exceeded",
    "max_position_exceeded", "exposure_limit_exceeded",
  ].includes(reason);
  const required = pulseNumber(outcome.required);
  const available = pulseNumber(outcome.available);
  return hasRejectionMarker || hasRejectionReason
    || (required !== null && available !== null && required > available);
};

const resolvePulseEventQuantities = (outcome: ManagementTradingPulseLatestOutcome | undefined) => {
  const requested = pulseNumber(outcome?.requestedQuantity);
  // An explicit pre-broker rejection establishes no fill for this intent.
  const filled = pulseNumber(outcome?.filledQuantity)
    ?? (outcome?.status === "available" && isPulsePreBrokerRejection(outcome) ? 0 : null);
  const rate = outcome?.status === "available" && requested !== null && requested > 0 && filled !== null && filled >= 0
    ? filled / requested
    : null;
  return { requested, filled, rate };
};

const isVerifiedNormalFullFillRow = (row: ManagementTradingPulseRuntimeRow): boolean => {
  const outcome = row.latestOutcome;
  if (outcome?.status !== "available" || outcome.submittedToBroker === false) return false;
  const kind = outcome.kind ?? outcome.outcome_kind;
  if (kind && kind !== "normal") return false;
  if (hasActionablePulseOutcomeReason(outcome.reasonCode)) return false;
  const required = pulseNumber(outcome.required);
  const available = pulseNumber(outcome.available);
  if (required !== null && available !== null && required > available) return false;
  const { rate } = resolvePulseEventQuantities(outcome);
  return rate === 1;
};

const isNotableOutcomeRow = (row: ManagementTradingPulseRuntimeRow): boolean => {
  if (isNormalPulseHold(row.latestOutcome) || isVerifiedNormalFullFillRow(row)) return false;
  const outcome = row.latestOutcome;
  if (outcome && outcome.status === "available") return true;
  if (typeof outcome?.submittedToBroker === "boolean") return true;
  if (outcome?.reasonCode) return true;
  const requested = pulseNumber(outcome?.requestedQuantity);
  const filled = pulseNumber(outcome?.filledQuantity);
  if (requested !== null && requested > 0 && filled !== null && filled !== requested) return true;
  const reqAmt = pulseNumber(outcome?.required);
  const availAmt = pulseNumber(outcome?.available);
  if (reqAmt !== null && availAmt !== null && reqAmt > availAmt) return true;
  return false;
};

const notableOutcomePriority = (row: ManagementTradingPulseRuntimeRow): number => {
  const outcome = row.latestOutcome;
  if (outcome?.submittedToBroker === false) return 0;
  const reason = String(outcome?.reasonCode ?? "").toLowerCase();
  if (reason && reason !== "reason_not_recorded") return 1;
  return 2;
};

const TradingPulseNotableEventsSection = ({
  rows,
}: {
  rows: ManagementTradingPulseRuntimeRow[];
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const notableRows = [...rows]
    .filter(isNotableOutcomeRow)
    .sort((a, b) => notableOutcomePriority(a) - notableOutcomePriority(b));

  return (
    <Card className="p-4 space-y-3" data-testid="trading-pulse-notable-events">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.eventsSectionTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("mgmt.pulse.eventsSectionSubtitle")}</p>
      </div>

      {notableRows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("mgmt.pulse.eventsEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {notableRows.map((row, idx) => {
            const outcome = row.latestOutcome;
            const perf = row.performanceContext;
            const fillDetails = perf?.fillRateDetails;
            const { requested: reqQty, filled: fillQty, rate: verifiedFillRate } = resolvePulseEventQuantities(outcome);
            const missingFillRateKind = resolvePulseMissingFillRateKind(row);
            const displayName = resolvePulsePersonaDisplayName(row, t);
            const symbol = resolvePulseRowSymbol(row);
            const submitted = outcome?.submittedToBroker;
            const reasonText = outcome?.reasonCode === "hold_signal"
              ? t("mgmt.pulse.eventHoldConflict")
              : formatPulseOutcomeReason(outcome?.reasonCode, t);
            const unitInfo = formatPulseQuantityUnit(fillDetails?.unit, t, symbol);
            const reqAmt = pulseNumber(outcome?.required);
            const availAmt = pulseNumber(outcome?.available);
            const currency = outcome?.currency ?? perf?.pnlCurrency;
            const occurredAt = outcome?.occurredAt;
            const journeyHref = row.links?.journey
              ? tradeJourneyHref(
                  location,
                  {
                    href: row.links.journey,
                    tenantId: row.tenantId,
                    environment: row.deploymentStage,
                  },
                  t("mgmt.pulse.title"),
                )
              : row.personaId && row.links?.persona
                ? tradeJourneyHref(
                    location,
                    {
                      personaId: row.personaId,
                      tenantId: row.tenantId,
                      environment: row.deploymentStage,
                    },
                    t("mgmt.pulse.title"),
                  )
                : null;

            return (
              <li
                key={`notable-${idx}-${displayName}-${symbol ?? ""}`}
                className="rounded-md border border-border bg-background p-3 text-xs space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">{displayName}</span>
                    {symbol && (
                      <Badge variant="secondary">
                        {t("mgmt.pulse.symbolLabelFmt", { symbol })}
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {formatPulseStage(row.deploymentStage, t)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isPulsePreBrokerRejection(outcome) && (
                      <Badge variant="outline" className={statusTone("failed")}>
                        {t("mgmt.pulse.eventPreBrokerRejected")}
                      </Badge>
                    )}
                    {submitted === true && (
                      <Badge variant="outline" className={statusTone("ok")}>
                        {t("mgmt.pulse.eventSubmittedToBroker")}
                      </Badge>
                    )}
                    <Badge variant="outline" className={statusTone("watch")}>
                      {reasonText}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                  {reqQty !== null && reqQty > 0 && fillQty !== null && verifiedFillRate !== null ? (
                    <span className="text-foreground">
                      {t("mgmt.pulse.eventOrderFillQtyFmt", {
                        requested: formatPulseInt(reqQty),
                        filled: formatPulseInt(fillQty),
                        unit: unitInfo.localized,
                        rate: formatPulsePercentFromFraction(verifiedFillRate) ?? "0%",
                      })}
                    </span>
                  ) : reqQty !== null ? (
                    <span className="text-foreground">
                      {t("mgmt.pulse.eventOrderRequestedOnlyFmt", {
                        requested: formatPulseInt(reqQty),
                        unit: unitInfo.localized,
                      })}
                    </span>
                  ) : null}

                  {verifiedFillRate === null && (
                    missingFillRateKind === "unavailable" ? (
                      <span className="text-status-warning">{t("mgmt.pulse.fillRateSourceUnavailable")}</span>
                    ) : missingFillRateKind === "stale" ? (
                      <span className="text-status-warning">{t("mgmt.pulse.fillRateStale")}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("mgmt.pulse.eventFillUnknown")}</span>
                    )
                  )}

                  {reqAmt !== null && availAmt !== null && (
                    <span>
                      {t("mgmt.pulse.eventCapitalCompareFmt", {
                        required: formatPulseCurrencyAmount(reqAmt, currency),
                        available: formatPulseCurrencyAmount(availAmt, currency),
                      })}
                    </span>
                  )}

                  {occurredAt && (
                    <span>
                      {t("mgmt.pulse.eventOccurredAtFmt", { time: safeDateTime(occurredAt) })}
                    </span>
                  )}
                </div>

                <div>
                  {journeyHref ? (
                    <Link
                      to={journeyHref}
                      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {t("mgmt.pulse.eventOpenJourney")}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{t("mgmt.pulse.eventNoJourneyLink")}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

const TradingPulsePersonaDetailsSection = ({
  model,
  rows,
}: {
  model: ManagementTradingPulseModel;
  rows: ManagementTradingPulseRuntimeRow[];
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const pulseReturnState =
    location.pathname === "/management/trading-pulse"
      ? { returnTo: "/management/trading-pulse" }
      : undefined;
  const scope = model.summary.operatorScope;
  const scopeStatus = String(scope.status ?? "unverified").trim().toLowerCase();
  const excludedProbeCount = pulseNumber(scope.excludedProbeCount);
  const isAllProbesEmpty =
    rows.length === 0
    && ((excludedProbeCount !== null && excludedProbeCount > 0) || /probe|test/i.test(String(scope.reason ?? "")));

  return (
    <Card className="p-3 sm:p-4 space-y-3" data-testid="trading-pulse-persona-details">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.personaSectionTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("mgmt.pulse.personaSectionSubtitle")}</p>
        </div>
        {scopeStatus !== "unavailable" && (
          <Badge variant="outline">{formatPulseInt(rows.length)}</Badge>
        )}
      </div>

      <div className="overflow-x-auto" data-testid="trading-pulse-runtime-table-scroll">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-card text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.colPersonaSymbol")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.colFills")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.colFillRate")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.colPnl")}</th>
              <th className="py-2 font-medium">{t("mgmt.pulse.colRecentEvent")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-4 text-muted-foreground" colSpan={5}>
                  {scopeStatus === "unavailable"
                    ? t("mgmt.pulse.scopeUnavailableNotice")
                    : isAllProbesEmpty
                      ? t("mgmt.pulse.scopeEmptyAllProbesNotice")
                      : t("mgmt.pulse.scopeEmptyNormalNotice")}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const displayName = resolvePulsePersonaDisplayName(row, t);
                const strategyName = resolvePulseStrategyDisplayName(row, displayName);
                const symbol = resolvePulseRowSymbol(row);
                const personaHref = row.links?.persona ?? null;
                const latestJourneyHref = row.links?.journey
                  ? tradeJourneyHref(
                      location,
                      {
                        href: row.links.journey,
                        tenantId: row.tenantId,
                        environment: row.deploymentStage,
                      },
                      t("mgmt.pulse.title"),
                    )
                  : null;
                const personaJourneysHref =
                  row.personaId && row.links?.persona
                    ? tradeJourneyHref(
                        location,
                        {
                          personaId: row.personaId,
                          tenantId: row.tenantId,
                          environment: row.deploymentStage,
                        },
                        t("mgmt.pulse.title"),
                      )
                    : null;
                const perf = row.performanceContext;
                const sourceStatus = String(perf?.sourceStatus ?? "").toLowerCase();
                const fillCount = resolvePulseRowFillCount(row);
                const fillDetails = perf?.fillRateDetails;
                const verifiedFillRate = resolvePulseVerifiedFillRate(row);
                const missingFillRateKind = resolvePulseMissingFillRateKind(row);
                const canUseFillDetails = isPulseFillRateDetailsVerified(row) && verifiedFillRate !== null;
                const num = pulseNumber(fillDetails?.numerator);
                const den = pulseNumber(fillDetails?.denominator);
                const unitInfo = formatPulseQuantityUnit(fillDetails?.unit, t, symbol);

                const pnlVal = pulseNumber(row.metrics?.pnl);
                const pnlCurrency = perf?.pnlCurrency ?? null;
                const pnlDef = perf?.pnlDefinition ?? null;
                const pnlReason = perf?.metricReasons?.pnl ?? null;
                const pnlStart = perf?.pnlPeriodStartAt;
                const pnlAt = perf?.pnlAt;

                const outcome = row.latestOutcome;
                const normalHold = isNormalPulseHold(outcome);
                const outcomeSubmitted = outcome?.submittedToBroker;
                const outcomeReasonCode = outcome?.reasonCode;
                const outcomeOccurredAt = outcome?.occurredAt;
                const outcomeReqQty = pulseNumber(outcome?.requestedQuantity);
                const outcomeRequired = pulseNumber(outcome?.required);
                const outcomeAvailable = pulseNumber(outcome?.available);
                const outcomeCurrency = outcome?.currency ?? pnlCurrency;

                const slippageBps = formatPulseBps(row.metrics?.avg_slippage_bps);
                const drawdownPct = formatPulsePercentFromFraction(row.metrics?.drawdown);
                const lastFillAt = perf?.lastFillAt;
                const latestReportAt = perf?.latestReportAt ?? row.lastUpdatedAt;

                return (
                  <tr
                    key={`pulse-row-${idx}-${displayName}-${symbol ?? ""}`}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="w-[180px] max-w-[180px] sm:w-auto sm:max-w-[280px] py-3 pr-3 align-top break-words">
                      <div>
                        {personaHref ? (
                          <Link
                            to={personaHref}
                            state={pulseReturnState}
                            className="inline-block max-w-full break-words font-semibold text-primary underline-offset-4 hover:underline"
                          >
                            {displayName}
                          </Link>
                        ) : (
                          <span className="inline-block max-w-full break-words font-semibold text-foreground">
                            {displayName}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {symbol ? (
                          <Badge variant="secondary">
                            {t("mgmt.pulse.symbolLabelFmt", { symbol })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            {t("mgmt.pulse.symbolUnspecified")}
                          </Badge>
                        )}
                        <Badge variant="outline">
                          {formatPulseStage(row.deploymentStage, t)}
                        </Badge>
                        <Badge variant="outline" className={statusTone(row.status)}>
                          {formatPulseExecutionStatus(row.status, t)}
                        </Badge>
                        {sourceStatus === "stale" && (
                          <Badge variant="outline" className={statusTone("watch")}>
                            {t("mgmt.pulse.staleDataBadge")}
                          </Badge>
                        )}
                        {sourceStatus === "unavailable" && (
                          <Badge variant="outline" className={statusTone("unavailable")}>
                            {t("mgmt.pulse.sourceUnavailableBadge")}
                          </Badge>
                        )}
                      </div>
                      {strategyName && (
                        <div className="mt-1 text-[11px] text-muted-foreground break-words">
                          {t("mgmt.pulse.strategyLabelFmt", { strategy: strategyName })}
                        </div>
                      )}
                      <div className="mt-1.5 flex flex-col items-start gap-1 text-[11px]">
                        {latestJourneyHref && (
                          <Link
                            to={latestJourneyHref}
                            className="inline-block max-w-full break-words font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {t("mgmt.pulse.openLatestJourney")}
                          </Link>
                        )}
                        {personaJourneysHref && personaJourneysHref !== latestJourneyHref && (
                          <Link
                            to={personaJourneysHref}
                            className="inline-block max-w-full break-words text-primary underline-offset-4 hover:underline"
                          >
                            {t("mgmt.pulse.openPersonaJourneys")}
                          </Link>
                        )}
                        {!latestJourneyHref && !personaJourneysHref && (
                          <span className="text-muted-foreground">{t("mgmt.pulse.eventNoJourneyLink")}</span>
                        )}
                        {!personaHref && (
                          <span className="text-muted-foreground">{t("mgmt.pulse.noPersonaLink")}</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 pr-3 align-top">
                      {fillCount !== null ? (
                        <div>
                          <div className="font-medium text-foreground">
                            {fillCount === 1
                              ? t("mgmt.pulse.fillsCountOne")
                              : t("mgmt.pulse.fillsCountFmt", { count: formatPulseInt(fillCount) })}
                          </div>
                          {fillCount === 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              {t("mgmt.pulse.fillsZeroHint")}
                            </div>
                          )}
                        </div>
                      ) : sourceStatus === "unavailable"
                        || perf?.metricReasons?.total_trades === "source_unavailable" ? (
                        <span className="text-status-warning">{t("mgmt.pulse.fillsUnavailable")}</span>
                      ) : sourceStatus === "stale" ? (
                        <span className="text-status-warning">{t("mgmt.pulse.fillsStaleUnknown")}</span>
                      ) : (
                        <span className="text-muted-foreground">{t("mgmt.pulse.fillsUnrecorded")}</span>
                      )}
                    </td>

                    <td className="py-3 pr-3 align-top">
                      {verifiedFillRate !== null ? (
                        <div className="space-y-0.5">
                          <div className="font-medium text-foreground">
                            {canUseFillDetails && num !== null && den !== null && den > 0
                              ? t("mgmt.pulse.fillRateKnownWithBasisFmt", {
                                  rate: formatPulsePercentFromFraction(verifiedFillRate) ?? "0%",
                                  requested: formatPulseInt(den),
                                  filled: formatPulseInt(num),
                                  unit: unitInfo.localized,
                                })
                              : (formatPulsePercentFromFraction(verifiedFillRate) ?? "0%")}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {(() => {
                              const period = fillDetails?.window;
                              const range = [period, perf?.metricPeriods?.fill_rate].map((candidate) => {
                                if (!candidate || typeof candidate !== "object") return null;
                                const start = candidate.startAt ?? candidate.start_at;
                                const end = candidate.endExclusiveAt ?? candidate.end_exclusive_at
                                  ?? candidate.endAt ?? candidate.end_at ?? candidate.asOf ?? candidate.as_of;
                                return typeof start === "string" && typeof end === "string" && start && end
                                  ? { start, end } : null;
                              }).find((candidate) => candidate !== null);
                              return range
                                ? t("mgmt.pulse.pnlPeriodRangeFmt", { start: safeDateTime(range.start), end: safeDateTime(range.end) })
                                : typeof period === "string" && !isPulseTechnicalId(period)
                                  ? t("mgmt.pulse.fillRatePeriodFmt", { period })
                                  : t("mgmt.pulse.pnlPeriodUnverified");
                            })()}
                          </div>
                        </div>
                      ) : missingFillRateKind === "unavailable" ? (
                        <span className="text-status-warning">{t("mgmt.pulse.fillRateSourceUnavailable")}</span>
                      ) : missingFillRateKind === "stale" ? (
                        <span className="text-status-warning">{t("mgmt.pulse.fillRateStale")}</span>
                      ) : missingFillRateKind === "no_orders" ? (
                        <span className="text-muted-foreground">{t("mgmt.pulse.fillRateNoOrders")}</span>
                      ) : (
                        <span className="text-muted-foreground">{t("mgmt.pulse.fillRateUnknown")}</span>
                      )}
                    </td>

                    <td className="py-3 pr-3 align-top">
                      {pnlVal !== null && sourceStatus !== "unavailable" ? (
                        <div className="space-y-0.5">
                          <div className="font-medium text-foreground">
                            {formatPulseCurrencyAmount(pnlVal, pnlCurrency)}
                            {!pnlCurrency ? ` (${t("mgmt.pulse.pnlCurrencyUnverified")})` : ""}
                            {pnlVal < 0
                              ? `（${t("mgmt.pulse.pnlLossTag")}）`
                              : pnlVal === 0
                                ? `（${t("mgmt.pulse.pnlFlatTag")}）`
                                : ""}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatPulsePnlDefinition(pnlDef, t)}
                          </div>
                          {pnlStart && pnlAt ? (
                            <div className="text-[11px] text-muted-foreground">
                              {t("mgmt.pulse.pnlPeriodRangeFmt", {
                                start: safeDateTime(pnlStart),
                                end: safeDateTime(pnlAt),
                              })}
                            </div>
                          ) : pnlStart ? (
                            <div className="text-[11px] text-muted-foreground">
                              {t("mgmt.pulse.pnlPeriodStartOnlyFmt", { start: safeDateTime(pnlStart) })}
                            </div>
                          ) : pnlAt ? (
                            <div className="text-[11px] text-muted-foreground">
                              {t("mgmt.pulse.pnlAsOfFmt", { asOf: safeDateTime(pnlAt) })}
                            </div>
                          ) : null}
                        </div>
                      ) : sourceStatus === "unavailable" || pnlReason === "source_unavailable" ? (
                        <span className="text-status-warning">{t("mgmt.pulse.pnlSourceUnavailable")}</span>
                      ) : sourceStatus === "stale" || pnlReason === "stale" ? (
                        <span className="text-status-warning">{t("mgmt.pulse.pnlStaleUnknown")}</span>
                      ) : pnlReason === "no_fills" || fillCount === 0 ? (
                        <span className="text-muted-foreground">
                          {pnlCurrency
                            ? t("mgmt.pulse.pnlNoFillsWithCurrencyFmt", { currency: pnlCurrency })
                            : t("mgmt.pulse.pnlNoFills")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("mgmt.pulse.pnlUnknown")}</span>
                      )}
                    </td>

                    <td className="py-3 align-top space-y-1 text-muted-foreground">
                      {!isVerifiedNormalFullFillRow(row)
                      && outcome
                      && (outcome.status === "available" || outcomeReasonCode || outcomeSubmitted !== null) ? (
                        <div className="space-y-0.5 text-foreground">
                          <div className="flex flex-wrap items-center gap-1">
                            {isPulsePreBrokerRejection(outcome) && (
                              <Badge variant="outline" className={statusTone("failed")}>
                                {t("mgmt.pulse.eventPreBrokerRejected")}
                              </Badge>
                            )}
                            {outcomeSubmitted === true && (
                              <Badge variant="outline" className={statusTone("ok")}>
                                {t("mgmt.pulse.eventSubmittedToBroker")}
                              </Badge>
                            )}
                            <span className="font-medium">{normalHold
                              ? t("tradeJourneys.reasons.hold_signal")
                              : outcomeReasonCode === "hold_signal"
                                ? t("mgmt.pulse.eventHoldConflict")
                                : formatPulseOutcomeReason(outcomeReasonCode, t)}</span>
                          </div>
                          {!normalHold && outcomeReqQty !== null && (
                            <div className="text-[11px] text-muted-foreground">
                              {t("mgmt.pulse.eventOrderRequestedOnlyFmt", {
                                requested: formatPulseInt(outcomeReqQty),
                                unit: unitInfo.localized,
                              })}
                            </div>
                          )}
                          {!normalHold && resolvePulseEventQuantities(outcome).rate === null && (
                            <div className="text-[11px]">{t("mgmt.pulse.eventFillUnknown")}</div>
                          )}
                          {outcomeRequired !== null && outcomeAvailable !== null && (
                            <div className="text-[11px] text-muted-foreground">
                              {t("mgmt.pulse.eventCapitalCompareFmt", {
                                required: formatPulseCurrencyAmount(outcomeRequired, outcomeCurrency),
                                available: formatPulseCurrencyAmount(outcomeAvailable, outcomeCurrency),
                              })}
                            </div>
                          )}
                          {outcomeOccurredAt && (
                            <div className="text-[11px] text-muted-foreground">
                              {t("mgmt.pulse.eventOccurredAtFmt", { time: safeDateTime(outcomeOccurredAt) })}
                            </div>
                          )}
                        </div>
                      ) : sourceStatus === "unavailable" ? (
                        <div className="text-status-warning">{t("mgmt.pulse.sourceUnavailableBadge")}</div>
                      ) : sourceStatus === "stale" ? (
                        <div className="text-status-warning">{t("mgmt.pulse.staleDataBadge")}</div>
                      ) : fillCount !== null && fillCount > 0 ? (
                        <div>{t("mgmt.pulse.noAbnormalEvents")}</div>
                      ) : (
                        <div>{t("mgmt.pulse.noTradeEventsYet")}</div>
                      )}

                      {(slippageBps !== null || drawdownPct !== null) && (
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                          {slippageBps !== null && (
                            <span>{t("mgmt.pulse.slippageBpsFmt", { bps: slippageBps })}</span>
                          )}
                          {drawdownPct !== null && (
                            <span>{t("mgmt.pulse.drawdownPctFmt", { pct: drawdownPct })}</span>
                          )}
                        </div>
                      )}

                      {lastFillAt && (
                        <div className="text-[11px]">
                          {t("mgmt.pulse.lastFillAtFmt", { time: safeDateTime(lastFillAt) })}
                        </div>
                      )}
                      {latestReportAt && (
                        <div className="text-[11px]">
                          {t("mgmt.pulse.latestReportAtFmt", { time: safeDateTime(latestReportAt) })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const formatRankingBlockTitle = (block: TradingPulseRankBlock, t: PulseTranslate): string => {
  const kind = String(block.kind ?? block.blockId ?? "").toLowerCase();
  const metric = String(block.metric ?? "").toLowerCase();
  if (kind === "pnl-leaders" || metric === "pnl") return t("mgmt.pulse.rankingTitlePnl");
  if (kind === "drawdown-control" || metric === "drawdown") return t("mgmt.pulse.rankingTitleDrawdown");
  if (kind === "execution-quality" || metric === "fill_rate") return t("mgmt.pulse.rankingTitleExecution");
  if (kind === "sharpe-leaders" || metric === "sharpe_ratio") return t("mgmt.pulse.rankingTitleSharpe");
  return block.label || kind;
};

const formatRankingRowMetricValue = (
  block: TradingPulseRankBlock,
  row: TradingPulseRankRow,
  t: PulseTranslate,
): string => {
  const kind = String(block.kind ?? block.blockId ?? "").toLowerCase();
  const metric = String(block.metric ?? row.rankingMetric ?? "").toLowerCase();
  const unit = String(row.metricUnit ?? row.rankingUnit ?? "").trim();
  const val = pulseNumber(row.metricValue ?? row.rankingMetricValue);
  if (val === null) return "—";

  if (kind === "pnl-leaders" || metric === "pnl" || ["TWD", "USD", "EUR", "JPY", "HKD"].includes(unit.toUpperCase())) {
    const currency = unit && unit.toLowerCase() !== "fraction" && unit.toLowerCase() !== "ratio" ? unit : null;
    const base = formatPulseCurrencyAmount(val, currency);
    if (val < 0) return `${base}（${t("mgmt.pulse.pnlLossTag")}）`;
    if (val === 0) return `${base}（${t("mgmt.pulse.pnlFlatTag")}）`;
    return base;
  }

  if (
    kind === "drawdown-control"
    || metric === "drawdown"
    || kind === "execution-quality"
    || metric === "fill_rate"
    || unit.toLowerCase() === "fraction"
  ) {
    const pct = formatPulsePercentFromFraction(val) ?? `${val}%`;
    const slippage = formatPulseBps(row.avgSlippageBps);
    if ((kind === "execution-quality" || metric === "fill_rate") && slippage !== null) {
      return `${pct} · ${t("mgmt.pulse.slippageBpsFmt", { bps: slippage })}`;
    }
    return pct;
  }

  if (unit === "%") {
    return `${Number(val.toFixed(2)).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  }
  if (unit.toLowerCase() === "bps") {
    return `${formatPulseBps(val)} bps`;
  }
  return `${formatPulseRatio(val)}${unit && unit.toLowerCase() !== "ratio" ? ` ${unit}` : ""}`;
};

const formatRankingComparisonScopeText = (
  scope: TradingPulseComparisonScope | null | undefined,
  t: PulseTranslate,
): string | null => {
  if (!scope) return null;
  const parts: string[] = [];
  if (scope.stage) parts.push(formatPulseStage(scope.stage, t));
  if (scope.unit && !["fraction", "ratio"].includes(scope.unit.toLowerCase())) {
    parts.push(scope.unit);
  }
  if (scope.definition) {
    parts.push(formatPulsePnlDefinition(scope.definition, t));
  }
  if (scope.period && typeof scope.period === "object") {
    const start = scope.period.startAt;
    const end = scope.period.endAt ?? scope.period.asOf;
    if (start && end) {
      parts.push(`${safeDateTime(start)} – ${safeDateTime(end)}`);
    } else if (start) {
      parts.push(safeDateTime(start));
    }
  } else if (typeof scope.period === "string" && scope.period.trim()) {
    parts.push(scope.period.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : null;
};

const summarizeBlockMissingReasons = (
  block: TradingPulseRankBlock,
  runtimeRows: ManagementTradingPulseRuntimeRow[],
  t: PulseTranslate,
): string | null => {
  const reasonsMap = block.metricReasons ?? {};
  const entries = Object.entries(reasonsMap).filter(([, reason]) => Boolean(reason));
  const missingCount = pulseNumber(block.missingMetricCount) ?? entries.length;
  if (missingCount <= 0 && entries.length === 0) return null;

  const runtimeNameById = new Map<string, string>();
  for (const r of runtimeRows) {
    const rid = r.runtimeId;
    const name = resolvePulsePersonaDisplayName(r, t);
    if (rid) runtimeNameById.set(rid, name);
  }

  if (entries.length > 0) {
    return entries
      .map(([rid, reason]) => {
        const personaLabel = runtimeNameById.get(rid);
        const reasonLabel = formatPulseMetricReason(reason, t);
        return personaLabel ? `${personaLabel}（${reasonLabel}）` : reasonLabel;
      })
      .join("、");
  }

  return t("mgmt.pulse.reasonUnknown");
};

const TradingPulseRankingsSection = ({
  runtimeRows,
}: {
  runtimeRows: ManagementTradingPulseRuntimeRow[];
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const pulseReturnState =
    location.pathname === "/management/trading-pulse"
      ? { returnTo: "/management/trading-pulse" }
      : undefined;
  const { data, loading, error = null } = useV5Live(
    (signal) => mgmt.tradingPulse.rankingsLiveOnly({ signal }),
    [],
    { cacheKey: "oversight.tradingPulse.rankings" },
  );

  const runtimeById = useMemo(() => {
    const map = new Map<string, ManagementTradingPulseRuntimeRow>();
    for (const r of runtimeRows) {
      if (r.runtimeId) map.set(r.runtimeId, r);
      if (r.runtimeBindingId) map.set(r.runtimeBindingId, r);
      if (r.personaId) map.set(r.personaId, r);
    }
    return map;
  }, [runtimeRows]);

  if (loading && !data) {
    return (
      <Card className="p-4 space-y-2" aria-label={t("mgmt.pulse.rankingsLabel")} data-testid="trading-pulse-rankings">
        <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.rankingsSectionTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("mgmt.pulse.rankingsLoading")}</p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-4 space-y-2" aria-label={t("mgmt.pulse.rankingsLabel")} data-testid="trading-pulse-rankings">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.rankingsUnavailableTitle")}</h2>
          <Badge variant="outline" className={statusTone("unavailable")}>
            {t("mgmt.pulse.rankingsUnavailableTitle")}
          </Badge>
        </div>
        <p className="text-xs text-status-warning" data-testid="trading-pulse-rankings-unavailable">
          {t("mgmt.pulse.rankingsUnavailableBody")}
        </p>
      </Card>
    );
  }

  const populatedBlocks = data.filter((b) => (b.rows?.length ?? 0) > 0);
  const omittedBlocks = data.filter((b) => (b.rows?.length ?? 0) === 0);

  return (
    <Card className="p-4 space-y-3" aria-label={t("mgmt.pulse.rankingsLabel")} data-testid="trading-pulse-rankings">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.rankingsSectionTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("mgmt.pulse.rankingsSectionSubtitle")}</p>
      </div>

      {populatedBlocks.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="trading-pulse-rankings-empty">
          {runtimeRows.length === 0
            ? t("mgmt.pulse.rankingsEmptyNoPersonas")
            : t("mgmt.pulse.rankingsEmptyNoComparable")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {populatedBlocks.map((b) => {
            const kind = String(b.kind ?? b.blockId ?? "").toLowerCase();
            const isSharpeLeaders = kind === "sharpe-leaders" || b.metric === "sharpe_ratio";
            const isPnlBlock = kind === "pnl-leaders" || b.metric === "pnl";
            const blockTitle = formatRankingBlockTitle(b, t);
            const allNegativePnl =
              isPnlBlock
              && b.rows.length > 0
              && b.rows.every((r) => {
                const v = pulseNumber(r.metricValue ?? r.rankingMetricValue);
                return v !== null && v < 0;
              });
            const scopeText = formatRankingComparisonScopeText(b.rows[0]?.comparisonScope, t);
            const missingCount = pulseNumber(b.missingMetricCount) ?? 0;
            const missingDetails = summarizeBlockMissingReasons(b, runtimeRows, t);

            return (
              <div
                key={b.kind}
                className="rounded-md border border-border bg-background p-3 space-y-2 text-xs"
                data-testid={`trading-pulse-ranking-block-${b.kind}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground">{blockTitle}</h3>
                  <Badge variant="outline">
                    {t("mgmt.pulse.rankingEligibleCountFmt", { count: formatPulseInt(b.rows.length) })}
                  </Badge>
                </div>

                {scopeText && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("mgmt.pulse.rankingScopeFmt", { scope: scopeText })}
                  </p>
                )}

                {allNegativePnl && (
                  <p className="text-[11px] text-status-warning">
                    {t("mgmt.pulse.rankingAllNegativePnlNote")}
                  </p>
                )}

                <ul className="space-y-1.5">
                  {b.rows.map((r, idx) => {
                    const matchedRuntime =
                      runtimeById.get(r.runtimeId ?? "")
                      ?? runtimeById.get(r.subjectId ?? "")
                      ?? runtimeById.get(r.personaId ?? "");
                    const displayName = resolvePulsePersonaDisplayName(
                      {
                        personaName: r.personaName ?? matchedRuntime?.personaName,
                        strategyName: r.strategyName ?? matchedRuntime?.strategyName,
                        subjectLabel: r.subjectLabel,
                      },
                      t,
                    );
                    const symbol =
                      resolvePulseRowSymbol(r) ?? (matchedRuntime ? resolvePulseRowSymbol(matchedRuntime) : null);
                    const personaHref = r.links?.persona ?? matchedRuntime?.links?.persona ?? null;
                    const rawJourneyHref = r.links?.journey ?? matchedRuntime?.links?.journey;
                    const journeyHref = rawJourneyHref
                      ? tradeJourneyHref(
                          location,
                          {
                            href: rawJourneyHref,
                            tenantId: r.tenantId ?? matchedRuntime?.tenantId,
                            environment: r.deploymentStage || matchedRuntime?.deploymentStage,
                          },
                          t("mgmt.pulse.title"),
                        )
                      : null;
                    const rankNum = pulseNumber(r.rank) ?? idx + 1;

                    return (
                      <li
                        key={`${b.kind}-${idx}-${displayName}`}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-1.5 last:border-0 last:pb-0"
                      >
                        <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-muted-foreground">#{rankNum}</span>
                          {personaHref ? (
                            <Link
                              to={personaHref}
                              state={pulseReturnState}
                              className="font-medium text-primary underline-offset-4 hover:underline break-words"
                            >
                              {displayName}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground break-words">{displayName}</span>
                          )}
                          {symbol && (
                            <Badge variant="secondary" className="text-[10px]">
                              {symbol}
                            </Badge>
                          )}
                          {journeyHref && (
                            <Link
                              to={journeyHref}
                              className="text-[11px] text-primary underline-offset-4 hover:underline"
                            >
                              {t("mgmt.pulse.eventOpenJourney")}
                            </Link>
                          )}
                        </div>
                        <span className="font-medium text-foreground">
                          {formatRankingRowMetricValue(b, r, t)}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {isSharpeLeaders && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("mgmt.pulse.sharpeShortSampleCaption")}
                  </p>
                )}

                {missingCount > 0 && missingDetails && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("mgmt.pulse.rankingExcludedSummaryFmt", {
                      count: formatPulseInt(missingCount),
                      details: missingDetails,
                    })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {omittedBlocks.length > 0 && (
        <div
          className="rounded-md border border-border/70 bg-muted/30 p-3 space-y-1 text-xs"
          data-testid="trading-pulse-rankings-omitted"
        >
          <div className="font-medium text-foreground">{t("mgmt.pulse.rankingOmittedBlocksTitle")}</div>
          <ul className="space-y-1 text-muted-foreground">
            {omittedBlocks.map((b) => {
              const blockTitle = formatRankingBlockTitle(b, t);
              const missingCount = pulseNumber(b.missingMetricCount) ?? runtimeRows.length;
              const details =
                summarizeBlockMissingReasons(b, runtimeRows, t) ?? t("mgmt.pulse.reasonUnknown");
              return (
                <li key={`omitted-${b.kind}`}>
                  {t("mgmt.pulse.rankingOmittedBlockLineFmt", {
                    label: blockTitle,
                    count: formatPulseInt(missingCount),
                    details,
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
};

const TradingPulseDiagnosticsSection = ({
  model,
  rows,
}: {
  model: ManagementTradingPulseModel;
  rows: ManagementTradingPulseRuntimeRow[];
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const surfaces = Object.entries(model.meta.surfaces ?? {});
  const snapshotAt = model.meta.snapshotAt ?? model.summary.snapshotAt;
  const fillRateAggregation = model.summary.fillRateAggregation ?? null;

  return (
    <Card className="p-4 space-y-3" data-testid="trading-pulse-diagnostics">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            {t("mgmt.pulse.diagnosticsToggle")}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">{t("mgmt.pulse.diagnosticsSubtitle")}</p>
        </div>
        {snapshotAt && (
          <span className="text-xs text-muted-foreground">
            {t("mgmt.pulse.snapshotAt")}：{safeDateTime(snapshotAt)}
          </span>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-border pt-3 text-xs" data-testid="trading-pulse-diagnostics-panel">
          {fillRateAggregation && (
            <div className="text-muted-foreground">
              {t("mgmt.pulse.diagnosticsFillRateAggregationFmt", { method: fillRateAggregation })}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">{t("mgmt.pulse.diagnosticsSourcesTitle")}</h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {surfaces.map(([key, surface]) => (
                <div key={key} className="rounded-md border border-border bg-background p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-foreground truncate" title={key}>
                      {key}
                    </span>
                    <Badge variant="outline" className={statusTone(surface.status)}>
                      {surface.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">{surface.source || "—"}</div>
                  {surface.message && <div className="text-muted-foreground">{surface.message}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">{t("mgmt.pulse.diagnosticsRuntimesTitle")}</h3>
            <ul className="space-y-1.5">
              {rows.map((row) => {
                const displayName = resolvePulsePersonaDisplayName(row, t);
                const perf = row.performanceContext;
                const rid = row.runtimeId || "—";
                const rbid = row.runtimeBindingId || "—";
                const pid = row.personaId || "—";
                const sid = row.strategyId || "—";
                const reportAt = perf?.latestReportAt ?? row.lastUpdatedAt;
                const fillAt = perf?.lastFillAt;

                return (
                  <li
                    key={`diag-${rid}-${rbid}`}
                    className="rounded-md border border-border bg-background p-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="font-medium text-foreground">{displayName}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {rid} · {rbid} · {pid} · {sid}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground space-x-3">
                      {reportAt && (
                        <span>{t("mgmt.pulse.latestReportAtFmt", { time: safeDateTime(reportAt) })}</span>
                      )}
                      {fillAt && (
                        <span>{t("mgmt.pulse.lastFillAtFmt", { time: safeDateTime(fillAt) })}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
};

// =====================================================================
// Evolution Journal
// =====================================================================

interface EvolutionEntry {
  id: string;
  // Legacy in-process mock shape (kept so seed/tests still render).
  mutation?: string; before?: number; after?: number;
  verdict?: string; landedAt?: string;
  // Live BFF shape: /bff/management/evolution-journal aggregate emits
  // mutation_review journal entries with a different field set.
  title?: string; summary?: string; status?: string; entryType?: string;
  entry_type?: string;
  source_id?: string;
  risk_level?: string; action_type?: string;
  evidence_class?: string;
  evidenceClass?: string;
  persona_id?: string;
  personaId?: string;
  route?: string;
  target?: { type?: string | number | null; id?: string | number | null; version?: string | number | null } | null;
  decision?: Record<string, unknown> | null;
  mutation_review?: Record<string, unknown> | null;
  record?: { evidence_refs?: unknown; [key: string]: unknown } | null;
  occurred_at?: string; created_at?: string;
  // EVOCHAIN-007 producer marker: seed-derived entries carry `origin: "seed"`
  // so the FE can badge them as fixture data instead of live evolution output.
  origin?: string;
  // BFF-EVO-JOURNAL-POOL-VERSIONS-20261125: entry_type "pool_version" rows and
  // the recorded subject class of decision rows.
  persona_name?: string;
  pool_version?: number;
  action?: string;
  decision_status?: string;
  refused?: boolean;
  membership_changed?: boolean;
  reasons?: unknown;
  members_before?: unknown;
  members_after?: unknown;
  subject_class?: string;
}

const FORMAL_EVOLUTION_ENTRY_TYPES = new Set(["evolution_decision", "mutation_review"]);

function extractEvolutionEvidenceClass(entry: EvolutionEntry): string | undefined {
  const raw =
    entry.evidence_class
    ?? entry.evidenceClass
    ?? (entry.decision && typeof entry.decision.evidence_class === "string" ? entry.decision.evidence_class : undefined)
    ?? (entry.mutation_review && typeof entry.mutation_review.evidence_class === "string" ? entry.mutation_review.evidence_class : undefined)
    ?? (entry.record && typeof entry.record.evidence_class === "string" ? entry.record.evidence_class : undefined);
  if (!raw) return undefined;
  const clean = String(raw).trim();
  if (!clean || ["nan", "undefined", "null", "none"].includes(clean.toLowerCase())) return undefined;
  return clean;
}

type RawEvolutionFleetRow = ManagementPersonaFleetRow & {
  id?: string;
  persona_id?: string;
  name?: string;
  current_work?: string;
  last_mutation?: string;
  last_mutation_at?: string;
};

function evolutionFleetPersonaId(row: ManagementPersonaFleetRow): string | undefined {
  const raw = row as RawEvolutionFleetRow;
  const id = row.personaId ?? raw.persona_id ?? raw.id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function fallbackEvolutionEntryFromFleet(
  fleetRows: ManagementPersonaFleetRow[] | undefined,
  personaFocus: string,
): EvolutionEntry | null {
  const focus = personaFocus.trim();
  if (!focus || focus === "nan" || focus === "undefined") return null;
  const row = (fleetRows ?? []).find((item) => evolutionFleetPersonaId(item) === focus);
  if (!row) return null;
  const raw = row as RawEvolutionFleetRow;
  const lastMutation = row.lastMutation ?? raw.last_mutation ?? "";
  const lastMutationAt = row.lastMutationAt ?? raw.last_mutation_at;

  const asOf = lastMutationAt && lastMutationAt !== "nan" ? lastMutationAt : (lastMutation && lastMutation !== "nan" ? lastMutation : "");
  const cleanAsOf = asOf ? asOf : "none";
  const personaName = row.personaName ?? raw.name ?? focus;
  const currentWork = row.currentWork ?? raw.current_work;

  const stateStr = row.state ? `state: ${row.state}` : "";
  const confidenceStr = row.mutationConfidence ? `confidence: ${row.mutationConfidence}` : "";
  const diagnosticsStr = row.mutationDiagnostics && row.mutationDiagnostics.length
    ? `diagnostics: ${row.mutationDiagnostics.join(" / ")}`
    : "";
  const summaryParts = [
    currentWork,
    stateStr,
    confidenceStr,
    diagnosticsStr
  ].filter(Boolean).join(" · ");

  return {
    id: `persona-fleet-summary:${focus}:${cleanAsOf}`,
    title: `Persona Fleet status summary · ${personaName}`,
    summary: summaryParts || "No details available.",
    status: row.state ?? "fleet_summary",
    entryType: "persona_fleet_summary",
    action_type: undefined, // 不得把日期顯示成 Action
    target: { type: "Persona", id: focus },
    occurred_at: asOf ? asOf : undefined,
  };
}

const PLAIN_TITLE_ENTRY_TYPES = new Set(["evolution_decision", "mutation_review", "postmortem", "rollback", "freeze_order"]);

function evolutionReasonList(raw: unknown): string[] {
  if (typeof raw === "string") return raw.trim() ? [raw.trim()] : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : item && typeof item === "object" ? String((item as { text?: unknown; reason?: unknown; message?: unknown }).text ?? (item as { reason?: unknown }).reason ?? (item as { message?: unknown }).message ?? "").trim() : ""))
    .filter(Boolean);
}

const verdictTone = (v?: string) =>
  v === "improved" || v === "accepted" || v === "approved"
    ? "bg-status-success/15 text-status-success border-status-success/30"
    : v === "degraded" || v === "rejected" || v === "failed"
      ? "bg-status-failed/15 text-status-failed border-status-failed/30"
      : "bg-muted text-muted-foreground border-border";

export const EvolutionJournalPage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeView = normalizeEvolutionJournalView(searchParams.get("view"));
  const personaFocus = normalizeEvolutionFocusToken(searchParams.get("persona"));
  const mutationFocus = normalizeEvolutionFocusToken(
    searchParams.get("mutation_review") ?? searchParams.get("decision") ?? searchParams.get("item"),
    true,
  );

  const includeSystem = activeView === "history" && searchParams.get("include_system") === "true";
  const serverMutationReview = normalizeEvolutionFocusToken(searchParams.get("mutation_review"), true);
  const serverDecision = serverMutationReview ? "" : normalizeEvolutionFocusToken(searchParams.get("decision"), true);

  const scopeKey = `${activeView}|${personaFocus}|${serverMutationReview}|${serverDecision}|${includeSystem}`;
  const [pager, setPager] = useState<{ scopeKey: string; tokens: string[] }>({ scopeKey, tokens: [""] });
  if (pager.scopeKey !== scopeKey) setPager({ scopeKey, tokens: [""] });
  const tokens = pager.scopeKey === scopeKey ? pager.tokens : [""];
  const pageIndex = tokens.length - 1;
  const pageToken = tokens[pageIndex] || undefined;

  const { data, loading, error = null, refresh } = useV5Live(
    (signal) =>
      mgmt.evolutionJournal.list<EvolutionEntry>(() => [], {
        signal,
        view: activeView,
        persona: personaFocus,
        mutationReview: serverMutationReview,
        decision: serverDecision,
        includeSystem,
        pageToken,
      }),
    [includeSystem ? `${activeView}+system` : activeView, personaFocus, serverMutationReview, serverDecision, pageToken ?? ""],
    { cacheKey: "oversight.evolutionJournal.list" },
  );
  const { data: fleetRows } = useV5Live((signal) => mgmt.personaFleet.get({}, { signal }), [], {
    cacheKey: "oversight.personaFleet",
  });

  const adaptedList = useMemo(
    () => (data !== undefined ? adaptEvolutionJournalList<EvolutionEntry>(data) : null),
    [data],
  );
  const rows = useMemo(() => adaptedList ?? [], [adaptedList]);
  const summary: ManagementEvolutionJournalSummary | undefined = adaptedList?.summary;
  const autoProposalCounts: ManagementEvolutionJournalAutoProposalCounts = useMemo(
    () =>
      adaptedList?.autoProposalCounts ?? {
        threshold: 0,
        other: 0,
        infrastructure: 0,
        incident_followup: 0,
        incident_severity: 0,
        postmortem_draft: 0,
        total: 0,
        incidentFollowup: 0,
        incidentSeverity: 0,
        postmortemDraft: 0,
      },
    [adaptedList],
  );
  const pageInfo: ManagementEvolutionJournalPageInfo | undefined = adaptedList?.pageInfo;
  const journalMeta: ManagementEvolutionJournalMeta | undefined = adaptedList?.meta;

  const focus = useMemo(
    () => filterEvolutionJournalRowsForFocus(rows, { personaFocus, mutationFocus }),
    [mutationFocus, personaFocus, rows],
  );
  const fleetFallback = useMemo(
    () => focus.matched || mutationFocus ? null : fallbackEvolutionEntryFromFleet(fleetRows, personaFocus),
    [fleetRows, focus.matched, mutationFocus, personaFocus],
  );
  const visibleRows = fleetFallback ? [fleetFallback] : focus.rows;
  const hasFocus = Boolean(personaFocus || mutationFocus);

  const sourceFocus = normalizeEvolutionFocusToken(searchParams.get("source"));
  const isFleetSummary = Boolean(fleetFallback || sourceFocus === "fleet_summary");

  const degradedSurfaces = useMemo(() => {
    const entries = Object.entries(journalMeta?.surfaces ?? {});
    return entries.filter(([, surface]) =>
      ["degraded", "unavailable", "error", "failed", "unknown"].includes(String(surface?.status ?? "").toLowerCase()),
    );
  }, [journalMeta]);
  const hasDegradedSurfaces = degradedSurfaces.length > 0;
  const hasHealthyJournalSource = useMemo(() => {
    const surfaces = journalMeta?.surfaces;
    const hasOkSource = ["evolution_decisions", "postmortems", "mutation_review", "rollbacks", "freeze_orders", "strategy_pools"].some(
      (key) => String(surfaces?.[key]?.status ?? "").trim().toLowerCase() === "ok",
    );
    return hasOkSource || rows.length > 0 || autoProposalCounts.total > 0;
  }, [autoProposalCounts.total, journalMeta, rows.length]);
  const isPartialRead = !error && hasDegradedSurfaces && hasHealthyJournalSource;
  const errorStatus = (error as { status?: unknown } | null)?.status;
  const isDenied = Boolean(error) && (errorStatus === 401 || errorStatus === 403);
  const isReadFailed =
    Boolean(error) ||
    (!loading && data === undefined && !isFleetSummary) ||
    (hasDegradedSurfaces && !hasHealthyJournalSource);

  const isJournalSurfaceDegraded = (surfaceKey: string): boolean => {
    const status = String(journalMeta?.surfaces?.[surfaceKey]?.status ?? "").trim().toLowerCase();
    return ["degraded", "unavailable", "error", "failed", "unknown"].includes(status);
  };

  const formatJournalSurfaceCount = (surfaceKey: string, count: number | null | undefined): string => {
    const surface = journalMeta?.surfaces?.[surfaceKey];
    const status = String(surface?.status ?? "").trim().toLowerCase();
    if (["degraded", "unavailable", "error", "failed", "unknown"].includes(status)) {
      return t("mgmt.evolution.summarySourceUnknownFmt", { status: surface?.status || "unavailable" });
    }
    if (count === null || count === undefined || !Number.isFinite(count)) {
      return t("mgmt.evolution.summarySourceUnknown", { defaultValue: "unknown" });
    }
    return String(count);
  };

  const incidentFollowupDisplay = formatJournalSurfaceCount(
    "evolution_decisions",
    autoProposalCounts.incident_followup,
  );
  const incidentSeverityDisplay = formatJournalSurfaceCount(
    "evolution_decisions",
    autoProposalCounts.incident_severity,
  );
  const thresholdDisplay = formatJournalSurfaceCount("evolution_decisions", autoProposalCounts.threshold);
  const infrastructureDisplay = formatJournalSurfaceCount("evolution_decisions", autoProposalCounts.infrastructure);
  const otherDisplay = formatJournalSurfaceCount("evolution_decisions", autoProposalCounts.other);
  const postmortemDraftDisplay = formatJournalSurfaceCount(
    "postmortems",
    autoProposalCounts.postmortem_draft,
  );
  const autoProposalTotalDisplay = isJournalSurfaceDegraded("evolution_decisions")
    ? formatJournalSurfaceCount("evolution_decisions", null)
    : isJournalSurfaceDegraded("postmortems")
      ? formatJournalSurfaceCount("postmortems", null)
      : String(autoProposalCounts.total);

  const hiddenSystemCounts = summary?.hidden_system_counts ?? null;
  const hiddenSystemTotal = hiddenSystemCounts
    ? Object.values(hiddenSystemCounts).reduce((sum, n) => sum + n, 0)
    : null;
  const shownSystemTotal = summary?.decision_subject_class_counts
    ? (summary.decision_subject_class_counts.infrastructure ?? 0) + (summary.decision_subject_class_counts.test ?? 0)
    : null;
  const systemToggleCount = includeSystem ? shownSystemTotal : hiddenSystemTotal;
  const systemToggleParts = (includeSystem ? summary?.decision_subject_class_counts : hiddenSystemCounts)
    ? Object.entries((includeSystem ? summary?.decision_subject_class_counts : hiddenSystemCounts) ?? {})
        .filter(([key, n]) => n > 0 && (!includeSystem || key === "infrastructure" || key === "test"))
        .map(([key, n]) => `${t(`mgmt.evolution.systemToggle.classes.${key}`, { defaultValue: key })} ${n}`)
        .join("、")
    : "";
  const toggleSystem = () => {
    const next = new URLSearchParams(searchParams);
    if (includeSystem) next.delete("include_system");
    else next.set("include_system", "true");
    setSearchParams(next);
  };
  const strategyPoolsDegraded = isJournalSurfaceDegraded("strategy_pools");

  const switchView = (nextView: EvolutionJournalView) => {
    const next = new URLSearchParams(searchParams);
    next.set("view", nextView);
    setSearchParams(next);
  };

  const nextPageToken = pageInfo?.next_page_token ?? null;
  const pageSize = pageInfo?.page_size ?? 20;
  const filteredTotal = summary?.total_items ?? pageInfo?.total ?? visibleRows.length;
  const returnedCount = summary?.returned_items ?? visibleRows.length;
  const rangeStart = visibleRows.length === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = pageIndex * pageSize + visibleRows.length;

  const goNext = () => {
    if (!nextPageToken) return;
    setPager({ scopeKey, tokens: [...tokens, nextPageToken] });
  };
  const goPrev = () => {
    if (pageIndex === 0) return;
    setPager({ scopeKey, tokens: tokens.slice(0, -1) });
  };

  const focusText = (() => {
    const pText = personaFocus;
    const mText = mutationFocus;
    
    if (isFleetSummary) {
      return `已聚焦 Persona: ${pText || "—"} · fleet summary fallback · 無正式 mutation id`;
    }
    
    if (focus.matched) {
      if (pText && mText) {
        return `已聚焦 Persona: ${pText} · mutation: ${mText} · ${focus.rows.length} 筆正式演化項目`;
      } else if (pText) {
        return `已聚焦 Persona: ${pText} · ${focus.rows.length} 筆正式演化項目`;
      } else if (mText) {
        return `已聚焦 Mutation: ${mText} · ${focus.rows.length} 筆正式演化項目`;
      }
      return `已聚焦 · ${focus.rows.length} 筆正式演化項目`;
    }
    
    const pPart = pText ? `Persona: ${pText}` : "";
    const mPart = mText ? `mutation: ${mText}` : "";
    const detailParts = [pPart, mPart].filter(Boolean).join(" · ");
    return `無匹配項目${detailParts ? ` (${detailParts})` : ""}`;
  })();

  const viewBadgeLabel =
    activeView === "auto_proposals"
      ? t("mgmt.evolution.viewAutoProposals")
      : activeView === "all"
        ? t("mgmt.evolution.viewAll")
        : t("mgmt.evolution.viewHistory");

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.evolution.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evolution.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.evolution.subtitle")}</p>
      </header>
      {!isReadFailed && (
        <Card className="p-3 text-sm" data-testid="evolution-auto-proposals-summary">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="text-foreground">
                {t("mgmt.evolution.autoProposalsSummaryFmt", {
                  total: autoProposalTotalDisplay,
                  threshold: thresholdDisplay,
                  incidentFollowup: incidentFollowupDisplay,
                  incidentSeverity: incidentSeverityDisplay,
                  infrastructure: infrastructureDisplay,
                  other: otherDisplay,
                })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="outline" data-testid="auto-proposal-total">
                  {t("mgmt.evolution.autoProposalsTotal")}: {autoProposalTotalDisplay}
                </Badge>
                <Badge variant="outline" data-testid="auto-proposal-incident-followup">
                  {t("mgmt.evolution.incidentFollowup")}: {incidentFollowupDisplay}
                </Badge>
                <Badge variant="outline" data-testid="auto-proposal-incident-severity">
                  {t("mgmt.evolution.incidentSeverity")}: {incidentSeverityDisplay}
                </Badge>
                <Badge variant="outline" data-testid="auto-proposal-threshold">
                  {t("mgmt.evolution.autoProposalThreshold")}: {thresholdDisplay}
                </Badge>
                <Badge variant="outline" data-testid="auto-proposal-infrastructure">
                  {t("mgmt.evolution.autoProposalInfrastructure")}: {infrastructureDisplay}
                </Badge>
                <Badge variant="outline" data-testid="auto-proposal-other">
                  {t("mgmt.evolution.autoProposalOther")}: {otherDisplay}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground" data-testid="auto-proposal-parts-hint">
                {t("mgmt.evolution.autoProposalsPartsHint")}
              </div>
              <div className="text-xs text-muted-foreground" data-testid="auto-proposal-postmortem-draft">
                {t("mgmt.evolution.postmortemDraftNote", { count: postmortemDraftDisplay })}
              </div>
            </div>
            <Button
              size="sm"
              variant={activeView === "auto_proposals" ? "default" : "outline"}
              data-testid="evolution-view-toggle"
              onClick={() => switchView(activeView === "auto_proposals" ? "history" : "auto_proposals")}
            >
              {activeView === "auto_proposals"
                ? t("mgmt.evolution.showHistory")
                : t("mgmt.evolution.showAutoProposals")}
            </Button>
          </div>
        </Card>
      )}
      {!isReadFailed && (summary !== undefined || pageInfo !== undefined) && (
        <Card className="p-3 text-xs text-muted-foreground" data-testid="evolution-journal-summary">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" data-testid="evolution-active-view-badge">
                {viewBadgeLabel}
              </Badge>
              {isPartialRead && (
                <Badge
                  variant="outline"
                  data-testid="evolution-partial-read-badge"
                  className="bg-status-warning/15 text-status-warning border-status-warning/30"
                >
                  {t("mgmt.evolution.partialReadBadge")}
                </Badge>
              )}
              <span className="text-foreground">
                {t(
                  isPartialRead
                    ? "mgmt.evolution.partialFilteredSummaryFmt"
                    : "mgmt.evolution.filteredSummaryFmt",
                  {
                    total: filteredTotal,
                    returned: returnedCount,
                  },
                )}
              </span>
            </div>
            {summary && (
              <div className="flex flex-wrap items-center gap-2">
                <span data-testid="evolution-summary-decisions" title={t("mgmt.evolution.summaryDecisionsNote")}>
                  {t("mgmt.evolution.summaryDecisions")}:{" "}
                  {formatJournalSurfaceCount("evolution_decisions", summary.decision_count)}
                </span>
                {summary.pool_version_count !== null && (
                  <span data-testid="evolution-summary-pool-versions">
                    {t("mgmt.evolution.summaryPoolVersions")}:{" "}
                    {isJournalSurfaceDegraded("strategy_pools")
                      ? formatJournalSurfaceCount("strategy_pools", null)
                      : t("mgmt.evolution.summaryPoolVersionsFmt", {
                          total: summary.pool_version_count,
                          refused: summary.refused_pool_version_count ?? 0,
                          applied: summary.pool_version_count - (summary.refused_pool_version_count ?? 0),
                        })}
                  </span>
                )}
                <span data-testid="evolution-summary-postmortems">
                  {t("mgmt.evolution.summaryPostmortems")}:{" "}
                  {formatJournalSurfaceCount("postmortems", summary.postmortem_count)}
                </span>
                <span data-testid="evolution-summary-rollbacks">
                  {t("mgmt.evolution.summaryRollbacks")}:{" "}
                  {formatJournalSurfaceCount("rollbacks", summary.rollback_count)}
                </span>
                <span data-testid="evolution-summary-freeze-orders">
                  {t("mgmt.evolution.summaryFreezeOrders")}:{" "}
                  {formatJournalSurfaceCount("freeze_orders", summary.freeze_order_count)}
                </span>
              </div>
            )}
          </div>
          {activeView === "history" && (
            <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="evolution-system-toggle-row">
              <Button
                size="sm"
                variant={includeSystem ? "default" : "outline"}
                aria-pressed={includeSystem}
                data-testid="evolution-system-toggle"
                onClick={toggleSystem}
              >
                {includeSystem ? t("mgmt.evolution.systemToggle.hide") : t("mgmt.evolution.systemToggle.show")}
              </Button>
              <span data-testid="evolution-system-hidden-count">
                {systemToggleCount === null
                  ? t("mgmt.evolution.systemToggle.hiddenUnknown")
                  : includeSystem
                    ? t("mgmt.evolution.systemToggle.shownBadge") + (systemToggleParts ? `（${systemToggleParts}）` : "")
                    : systemToggleCount === 0
                      ? t("mgmt.evolution.systemToggle.hiddenNone")
                      : t("mgmt.evolution.systemToggle.hiddenFmt", { count: systemToggleCount, parts: systemToggleParts })}
              </span>
            </div>
          )}
        </Card>
      )}
      {hasFocus && (
        <Card className={"p-3 text-sm " + (focus.matched && !isFleetSummary
          ? "border-primary/30 bg-primary/5"
          : "border-status-warning/30 bg-status-warning/10")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              {focusText}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to="/management/evolution-journal">{t("mgmt.evolution.showAll")}</Link>
            </Button>
          </div>
        </Card>
      )}
      {loading && rows.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          {t("common.loading", { defaultValue: "Loading..." })}
        </Card>
      )}
      {isDenied && (
        <Card className="border-status-warning/30 bg-status-warning/10 p-4 text-sm space-y-1" role="alert" data-testid="evolution-journal-denied">
          <div className="font-semibold text-foreground">{t("mgmt.evolution.deniedTitle")}</div>
          <p className="text-muted-foreground">{t("mgmt.evolution.deniedBody")}</p>
        </Card>
      )}
      {(isReadFailed || hasDegradedSurfaces) && !isDenied && (
        <Card
          className="border-status-failed/30 bg-status-failed/10 p-4 text-sm space-y-2"
          role="alert"
          data-testid="evolution-journal-degraded"
        >
          <div className="flex items-center gap-2 text-status-failed">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">{t("mgmt.evolution.degradedTitle")}</span>
          </div>
          <p className="text-muted-foreground">
            {isReadFailed ? t("mgmt.evolution.degradedBody") : t("mgmt.evolution.partialReadBody")}
          </p>
          {strategyPoolsDegraded && (
            <p className="text-muted-foreground" data-testid="evolution-strategy-pools-unavailable">
              {t("mgmt.evolution.strategyPoolsUnavailable")}
            </p>
          )}
          {degradedSurfaces.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {degradedSurfaces.map(([key, surface]) => `${key}: ${surface.status}`).join(" · ")}
            </div>
          )}
          <div>
            <Button size="sm" variant="outline" onClick={() => void refresh?.()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              {t("mgmt.evolution.retry")}
            </Button>
          </div>
        </Card>
      )}
      {!loading && !isReadFailed && !hasDegradedSurfaces && !isDenied && visibleRows.length === 0 && (
        activeView === "history" && !hasFocus ? (
          <Card className="p-4 text-sm space-y-2" data-testid="evolution-history-empty">
            <div className="font-medium text-foreground">{t("mgmt.evolution.emptyHistoryTitle")}</div>
            <p className="text-muted-foreground">
              {t("mgmt.evolution.emptyHistoryWithProposalsFmt", {
                total: autoProposalCounts.total,
                threshold: autoProposalCounts.threshold,
                incidentFollowup: autoProposalCounts.incident_followup,
                incidentSeverity: autoProposalCounts.incident_severity,
                infrastructure: autoProposalCounts.infrastructure,
                other: autoProposalCounts.other,
              })}
            </p>
          </Card>
        ) : activeView === "auto_proposals" && !hasFocus ? (
          <Card className="p-4 text-sm text-muted-foreground" data-testid="evolution-auto-proposals-empty">
            {t("mgmt.evolution.emptyAutoProposals")}
          </Card>
        ) : (
          <Card className="p-4 text-sm text-muted-foreground">
            {t("common.awaitingData", { defaultValue: "No data yet" })}
          </Card>
        )
      )}
      {visibleRows.map((e) => {
        // The live aggregate and the legacy mock have different field sets;
        // normalize defensively so neither shape throws (real entries have no
        // numeric before/after — calling .toFixed on those crashed the page).
        // FE-EVO-JOURNAL-VERSION-GUARD-20261126: the BFF may send any of these
        // as a number or null (a numeric target.version crashed the page), so
        // read them as text before any string method.
        const headline = cleanJournalFieldText(e.title ?? e.mutation ?? e.id);

        const status = cleanJournalFieldText(e.status ?? e.verdict) || undefined;

        const action = cleanJournalFieldText(e.action_type) || undefined;
        const risk = cleanJournalFieldText(e.risk_level) || undefined;

        const cleanTargetType = cleanJournalFieldText(e.target?.type);
        const cleanTargetId = cleanJournalFieldText(e.target?.id);
        const cleanTargetVersion = cleanJournalFieldText(e.target?.version);
        const target = e.target && cleanTargetId
          ? [cleanTargetType, cleanTargetId].filter(Boolean).join(":") +
            (cleanTargetVersion ? ` (${cleanTargetVersion})` : "")
          : undefined;

        const whenRaw = e.occurred_at ?? e.created_at ?? e.landedAt;
        const when = whenRaw && !["nan", "undefined", "null"].includes(String(whenRaw).toLowerCase())
          ? (Number.isNaN(new Date(whenRaw).getTime()) ? String(whenRaw) : safeDateTime(whenRaw))
          : undefined;

        const hasMetrics =
          typeof e.before === "number" &&
          Number.isFinite(e.before) &&
          typeof e.after === "number" &&
          Number.isFinite(e.after);
        // Formal entries (evolution_decision / mutation_review) carry a real
        // governance lifecycle state in `status`; label it explicitly as
        // approval status instead of relying on the generic status badge,
        // since fleet-summary/postmortem/freeze/rollback entries reuse the
        // same `status` field for unrelated meanings.
        const entryType = e.entry_type ?? e.entryType;
        const isFormalEntry = Boolean(entryType && FORMAL_EVOLUTION_ENTRY_TYPES.has(entryType));
        const approvalStatus = isFormalEntry ? status : undefined;
        const isFixture = e.origin === "seed";
        const evidenceClass = extractEvolutionEvidenceClass(e);
        const evidenceClassLabel = evidenceClass
          ? t(`mgmt.evolution.evidenceClasses.${evidenceClass}`, { defaultValue: evidenceClass })
          : undefined;
        if (entryType === "pool_version") {
          const before = normalizePoolMembers(e.members_before);
          const after = normalizePoolMembers(e.members_after);
          const changes = diffPoolMembers(before, after);
          const refused = e.refused === true || String(e.decision_status ?? e.status ?? "").toLowerCase() === "refused";
          const decisionStatus = String(e.decision_status ?? e.status ?? "").toLowerCase();
          const applied = !refused && decisionStatus === "applied";
          const personaName = journalFieldText(e.persona_name).trim() || e.persona_id || e.personaId || t("mgmt.evolution.poolVersion.personaUnknown");
          const isInitial = String(e.action ?? "").toLowerCase() === "initial";
          const reasons = evolutionReasonList(e.reasons);
          const memberText = (m: { artifact_ref: string; stage?: string | null; risk_weight?: number | null }) =>
            t("mgmt.evolution.poolVersion.memberFmt", {
              ref: m.artifact_ref,
              stage: m.stage ?? "—",
              weight: typeof m.risk_weight === "number" ? m.risk_weight : "—",
            });
          const actionLabel = e.action
            ? t(`mgmt.evolution.poolVersion.actions.${e.action}`, { defaultValue: e.action })
            : undefined;
          return (
            <Card key={e.id} className="p-4 space-y-2" data-testid={`evolution-pool-version-${e.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-foreground" data-testid="evolution-pool-version-title">
                  {t(isInitial ? "mgmt.evolution.poolVersion.initialTitleFmt" : "mgmt.evolution.poolVersion.titleFmt", {
                    persona: personaName,
                    version: e.pool_version ?? "—",
                  })}
                </div>
                <Badge
                  variant="outline"
                  data-testid="evolution-pool-version-status"
                  className={refused ? verdictTone("rejected") : applied ? verdictTone("accepted") : verdictTone(undefined)}
                >
                  {refused
                    ? t("mgmt.evolution.poolVersion.refused")
                    : applied
                      ? t("mgmt.evolution.poolVersion.applied")
                      : t("mgmt.evolution.poolVersion.statusUnknown")}
                </Badge>
              </div>
              <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div className="min-w-0" data-testid="evolution-pool-version-before">
                  <dt className="text-muted-foreground">{t("mgmt.evolution.poolVersion.before")}</dt>
                  <dd className="text-foreground [overflow-wrap:anywhere]">
                    {before.length === 0
                      ? t("mgmt.evolution.poolVersion.noMembers")
                      : before.map((m) => <div key={m.artifact_ref}>{memberText(m)}</div>)}
                  </dd>
                </div>
                <div className="min-w-0" data-testid="evolution-pool-version-after">
                  <dt className="text-muted-foreground">{t("mgmt.evolution.poolVersion.after")}</dt>
                  <dd className="text-foreground [overflow-wrap:anywhere]">
                    {after.length === 0
                      ? t("mgmt.evolution.poolVersion.noMembers")
                      : after.map((m) => <div key={m.artifact_ref}>{memberText(m)}</div>)}
                  </dd>
                </div>
              </dl>
              <ul className="space-y-0.5 text-xs text-foreground" data-testid="evolution-pool-version-diff">
                {refused ? (
                  <li>{t("mgmt.evolution.poolVersion.refusedNoChange")}</li>
                ) : changes.length === 0 ? (
                  <li>{t("mgmt.evolution.poolVersion.noChange")}</li>
                ) : (
                  changes.map((c) => (
                    <li key={`${c.kind}:${c.kind === "changed" ? c.ref : c.member.artifact_ref}`}>
                      {c.kind === "added"
                        ? t("mgmt.evolution.poolVersion.added", { ref: c.member.artifact_ref, stage: c.member.stage ?? "—", weight: c.member.risk_weight ?? "—" })
                        : c.kind === "removed"
                          ? t("mgmt.evolution.poolVersion.removed", { ref: c.member.artifact_ref })
                          : t("mgmt.evolution.poolVersion.changed", {
                              ref: c.ref,
                              from: `${c.from.stage ?? "—"} / ${c.from.risk_weight ?? "—"}`,
                              to: `${c.to.stage ?? "—"} / ${c.to.risk_weight ?? "—"}`,
                            })}
                    </li>
                  ))
                )}
              </ul>
              <div className="text-xs" data-testid="evolution-pool-version-reason">
                <span className="text-muted-foreground">{t("mgmt.evolution.poolVersion.reasonLabel")}: </span>
                {reasons.length === 0 ? (
                  <span className="text-muted-foreground">{t("mgmt.evolution.poolVersion.reasonNone")}</span>
                ) : (
                  <span className="text-foreground">{reasons.join("；")}</span>
                )}
              </div>
              <details className="text-xs text-muted-foreground" data-testid="evolution-pool-version-technical">
                <summary className="cursor-pointer">{t("mgmt.evolution.poolVersion.technical")}</summary>
                <div className="mt-1 space-y-0.5 [overflow-wrap:anywhere]">
                  <div className="font-mono">{e.id}</div>
                  {e.persona_id && <div className="font-mono">{e.persona_id}</div>}
                  {actionLabel && <div>{t("mgmt.evolution.poolVersion.action")}: {actionLabel}</div>}
                  {headline && <div>{headline}</div>}
                  {e.summary && <div>{e.summary}</div>}
                  {when && <div>{t("mgmt.evolution.landed")}: {when}</div>}
                </div>
              </details>
            </Card>
          );
        }
        const subjectClass = e.subject_class && e.subject_class !== "strategy" ? e.subject_class : undefined;
        const plainTitle =
          entryType && PLAIN_TITLE_ENTRY_TYPES.has(entryType)
            ? t(`mgmt.evolution.plainTitle.${entryType}`, {
                action: action ?? t("mgmt.evolution.plainTitle.actionUnknown"),
                target: journalFieldText(e.persona_name).trim() || (target ? [cleanTargetType, cleanTargetId].filter(Boolean).join(":") : undefined) || t("mgmt.evolution.plainTitle.targetUnknown"),
              })
            : undefined;
        return (
          <Card key={e.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-foreground">{plainTitle ?? headline}</div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {evidenceClass && (
                  <Badge
                    variant="outline"
                    data-testid={`evolution-evidence-class-${evidenceClass}`}
                    className={
                      evidenceClass === "threshold_signal"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : evidenceClass === "incident_severity"
                          ? "bg-status-warning/15 text-status-warning border-status-warning/30"
                          : "bg-muted text-muted-foreground border-border"
                    }
                  >
                    {evidenceClassLabel} ({evidenceClass})
                  </Badge>
                )}
                {subjectClass && (
                  <Badge variant="outline" data-testid={`evolution-subject-class-${subjectClass}`}>
                    {t("mgmt.evolution.subjectClassBadge", {
                      label: t(`mgmt.evolution.systemToggle.classes.${subjectClass}`, { defaultValue: subjectClass }),
                    })}
                  </Badge>
                )}
                {isFixture && (
                  <Badge
                    variant="outline"
                    className="bg-status-warning/15 text-status-warning border-status-warning/30"
                    title={t("mgmt.evolution.fixtureBadgeHint", { defaultValue: "Seed-derived entry; not a live evolution outcome." })}
                  >
                    {t("mgmt.evolution.fixtureBadge", { defaultValue: "Fixture" })}
                  </Badge>
                )}
                {status && (
                  <Badge variant="outline" className={verdictTone(status)}>{status}</Badge>
                )}
              </div>
            </div>
            {plainTitle && headline && headline !== plainTitle && (
              <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid="evolution-machine-title" title={t("mgmt.evolution.machineDetail")}>{headline}</div>
            )}
            {subjectClass === "unclassified" && (
              <div className="text-xs text-muted-foreground">{t("mgmt.evolution.unclassifiedNote")}</div>
            )}
            <div className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{e.id}</div>
            {e.summary && <p className="text-sm text-muted-foreground">{e.summary}</p>}
            <dl className="mt-1 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {hasMetrics && (
                <>
                  <div className="min-w-0"><dt className="text-muted-foreground">{t("mgmt.evolution.before")}</dt><dd className="[overflow-wrap:anywhere] text-foreground">{e.before!.toFixed(2)}</dd></div>
                  <div className="min-w-0"><dt className="text-muted-foreground">{t("mgmt.evolution.after")}</dt><dd className="[overflow-wrap:anywhere] text-foreground">{e.after!.toFixed(2)}</dd></div>
                </>
              )}
              {action && <div className="min-w-0"><dt className="text-muted-foreground">{t("mgmt.evolution.action", { defaultValue: "Action" })}</dt><dd className="[overflow-wrap:anywhere] text-foreground">{action}</dd></div>}
              {risk && <div className="min-w-0"><dt className="text-muted-foreground">{t("mgmt.evolution.risk", { defaultValue: "Risk" })}</dt><dd className="[overflow-wrap:anywhere] text-foreground">{risk}</dd></div>}
              {target && <div className="min-w-0"><dt className="text-muted-foreground">{t("mgmt.evolution.target", { defaultValue: "Target" })}</dt><dd className="[overflow-wrap:anywhere] font-mono text-foreground">{target}</dd></div>}
              {evidenceClass && <div className="min-w-0"><dt className="text-muted-foreground">{t("mgmt.evolution.evidenceClass")}</dt><dd className="[overflow-wrap:anywhere] text-foreground">{evidenceClassLabel}</dd></div>}
              {approvalStatus && <div className="min-w-0"><dt className="text-muted-foreground">{t("mgmt.evolution.approvalStatus", { defaultValue: "Approval status" })}</dt><dd className="[overflow-wrap:anywhere] text-foreground">{approvalStatus}</dd></div>}
              {when && <div className="min-w-0"><dt className="text-muted-foreground">{t("mgmt.evolution.landed")}</dt><dd className="[overflow-wrap:anywhere] text-foreground">{when}</dd></div>}
            </dl>
          </Card>
        );
      })}
      {!isReadFailed && !isFleetSummary && (visibleRows.length > 0 || pageIndex > 0 || nextPageToken !== null) && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
          data-testid="evolution-journal-pager"
        >
          <span>
            {t("mgmt.evolution.pager.rangeFmt", {
              start: rangeStart,
              end: rangeEnd,
              total: filteredTotal,
            })}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={goPrev} disabled={pageIndex === 0 || loading}>
              {t("mgmt.evolution.pager.previous")}
            </Button>
            <span>{t("mgmt.evolution.pager.pageFmt", { page: pageIndex + 1 })}</span>
            <Button size="sm" variant="outline" onClick={goNext} disabled={!nextPageToken || loading}>
              {t("mgmt.evolution.pager.next")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};

// =====================================================================
// Evidence Explorer
// =====================================================================

function evidenceLabel(value?: string | null): string {
  return value ? value.replace(/_/g, " ") : "—";
}

function evidenceTimestamp(value?: string | null): string {
  return value ? safeDateTime(value) : "—";
}

function linkedObjectLabel(item?: ManagementEvidenceListItem["linkedObjectSummary"]): string {
  if (!item) return "—";
  return item.displayLabel || item.display_label || item.entityRef || item.entity_ref || "—";
}

function linkedObjectRef(item?: ManagementEvidenceListItem["linkedObjectSummary"]): string {
  if (!item) return "—";
  const entityType = item.entityType || item.entity_type;
  const entityRef = item.entityRef || item.entity_ref;
  return [entityType, entityRef].filter(Boolean).join(":") || "—";
}

function evidenceSurfaceStatus(meta?: ManagementEvidenceMeta, key = "management_evidence"): string {
  return meta?.surfaces?.[key]?.status ?? "unknown";
}

function isEvidenceSurfaceDegraded(status: string): boolean {
  return !["ok", "fresh", "mock"].includes(status.toLowerCase());
}

const EvidenceSurfaceBanner = ({ meta, primaryKey }: { meta?: ManagementEvidenceMeta; primaryKey: string }) => {
  const { t } = useTranslation();
  const entries = Object.entries(meta?.surfaces ?? {});
  const degraded = entries.filter(([, surface]) => isEvidenceSurfaceDegraded(surface.status));
  if (degraded.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
      <div className="font-medium">{t("mgmt.evidence.surfaceDegraded")}</div>
      <div className="mt-1 text-xs">
        {degraded.map(([key, surface]) => `${key}: ${surface.status}`).join(" · ")}
        {meta?.snapshotAt || meta?.snapshot_at ? ` · ${t("mgmt.evidence.snapshotAt")}: ${meta.snapshotAt ?? meta.snapshot_at}` : ""}
      </div>
      {!degraded.some(([key]) => key === primaryKey) && (
        <div className="mt-1 text-xs">{primaryKey}: {evidenceSurfaceStatus(meta, primaryKey)}</div>
      )}
    </div>
  );
};

const isOfficialReferenceWithoutInternalLink = (
  link: ManagementEvidenceResolvedLink,
  sourceType?: string | null,
): boolean => {
  const href = link.routeHref ?? link.route_href;
  if (href) return false;
  if (link.availability === "no_internal_link") return true;
  if (String(sourceType ?? "").trim().toLowerCase() === "official_reference") return true;
  return /^no internal link$/i.test(String(link.displayLabel ?? link.display_label ?? "").trim());
};

const EvidenceResolvedLinkAction = ({
  link,
  sourceType,
}: {
  link: ManagementEvidenceResolvedLink;
  sourceType?: string | null;
}) => {
  const { t } = useTranslation();
  const href = link.routeHref ?? link.route_href;
  const officialNoInternalLink = isOfficialReferenceWithoutInternalLink(link, sourceType);
  const rawLabel = link.displayLabel || link.display_label;
  const label = officialNoInternalLink
    ? t("mgmt.evidence.noInternalLink", { defaultValue: "No internal link" })
    : rawLabel || t("mgmt.evidence.openResolvedSource");
  const badgeText = officialNoInternalLink
    ? t("mgmt.evidence.externalSourceBadge", { defaultValue: "external source" })
    : evidenceLabel(link.availability);
  if (!href) {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="outline" className="w-fit">{badgeText}</Badge>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    );
  }
  if (link.openInNewTab || link.open_in_new_tab || link.availability === "external") {
    return (
      <Button asChild size="sm" variant="outline">
        <a href={href} target="_blank" rel="noreferrer">
          {label}
          <ArrowUpRight aria-hidden="true" />
        </a>
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="outline">
      <Link to={href}>
        {label}
        <ArrowUpRight aria-hidden="true" />
      </Link>
    </Button>
  );
};

const EvidenceMetric = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="rounded-md border border-border bg-background px-4 py-3" data-testid="evidence-metric-card">
    <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-2xl font-semibold text-foreground">{value}</dd>
  </div>
);

const EvidenceField = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) => (
  <div>
    <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
    <dd className={["mt-1 text-sm text-foreground", mono ? "break-all font-mono text-xs" : ""].filter(Boolean).join(" ")}>
      {value}
    </dd>
  </div>
);

function evidenceStateTone(state?: string): string {
  const normalized = String(state ?? "").toLowerCase();
  if (["traceable", "resolved", "ok"].includes(normalized)) {
    return "bg-status-success/15 text-status-success border-status-success/30";
  }
  if (["redacted", "under_review", "open"].includes(normalized)) {
    return "bg-primary/10 text-primary border-primary/30";
  }
  if (["stale", "needs_evidence", "unresolved_source", "incomplete"].includes(normalized)) {
    return "bg-status-warning/15 text-status-warning border-status-warning/30";
  }
  return "bg-muted text-muted-foreground border-border";
}

const EvidenceStateBadge = ({ state, label }: { state?: string; label?: string }) => (
  <Badge variant="outline" className={evidenceStateTone(state)}>
    {label ?? evidenceLabel(state)}
  </Badge>
);

function evidenceReasonList(reasons?: string[]): string {
  const clean = (reasons ?? []).filter(Boolean);
  return clean.length ? clean.map(evidenceLabel).join(" · ") : "—";
}

const EvidenceLinkedObjectAction = ({ detail }: { detail: ManagementEvidenceDetail }) => {
  const { t } = useTranslation();
  const link = detail.linkedObjectLink ?? detail.linked_object_link;
  const href = link?.routeHref ?? link?.route_href;
  const label = link?.displayLabel ?? link?.display_label ?? linkedObjectLabel(detail.linkedObjectSummary ?? detail.linked_object_summary);
  if (!href) {
    return (
      <div className="space-y-1">
        <EvidenceStateBadge state={link?.availability ?? "unavailable"} />
        <div className="text-xs text-muted-foreground">{link?.reason ?? t("mgmt.evidence.linkedObjectUnavailable")}</div>
      </div>
    );
  }
  return (
    <Button asChild size="sm" variant="outline">
      <Link to={href}>
        {label}
        <ArrowUpRight aria-hidden="true" />
      </Link>
    </Button>
  );
};

const EVIDENCE_ACTION_LABELS: Record<EvidenceOperationAction, string> = {
  mark_stale: "mgmt.evidence.actions.markStale",
  request_more_evidence: "mgmt.evidence.actions.requestEvidence",
  create_disposition_task: "mgmt.evidence.actions.createTask",
  assign_reviewer: "mgmt.evidence.actions.assignReviewer",
  resolve: "mgmt.evidence.actions.resolve",
};

const EVIDENCE_ACTION_ALLOWED_KEYS: Record<EvidenceOperationAction, keyof ManagementEvidenceAllowedActions> = {
  mark_stale: "canMarkStale",
  request_more_evidence: "canRequestEvidence",
  create_disposition_task: "canCreateDispositionTask",
  assign_reviewer: "canAssignReviewer",
  resolve: "canResolve",
};

const EvidenceOperationPanel = ({
  refId,
  operation,
  allowedActions,
  disabledReasons,
  onUpdated,
}: {
  refId: string;
  operation: ManagementEvidenceOperation;
  allowedActions: ManagementEvidenceAllowedActions;
  disabledReasons: Partial<Record<keyof ManagementEvidenceAllowedActions, string>>;
  onUpdated: () => Promise<void> | void;
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [reviewer, setReviewer] = useState(operation.reviewer ?? "");
  const [pending, setPending] = useState<EvidenceOperationAction | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: EvidenceOperationAction) => {
    setPending(action);
    setError(null);
    try {
      const result = await submitEvidenceOperation({
        refId,
        action,
        reason: reason.trim() || t(EVIDENCE_ACTION_LABELS[action]),
        reviewer: action === "assign_reviewer" ? reviewer.trim() : undefined,
      });
      const commandId = result.response.data?.command_id ?? result.response.data?.commandId ?? result.response.data?.receipt_id ?? result.idempotencyKey;
      setLastReceipt(commandId);
      toast.success(t("mgmt.evidence.actions.queued"), {
        description: commandId,
      });
      await onUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(t("mgmt.evidence.actions.failed"), { description: message });
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.operation")}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <EvidenceStateBadge state={operation.status} />
            {operation.owner && <Badge variant="outline">{t("mgmt.evidence.ownerFmt", { owner: operation.owner })}</Badge>}
            {operation.reviewer && <Badge variant="outline">{t("mgmt.evidence.reviewerFmt", { reviewer: operation.reviewer })}</Badge>}
          </div>
        </div>
        <div className="min-w-[220px] text-xs text-muted-foreground">
          {operation.lastActionAt ?? operation.last_action_at
            ? t("mgmt.evidence.lastActionFmt", { at: evidenceTimestamp(operation.lastActionAt ?? operation.last_action_at) })
            : t("mgmt.evidence.noOperationYet")}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          {t("mgmt.evidence.reason")}
          <textarea
            className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          {t("mgmt.evidence.reviewer")}
          <input
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-normal text-foreground"
            value={reviewer}
            onChange={(event) => setReviewer(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(EVIDENCE_ACTION_LABELS) as EvidenceOperationAction[]).map((action) => {
          const allowedKey = EVIDENCE_ACTION_ALLOWED_KEYS[action];
          const allowed = Boolean(allowedActions[allowedKey]);
          const reasonText = disabledReasons[allowedKey];
          return (
            <Button
              key={action}
              size="sm"
              variant={action === "resolve" ? "default" : "outline"}
              disabled={!allowed || pending !== null || (action === "assign_reviewer" && !reviewer.trim())}
              title={!allowed ? reasonText : undefined}
              onClick={() => void submit(action)}
            >
              {pending === action ? t("mgmt.evidence.actions.working") : t(EVIDENCE_ACTION_LABELS[action])}
            </Button>
          );
        })}
      </div>
      {(lastReceipt || error) && (
        <div className="mt-3 text-xs">
          {lastReceipt && <span className="font-mono text-muted-foreground">{t("mgmt.evidence.receiptFmt", { receipt: lastReceipt })}</span>}
          {error && <span className="text-status-failed">{error}</span>}
        </div>
      )}
    </Card>
  );
};

const EvidenceRelationshipsPanel = ({ relationships }: { relationships: ManagementEvidenceRelationships }) => {
  const { t } = useTranslation();
  const buckets = Object.entries(relationships).filter(([, rows]) => rows.length > 0);
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.relationships")}</h2>
      {buckets.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("mgmt.evidence.noRelationships")}</p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {buckets.map(([bucket, rows]) => (
            <div key={bucket} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{evidenceLabel(bucket)}</Badge>
                <span className="text-xs text-muted-foreground">{rows.length}</span>
              </div>
              <ul className="mt-2 space-y-2 text-sm">
                {rows.map((row, index) => {
                  const href = row.routeHref ?? row.route_href;
                  const label = row.displayLabel ?? row.display_label ?? row.entityRef ?? row.entity_ref;
                  return (
                    <li key={`${bucket}-${row.entityRef}-${index}`}>
                      {href ? (
                        <Link to={href} className="font-medium text-primary underline-offset-4 hover:underline">{label}</Link>
                      ) : (
                        <span className="font-medium text-foreground">{label}</span>
                      )}
                      <div className="break-all font-mono text-xs text-muted-foreground">
                        {[row.entityType ?? row.entity_type, row.entityRef ?? row.entity_ref].filter(Boolean).join(":")}
                      </div>
                      {(row.linkType ?? row.link_type) && (
                        <div className="text-xs text-muted-foreground">{evidenceLabel(row.linkType ?? row.link_type)}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const EvidenceChainPanel = ({ chain }: { chain: ManagementEvidenceChain }) => {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.chain")}</h2>
        <Badge variant="outline">{t("mgmt.evidence.chainCountFmt", { nodes: chain.nodes.length, edges: chain.edges.length })}</Badge>
      </div>
      {chain.edges.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{evidenceLabel(chain.emptyReason ?? chain.empty_reason)}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {chain.edges.map((edge, index) => {
            const from = chain.nodes.find((node) => node.id === edge.from);
            const to = chain.nodes.find((node) => node.id === edge.to);
            return (
              <li key={`${edge.from}-${edge.to}-${index}`} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{from?.label ?? edge.from}</span>
                  <span className="text-xs text-muted-foreground">→ {evidenceLabel(edge.relationship)} →</span>
                  <span className="font-medium text-foreground">{to?.label ?? edge.to}</span>
                  {edge.degraded && <EvidenceStateBadge state="degraded" />}
                </div>
                <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {edge.from} → {edge.to}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {chain.degradedReasons.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{evidenceReasonList(chain.degradedReasons)}</p>
      )}
    </Card>
  );
};

const EvidenceTasksPanel = ({ tasks }: { tasks: ManagementEvidenceTask[] }) => {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.tasks")}</h2>
      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("mgmt.evidence.noTasks")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {tasks.map((task) => {
            const href = task.routeHref ?? task.route_href;
            return (
              <li key={task.taskRef} className="py-3 first:pt-0 last:pb-0">
                {href ? (
                  <Link to={href} className="font-mono text-primary underline-offset-4 hover:underline">{task.taskRef}</Link>
                ) : (
                  <span className="font-mono text-sm text-foreground">{task.taskRef}</span>
                )}
                <div className="mt-1 flex flex-wrap gap-2">
                  <EvidenceStateBadge state={task.status} />
                  {task.materialization && <Badge variant="outline">{evidenceLabel(task.materialization)}</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

const EvidenceAuditPanel = ({ events }: { events: ManagementEvidenceAuditEvent[] }) => {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.audit")}</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("mgmt.evidence.noAudit")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {events.map((event, index) => (
            <li key={event.eventId ?? event.event_id ?? index} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <EvidenceStateBadge state={event.action ?? "event"} />
                <span className="text-muted-foreground">{evidenceTimestamp(event.createdAt ?? event.created_at)}</span>
              </div>
              <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {event.auditRef ?? event.audit_ref ?? event.commandId ?? event.command_id ?? "—"}
              </div>
              {event.reason && <p className="mt-1 text-muted-foreground">{event.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const EvidenceExplorerList = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const journeyFocus = searchParams.get("journey_id")?.trim() ?? "";
  const initialPageToken = searchParams.get("page_token")?.trim() ?? "";
  const [pageTokens, setPageTokens] = useState<string[]>(initialPageToken ? ["", initialPageToken] : [""]);
  const currentPageToken = pageTokens[pageTokens.length - 1] || undefined;
  const currentPage = pageTokens.length;

  const { data, loading } = useV5Live(
    (signal) => mgmt.evidence.overviewLiveOnly({ pageToken: currentPageToken, signal }),
    [currentPageToken],
    {
      cacheKey: "oversight.evidence.overview",
    },
  );
  useEffect(() => {
    if (!loading) markRoutePrimaryReady(location.pathname);
  }, [loading, location.pathname]);

  if (!data && loading) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.title")} data-testid="evidence-route-loading">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evidence.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.evidence.subtitle")}</p>
        </header>
        <Card className="p-4 text-sm text-muted-foreground">{t("mgmt.evidence.loading")}</Card>
      </section>
    );
  }
  const model: ManagementEvidenceOverview = data ?? {
    items: [],
    data: [],
    summary: {
      totalEvidence: 0,
      total_evidence: 0,
      returnedEvidence: 0,
      returned_evidence: 0,
      visibleEvidence: 0,
      visible_evidence: 0,
      redactedEvidence: 0,
      redacted_evidence: 0,
      verifiedEvidence: 0,
      verified_evidence: 0,
      bySourceType: {},
      by_source_type: {},
      byLinkType: {},
      by_link_type: {},
      byCredibilityTier: {},
      by_credibility_tier: {},
      traceableEvidence: 0,
      traceable_evidence: 0,
      unresolvedSourceEvidence: 0,
      unresolved_source_evidence: 0,
      incompleteEvidence: 0,
      incomplete_evidence: 0,
      needsAttentionEvidence: 0,
      needs_attention_evidence: 0,
      openOperationEvidence: 0,
      open_operation_evidence: 0,
      byActionabilityState: {},
      by_actionability_state: {},
      byActionabilitySeverity: {},
      by_actionability_severity: {},
      byOperationStatus: {},
      by_operation_status: {},
    },
    facets: {
      sourceTypes: {},
      source_types: {},
      linkTypes: {},
      link_types: {},
      credibilityTiers: {},
      credibility_tiers: {},
      actionabilityStates: {},
      actionability_states: {},
      actionabilitySeverity: {},
      actionability_severity: {},
      operationStatuses: {},
      operation_statuses: {},
    },
    pageInfo: {
      nextPageToken: null,
      next_page_token: null,
      hasMore: false,
      has_more: false,
      total: 0,
      pageSize: 0,
      page_size: 0,
    },
    page_info: {
      nextPageToken: null,
      next_page_token: null,
      hasMore: false,
      has_more: false,
      total: 0,
      pageSize: 0,
      page_size: 0,
    },
    pagination: {
      nextPageToken: null,
      next_page_token: null,
      hasMore: false,
      has_more: false,
      total: 0,
      pageSize: 0,
      page_size: 0,
    },
    meta: {
      surfaces: {
        management_evidence: { status: "unavailable", source: "live_transport" },
      },
      redactedEvidenceCount: 0,
      redacted_evidence_count: 0,
    },
  };
  const rows = model.items;
  const primarySurfaceStatus = evidenceSurfaceStatus(model.meta, "management_evidence");
  const managementEvidenceOk = Boolean(data) && primarySurfaceStatus.toLowerCase() === "ok";
  const unavailableMetricValue = t("mgmt.evidence.unavailableValue", { defaultValue: "Unavailable" });
  const noDataMetricValue = t("common.noData", { defaultValue: "No data" });
  const summaryMetricValue = (val: number | null | undefined): ReactNode =>
    typeof val === "number" && Number.isFinite(val) ? val : noDataMetricValue;
  const totalShown = model.pageInfo.total ?? model.page_info.total ?? model.summary.totalEvidence;
  const nextPageToken = model.pageInfo.nextPageToken ?? model.page_info.next_page_token ?? null;
  const canGoPrev = pageTokens.length > 1;
  const canGoNext = Boolean(nextPageToken);

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6" aria-label={t("mgmt.evidence.title")} data-testid="evidence-route-ready">
      <header className="shrink-0">
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evidence.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.evidence.subtitle")}</p>
      </header>
      <EvidenceSurfaceBanner meta={model.meta} primaryKey="management_evidence" />
      {journeyFocus && (
        <Card className="shrink-0 border-primary/30 bg-primary/5 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              {t("mgmt.evidence.journeyContextFmt", { journey: journeyFocus, defaultValue: `Viewing evidence linked from trade journey ${journeyFocus}` })}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link aria-label={`${journeyFocus} back to trade journey`} to={`/management/trade-journeys/${encodeURIComponent(journeyFocus)}`}>
                {t("mgmt.evidence.backToJourney", { defaultValue: "Back to journey" })}
              </Link>
            </Button>
          </div>
        </Card>
      )}
      <dl className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-5" data-testid="evidence-metrics">
        <EvidenceMetric label={t("mgmt.evidence.total")} value={managementEvidenceOk ? totalShown : unavailableMetricValue} />
        <EvidenceMetric label={t("mgmt.evidence.traceable")} value={managementEvidenceOk ? summaryMetricValue(model.summary.traceableEvidence) : unavailableMetricValue} />
        <EvidenceMetric label={t("mgmt.evidence.needsAttention")} value={managementEvidenceOk ? summaryMetricValue(model.summary.needsAttentionEvidence) : unavailableMetricValue} />
        <EvidenceMetric label={t("mgmt.evidence.verified")} value={managementEvidenceOk ? model.summary.verifiedEvidence : unavailableMetricValue} />
        <EvidenceMetric label={t("mgmt.evidence.openOperations")} value={managementEvidenceOk ? summaryMetricValue(model.summary.openOperationEvidence) : unavailableMetricValue} />
      </dl>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ManagementTableScroll
          className="min-h-0 flex-1"
          testId="evidence-explorer-table-scroll"
          minScrollWidth={1040}
          showPinnedScrollbar={false}
          contentClassName="pb-4"
          viewportClassName="h-full min-h-0 overflow-auto pb-4"
        >
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-card text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t("mgmt.evidence.source")}</th>
              <th className="px-3 py-2">{t("mgmt.evidence.credibility")}</th>
              <th className="px-3 py-2">{t("mgmt.evidence.actionability")}</th>
              <th className="px-3 py-2">{t("mgmt.evidence.operation")}</th>
              <th className="px-3 py-2">{t("mgmt.evidence.resolution")}</th>
              <th className="px-3 py-2">{t("mgmt.evidence.linkedObject")}</th>
              <th className="px-3 py-2">{t("mgmt.evidence.captured")}</th>
              <th className="px-3 py-2 text-right">{t("mgmt.evidence.actions.title")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const detailHref = e.managementHref ?? e.management_href;
              const linkedObjectHref = e.linkedObjectLink?.routeHref ?? e.linked_object_link?.route_href;
              const linkedObjectUnavailable = e.disabledActionReasons.canOpenLinkedObject ?? e.disabled_action_reasons.canOpenLinkedObject;
              return (
                <tr key={e.refId} className="border-b border-border/50 align-top" data-testid="evidence-route-row">
                  <td className="px-3 py-3">
                    {detailHref ? (
                      <Link to={detailHref} className="font-medium text-primary underline-offset-4 hover:underline">
                        {e.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{e.title}</span>
                    )}
                    <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{e.refId}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span data-testid="evidence-row-source-type" title={e.sourceType}>{evidenceLabel(e.sourceType)}</span>
                      {" · "}
                      <span title={e.linkType}>{evidenceLabel(e.linkType)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={e.credibility.verified ? "default" : "outline"}>
                        {e.credibility.verified ? t("mgmt.evidence.verified") : t("mgmt.evidence.unverified")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{evidenceLabel(e.credibility.tier)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <EvidenceStateBadge state={e.actionability.state} />
                      <span className="max-w-[220px] text-xs text-muted-foreground">
                        {evidenceReasonList(e.actionability.reasons)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <EvidenceStateBadge state={e.operation.status} />
                      {e.operation.reviewer && (
                        <span className="text-xs text-muted-foreground">{t("mgmt.evidence.reviewerFmt", { reviewer: e.operation.reviewer })}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <EvidenceResolvedLinkAction link={e.resolvedLink} sourceType={e.sourceType ?? e.source_type} />
                  </td>
                  <td className="px-3 py-3">
                    {linkedObjectHref ? (
                      <Link to={linkedObjectHref} className="font-medium text-primary underline-offset-4 hover:underline">
                        {linkedObjectLabel(e.linkedObjectSummary)}
                      </Link>
                    ) : (
                      <div className="font-medium text-foreground">{linkedObjectLabel(e.linkedObjectSummary)}</div>
                    )}
                    <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {linkedObjectRef(e.linkedObjectSummary)}
                    </div>
                    {!linkedObjectHref && linkedObjectUnavailable && (
                      <div className="mt-1 text-xs text-muted-foreground">{linkedObjectUnavailable}</div>
                    )}
                    {e.redacted && (
                      <Badge variant="outline" className="mt-2">{t("mgmt.evidence.redacted")}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground" data-testid="evidence-row-captured-at" title={e.capturedAt ?? e.captured_at ?? undefined}>
                    {evidenceTimestamp(e.capturedAt ?? e.captured_at)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {detailHref && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={detailHref}>{t("mgmt.evidence.actions.inspect")}</Link>
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              managementEvidenceOk ? (
                <tr data-testid="evidence-route-empty">
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                    {t("mgmt.evidence.noRows")}
                  </td>
                </tr>
              ) : (
                <tr data-testid="evidence-route-unavailable">
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                    {t("mgmt.evidence.unavailableRows")}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        </ManagementTableScroll>
        {managementEvidenceOk && (rows.length > 0 || canGoPrev || canGoNext) && (
          <div
            className="flex shrink-0 items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground"
            data-testid="evidence-pagination"
          >
            <span>
              {t("mgmt.evidence.pager.pageFmt", {
                page: currentPage,
                total: totalShown,
                defaultValue: `Page ${currentPage} · Total ${totalShown}`,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canGoPrev || loading}
                data-testid="evidence-pagination-prev"
                onClick={() => setPageTokens((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
              >
                {t("mgmt.evidence.pager.previous", { defaultValue: "Previous" })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canGoNext || loading}
                data-testid="evidence-pagination-next"
                onClick={() => {
                  if (nextPageToken) {
                    setPageTokens((prev) => [...prev, nextPageToken]);
                  }
                }}
              >
                {t("mgmt.evidence.pager.next", { defaultValue: "Next" })}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
};

export const EvidenceExplorerPage = () => {
  const [searchParams] = useSearchParams();
  const focusedRefId = searchParams.get("ref_id");
  if (focusedRefId) return <EvidenceDetailView refId={focusedRefId} />;
  return <EvidenceExplorerList />;
};

const EvidenceLinkedDecisions = ({ decisions }: { decisions: ManagementEvidenceLinkedDecision[] }) => {
  const { t } = useTranslation();
  if (decisions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("mgmt.evidence.noLinkedDecisions")}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {decisions.map((decision, index) => {
        const label = (
          decision.displayLabel ?? decision.display_label ?? decision.entityRef ?? decision.entity_ref
        ) || t("mgmt.evidence.redactedDecision");
        const href = decision.routeHref ?? decision.route_href;
        return (
          <li key={`${decision.entityType}-${decision.entityRef}-${index}`} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              {href ? (
                <Link to={href} className="font-medium text-primary underline-offset-4 hover:underline">{label}</Link>
              ) : (
                <span className="font-medium text-foreground">{label}</span>
              )}
              {decision.redacted && <Badge variant="outline">{t("mgmt.evidence.redacted")}</Badge>}
            </div>
            <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {[decision.entityType ?? decision.entity_type, decision.entityRef ?? decision.entity_ref].filter(Boolean).join(":") || "—"}
            </div>
            {decision.linkType || decision.link_type ? (
              <div className="mt-1 text-xs text-muted-foreground">{evidenceLabel(decision.linkType ?? decision.link_type)}</div>
            ) : null}
            {decision.relationshipNote || decision.relationship_note ? (
              <p className="mt-1 text-sm text-muted-foreground">{decision.relationshipNote ?? decision.relationship_note}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};

const EvidenceSourceContexts = ({ detail }: { detail: ManagementEvidenceDetail }) => {
  const { t } = useTranslation();
  const note = detail.sourceNoteContext ?? detail.source_note_context;
  const memory = detail.sourceMemoryContext ?? detail.source_memory_context;
  if (!note && !memory) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {note && (
        <Card className="p-4">
          <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.sourceNote")}</h2>
          <dl className="mt-3 space-y-3">
            <EvidenceField label={t("mgmt.evidence.titleLabel")} value={note.title || "—"} />
            <EvidenceField label={t("mgmt.evidence.id")} value={note.noteId ?? note.note_id ?? "—"} mono />
            {note.excerpt && <EvidenceField label={t("mgmt.evidence.excerpt")} value={note.excerpt} />}
            {(note.routeHref ?? note.route_href) && (
              <dd>
                <Button asChild size="sm" variant="outline">
                  <Link to={(note.routeHref ?? note.route_href) as string}>
                    {t("mgmt.evidence.openContext")}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </Button>
              </dd>
            )}
          </dl>
        </Card>
      )}
      {memory && (
        <Card className="p-4">
          <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.sourceMemory")}</h2>
          <dl className="mt-3 space-y-3">
            <EvidenceField label={t("mgmt.evidence.titleLabel")} value={memory.headline || "—"} />
            <EvidenceField label={t("mgmt.evidence.id")} value={memory.entryId ?? memory.entry_id ?? "—"} mono />
            <EvidenceField label={t("mgmt.evidence.kind")} value={evidenceLabel(memory.knowledgeType ?? memory.knowledge_type)} />
            <EvidenceField label={t("mgmt.evidence.status")} value={evidenceLabel(memory.lifecycleStatus ?? memory.lifecycle_status)} />
            {(memory.routeHref ?? memory.route_href) && (
              <dd>
                <Button asChild size="sm" variant="outline">
                  <Link to={(memory.routeHref ?? memory.route_href) as string}>
                    {t("mgmt.evidence.openContext")}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </Button>
              </dd>
            )}
          </dl>
        </Card>
      )}
    </div>
  );
};

const EvidenceDetailView = ({ refId }: { refId: string }) => {
  const { t } = useTranslation();
  const { data, loading, error, refresh } = useV5Live(
    (signal) => refId ? mgmt.evidence.detailLiveOnly(refId, { signal }) : Promise.resolve(undefined),
    [refId],
    { cacheKey: `oversight.evidence.detail.${refId}` },
  );

  if (!refId) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.packetTitle")}>
        <Card className="p-4">
          <p className="text-sm">{t("mgmt.evidence.seeListAt")} <Link to="/management/evidence" className="text-primary underline-offset-4 hover:underline">{t("mgmt.evidence.backToList")}</Link>.</p>
        </Card>
      </section>
    );
  }

  if (!data && loading) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.packetTitle")}>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evidence.packetTitle")}</h1>
        <Card className="p-4 text-sm text-muted-foreground">{t("mgmt.evidence.loading")}</Card>
      </section>
    );
  }

  if (!data) {
    const notFound = Boolean(error) && isNotFoundError(error);
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.packetTitle")}>
        <header>
          <h1 className="text-2xl font-semibold text-foreground">
            {notFound ? t("mgmt.evidence.detailNotFoundTitle") : t("mgmt.evidence.unavailableTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">{refId}</p>
          {notFound && (
            <p className="text-sm text-muted-foreground">{t("mgmt.evidence.detailNotFoundBody", { id: refId })}</p>
          )}
        </header>
        <Card className="p-4">
          <Button asChild size="sm" variant="outline">
            <Link to="/management/evidence">{t("mgmt.evidence.backToList")}</Link>
          </Button>
        </Card>
      </section>
    );
  }

  const detail = data;
  const linkedObject = detail.linkedObjectSummary ?? detail.linked_object_summary;
  const storagePreview = detail.sourceDocument.storagePreview ?? detail.sourceDocument.storage_preview;
  const sourceTitle = detail.sourceDocument.title || detail.title;

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.packetTitle")}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{sourceTitle}</h1>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{detail.refId}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <EvidenceStateBadge state={detail.actionability.state} />
            <EvidenceStateBadge state={detail.operation.status} label={t("mgmt.evidence.operationStatusFmt", { status: evidenceLabel(detail.operation.status) })} />
            {detail.actionability.reasons.length > 0 && (
              <span className="self-center text-xs text-muted-foreground">{evidenceReasonList(detail.actionability.reasons)}</span>
            )}
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/management/evidence">{t("mgmt.evidence.backToList")}</Link>
        </Button>
      </header>
      <EvidenceSurfaceBanner meta={detail.meta} primaryKey="evidence_ref_detail" />
      <EvidenceOperationPanel
        refId={detail.refId}
        operation={detail.operation}
        allowedActions={detail.allowedActions}
        disabledReasons={detail.disabledActionReasons}
        onUpdated={refresh}
      />
      {detail.redacted && (
        <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm">
          <Badge variant="outline">{t("mgmt.evidence.redacted")}</Badge>
          <span className="ml-2 text-muted-foreground">{detail.requiredCapability ?? detail.reason ?? "—"}</span>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="p-4">
          <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.packetContent")}</h2>
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            <EvidenceField label={t("mgmt.evidence.sourceType")} value={evidenceLabel(detail.sourceDocument.sourceType ?? detail.sourceDocument.source_type)} />
            <EvidenceField label={t("mgmt.evidence.linkType")} value={evidenceLabel(detail.linkType)} />
            <EvidenceField label={t("mgmt.evidence.captured")} value={evidenceTimestamp(detail.sourceDocument.capturedAt ?? detail.sourceDocument.captured_at)} />
            <EvidenceField label={t("mgmt.evidence.capturedBy")} value={detail.sourceDocument.capturedBy ?? detail.sourceDocument.captured_by ?? "—"} />
            <EvidenceField label={t("mgmt.evidence.preview")} value={storagePreview.available ? evidenceLabel(storagePreview.previewType ?? storagePreview.preview_type) : t("mgmt.evidence.previewUnavailable")} />
            <EvidenceField label={t("mgmt.evidence.created")} value={evidenceTimestamp(detail.createdAt ?? detail.created_at)} />
          </dl>
          <div className="mt-4">
            <div className="text-xs font-medium uppercase text-muted-foreground mb-2">{t("mgmt.evidence.excerpt")}</div>
            <CodeBlock
              code={detail.sourceDocument.excerpt || t("mgmt.evidence.noExcerpt")}
              language="json"
              className="max-h-80 overflow-auto"
            />
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.credibility")}</h2>
            <dl className="mt-3 space-y-3">
              <EvidenceField label={t("mgmt.evidence.tier")} value={evidenceLabel(detail.credibility.tier)} />
              <EvidenceField
                label={t("mgmt.evidence.verified")}
                value={detail.credibility.verified ? t("mgmt.evidence.yes") : t("mgmt.evidence.no")}
              />
              <EvidenceField label={t("mgmt.evidence.lastVerified")} value={evidenceTimestamp(detail.credibility.lastVerifiedAt ?? detail.credibility.last_verified_at)} />
              <EvidenceField label={t("mgmt.evidence.verificationMethod")} value={evidenceLabel(detail.credibility.verificationMethod ?? detail.credibility.verification_method)} />
            </dl>
          </Card>
          <Card className="p-4">
            <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.resolution")}</h2>
            <dl className="mt-3 space-y-3">
              <EvidenceField
                label={t("mgmt.evidence.availability")}
                value={
                  isOfficialReferenceWithoutInternalLink(
                    detail.resolvedLink,
                    detail.sourceDocument.sourceType ?? detail.sourceDocument.source_type,
                  )
                    ? t("mgmt.evidence.externalSourceBadge", { defaultValue: "external source" })
                    : evidenceLabel(detail.resolvedLink.availability)
                }
              />
              <dd>
                <EvidenceResolvedLinkAction
                  link={detail.resolvedLink}
                  sourceType={detail.sourceDocument.sourceType ?? detail.sourceDocument.source_type}
                />
              </dd>
            </dl>
          </Card>
          <Card className="p-4">
            <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.linkedObject")}</h2>
            <dl className="mt-3 space-y-3">
              <EvidenceField label={t("mgmt.evidence.titleLabel")} value={linkedObjectLabel(linkedObject)} />
              <EvidenceField label={t("mgmt.evidence.entity")} value={linkedObjectRef(linkedObject)} mono />
              <dd><EvidenceLinkedObjectAction detail={detail} /></dd>
            </dl>
          </Card>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <EvidenceChainPanel chain={detail.chain} />
        <EvidenceRelationshipsPanel relationships={detail.relationships} />
      </div>
      <Card className="p-4">
        <h2 className="text-base font-semibold text-foreground">{t("mgmt.evidence.linkedDecisions")}</h2>
        {isEvidenceSurfaceDegraded(evidenceSurfaceStatus(detail.meta, "linked_decisions")) && (
          <p className="mt-1 text-xs text-amber-700">{t("mgmt.evidence.linkedDecisionsDegraded")}</p>
        )}
        <div className="mt-3">
          <EvidenceLinkedDecisions decisions={detail.linkedDecisions} />
        </div>
      </Card>
      <EvidenceSourceContexts detail={detail} />
      <div className="grid gap-4 lg:grid-cols-2">
        <EvidenceTasksPanel tasks={detail.tasks} />
        <EvidenceAuditPanel events={detail.auditEvents ?? detail.audit_events} />
      </div>
    </section>
  );
};

export const EvidencePacketDetailPage = () => {
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  return <EvidenceDetailView refId={id || searchParams.get("ref_id") || ""} />;
};
