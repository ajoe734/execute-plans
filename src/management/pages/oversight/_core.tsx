// 2026-05-20 revamp §6 — Core 7 Oversight pages (Phase 1).
// Cockpit upgraded by PM-3 (composeCockpit + SystemStateStrip / LoopFlowMap /
// PersonaOodaMatrix / CriticalAnomalyPanel).
//
// PersonaIntent + readiness pages live in their own files.

import { type ReactNode, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { agentPanel } from "@/management/components/agent/useAgentPanel";
import { composeCockpit, defaultCockpitSeed } from "@/lib/v5/management/cockpit";
import { SystemStateStrip } from "@/management/components/cockpit/SystemStateStrip";
import { LoopFlowMap } from "@/management/components/cockpit/LoopFlowMap";
import { PersonaOodaMatrix } from "@/management/components/cockpit/PersonaOodaMatrix";
import { CriticalAnomalyPanel } from "@/management/components/cockpit/CriticalAnomalyPanel";
import { TotalCapitalSnapshot } from "@/management/components/cockpit/TotalCapitalSnapshot";
import { PersonaLeagueSnapshot } from "@/management/components/cockpit/PersonaLeagueSnapshot";
import { QuarterlyRankingCountdown } from "@/management/components/cockpit/QuarterlyRankingCountdown";
import { DataSourceHealthSnapshot } from "@/management/components/cockpit/DataSourceHealthSnapshot";
import { OpenClawLlmAuthPanel } from "@/management/components/openclaw/OpenClawLlmAuthPanel";
import { defaultPulseRankings } from "@/lib/v5/management/tradingRankings";
import { defaultPortfolioBook } from "@/lib/v5/management/portfolio";
import { defaultPersonaLeague } from "@/lib/v5/management/personaLeague";
import { defaultQuarterlySnapshot } from "@/lib/v5/management/quarterlyRanking";
import {
  HUMAN_INBOX_KINDS, humanInboxRank, type HumanInboxItem, type HumanInboxKind,
} from "@/lib/v5/management/humanInbox";
import { buildLinkSet } from "@/lib/v5/management/links";
import { mgmt } from "@/lib/bff-v1";
import {
  defaultTradingPulseModel,
  type ManagementPersonaFleetRow,
  type ManagementTradingPulseCard,
  type ManagementTradingPulseModel,
  type ManagementTradingPulseRuntimeRow,
  type ManagementTradingPulseSurface,
} from "@/lib/bff-v1/management";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { visibleDataSources } from "./personaFleetDataSources";
import { PERSONA_FLEET_ACTION_LABELS } from "./personaFleetActionLabels";
import {
  personaFleetArtifactHref,
  personaFleetDataSourcesHref,
  personaFleetHumanGateHref,
  personaFleetMutationHref,
  personaFleetPerformanceHref,
  personaFleetPersonaHref,
  personaFleetResearchHref,
} from "./personaFleetLinks";
import { safeDateTime } from "@/lib/utils";

// =====================================================================
// Pathreon Management Cockpit (PM-3)
// =====================================================================

export const OneRingCockpitPage = () => {
  const { t } = useTranslation();
  const seed = useMemo(() => composeCockpit(defaultCockpitSeed()), []);
  const { data } = useV5Live(() => mgmt.cockpit.get(() => seed), []);
  const model = data ?? seed;

  // PM-12 snapshots
  const pSeed = useMemo(() => defaultPortfolioBook(), []);
  const lSeed = useMemo(() => defaultPersonaLeague(), []);
  const qSnap = useMemo(() => defaultQuarterlySnapshot(), []);
  const { data: pSummary } = useV5Live(() => mgmt.portfolioBook.summary(() => pSeed.summary), []);
  const { data: league } = useV5Live(() => mgmt.personaLeague.list(() => lSeed), []);
  const { data: fleetRows } = useV5Live(() => mgmt.personaFleet.get(() => PERSONA_FLEET_SEED), []);

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
      <SystemStateStrip model={model.strip} />
      <OpenClawLlmAuthPanel mode="summary" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TotalCapitalSnapshot summary={pSummary ?? pSeed.summary} />
        <PersonaLeagueSnapshot rows={league ?? lSeed} />
        <QuarterlyRankingCountdown snap={qSnap} />
        <DataSourceHealthSnapshot rows={fleetRows ?? PERSONA_FLEET_SEED} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LoopFlowMap model={model.loopFlow} />
        <PersonaOodaMatrix model={model.matrix} />
      </div>
      <CriticalAnomalyPanel anomalies={model.anomalies} />
    </section>
  );
};



