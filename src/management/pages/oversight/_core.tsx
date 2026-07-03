// 2026-05-20 revamp §6 — Core 7 Oversight pages (Phase 1).
// Cockpit upgraded by PM-3 (composeCockpit + SystemStateStrip / LoopFlowMap /
// PersonaOodaMatrix / CriticalAnomalyPanel).
//
// PersonaIntent + readiness pages live in their own files.

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { agentPanel } from "@/management/components/agent/useAgentPanel";
import type { QuarterlyRankingFormula, QuarterlyRankingRow, QuarterlySnapshot } from "@/lib/v5/management/quarterlyRanking";
import { SystemStateStrip } from "@/management/components/cockpit/SystemStateStrip";
import { LoopFlowMap } from "@/management/components/cockpit/LoopFlowMap";
import { PersonaOodaMatrix } from "@/management/components/cockpit/PersonaOodaMatrix";
import { CriticalAnomalyPanel } from "@/management/components/cockpit/CriticalAnomalyPanel";
import { TotalCapitalSnapshot } from "@/management/components/cockpit/TotalCapitalSnapshot";
import { PersonaLeagueSnapshot } from "@/management/components/cockpit/PersonaLeagueSnapshot";
import { QuarterlyRankingCountdown } from "@/management/components/cockpit/QuarterlyRankingCountdown";
import { DataSourceHealthSnapshot } from "@/management/components/cockpit/DataSourceHealthSnapshot";
import { OpenClawLlmAuthPanel } from "@/management/components/openclaw/OpenClawLlmAuthPanel";
import {
  HUMAN_INBOX_KINDS, humanInboxRank, type HumanInboxItem,
} from "@/lib/v5/management/humanInbox";
import { mgmt } from "@/lib/bff-v1";
import {
  type ManagementEvidenceDetail,
  type ManagementEvidenceAllowedActions,
  type ManagementEvidenceAuditEvent,
  type ManagementEvidenceChain,
  type ManagementEvidenceLinkedDecision,
  type ManagementEvidenceListItem,
  type ManagementEvidenceMeta,
  type ManagementEvidenceOperation,
  type ManagementEvidenceRelationships,
  type ManagementEvidenceResolvedLink,
  type ManagementEvidenceTask,
  type ManagementPersonaFleetRow,
  type ManagementTradingPulseCard,
  type ManagementTradingPulseModel,
  type ManagementTradingPulseRuntimeRow,
  type ManagementTradingPulseSurface,
} from "@/lib/bff-v1/management";
import {
  submitEvidenceOperation,
  type EvidenceOperationAction,
} from "@/lib/bff/evidenceOperations";
import { useV5Live } from "@/management/pages/v5/useV5Live";
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
  isNonProductionPersonaFleetRow,
  productionPersonaFleetRows,
} from "./personaFleetFilters";
import {
  personaFleetArtifactHref,
  personaFleetDataSourcesHref,
  personaFleetHumanGateHref,
  personaFleetMutationHref,
  personaFleetOodaHref,
  personaFleetOnboardingHref,
  personaFleetPerformanceHref,
  personaFleetPersonaHref,
  personaFleetResearchHref,
  personaFleetResearchItems,
  personaFleetRuntimeHref,
  type PersonaFleetResearchItem,
} from "./personaFleetLinks";
import { filterEvolutionJournalRowsForFocus } from "./evolutionJournalFocus";
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
  if (!rows && !formula) return undefined;
  const rowList = rows ?? [];
  const quarter = rowList.find((row) => row.quarter)?.quarter ?? currentQuarterId();
  const cutoffDate = quarterCutoffDate(quarter);
  return {
    quarter,
    cutoffDate,
    daysRemaining: daysUntil(cutoffDate),
    eligiblePersonas: rowList.filter((row) => row.eligibility === "eligible").length,
    disqualifiedPersonas: rowList.filter((row) => row.eligibility === "disqualified").length,
    pendingEvidenceGaps: rowList.filter((row) => (row.evidenceRefs ?? []).length === 0).length,
    formulaVersion: formula?.version ?? "—",
  };
}