// =====================================================================
// Persona Fleet
// =====================================================================

// Shared seed for management surfaces that currently derive system-level state
// from the live persona fleet contract.
// eslint-disable-next-line react-refresh/only-export-components
export const PERSONA_FLEET_SEED: ManagementPersonaFleetRow[] = [
  {
    personaId: "persona-crypto",
    personaName: "Crypto Macro Persona",
    owner: "pathreon-management",
    ooda: "Act",
    autonomy: "supervised",
    perfDelta: 0.182,
    humanNeeded: true,
    lastMutation: "2026-06-07",
    state: "paper_running",
    marketScope: ["CRYPTO"],
    currentWork: "paper broker sandbox readback and funding-rate stress review",
    dataSourceStatus: {
      state: "datasource_smoke_ok",
      summary: "Kraken datasource smoke has a normalized quote projection; repo-local network readback remains disabled.",
      providerStatuses: { kraken: "datasource_smoke_ok", coingecko: "read_unavailable" },
      readbackRefs: ["support/evidence/MGMT-BROKER-006/datasource-smoke/datasource-smoke.json"],
      unavailableRefs: ["support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-uncredentialed/coingecko.json"],
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
      liveIngestionEnabled: false,
    },
    dataSources: [
      {
        providerKey: "kraken",
        provider: "Kraken market data",
        status: "datasource_smoke_ok",
        sourceClass: "broker_execution",
        orderPath: "validate_only",
        orderCapableProvider: true,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
      {
        providerKey: "coingecko",
        provider: "CoinGecko",
        status: "read_unavailable",
        sourceClass: "research_grade",
        orderCapableProvider: false,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
    ],
    researchStatus: {
      stage: "act",
      frameworks: ["vectorbt", "statsmodels", "finrl-rllib"],
      strategyId: "strategy-crypto-trend-carry",
      artifactId: "artifact-crypto-trend-carry-v1",
      deploymentStage: "paper",
      registryAdmissionStatus: "not_requested",
      pendingTaskIds: [],
      canDeploy: false,
      summary: "paper broker sandbox readback and funding-rate stress review",
    },
    currentResearchProjects: [
      {
        projectId: "research-crypto-paper-001",
        title: "paper broker sandbox readback and funding-rate stress review",
        stage: "act",
        status: "paper_running",
        frameworks: ["vectorbt", "statsmodels", "finrl-rllib"],
        artifactId: "artifact-crypto-trend-carry-v1",
        blockedByTaskIds: [],
        canDeploy: false,
      },
    ],
  },
  {
    personaId: "persona-us-equity",
    personaName: "US Equity Persona",
    owner: "pathreon-management",
    ooda: "Orient",
    autonomy: "supervised",
    perfDelta: 0.14,
    humanNeeded: true,
    lastMutation: "2026-06-07",
    state: "researching",
    marketScope: ["US"],
    currentWork: "paper observation and OOS cost review",
    dataSourceStatus: {
      state: "quote_readback_ok",
      summary: "IBKR quote readback is present; order path is disabled for marketdata smoke.",
      providerStatuses: { ibkr: "read_ok" },
      readbackRefs: ["support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-quote-readback/ibkr.json"],
      unavailableRefs: [],
      readbackCapturedAt: "2026-05-01T17:20:00Z",
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
      liveIngestionEnabled: false,
    },
    dataSources: [
      {
        providerKey: "ibkr",
        provider: "IBKR market data",
        status: "read_ok",
        sourceClass: "broker_execution",
        orderPath: "disabled_for_marketdata_smoke",
        orderCapableProvider: true,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
    ],
    researchStatus: {
      stage: "orient",
      frameworks: ["vectorbt", "statsmodels", "quantlib"],
      strategyId: "strategy-us-equity-momentum",
      artifactId: "artifact-us-equity-momentum-v1",
      deploymentStage: "paper",
      registryAdmissionStatus: "not_requested",
      pendingTaskIds: [],
      canDeploy: false,
      summary: "paper observation and OOS cost review",
    },
    currentResearchProjects: [
      {
        projectId: "research-us-paper-001",
        title: "paper observation and OOS cost review",
        stage: "orient",
        status: "researching",
        frameworks: ["vectorbt", "statsmodels", "quantlib"],
        artifactId: "artifact-us-equity-momentum-v1",
        blockedByTaskIds: [],
        canDeploy: false,
      },
    ],
  },
  {
    personaId: "persona-tw-equity",
    personaName: "Taiwan Equity Persona",
    owner: "pathreon-management",
    ooda: "Decide",
    autonomy: "supervised",
    perfDelta: 0.095,
    humanNeeded: true,
    lastMutation: "2026-06-07",
    state: "needs_human_approval",
    marketScope: ["TW"],
    currentWork: "TW corporate-action and session-boundary evidence review",
    dataSourceStatus: {
      state: "partial_readback",
      summary: "Shioaji quote readback is present; TWSE, TPEx, MOPS, and TEJ are explicit unavailable/credential-unavailable repo-local smoke evidence.",
      providerStatuses: {
        twse: "read_unavailable",
        tpex: "read_unavailable",
        mops: "public_reference_unavailable",
        tej: "credential_unavailable",
        shioaji: "read_ok",
      },
      readbackRefs: ["support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-quote-readback/shioaji.json"],
      unavailableRefs: [
        "support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-uncredentialed/twse.json",
        "support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-uncredentialed/tpex.json",
        "support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-uncredentialed/mops.json",
        "support/evidence/P2-MARKETDATA-CREDENTIAL-SMOKE-001/repo-local-uncredentialed/tej.json",
      ],
      researchDatasetRef: "dataset:tw-equity-ohlcv-top50-2024-daily",
      researchDatasetAsOf: "2026-01-05T00:00:00Z",
      readbackCapturedAt: "2026-05-01T17:20:00Z",
      readOnly: true,
      orderSideEffectsAllowed: false,
      capitalSideEffectsAllowed: false,
      liveIngestionEnabled: false,
    },
    dataSources: [
      {
        providerKey: "shioaji",
        provider: "Shioaji quote",
        status: "read_ok",
        sourceClass: "broker_execution",
        orderPath: "disabled_for_marketdata_smoke",
        orderCapableProvider: true,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
      {
        providerKey: "twse",
        provider: "TWSE OpenAPI",
        status: "read_unavailable",
        sourceClass: "official_reference",
        orderCapableProvider: false,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
      {
        providerKey: "tpex",
        provider: "TPEx E-Data",
        status: "read_unavailable",
        sourceClass: "official_reference",
        orderCapableProvider: false,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
      {
        providerKey: "tej",
        provider: "TEJ API",
        status: "credential_unavailable",
        sourceClass: "research_grade",
        orderCapableProvider: false,
        readOnly: true,
        orderSideEffectsAllowed: false,
        capitalSideEffectsAllowed: false,
      },
    ],
    researchStatus: {
      stage: "management_review_linked",
      framework: "qlib",
      frameworks: ["qlib", "vectorbt", "statsmodels"],
      experimentId: "exp-mgmt-qlib-006",
      strategyId: "tw-cross-sectional-equity-alpha",
      strategySpecId: "qlib-tw-cross-sectional-alpha-spec-v1",
      artifactId: "qlib-tw-cross-sectional-alpha-model-draft-v1",
      artifactState: "draft",
      deploymentStage: "none",
      datasetRef: "dataset:tw-equity-ohlcv-top50-2024-daily",
      registryAdmissionStatus: "pending_upstream_task",
      pendingTaskIds: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
      canDeploy: false,
      summary: "Qlib TW cross-sectional alpha draft is linked for Management review.",
    },
    currentResearchProjects: [
      {
        projectId: "MGMT-QLIB-006",
        title: "Qlib TW cross-sectional equity alpha admission linkage",
        stage: "management_review_linked",
        status: "needs_human_approval",
        frameworks: ["qlib", "vectorbt", "statsmodels"],
        datasetRef: "dataset:tw-equity-ohlcv-top50-2024-daily",
        artifactId: "qlib-tw-cross-sectional-alpha-model-draft-v1",
        experimentId: "exp-mgmt-qlib-006",
        blockedByTaskIds: ["MGMT-QLIB-003", "MGMT-QLIB-005"],
        canDeploy: false,
      },
    ],
  },
];

const HIDDEN_STATES = new Set(["retired", "deprecated", "archived"]);

function isDevProbe(r: ManagementPersonaFleetRow): boolean {
  if (r.tags?.some((t) => t === "dev-probe" || t === "test")) return true;
  return /^dev-probe/i.test(r.personaId);
}

function formatPerfDelta(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";
}

function formatToken(value?: string): string {
  return value ? value.replace(/_/g, " ") : "—";
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
  const statuses = r.dataSourceStatus?.providerStatuses ?? {};
  const values = Object.values(statuses);
  const total = values.length || r.dataSources?.length || 0;
  const ok = values.filter((status) => /read_ok|smoke_ok|quote_readback_ok/i.test(status)).length;
  return { ok, total };
}

function FleetLinkButton({
  to,
  label,
  value,
  ariaLabel,
  className,
}: {
  to: string;
  label: ReactNode;
  value?: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className={
        "h-8 min-w-max border-primary/45 bg-primary/5 px-2.5 text-xs font-semibold text-primary shadow-sm " +
        "hover:bg-primary/10 hover:text-primary " +
        (className ?? "")
      }
    >
      <Link to={to} aria-label={ariaLabel}>
        <span className="truncate">{label}</span>
        {value !== undefined && (
          <span className="max-w-[9rem] truncate text-muted-foreground">{value}</span>
        )}
        <ArrowUpRight className="size-3" aria-hidden="true" />
      </Link>
    </Button>
  );
}

export const PersonaFleetPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const { data, loading } = useV5Live(() => mgmt.personaFleet.get(() => PERSONA_FLEET_SEED), []);
  const rows = useMemo(() => data ?? (personaFocus ? [] : PERSONA_FLEET_SEED), [data, personaFocus]);

  const [showRetired, setShowRetired] = useState(false);
  const [showDevProbe, setShowDevProbe] = useState(false);

  const filtered = useMemo(() => rows.filter((r) => {
    if (!showRetired && r.state && HIDDEN_STATES.has(r.state)) return false;
    if (!showDevProbe && isDevProbe(r)) return false;
    return true;
  }), [rows, showRetired, showDevProbe]);

  const visibleRows = useMemo(() => {
    if (!personaFocus) return filtered;
    return rows.filter((r) => r.personaId === personaFocus);
  }, [filtered, personaFocus, rows]);
  const isPersonaFocusLoading = Boolean(personaFocus && loading && data === undefined);
  const hasPersonaFocusMatch = !personaFocus || visibleRows.length > 0;

  const hiddenRetired = rows.filter((r) => r.state && HIDDEN_STATES.has(r.state)).length;
  const hiddenProbe = rows.filter(isDevProbe).length;

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
            variant={showDevProbe ? "default" : "outline"}
            onClick={() => setShowDevProbe((v) => !v)}
            aria-pressed={showDevProbe}
          >
            {showDevProbe
              ? t("mgmt.fleet.filter.hideDevProbe")
              : t("mgmt.fleet.filter.showDevProbeFmt", { count: hiddenProbe })}
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
              const probe = isDevProbe(r);
              const sourceCount = providerOkCount(r);
              const project = r.currentResearchProjects?.[0];
              const sourceBadges = visibleDataSources(r);
              const frameworkText = project?.frameworks?.length
                ? project.frameworks.join(" / ")
                : r.researchStatus?.frameworks?.join(" / ");
              const personaHref = personaFleetPersonaHref(r);
              const researchHref = personaFleetResearchHref(r);
              const artifactHref = personaFleetArtifactHref(r);
              const artifactLabel = project?.artifactId || r.researchStatus?.artifactId;
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
                  <td className="px-3 py-2"><Badge variant="outline">{r.ooda}</Badge></td>
                  <td className="px-3 py-2"><Badge variant="outline">{r.autonomy}</Badge></td>
                  <td className="px-3 py-2 min-w-[240px]">
                    <div className="flex flex-wrap items-center gap-1">
                      <FleetLinkButton
                        to={personaFleetDataSourcesHref(r)}
                        ariaLabel={`${r.personaId} data sources`}
                        className={dataSourceTone(r.dataSourceStatus?.state)}
                        label={PERSONA_FLEET_ACTION_LABELS.dataSources}
                        value={formatToken(r.dataSourceStatus?.state)}
                      />
                      {sourceCount.total > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t("mgmt.fleet.providersFmt", { ok: sourceCount.ok, total: sourceCount.total })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {sourceBadges.map((source) => (
                        <Badge key={source.providerKey} variant="outline" className="text-[10px]">
                          {source.providerKey}: {formatToken(source.status)}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.dataSourceStatus?.liveIngestionEnabled
                        ? t("mgmt.fleet.liveOn")
                        : t("mgmt.fleet.liveOff")}
                      {" · "}
                      {r.dataSourceStatus?.orderSideEffectsAllowed
                        ? t("mgmt.fleet.sideEffectsOn")
                        : t("mgmt.fleet.sideEffectsOff")}
                    </div>
                  </td>
                  <td className="px-3 py-2 min-w-[260px]">
                    <div className="flex flex-wrap items-center gap-1">
                      {researchHref ? (
                        <FleetLinkButton
                          to={researchHref}
                          ariaLabel={`${r.personaId} research detail`}
                          label={PERSONA_FLEET_ACTION_LABELS.research}
                          value={formatToken(r.researchStatus?.stage ?? project?.stage)}
                        />
                      ) : (
                        <Badge variant="outline">{formatToken(r.researchStatus?.stage ?? project?.stage)}</Badge>
                      )}
                      {r.researchStatus?.canDeploy === false && (
                        <Badge variant="outline" className="bg-status-warning/15 text-status-warning border-status-warning/30">
                          {t("mgmt.fleet.governed")}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 max-w-[320px] truncate font-medium text-foreground">
                      {researchHref ? (
                        <Link to={researchHref} className="text-primary underline underline-offset-4 hover:text-primary/80">
                          {project?.title || r.currentWork || r.researchStatus?.summary || "—"}
                        </Link>
                      ) : (
                        project?.title || r.currentWork || r.researchStatus?.summary || "—"
                      )}
                    </div>
                    <div className="mt-0.5 max-w-[320px] truncate text-xs text-muted-foreground">
                      {frameworkText || "—"}
                      {artifactLabel && (
                        <>
                          {" · "}
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
                  </td>
                  <td className={"px-3 py-2 " + (Number.isFinite(r.perfDelta) && r.perfDelta >= 0 ? "text-status-success" : "text-status-failed")}>
                    <FleetLinkButton
                      to={personaFleetPerformanceHref(r)}
                      ariaLabel={`${r.personaId} performance attribution`}
                      className={Number.isFinite(r.perfDelta) && r.perfDelta >= 0 ? "text-status-success" : "text-status-failed"}
                      label={PERSONA_FLEET_ACTION_LABELS.performance}
                      value={formatPerfDelta(r.perfDelta)}
                    />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <FleetLinkButton
                      to={personaFleetMutationHref(r)}
                      ariaLabel={`${r.personaId} mutation history`}
                      label={PERSONA_FLEET_ACTION_LABELS.mutation}
                      value={r.lastMutation}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {r.humanNeeded
                      ? (
                        <FleetLinkButton
                          to={personaFleetHumanGateHref(r)}
                          ariaLabel={`${r.personaId} human gate`}
                          className="bg-status-warning/15 text-status-warning border-status-warning/30"
                          label={PERSONA_FLEET_ACTION_LABELS.humanGate}
                          value={t("mgmt.fleet.yes")}
                        />
                      )
                      : <span className="text-xs text-muted-foreground">{t("mgmt.fleet.no")}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.state && (
                      <FleetLinkButton
                        to={r.humanNeeded ? personaFleetHumanGateHref(r) : personaHref}
                        ariaLabel={`${r.personaId} status detail`}
                        className={retired ? "bg-muted text-muted-foreground" : ""}
                        label={PERSONA_FLEET_ACTION_LABELS.status}
                        value={r.state}
                      />
                    )}
                    {probe && (
                      <Badge variant="outline" className="ml-1 bg-muted text-muted-foreground">dev-probe</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!retired && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/management/personas/${encodeURIComponent(r.personaId)}/onboarding`}>
                          {t("mgmt.fleet.onboard")}
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
    </section>
  );
};

// =====================================================================
// Human Inbox — 9 kinds (PM-6)
// =====================================================================

const INBOX: HumanInboxItem[] = [
  buildInbox("appr-001", "approval", "Approve mutation v3 for alpha-trader", "research-owner",
    "Mutation enters paper run", "Mutation discarded", "Times out in 12h"),
  buildInbox("sent-019", "sentinel", "Beta drift critical on momentum sleeve", "risk-owner",
    "Acknowledged + remediation", "Auto-paused", "Auto-paused in 30m"),
  buildInbox("ask-007", "ask", "Persona asks: extend live-paper overlap?", "operator",
    "Overlap +2d", "Continue as planned", "Default: continue"),
  buildInbox("inter-031", "intervention", "Pause persona capital-steward live trading", "ops-owner",
    "Persona paused", "Persona continues", "Continues until next gate"),
  buildInbox("rdy-002", "readiness_blocker", "EP5 canary blocker: missing paper-14d evidence", "research-owner",
    "Unblocks canary promote", "Blocker remains", "Blocker remains"),
  buildInbox("pol-014", "policy_violation", "Trace-003 flagged confidentiality violation", "compliance",
    "Acknowledged + remediation logged", "Escalated to legal", "Auto-escalates in 2h"),
  buildInbox("rbk-009", "rollback_request", "Rollback dep-042 vol-target weekly", "ops-owner",
    "Rollback executes", "Rollback denied", "Awaits next window"),
  buildInbox("cap-022", "capital_breach", "cp-eu-mid-cap VaR utilisation at 0.91", "capital-owner",
    "Risk budget extended", "Reduce exposure", "Auto-reduces in 1h"),
  buildInbox("brk-005", "broker_disconnect", "Broker IB EU lost binding", "ops-owner",
    "Re-bind broker", "Switch venue", "Live trading halts"),
];

function buildInbox(id: string, kind: HumanInboxKind, title: string, requiredRole: string,
                    a: string, r: string, ign: string): HumanInboxItem {
  const links = kind === "approval"          ? buildLinkSet({ primary: { kind: "approval", id } }) :
                kind === "sentinel"          ? buildLinkSet({ primary: { kind: "sentinel", id } }) :
                kind === "rollback_request"  ? buildLinkSet({ primary: { kind: "deployment", id: "dep-042" } }) :
                kind === "capital_breach"    ? buildLinkSet({ primary: { kind: "capital_pool", id: "cp-eu-mid-cap" } }) :
                kind === "broker_disconnect" ? buildLinkSet({ primary: { kind: "broker_live" } }) :
                kind === "policy_violation"  ? buildLinkSet({ primary: { kind: "evidence", id: "ev:legal-hold-1" } }) :
                kind === "readiness_blocker" ? buildLinkSet({ primary: { kind: "strict_publish" } }) :
                                                buildLinkSet({ primary: { kind: "human_gate", id } });
  return {
    id, kind, title, requiredRole,
    consequenceIfApproved: a, consequenceIfRejected: r, consequenceIfIgnored: ign,
    canDecide: kind !== "policy_violation",
    canProceed: kind !== "capital_breach",
    blockingReasons: kind === "capital_breach" ? ["Capital pool VaR breach"] : undefined,
    detailHref: `/management/human-inbox/${encodeURIComponent(id)}`,
    ttlSec: 12 * 3600,
    links,
  };
}

export const HumanInboxPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const seed = useMemo(() => [...INBOX].sort((a, b) => humanInboxRank(b.kind) - humanInboxRank(a.kind)), []);
  const { data, loading } = useV5Live(() => mgmt.humanInbox.list(() => seed), []);
  const sorted = useMemo(() => data ?? (personaFocus ? [] : seed), [data, personaFocus, seed]);
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
          {/* The consequence triplet only exists on the mock/legacy shape; live
              governance items carry a summary instead — show the grid only when
              populated so real payloads don't render three blank cells. */}
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

const CARD_ORDER = ["runtime-status", "pnl", "drawdown", "execution-quality", "baseline-comparison"];

const orderedCards = (cards: ManagementTradingPulseCard[]): ManagementTradingPulseCard[] =>
  [...cards].sort((a, b) => {
    const ai = CARD_ORDER.indexOf(a.cardId);
    const bi = CARD_ORDER.indexOf(b.cardId);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

const fallbackCardsFromSummary = (model: ManagementTradingPulseModel): ManagementTradingPulseCard[] => ([
  { cardId: "runtime-status", label: "Runtime Status", value: model.summary.runtimeCount, details: { byStatus: model.summary.byStatus, byStage: model.summary.byStage } },
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
  if (["runtime-status", "baseline-comparison", "total-trades"].includes(cardId ?? "")) {
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

export const TradingPulsePage = () => {
  const { t } = useTranslation();
  const seed = useMemo(() => defaultTradingPulseModel(), []);
  const { data } = useV5Live(() => mgmt.tradingPulse.get(() => seed), []);
  const model = data ?? seed;
  const cards = orderedCards(model.cards.length > 0 ? model.cards : fallbackCardsFromSummary(model));

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.pulse.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.pulse.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.pulse.subtitle")}</p>
      </header>

      <TradingPulseSurfaceHealth model={model} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.cardId} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline">{card.label}</Badge>
              <Badge variant="outline">{card.cardId}</Badge>
            </div>
            <div className="mt-3 text-2xl font-semibold">{formatPulseValue(card.value, card.cardId)}</div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {card.cardId === "runtime-status" && (
                <>
                  <div>{t("mgmt.pulse.byStatus")}: {compactCounts(card.details?.byStatus)}</div>
                  <div>{t("mgmt.pulse.byStage")}: {compactCounts(card.details?.byStage)}</div>
                </>
              )}
              {card.cardId === "pnl" && (
                <div>{t("mgmt.pulse.telemetryCoverage")}: {formatPulseValue(card.details?.telemetryCoverageCount, "runtime-status")}</div>
              )}
              {card.cardId === "execution-quality" && (
                <div>{t("mgmt.pulse.worstSlippage")}: {formatPulseValue(card.details?.worstSlippageBps)}</div>
              )}
              {card.cardId === "baseline-comparison" && (
                <>
                  <div>{t("mgmt.pulse.baselineCoverage")}: {formatPulseValue(card.details?.baselineComparisonCount, "runtime-status")}</div>
                  <div>{t("mgmt.pulse.byBaseline")}: {compactCounts(card.details?.byBaselineStatus)}</div>
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
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {surfaces.map(([key, surface]) => (
          <SurfaceBadge key={key} name={key} surface={surface} />
        ))}
      </div>
    </Card>
  );
};

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
  const visible = rows.slice(0, 10);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t("mgmt.pulse.runtimeRows")}</h2>
        <Badge variant="outline">{rows.length}</Badge>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.runtime")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.stage")}</th>
              <th className="py-2 pr-3 font-medium">P&L</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.fillRate")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.trades")}</th>
              <th className="py-2 pr-3 font-medium">{t("mgmt.pulse.baselineStatus")}</th>
              <th className="py-2 font-medium">{t("mgmt.pulse.updated")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className="py-3 text-muted-foreground" colSpan={7}>{t("mgmt.pulse.noRows")}</td>
              </tr>
            ) : visible.map((row) => (
              <tr key={row.runtimeId || row.runtime_id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 font-mono text-foreground">{row.runtimeId || row.runtime_id || "—"}</td>
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
                <td className="py-2 text-muted-foreground">{safeDateTime(row.lastUpdatedAt ?? row.last_updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const RankingBlocks = () => {
  const { t } = useTranslation();
  const { data } = useV5Live(() => mgmt.tradingPulse.rankings(), []);
  const blocks = data ?? defaultPulseRankings();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("mgmt.pulse.rankingsLabel")}>
      {blocks.map((b) => (
        <Card key={b.kind} className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{b.label}</h3>
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

const EVOLUTION: EvolutionEntry[] = [
  { id: "ev-101", mutation: "Tune momentum lookback 30→45", before: 1.20, after: 1.31, verdict: "improved", landedAt: "2026-05-19" },
  { id: "ev-102", mutation: "Add ATR-based position sizing", before: 1.05, after: 1.04, verdict: "inconclusive", landedAt: "2026-05-17" },
  { id: "ev-103", mutation: "Switch to vol-target rebal weekly", before: 1.10, after: 0.98, verdict: "degraded", landedAt: "2026-05-15" },
];

const verdictTone = (v?: string) =>
  v === "improved" || v === "accepted" || v === "approved"
    ? "bg-status-success/15 text-status-success border-status-success/30"
    : v === "degraded" || v === "rejected" || v === "failed"
      ? "bg-status-failed/15 text-status-failed border-status-failed/30"
      : "bg-muted text-muted-foreground border-border";

export const EvolutionJournalPage = () => {
  const { t } = useTranslation();
  const { data } = useV5Live(() => mgmt.evolutionJournal.list<EvolutionEntry>(() => EVOLUTION), []);
  const rows = data ?? EVOLUTION;
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.evolution.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evolution.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.evolution.subtitle")}</p>
      </header>
      {rows.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          {t("common.awaitingData", { defaultValue: "No data yet" })}
        </Card>
      )}
      {rows.map((e) => {
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

interface EvidenceRow {
  id: string; kind: string; status: string;
  hash: string; linkedObject: string; createdAt: string;
  // Live BFF evidence shape uses different field names; some are objects.
  refId?: string; sourceType?: string; linkType?: string; capturedAt?: string;
  sourceRef?: unknown; credibility?: unknown; linkedObjectSummary?: unknown;
}

// Coerce a possibly-object evidence field to a display string.
function evidenceText(v: unknown): string | undefined {
  if (typeof v === "string") return v || undefined;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const s = o.display_label ?? o.displayLabel ?? o.tier ?? o.entity_ref ?? o.entityRef ?? o.label;
    return typeof s === "string" && s ? s : undefined;
  }
  return undefined;
}

const EVIDENCE: EvidenceRow[] = [
  { id: "ev:proposal-v3", kind: "MutationProposal", status: "verified", hash: "0xprop3", linkedObject: "persona:alpha-trader", createdAt: "2026-05-19" },
  { id: "ev:paper-14d",  kind: "Paper14dEvidence", status: "verified", hash: "0xpap14", linkedObject: "strategy:alpha-momentum", createdAt: "2026-05-19" },
  { id: "ev:legal-hold-1", kind: "PolicyEvidence", status: "verified", hash: "0xlegal1", linkedObject: "trace-003", createdAt: "2026-05-20" },
];

export const EvidenceExplorerPage = () => {
  const { t } = useTranslation();
  const { data } = useV5Live(() => mgmt.evidence.list<EvidenceRow>(() => EVIDENCE), []);
  const rows = data ?? EVIDENCE;
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evidence.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.evidence.subtitle")}</p>
      </header>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t("mgmt.evidence.id")}</th><th className="px-3 py-2">{t("mgmt.evidence.kind")}</th>
              <th className="px-3 py-2">{t("mgmt.evidence.status")}</th><th className="px-3 py-2">{t("mgmt.evidence.hash")}</th>
              <th className="px-3 py-2">{t("mgmt.evidence.linkedObject")}</th><th className="px-3 py-2">{t("mgmt.evidence.created")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              // Fall back to live BFF field names when the mock fields are absent.
              // credibility / linkedObjectSummary / sourceRef arrive as objects.
              const kind = e.kind ?? e.sourceType ?? e.linkType ?? "—";
              const status = e.status ?? evidenceText(e.credibility) ?? "—";
              const hash = e.hash ?? e.refId ?? evidenceText(e.sourceRef) ?? "—";
              const linkedObject = e.linkedObject ?? evidenceText(e.linkedObjectSummary) ?? "—";
              const createdAt = e.createdAt ?? e.capturedAt ?? "—";
              return (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="px-3 py-2 font-mono"><Link to={`/management/evidence/${encodeURIComponent(e.id)}`} className="text-primary underline-offset-4 hover:underline">{e.id}</Link></td>
                  <td className="px-3 py-2">{kind}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{status}</Badge></td>
                  <td className="px-3 py-2 font-mono text-xs">{hash}</td>
                  <td className="px-3 py-2 font-mono text-xs">{linkedObject}</td>
                  <td className="px-3 py-2 text-muted-foreground">{createdAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
};

export const EvidencePacketDetailPage = () => {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.evidence.packetTitle")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.evidence.packetTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.evidence.packetSubtitle")}</p>
      </header>
      <Card className="p-4">
        {id ? (
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("mgmt.evidence.ref")}
              </div>
              <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                {id}
              </code>
            </div>
            <p className="text-muted-foreground">{t("mgmt.evidence.refOnlyHint")}</p>
            <Button asChild size="sm" variant="outline">
              <Link to="/management/evidence">{t("mgmt.evidence.backToList")}</Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm">{t("mgmt.evidence.seeListAt")} <Link to="/management/evidence" className="text-primary underline-offset-4 hover:underline">{t("mgmt.evidence.backToList")}</Link>.</p>
        )}
      </Card>
    </section>
  );
};