export const OneRingCockpitPage = () => {
  const { t } = useTranslation();
  const { data: model, loading } = useV5Live(() => mgmt.cockpit.getLiveOnly(), []);
  const { data: pSummary } = useV5Live(() => mgmt.portfolioBook.summaryLiveOnly(), []);
  const { data: league } = useV5Live(() => mgmt.personaLeague.listLiveOnly(), []);
  const { data: quarterlyRows } = useV5Live(() => mgmt.quarterlyRanking.listLiveOnly(), []);
  const { data: quarterlyFormula } = useV5Live(() => mgmt.quarterlyRanking.formulaLiveOnly(), []);
  const { data: fleetRows } = useV5Live(() => mgmt.personaFleet.get(), []);
  const productionFleetRows = useMemo(() => productionPersonaFleetRows(fleetRows ?? []), [fleetRows]);
  const quarterlySnapshot = useMemo(
    () => quarterlySnapshotFromLive(quarterlyRows, quarterlyFormula),
    [quarterlyFormula, quarterlyRows],
  );

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
        <Button size="sm" variant="default" onClick={() => agentPanel.open()}>
          💬 詢問 AI Management
        </Button>
      </header>
      {!model && (
        <LiveOnlyNotice
          title={loading ? t("common.loading", { defaultValue: "Loading..." }) : unavailableTitle}
          body={loading ? t("mgmt.liveOnly.loadingBody", { defaultValue: "Waiting for live BFF data." }) : unavailableBody}
        />
      )}
      {model && <SystemStateStrip model={model.strip} />}
      <OpenClawLlmAuthPanel mode="summary" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {pSummary ? (
          <TotalCapitalSnapshot summary={pSummary} />
        ) : (
          <LiveOnlyNotice
            title={t("mgmt.cockpit.totalCapital")}
            body={unavailableBody}
            action={<Link to="/management/portfolio-book" className="text-xs text-primary hover:underline">{t("mgmt.actions.openDetail")} →</Link>}
          />
        )}
        <PersonaLeagueSnapshot rows={league ?? []} />
        {quarterlySnapshot ? (
          <QuarterlyRankingCountdown snap={quarterlySnapshot} />
        ) : (
          <LiveOnlyNotice
            title={t("mgmt.cockpit.quarterlyCountdown")}
            body={unavailableBody}
            action={<Link to="/management/quarterly-ranking" className="text-xs text-primary hover:underline">{t("mgmt.actions.openDetail")} →</Link>}
          />
        )}
        <DataSourceHealthSnapshot rows={productionFleetRows} />
      </div>
      {model && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <LoopFlowMap model={model.loopFlow} />
            <PersonaOodaMatrix model={model.matrix} />
          </div>
          <CriticalAnomalyPanel anomalies={model.anomalies} />
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
  href: string;
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

const ONBOARDING_ACTION_STATES = new Set([
  "draft",
  "none",
  "not_deployed",
  "not_started",
  "pending_onboarding",
  "onboarding",
  "no_runtime_binding",
  "missing_runtime_binding",
  "ready_for_paper",
  "ready_for_deployment",
]);

function normalizedFleetState(r: ManagementPersonaFleetRow): string {
  return String(r.state ?? "").trim().toLowerCase();
}

function personaFleetPrimaryAction(
  r: ManagementPersonaFleetRow,
  links: { personaHref: string; researchHref: string | null },
): PersonaFleetPrimaryAction {
  const state = normalizedFleetState(r);

  if (RUNTIME_ACTION_STATES.has(state) || state.endsWith("_running")) {
    return {
      href: personaFleetRuntimeHref(r),
      labelKey: "mgmt.fleet.primaryAction.viewRuntime",
      ariaLabelKey: "mgmt.fleet.primaryAction.viewRuntimeAriaFmt",
      className: "border-status-success/40 text-status-success hover:text-status-success",
    };
  }

  if (state === "needs_human_approval" || r.humanNeeded) {
    return {
      href: personaFleetHumanGateHref(r),
      labelKey: "mgmt.fleet.primaryAction.reviewHumanGate",
      ariaLabelKey: "mgmt.fleet.primaryAction.reviewHumanGateAriaFmt",
      className: "border-status-warning/40 text-status-warning hover:text-status-warning",
    };
  }

  if (ONBOARDING_ACTION_STATES.has(state)) {
    const isDraft = state === "draft";
    return {
      href: personaFleetOnboardingHref(r),
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
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const { data, loading, refresh } = useV5Live(() => mgmt.personaFleet.get(), []);
  const rows = useMemo(() => data ?? [], [data]);

  const [showRetired, setShowRetired] = useState(false);
  const [showNonProduction, setShowNonProduction] = useState(false);

  const filtered = useMemo(() => rows.filter((r) => {
    if (!showRetired && r.state && HIDDEN_STATES.has(r.state)) return false;
    if (!showNonProduction && isNonProductionPersonaFleetRow(r)) return false;
    return true;
  }), [rows, showRetired, showNonProduction]);

  const visibleRows = useMemo(() => {
    if (!personaFocus) return filtered;
    return filtered.filter((r) => r.personaId === personaFocus);
  }, [filtered, personaFocus]);
  const isPersonaFocusLoading = Boolean(personaFocus && loading && data === undefined);
  const hasPersonaFocusMatch = !personaFocus || visibleRows.length > 0;

  const hiddenRetired = rows.filter((r) => r.state && HIDDEN_STATES.has(r.state)).length;
  const hiddenNonProduction = rows.filter(isNonProductionPersonaFleetRow).length;

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.fleet.title")}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.fleet.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.fleet.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Button
            size="sm"
            variant={showRetired ? "default" : "outline"}
            onClick={() => setShowRetired((v) => !v)}
            aria-pressed={showRetired}
          >
            {showRetired
              ? t("mgmt.fleet.filter.hideRetired")
              : t("mgmt.fleet.filter.showRetiredFmt", { count: hiddenRetired })}
          </Button>
          <Button
            size="sm"
            variant={showNonProduction ? "default" : "outline"}
            onClick={() => setShowNonProduction((v) => !v)}
            aria-pressed={showNonProduction}
          >
            {showNonProduction
              ? t("mgmt.fleet.filter.hideNonProduction")
              : t("mgmt.fleet.filter.showNonProductionFmt", { count: hiddenNonProduction })}
          </Button>
        </div>
      </header>
      {personaFocus && (
        <Card className={"p-3 text-sm " + (isPersonaFocusLoading || hasPersonaFocusMatch
          ? "border-primary/30 bg-primary/5"
          : "border-status-warning/30 bg-status-warning/10")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              {isPersonaFocusLoading
                ? t("mgmt.fleet.focusLoadingPersonaFmt", { persona: personaFocus })
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
      {visibleRows.length === 0 && rows.length > 0 && !personaFocus && (
        <Card className="p-4 text-sm text-muted-foreground">
          {t("mgmt.fleet.filter.allFilteredHint")}
        </Card>
      )}
      {loading && rows.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          {t("mgmt.fleet.loadingLive")}
        </Card>
      )}
      {!loading && rows.length === 0 && (
        <Card className="p-4 text-sm">
          <div className="font-medium text-foreground">{t("mgmt.fleet.liveDataUnavailableTitle")}</div>
          <p className="mt-1 text-muted-foreground">{t("mgmt.fleet.liveDataUnavailableBody")}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={refresh}>
            {t("mgmt.actions.refresh")}
          </Button>
        </Card>
      )}
      {visibleRows.length > 0 && (
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t("mgmt.fleet.persona")}</th><th className="px-3 py-2">{t("mgmt.fleet.owner")}</th>
              <th className="px-3 py-2">{t("mgmt.fleet.ooda")}</th><th className="px-3 py-2">{t("mgmt.fleet.autonomy")}</th>
              <th className="px-3 py-2">{t("mgmt.fleet.dataSources")}</th><th className="px-3 py-2">{t("mgmt.fleet.research")}</th>
              <th className="px-3 py-2">{t("mgmt.fleet.perfDelta")}</th><th className="px-3 py-2">{t("mgmt.fleet.lastMutation")}</th>
              <th className="px-3 py-2">{t("mgmt.fleet.humanNeeded")}</th>
              <th className="px-3 py-2">{t("mgmt.fleet.state")}</th>
              <th className="px-3 py-2 text-right">{t("mgmt.fleet.actions")}</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((r) => {
              const retired = r.state && HIDDEN_STATES.has(r.state);
              const nonProduction = isNonProductionPersonaFleetRow(r);
              const sourceCount = providerOkCount(r);
              const sourceBadges = visibleDataSources(r);
              const sourceStatus = dataSourceState(r);
              const researchItems = personaFleetResearchItems(r);
              const primaryResearch = researchItems[0];
              const frameworkSummary = frameworkText(primaryResearch);
              const personaHref = personaFleetPersonaHref(r);
              const researchHref = personaFleetResearchHref(r, primaryResearch);
              const primaryAction = personaFleetPrimaryAction(r, { personaHref, researchHref });
              const artifactHref = personaFleetArtifactHref(r, primaryResearch);
              const artifactLabel = primaryResearch?.artifactId;
              const oodaHref = personaFleetOodaHref(r, primaryResearch);
              const focused = personaFocus === r.personaId;
              return (
                <tr
                  key={r.personaId}
                  className={"border-b border-border/50 " + (retired ? "opacity-60 " : "") + (focused ? "bg-primary/5" : "")}
                >
                  <td className="px-3 py-2">
                    <Link
                      to={personaHref}
                      className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      {r.personaName || r.personaId}
                    </Link>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">{r.personaId}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.owner}</td>
                  <td className="px-3 py-2">
                    <Link
                      to={oodaHref}
                      aria-label={`${r.personaId} OODA ${r.ooda} stage`}
                      className="inline-flex"
                    >
                      <Badge
                        variant="outline"
                        className={badgeLinkClass("border-primary/40 text-primary hover:border-primary/60 hover:bg-primary/5")}
                      >
                        {r.ooda}
                      </Badge>
                    </Link>
                  </td>
	                  <td className="px-3 py-2"><Badge variant="outline">{r.autonomy}</Badge></td>
	                  <td className="px-3 py-2 min-w-[240px]">
	                    <div className="flex max-w-[360px] flex-wrap gap-1">
	                      {sourceBadges.length > 0
	                        ? sourceBadges.map((source) => (
	                          <Link
	                            key={source.providerKey}
	                            to={`${personaFleetDataSourcesHref(r)}&source=${encodeURIComponent(source.providerKey)}`}
	                            aria-label={`${r.personaId} data source ${source.providerKey}`}
	                            className="inline-flex"
	                          >
	                            <Badge
	                              variant="outline"
	                              className={badgeLinkClass(`${dataSourceTone(source.status)} hover:border-primary/60`)}
	                            >
	                              {source.providerKey}: {formatToken(source.status)}
	                            </Badge>
	                          </Link>
	                        ))
	                        : (
	                          <Link
	                            to={personaFleetDataSourcesHref(r)}
	                            aria-label={`${r.personaId} data sources`}
	                            className={fieldLinkClass("text-xs text-muted-foreground hover:text-primary")}
	                          >
	                            nan
	                          </Link>
	                        )}
	                    </div>
	                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
	                      {sourceCount.total > 0 && (
	                        <span>{t("mgmt.fleet.providersFmt", { ok: sourceCount.ok, total: sourceCount.total })}</span>
	                      )}
	                      {sourceStatus && sourceBadges.length > 0 && (
	                        <Link
	                          to={personaFleetDataSourcesHref(r)}
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
	                      <Link
	                        to={researchHref}
	                        aria-label={`${r.personaId} research detail`}
	                        className="inline-flex"
	                      >
	                        <Badge
	                          variant="outline"
	                          className={badgeLinkClass("border-primary/40 text-primary hover:border-primary/60 hover:bg-primary/5")}
	                        >
	                          {primaryResearch?.stage ? formatToken(primaryResearch.stage) : "nan"}
	                        </Badge>
	                      </Link>
	                      {primaryResearch?.canDeploy === false && (
	                        <Badge variant="outline" className="bg-status-warning/15 text-status-warning border-status-warning/30">
	                          {t("mgmt.fleet.governed")}
	                        </Badge>
	                      )}
	                    </div>
	                    <div className="mt-1 max-w-[360px] space-y-0.5">
	                      {researchItems.length > 0
	                        ? researchItems.slice(0, 3).map((item) => (
	                          <Link
	                            key={item.key}
	                            to={personaFleetResearchHref(r, item)}
	                            className="block truncate font-medium text-primary underline underline-offset-4 hover:text-primary/80"
	                          >
	                            {item.title || "nan"}
	                          </Link>
	                        ))
	                        : (
	                          <Link
	                            to={researchHref}
	                            className={fieldLinkClass("block text-muted-foreground hover:text-primary")}
	                          >
	                            nan
	                          </Link>
	                        )}
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
                  <td className={"px-3 py-2 " + (Number.isFinite(r.perfDelta) && r.perfDelta >= 0 ? "text-status-success" : "text-status-failed")}>
                    <Link
                      to={personaFleetPerformanceHref(r)}
                      aria-label={`${r.personaId} performance attribution`}
                      className={fieldLinkClass(Number.isFinite(r.perfDelta) && r.perfDelta >= 0 ? "text-status-success hover:text-status-success" : "text-status-failed hover:text-status-failed")}
                    >
                      {formatPerfDelta(r.perfDelta)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <Link
                      to={personaFleetMutationHref(r)}
                      aria-label={`${r.personaId} mutation history`}
                      className={fieldLinkClass("text-muted-foreground hover:text-primary")}
                    >
                      {r.lastMutation || "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {r.humanNeeded
                      ? (
                        <Link
                          to={personaFleetHumanGateHref(r)}
                          aria-label={`${r.personaId} human gate`}
                          className="inline-flex"
                        >
                          <Badge
                            variant="outline"
                            className={badgeLinkClass("bg-status-warning/15 text-status-warning border-status-warning/30 hover:border-status-warning/60 hover:bg-status-warning/20")}
                          >
                            {t("mgmt.fleet.yes")}
                          </Badge>
                        </Link>
                      )
                      : (
                        <Link
                          to={personaFleetHumanGateHref(r)}
                          aria-label={`${r.personaId} human gate`}
                          className={fieldLinkClass("text-xs text-muted-foreground hover:text-primary")}
                        >
                          {t("mgmt.fleet.no")}
                        </Link>
                      )}
                  </td>
                  <td className="px-3 py-2">
                    {r.state && (
                      <Link
                        to={r.humanNeeded ? personaFleetHumanGateHref(r) : personaHref}
                        aria-label={`${r.personaId} status detail`}
                        className="inline-flex"
                      >
                        <Badge
                          variant="outline"
                          className={retired
                            ? badgeLinkClass("bg-muted text-muted-foreground hover:border-primary/60")
                            : badgeLinkClass("border-primary/40 text-primary hover:border-primary/60 hover:bg-primary/5")}
                        >
                          {r.state}
                        </Badge>
                      </Link>
                    )}
                    {nonProduction && (
                      <Badge variant="outline" className="ml-1 bg-muted text-muted-foreground">
                        {t("mgmt.fleet.nonProduction")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!retired && (
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
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      )}
    </section>
  );
};

// =====================================================================
// Human Inbox — governance work queue
// =====================================================================

export const HumanInboxPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const { data, loading } = useV5Live(() => mgmt.humanInbox.list(), []);
  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => humanInboxRank(b.kind) - humanInboxRank(a.kind)),
    [data],
  );
  const visibleItems = useMemo(() => {
    if (!personaFocus) return sorted;
    const encodedFocus = encodeURIComponent(personaFocus);
    return sorted.filter((it) => [
      it.id,
      it.title,
      it.summary,
      it.detailHref,
      it.links?.manageHref,
      it.links?.recommendedActionHref,
      it.links?.evidenceHref,
    ].some((value) => value?.includes(personaFocus) || value?.includes(encodedFocus)));
  }, [personaFocus, sorted]);
  const isPersonaFocusLoading = Boolean(personaFocus && loading && data === undefined);
  const hasPersonaFocusMatch = !personaFocus || visibleItems.length > 0;
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.inbox.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.inbox.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("mgmt.inbox.subtitleFmt", { count: HUMAN_INBOX_KINDS.length })}
        </p>
      </header>
      {personaFocus && (
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
            <Button asChild size="sm" variant="outline">
              <Link to="/management/human-inbox">{t("mgmt.inbox.showAllItems")}</Link>
            </Button>
          </div>
        </Card>
      )}
      {!loading && visibleItems.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          {personaFocus
            ? t("mgmt.inbox.focusEmptyBodyFmt", { persona: personaFocus })
            : t("mgmt.inbox.emptyBody")}
        </Card>
      )}
      {visibleItems.map((it) => {
        const evidenceRefs = it.evidenceRefs ?? [];
        const evidenceHref = evidenceRefs.length > 0 && it.detailHref
          ? `${it.detailHref}#evidence`
          : it.links?.evidenceHref;
        return (
        <Card key={it.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{it.kind}</Badge>
              <span className="text-sm font-medium text-foreground">{it.title}</span>
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
          {it.summary && <p className="mt-2 text-sm text-muted-foreground">{it.summary}</p>}
          {/* The consequence triplet only exists on the legacy shape; live
              governance items carry a summary instead. */}
          {(it.consequenceIfApproved || it.consequenceIfRejected || it.consequenceIfIgnored) && (
            <dl className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
              <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifApproved")}</dt><dd className="text-foreground">{it.consequenceIfApproved}</dd></div>
              <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifRejected")}</dt><dd className="text-foreground">{it.consequenceIfRejected}</dd></div>
              <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifIgnored")}</dt><dd className="text-foreground">{it.consequenceIfIgnored}</dd></div>
            </dl>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Live BFF inbox items lack the FE-composed detailHref/links; guard
                so a degraded/real payload renders instead of crashing the page. */}
            {it.detailHref && (
              <Button asChild size="sm" variant="outline"><Link to={it.detailHref}>{t("mgmt.actions.openDetail")}</Link></Button>
            )}
            {it.links?.manageHref && (
              <Button asChild size="sm" variant="outline"><Link to={it.links.manageHref}>{t("mgmt.actions.openActionPage")}</Link></Button>
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
    </section>
  );
};

// =====================================================================
// Trading Pulse
// =====================================================================

const CARD_ORDER = ["runtime-status", "row-health", "pnl", "drawdown", "execution-quality", "baseline-comparison"];

const orderedCards = (cards: ManagementTradingPulseCard[]): ManagementTradingPulseCard[] =>
  [...cards].sort((a, b) => {
    const ai = CARD_ORDER.indexOf(a.cardId);
    const bi = CARD_ORDER.indexOf(b.cardId);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

const fallbackCardsFromSummary = (model: ManagementTradingPulseModel): ManagementTradingPulseCard[] => ([
  { cardId: "runtime-status", label: "Runtime Status", value: model.summary.runtimeCount, details: { byStatus: model.summary.byStatus, byStage: model.summary.byStage } },
  { cardId: "row-health", label: "Row Health", value: Number(model.summary.rowHealthDegradedCount ?? model.summary.row_health_degraded_count ?? 0), details: { rowHealthStatusCounts: model.summary.rowHealthStatusCounts ?? model.summary.row_health_status_counts } },
  { cardId: "pnl", label: "P&L", value: model.summary.totalPnl, details: { telemetryCoverageCount: model.summary.telemetryCoverageCount } },
  { cardId: "drawdown", label: "Worst Drawdown", value: model.summary.worstDrawdown, details: {} },
  { cardId: "execution-quality", label: "Execution Quality", value: model.summary.averageFillRate, details: { worstSlippageBps: model.summary.worstSlippageBps } },
  { cardId: "baseline-comparison", label: "Baseline Comparison", value: model.summary.baselineBreachedCount, details: { baselineComparisonCount: model.summary.baselineComparisonCount, byBaselineStatus: model.summary.byBaselineStatus } },
]);

const formatPulseValue = (value: unknown, cardId?: string): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (["runtime-status", "row-health", "baseline-comparison", "total-trades"].includes(cardId ?? "")) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (cardId === "execution-quality") {
    return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

const statusTone = (status: unknown): string => {
  const normalized = String(status ?? "").toLowerCase();
  if (["ok", "live", "fresh", "active"].includes(normalized)) return "bg-status-success/15 text-status-success border-status-success/30";
  if (["watch", "degraded", "missing", "unavailable", "unverifiable"].includes(normalized)) return "bg-status-warning/15 text-status-warning border-status-warning/30";
  if (["breached", "failed", "error"].includes(normalized)) return "bg-status-failed/15 text-status-failed border-status-failed/30";
  return "bg-muted text-muted-foreground border-border";
};

const compactCounts = (value: unknown): string => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "—";
  return entries.map(([key, item]) => `${key}: ${formatPulseValue(item, "runtime-status")}`).join(" · ");
};

const pulseRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const pulseNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const pulseStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

const pulseCoverage = (model: ManagementTradingPulseModel): Record<string, unknown> =>
  pulseRecord(model.summary.coverage ?? model.meta.coverage);

const coverageCount = (coverage: Record<string, unknown>, availableKey: string, totalKey = "runtimeCount"): string => {
  const available = pulseNumber(coverage[availableKey]);
  const explicitTotal = pulseNumber(coverage[totalKey]);
  const missing = pulseNumber(coverage.missingCount ?? coverage.missing_count);
  const total = explicitTotal ?? (available !== null && missing !== null ? available + missing : null);
  if (available === null || total === null) return "—";
  return `${formatPulseValue(available, "runtime-status")}/${formatPulseValue(total, "runtime-status")}`;
};

const shortList = (items: string[], limit = 3): string => {
  if (items.length === 0) return "—";
  const visible = items.slice(0, limit).join(", ");
  return items.length > limit ? `${visible} +${items.length - limit}` : visible;
};

const rowHealth = (row: ManagementTradingPulseRuntimeRow): Record<string, unknown> =>
  pulseRecord(row.rowHealth ?? row.row_health);

const rowHealthStatus = (row: ManagementTradingPulseRuntimeRow): string =>
  String(rowHealth(row).status ?? "unknown");

const rowHealthChecks = (row: ManagementTradingPulseRuntimeRow): string[] =>
  pulseStringList(rowHealth(row).degraded_checks ?? rowHealth(row).degradedChecks);

const cardMetricCoverage = (card: ManagementTradingPulseCard): Record<string, unknown> =>
  pulseRecord(card.details?.metricCoverage ?? card.details?.metric_coverage);

export const TradingPulsePage = () => {
  const { t } = useTranslation();
  const { data: model, loading } = useV5Live(() => mgmt.tradingPulse.getLiveOnly(), []);
  if (!model) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.pulse.title")}>
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
  const cards = orderedCards(model.cards.length > 0 ? model.cards : fallbackCardsFromSummary(model));

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.pulse.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.pulse.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.pulse.subtitle")}</p>
      </header>

      <TradingPulseSurfaceHealth model={model} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {cards.map((card) => (
          <Card key={card.cardId} className="p-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{card.label}</Badge>
            </div>
            <div className="mt-3 text-2xl font-semibold">{formatPulseValue(card.value, card.cardId)}</div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {card.cardId === "runtime-status" && (
                <>
                  <div>{t("mgmt.pulse.byStatus")}: {compactCounts(card.details?.byStatus)}</div>
                  <div>{t("mgmt.pulse.byStage")}: {compactCounts(card.details?.byStage)}</div>
                </>
              )}
              {card.cardId === "row-health" && (
                <>
                  <div>{t("mgmt.pulse.rowHealth")}: {compactCounts(card.details?.rowHealthStatusCounts)}</div>
                  <div>{t("mgmt.pulse.degradedRows")}: {shortList(pulseStringList(card.details?.degradedRuntimeIds))}</div>
                </>
              )}
              {card.cardId === "pnl" && (
                <>
                  <div>{t("mgmt.pulse.telemetryCoverage")}: {formatPulseValue(card.details?.telemetryCoverageCount, "runtime-status")}</div>
                  <div>{t("mgmt.pulse.metricCoverage")}: {coverageCount(cardMetricCoverage(card), "availableCount", "runtimeCount")}</div>
                </>
              )}
              {card.cardId === "drawdown" && (
                <div>{t("mgmt.pulse.metricCoverage")}: {coverageCount(cardMetricCoverage(card), "availableCount", "runtimeCount")}</div>
              )}
              {card.cardId === "execution-quality" && (
                <>
                  <div>{t("mgmt.pulse.worstSlippage")}: {formatPulseValue(card.details?.worstSlippageBps)}</div>
                  <div>{t("mgmt.pulse.metricCoverage")}: {coverageCount(cardMetricCoverage(card), "availableCount", "runtimeCount")}</div>
                </>
              )}
              {card.cardId === "baseline-comparison" && (
                <>
                  <div>{t("mgmt.pulse.baselineCoverage")}: {formatPulseValue(card.details?.baselineComparisonCount, "runtime-status")}</div>
                  <div>{t("mgmt.pulse.byBaseline")}: {compactCounts(card.details?.byBaselineStatus)}</div>
                  <div>{t("mgmt.pulse.missing")}: {shortList(pulseStringList(card.details?.missingBaselineRuntimeIds))}</div>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      <RuntimeRowsPanel rows={model.runtimeRows} />

      <RankingBlocks />
    </section>
  );
};

const TradingPulseSurfaceHealth = ({ model }: { model: ManagementTradingPulseModel }) => {
  const { t } = useTranslation();
  const surfaces = Object.entries(model.meta.surfaces ?? {});
  const degraded = surfaces.filter(([, surface]) => !["ok", "live", "fresh"].includes(String(surface.status ?? "").toLowerCase()));
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.coverageTitle")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("mgmt.pulse.snapshotAt")}: {safeDateTime(model.meta.snapshotAt ?? model.meta.snapshot_at)}
          </p>
        </div>
        <Badge variant="outline" className={statusTone(degraded.length > 0 ? "degraded" : "ok")}>
          {degraded.length > 0 ? t("mgmt.pulse.degraded") : t("mgmt.pulse.live")}
        </Badge>
      </div>
      <TradingPulseCoverageSummary model={model} />
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {surfaces.map(([key, surface]) => (
          <SurfaceBadge key={key} name={key} surface={surface} />
        ))}
      </div>
    </Card>
  );
};

const TradingPulseCoverageSummary = ({ model }: { model: ManagementTradingPulseModel }) => {
  const { t } = useTranslation();
  const coverage = pulseCoverage(model);
  const rowHealthCounts = coverage.rowHealthStatusCounts ?? coverage.row_health_status_counts;
  const missingTelemetry = pulseStringList(coverage.missingTelemetryRuntimeIds ?? coverage.missing_telemetry_runtime_ids);
  const missingMonitoring = pulseStringList(coverage.missingMonitoringRuntimeIds ?? coverage.missing_monitoring_runtime_ids);
  const missingBaseline = pulseStringList(coverage.missingBaselineRuntimeIds ?? coverage.missing_baseline_runtime_ids);
  const degradedRows = pulseStringList(coverage.degradedRuntimeIds ?? coverage.degraded_runtime_ids);
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <CoverageStat
        label={t("mgmt.pulse.runtimeRows")}
        value={formatPulseValue(coverage.runtimeCount ?? model.summary.runtimeCount, "runtime-status")}
        detail={compactCounts(model.summary.byStatus)}
      />
      <CoverageStat
        label={t("mgmt.pulse.telemetryCoverage")}
        value={coverageCount(coverage, "telemetryCoverageCount")}
        detail={`${t("mgmt.pulse.missing")}: ${shortList(missingTelemetry)}`}
        status={missingTelemetry.length > 0 ? "degraded" : "ok"}
      />
      <CoverageStat
        label={t("mgmt.pulse.monitoringCoverage")}
        value={coverageCount(coverage, "monitoringCoverageCount", "paperRuntimeCount")}
        detail={`${t("mgmt.pulse.missing")}: ${shortList(missingMonitoring)}`}
        status={missingMonitoring.length > 0 ? "degraded" : "ok"}
      />
      <CoverageStat
        label={t("mgmt.pulse.baselineCoverage")}
        value={coverageCount(coverage, "baselineComparisonCount")}
        detail={`${t("mgmt.pulse.missing")}: ${shortList(missingBaseline)}`}
        status={missingBaseline.length > 0 ? "degraded" : "ok"}
      />
      <CoverageStat
        label={t("mgmt.pulse.rowHealth")}
        value={formatPulseValue(coverage.rowHealthDegradedCount ?? coverage.row_health_degraded_count, "row-health")}
        detail={`${compactCounts(rowHealthCounts)} · ${shortList(degradedRows)}`}
        status={degradedRows.length > 0 ? "degraded" : "ok"}
      />
    </div>
  );
};

const CoverageStat = ({ label, value, detail, status }: { label: string; value: string; detail: string; status?: string }) => (
  <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {status && <Badge variant="outline" className={statusTone(status)}>{status}</Badge>}
    </div>
    <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    <div className="mt-1 truncate text-muted-foreground" title={detail}>{detail}</div>
  </div>
);

const SurfaceBadge = ({ name, surface }: { name: string; surface: ManagementTradingPulseSurface }) => (
  <div className="rounded-md border border-border bg-background p-3 text-xs">
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="min-w-0 truncate font-mono text-foreground" title={name}>{name}</span>
      <Badge variant="outline" className={`shrink-0 ${statusTone(surface.status)}`}>{surface.status}</Badge>
    </div>
    <div className="mt-1 text-muted-foreground">{surface.source || "—"}</div>
    {surface.message && <div className="mt-2 text-muted-foreground">{surface.message}</div>}
  </div>
);

const RuntimeRowsPanel = ({ rows }: { rows: ManagementTradingPulseRuntimeRow[] }) => {
  const { t } = useTranslation();
  const degradedCount = rows.filter((row) => rowHealthStatus(row) !== "ok").length;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.runtimeRows")}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{rows.length}</Badge>
          <Badge variant="outline" className={statusTone(degradedCount > 0 ? "degraded" : "ok")}>
            {t("mgmt.pulse.degradedRows")}: {degradedCount}
          </Badge>
        </div>
      </div>
      <div className="mt-3 max-h-[640px] overflow-auto">
        <table className="w-full min-w-[1040px] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.runtime")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.rowHealth")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.stage")}</th>
              <th className="py-2 pr-3 font-medium">P&L</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.fillRate")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.trades")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.baselineStatus")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.checks")}</th>
              <th className="py-2 font-medium">{t("mgmt.pulse.updated")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-muted-foreground" colSpan={9}>{t("mgmt.pulse.noRows")}</td>
              </tr>
            ) : rows.map((row) => {
              const checks = rowHealthChecks(row);
              return (
              <tr key={row.runtimeId || row.runtime_id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 font-mono text-foreground">{row.runtimeId || row.runtime_id || "—"}</td>
                <td className="py-2 pr-3">
                  <Badge variant="outline" className={statusTone(rowHealthStatus(row))}>{rowHealthStatus(row)}</Badge>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{row.deploymentStage || row.deployment_stage || "—"}</Badge>
                    <Badge variant="outline" className={statusTone(row.status)}>{row.status || "—"}</Badge>
                  </div>
                </td>
                <td className="py-2 pr-3">{formatPulseValue(row.metrics.pnl)}</td>
                <td className="py-2 pr-3">{formatPulseValue(row.metrics.fill_rate ?? row.metrics.fillRate, "execution-quality")}</td>
                <td className="py-2 pr-3">{formatPulseValue(row.metrics.total_trades ?? row.metrics.totalTrades, "runtime-status")}</td>
                <td className="py-2 pr-3">
                  <Badge variant="outline" className={statusTone(row.baselineComparison?.status ?? row.baseline_comparison?.status)}>
                    {row.baselineComparison?.status ?? row.baseline_comparison?.status ?? "—"}
                  </Badge>
                </td>
                <td className="max-w-[220px] py-2 pr-3 text-muted-foreground">
                  <span className="block truncate" title={checks.join(", ")}>
                    {shortList(checks)}
                  </span>
                </td>
                <td className="py-2 text-muted-foreground">{safeDateTime(row.lastUpdatedAt ?? row.last_updated_at)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const RankingBlocks = () => {
  const { t } = useTranslation();
  const { data } = useV5Live(() => mgmt.tradingPulse.rankingsLiveOnly(), []);
  const blocks = data ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("mgmt.pulse.rankingsLabel")}>
      {blocks.length === 0 ? (
        <LiveOnlyNotice
          title={t("mgmt.pulse.rankingsLabel")}
          body={t("mgmt.pulse.noRows")}
        />
      ) : blocks.map((b) => (
        <Card key={b.kind} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{b.label}</h3>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {"eligibleItemCount" in b && (
                <Badge variant="outline">{formatPulseValue(b.eligibleItemCount, "runtime-status")}</Badge>
              )}
              {(b.missingMetricCount ?? b.missing_metric_count ?? 0) > 0 && (
                <Badge variant="outline" className={statusTone("degraded")}>
                  {t("mgmt.pulse.metricMissing")}: {formatPulseValue(b.missingMetricCount ?? b.missing_metric_count, "runtime-status")}
                </Badge>
              )}
            </div>
          </div>
          {(b.rows?.length ?? 0) === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("mgmt.pulse.noRows")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs">
              {(b.rows ?? []).map((r) => (
                <li key={r.subjectId} className="flex items-center justify-between gap-2">
                  <Link to={r.links?.manageHref ?? "#"} className="font-mono text-primary underline-offset-4 hover:underline">
                    {r.subjectLabel}
                  </Link>
                  <span className="text-muted-foreground">
                    {r.metric}: <span className="text-foreground">{formatPulseValue(r.metricValue)}{r.metricUnit ?? ""}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
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
  risk_level?: string; action_type?: string;
  target?: { type?: string; id?: string; version?: string } | null;
  occurred_at?: string; created_at?: string;
}

const verdictTone = (v?: string) =>
  v === "improved" || v === "accepted" || v === "approved"
    ? "bg-status-success/15 text-status-success border-status-success/30"
    : v === "degraded" || v === "rejected" || v === "failed"
      ? "bg-status-failed/15 text-status-failed border-status-failed/30"
      : "bg-muted text-muted-foreground border-border";

export const EvolutionJournalPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const mutationFocus = searchParams.get("mutation_review")?.trim() ?? searchParams.get("decision")?.trim() ?? searchParams.get("item")?.trim() ?? "";
  const { data, loading } = useV5Live(() => mgmt.evolutionJournal.list<EvolutionEntry>(() => []), []);
  const rows = useMemo(() => data ?? [], [data]);
  const focus = useMemo(
    () => filterEvolutionJournalRowsForFocus(rows, { personaFocus, mutationFocus }),
    [mutationFocus, personaFocus, rows],
  );
  const visibleRows = focus.rows;
  const hasFocus = Boolean(personaFocus || mutationFocus);
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.evolution.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evolution.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.evolution.subtitle")}</p>
      </header>
      {hasFocus && (
        <Card className={"p-3 text-sm " + (focus.matched
          ? "border-primary/30 bg-primary/5"
          : "border-status-warning/30 bg-status-warning/10")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-foreground">
              {focus.matched
                ? t("mgmt.evolution.focusedFmt", { persona: personaFocus || "nan", mutation: mutationFocus || "nan", count: visibleRows.length })
                : t("mgmt.evolution.focusMissingFmt", { persona: personaFocus || "nan", mutation: mutationFocus || "nan" })}
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
      {!loading && rows.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          {t("common.awaitingData", { defaultValue: "No data yet" })}
        </Card>
      )}
      {visibleRows.map((e) => {
        // The live aggregate and the legacy mock have different field sets;
        // normalize defensively so neither shape throws (real entries have no
        // numeric before/after — calling .toFixed on those crashed the page).
        const headline = e.title ?? e.mutation ?? e.id;
        const status = e.status ?? e.verdict;
        const action = e.action_type;
        const risk = e.risk_level;
        const target = e.target
          ? [e.target.type, e.target.id].filter(Boolean).join(":") +
            (e.target.version ? ` (${e.target.version})` : "")
          : undefined;
        const whenRaw = e.occurred_at ?? e.created_at ?? e.landedAt;
        const when = whenRaw
          ? (Number.isNaN(new Date(whenRaw).getTime()) ? whenRaw : safeDateTime(whenRaw))
          : undefined;
        const hasMetrics = typeof e.before === "number" && typeof e.after === "number";
        return (
          <Card key={e.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-foreground">{headline}</div>
              {status && (
                <Badge variant="outline" className={verdictTone(status)}>{status}</Badge>
              )}
            </div>
            <div className="font-mono text-xs text-muted-foreground">{e.id}</div>
            {e.summary && <p className="text-sm text-muted-foreground">{e.summary}</p>}
            <dl className="mt-1 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {hasMetrics && (
                <>
                  <div><dt className="text-muted-foreground">{t("mgmt.evolution.before")}</dt><dd className="text-foreground">{e.before!.toFixed(2)}</dd></div>
                  <div><dt className="text-muted-foreground">{t("mgmt.evolution.after")}</dt><dd className="text-foreground">{e.after!.toFixed(2)}</dd></div>
                </>
              )}
              {action && <div><dt className="text-muted-foreground">{t("mgmt.evolution.action", { defaultValue: "Action" })}</dt><dd className="text-foreground">{action}</dd></div>}
              {risk && <div><dt className="text-muted-foreground">{t("mgmt.evolution.risk", { defaultValue: "Risk" })}</dt><dd className="text-foreground">{risk}</dd></div>}
              {target && <div><dt className="text-muted-foreground">{t("mgmt.evolution.target", { defaultValue: "Target" })}</dt><dd className="font-mono text-foreground">{target}</dd></div>}
              {when && <div><dt className="text-muted-foreground">{t("mgmt.evolution.landed")}</dt><dd className="text-foreground">{when}</dd></div>}
            </dl>
          </Card>
        );
      })}
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

const EvidenceResolvedLinkAction = ({ link }: { link: ManagementEvidenceResolvedLink }) => {
  const { t } = useTranslation();
  const href = link.routeHref ?? link.route_href;
  const label = link.displayLabel || link.display_label || t("mgmt.evidence.openResolvedSource");
  if (!href) {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="outline" className="w-fit">{evidenceLabel(link.availability)}</Badge>
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
  <div className="rounded-md border border-border bg-background px-4 py-3">
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
  const { data, loading } = useV5Live(() => mgmt.evidence.overviewLiveOnly(), []);
  useEffect(() => {
    if (!loading) markRoutePrimaryReady(location.pathname);
  }, [loading, location.pathname]);

  if (!data && loading) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.title")}>
        <header>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evidence.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.evidence.subtitle")}</p>
        </header>
        <Card className="p-4 text-sm text-muted-foreground">{t("mgmt.evidence.loading")}</Card>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.title")}>
        <header>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evidence.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.evidence.unavailableTitle")}</p>
        </header>
      </section>
    );
  }
  const model = data;
  const rows = model.items;

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evidence.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.evidence.subtitle")}</p>
      </header>
      <EvidenceSurfaceBanner meta={model.meta} primaryKey="management_evidence" />
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <EvidenceMetric label={t("mgmt.evidence.total")} value={model.summary.totalEvidence} />
        <EvidenceMetric label={t("mgmt.evidence.traceable")} value={model.summary.traceableEvidence} />
        <EvidenceMetric label={t("mgmt.evidence.needsAttention")} value={model.summary.needsAttentionEvidence} />
        <EvidenceMetric label={t("mgmt.evidence.verified")} value={model.summary.verifiedEvidence} />
        <EvidenceMetric label={t("mgmt.evidence.openOperations")} value={model.summary.openOperationEvidence} />
      </dl>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
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
                <tr key={e.refId} className="border-b border-border/50 align-top">
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
                      {evidenceLabel(e.sourceType)} · {evidenceLabel(e.linkType)}
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
                    <EvidenceResolvedLinkAction link={e.resolvedLink} />
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
                  <td className="px-3 py-3 text-muted-foreground">{evidenceTimestamp(e.capturedAt ?? e.captured_at)}</td>
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
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                  {t("mgmt.evidence.noRows")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
  const { data, loading, refresh } = useV5Live(
    () => refId ? mgmt.evidence.detailLiveOnly(refId) : Promise.resolve(undefined),
    [refId],
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
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.packetTitle")}>
        <header>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evidence.unavailableTitle")}</h1>
          <p className="text-sm text-muted-foreground">{refId}</p>
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
            <div className="text-xs font-medium uppercase text-muted-foreground">{t("mgmt.evidence.excerpt")}</div>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-foreground">
              {detail.sourceDocument.excerpt || t("mgmt.evidence.noExcerpt")}
            </pre>
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
              <EvidenceField label={t("mgmt.evidence.availability")} value={evidenceLabel(detail.resolvedLink.availability)} />
              <dd><EvidenceResolvedLinkAction link={detail.resolvedLink} /></dd>
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
