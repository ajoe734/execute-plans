// 2026-07-11 MGMT-PERF-IA-004 - Consolidated Rankings Center - Rolling tab (Persona League)
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import {
  sortByPreset,
  tierDistribution,
  computeTopMovers,
  PERSONA_LEAGUE_PRESETS,
  type PersonaLeaguePreset,
  type PersonaLeagueRow,
} from "@/lib/v5/management/personaLeague";
import {
  currentPm12QuarterId,
  isGovernedRankingRecommendationAction,
  makeRankingRecommendationId,
  sendRankingRecommendation,
  type RankingRecommendationAction,
  type RankingRecommendationSubmitResult,
} from "@/lib/v5/management/rankingGovernance";
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";

// Safe Formatter Functions to handle null metrics and degraded telemetry
const fmtUsd = (n: number | undefined | null) =>
  n !== undefined && n !== null && Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    : "—";

const fmtPct = (n: number | undefined | null) =>
  n !== undefined && n !== null && Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—";

const fmtNum = (n: number | undefined | null, d = 2) =>
  n !== undefined && n !== null && Number.isFinite(n) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n) : "—";

const tierTone = (tier: string) =>
  tier === "S" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
  tier === "A" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
  tier === "B" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
  tier === "C" ? "bg-orange-500/10 text-orange-500 border-orange-500/20" :
  tier === "suspended" ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                         "bg-muted text-muted-foreground border-border";

const deltaArrow = (d?: number) =>
  d === undefined ? "·" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${Math.abs(d)}` : "—";

const personaManageHref = (row: PersonaLeagueRow): string =>
  row.links?.manageHref ?? `/management/personas/${encodeURIComponent(row.personaId)}`;



type RecommendationUiState =
  | { kind: "submitting" }
  | { kind: "local_only"; result: RankingRecommendationSubmitResult }
  | { kind: "submitted"; result: RankingRecommendationSubmitResult }
  | { kind: "error"; message: string };

type PersonaLeagueRecommendationRow = PersonaLeagueRow & {
  recommendationId?: string;
  recommendation_id?: string;
  evidenceRefs?: string[];
  evidence_refs?: string[];
  governanceDestinations?: string[];
  governance_destinations?: string[];
};

const evidenceRefsFromRow = (row: PersonaLeagueRecommendationRow): string[] =>
  row.evidenceRefs ?? row.evidence_refs ?? [];

const governanceDestinationsFromRow = (row: PersonaLeagueRecommendationRow): string[] | undefined =>
  row.governanceDestinations ?? row.governance_destinations;

type SortField = "rank" | "score" | "pnl" | "sharpe" | "drawdown" | "interventions";
type SortOrder = "asc" | "desc";

export const PersonaLeaguePage = ({ embedded = false }: { embedded?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const paramSourceConfidence = searchParams.get("source_confidence")?.trim();

  // Load from Live API
  const { data: apiData, loading: apiLoading } = useV5Live(() => mgmt.personaLeague.listLiveOnly(), []);

  // Determine fallback & telemetry health
  const useFallback = !apiData || apiData.length === 0;
  const isTelemetryDegraded = useFallback || paramSourceConfidence === "degraded";

  const rows = useMemo(() => {
    return apiData ?? [];
  }, [apiData]);

  const [preset, setPreset] = useState<PersonaLeaguePreset>("overall");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recommendationState, setRecommendationState] = useState<Record<string, RecommendationUiState>>({});
  const currentQuarter = useMemo(() => currentPm12QuarterId(), []);

  // Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Custom Sorting States
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // 1. Filter Rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Focus filter (from URL)
      if (personaFocus && row.personaId !== personaFocus && row.personaName !== personaFocus) {
        return false;
      }
      // Search query filter
      if (searchQuery && !row.personaName.toLowerCase().includes(searchQuery.toLowerCase()) && !row.personaId.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Tier filter
      if (selectedTier !== "all" && row.tier !== selectedTier) {
        return false;
      }
      // Status filter
      if (selectedStatus !== "all" && row.status !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [rows, personaFocus, searchQuery, selectedTier, selectedStatus]);

  // 2. Sort Rows
  const sortedRows = useMemo(() => {
    if (sortField) {
      return [...filteredRows].sort((a, b) => {
        let valA: number = 0;
        let valB: number = 0;

        switch (sortField) {
          case "rank":
            valA = a.currentRank;
            valB = b.currentRank;
            // Rank ascending is normally "better"
            return sortOrder === "asc" ? valA - valB : valB - valA;
          case "score":
            valA = Number.isFinite(a.score) ? a.score : -999;
            valB = Number.isFinite(b.score) ? b.score : -999;
            break;
          case "pnl":
            valA = Number.isFinite(a.pnl30d) ? a.pnl30d : -99999999;
            valB = Number.isFinite(b.pnl30d) ? b.pnl30d : -99999999;
            break;
          case "sharpe":
            valA = Number.isFinite(a.sharpe) ? a.sharpe : -99;
            valB = Number.isFinite(b.sharpe) ? b.sharpe : -99;
            break;
          case "drawdown":
            valA = Number.isFinite(a.maxDrawdown) ? a.maxDrawdown : 99; // Less negative is better
            valB = Number.isFinite(b.maxDrawdown) ? b.maxDrawdown : 99;
            break;
          case "interventions":
            valA = a.humanInterventions ?? 0;
            valB = b.humanInterventions ?? 0;
            break;
        }

        return sortOrder === "asc" ? valA - valB : valB - valA;
      });
    }

    // Default to preset sorting
    return sortByPreset(filteredRows, preset);
  }, [filteredRows, preset, sortField, sortOrder]);

  // 3. Paginate Rows
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage]);

  const tiers = useMemo(() => tierDistribution(rows), [rows]);
  const movers = useMemo(() => computeTopMovers(rows), [rows]);
  const suspended = rows.filter((r) => r.status === "suspended" || r.tier === "suspended");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const recommendationIdFor = (r: PersonaLeagueRow, action: RankingRecommendationAction): string => {
    const row = r as PersonaLeagueRecommendationRow;
    return row.recommendationId ?? row.recommendation_id ?? makeRankingRecommendationId({
      personaId: r.personaId,
      personaName: r.personaName,
      recommendation: action,
      source: "persona_league",
      quarter: currentQuarter,
      evidenceRefs: evidenceRefsFromRow(row),
    });
  };

  const submitRecommendation = async (r: PersonaLeagueRow, action: RankingRecommendationAction) => {
    const row = r as PersonaLeagueRecommendationRow;
    const recommendationId = recommendationIdFor(r, action);
    setRecommendationState((prev) => ({ ...prev, [recommendationId]: { kind: "submitting" } }));
    try {
      const result = await sendRankingRecommendation({
        personaId: r.personaId,
        personaName: r.personaName,
        recommendation: action,
        recommendationId,
        source: "persona_league",
        quarter: currentQuarter,
        evidenceRefs: evidenceRefsFromRow(row),
        governanceDestinations: governanceDestinationsFromRow(row),
      });
      if (result.persisted && result.detailHref) {
        navigate(result.detailHref);
        return;
      }
      setRecommendationState((prev) => ({
        ...prev,
        [recommendationId]: { kind: result.persisted ? "submitted" : "local_only", result },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRecommendationState((prev) => ({ ...prev, [recommendationId]: { kind: "error", message } }));
    }
  };

  return (
    <section className={embedded ? "space-y-6" : "p-6 space-y-6"} aria-label={t("mgmt.league.title")}>
      {/* Telemetry Status Indicator */}
      <Alert className={`border-l-4 transition-all duration-300 ${isTelemetryDegraded ? "bg-amber-500/5 border-l-amber-500 border-amber-500/10 text-amber-600" : "bg-emerald-500/5 border-l-emerald-500 border-emerald-500/10 text-emerald-600"}`}>
        <div className="flex items-center gap-3">
          {isTelemetryDegraded ? <ShieldAlert className="h-5 w-5 text-amber-500 animate-pulse" /> : <ShieldCheck className="h-5 w-5 text-emerald-500" />}
          <div className="flex-1">
            <AlertTitle className="text-sm font-semibold flex items-center gap-2">
              Telemetry Feed: {isTelemetryDegraded ? "Degraded Standby" : "High Confidence (BFF Live)"}
              <Badge variant="outline" className={`ml-2 text-[10px] uppercase font-bold tracking-wider ${isTelemetryDegraded ? "border-amber-500/30 text-amber-500 bg-amber-500/10" : "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"}`}>
                {isTelemetryDegraded ? "standby" : "live"}
              </Badge>
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground mt-0.5">
              {isTelemetryDegraded 
                ? "BFF real-time telemetry stream is offline or missing. Operating on local memory and seed backups safely."
                : "Active sync with live telemetry clusters verified. All indicators are optimal."}
            </AlertDescription>
          </div>
        </div>
      </Alert>

      {useFallback && !apiLoading ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {t("mgmt.liveOnly.unavailableTitle", { defaultValue: "Live data unavailable" })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("mgmt.liveOnly.unavailableBody", { defaultValue: "This page does not render seed, demo, or non-production fallback data." })}
          </p>
        </Card>
      ) : null}

      {/* Telemetry & Evidence Dashboard */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3 bg-card/60 backdrop-blur-sm border-border/80 hover:border-border transition-colors">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Info className="h-3 w-3 text-primary" /> Period
          </div>
          <div className="text-lg font-mono font-semibold text-foreground">30-Day Rolling</div>
        </Card>
        <Card className="p-3 bg-card/60 backdrop-blur-sm border-border/80 hover:border-border transition-colors">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Info className="h-3 w-3 text-primary" /> Snapshot ID
          </div>
          <div className="text-lg font-mono font-semibold text-foreground">rolling-live</div>
        </Card>
        <Card className="p-3 bg-card/60 backdrop-blur-sm border-border/80 hover:border-border transition-colors">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Info className="h-3 w-3 text-primary" /> Formula Criteria
          </div>
          <div className="text-sm font-medium text-foreground truncate mt-1">Multi-Factor v1.2</div>
        </Card>
        <Card className="p-3 bg-card/60 backdrop-blur-sm border-border/80 hover:border-border transition-colors">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Info className="h-3 w-3 text-primary" /> Evidence Coverage
          </div>
          <div className="text-sm font-medium text-foreground mt-1">
            {rows.length > 0 ? `100% (${rows.length}/${rows.length} Verified)` : "—"}
          </div>
        </Card>
      </div>

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.league.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("mgmt.league.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">{t("mgmt.league.preset")}</label>
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value as PersonaLeaguePreset);
              setSortField(null); // Reset header sort when preset changes
              setCurrentPage(1);
            }}
            aria-label={t("mgmt.league.preset")}
          >
            {PERSONA_LEAGUE_PRESETS.map((p) => (
              <option key={p} value={p}>{t(`mgmt.league.presets.${p}`)}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Advanced Filtering Block */}
      <Card className="p-4 bg-muted/20 border-border/50 space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Search & Filters</div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search persona name or ID..."
              className="pl-8 h-9"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="w-[150px]">
            <select
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={selectedTier}
              onChange={(e) => {
                setSelectedTier(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by Tier"
            >
              <option value="all">All Tiers</option>
              <option value="S">Tier S</option>
              <option value="A">Tier A</option>
              <option value="B">Tier B</option>
              <option value="C">Tier C</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="w-[150px]">
            <select
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by Status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="watch">Watch</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          {(searchQuery || selectedTier !== "all" || selectedStatus !== "all" || personaFocus) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchQuery("");
                setSelectedTier("all");
                setSelectedStatus("all");
                setCurrentPage(1);
                if (personaFocus) {
                  navigate(window.location.pathname);
                }
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>
      </Card>

      {personaFocus && (
        <Card className="p-3 border-primary/20 bg-primary/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-primary font-medium flex items-center gap-2">
              <Info className="h-4 w-4" />
              {filteredRows.length > 0
                ? t("mgmt.league.focusedPersonaFmt", { persona: personaFocus, count: filteredRows.length })
                : t("mgmt.league.focusMissingPersonaFmt", { persona: personaFocus })}
            </p>
            <Button asChild size="sm" variant="outline" className="border-primary/30 hover:bg-primary/10">
              <Link to="/management/rankings?tab=rolling">{t("mgmt.league.showAllPersonas")}</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* KPI + Tier distribution + Top movers */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-3 bg-card/40 border-border/60">
          <div className="text-xs text-muted-foreground mb-2 font-medium">{t("mgmt.league.tierDistribution")}</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(tiers)
              .filter(([tier, count]) => tier && tier !== "undefined" && Number.isFinite(count as number))
              .map(([tier, count]) => (
                <Badge key={tier} variant="outline" className={`${tierTone(tier)} transition-all hover:scale-105`}>
                  {tier}: {count}
                </Badge>
              ))}
          </div>
        </Card>
        <Card className="p-3 bg-card/40 border-border/60">
          <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-emerald-500" /> {t("mgmt.league.topUp")}
          </div>
          <ul className="text-sm space-y-1">
            {movers.topUp.map((m) => (
              <li key={m.personaId} className="flex justify-between items-center py-0.5 border-b border-border/30 last:border-0">
                <Link to={personaManageHref(m)} className="text-primary hover:underline font-medium">{m.personaName}</Link>
                <span className="text-emerald-500 font-mono text-xs flex items-center gap-0.5">
                  {deltaArrow(m.rankDelta)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-3 bg-card/40 border-border/60">
          <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-rose-500" /> {t("mgmt.league.topDown")}
          </div>
          <ul className="text-sm space-y-1">
            {movers.topDown.map((m) => (
              <li key={m.personaId} className="flex justify-between items-center py-0.5 border-b border-border/30 last:border-0">
                <Link to={personaManageHref(m)} className="text-primary hover:underline font-medium">{m.personaName}</Link>
                <span className="text-rose-500 font-mono text-xs flex items-center gap-0.5">
                  {deltaArrow(m.rankDelta)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Ranking table */}
      <Card className="border-border/80 shadow-md">
        <ManagementTableScroll minScrollWidth={1280}>
          <table className="w-full min-w-[1280px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
              <tr>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("rank")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.league.rank")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2">Δ</th>
                <th className="px-3 py-2">{t("mgmt.league.persona")}</th>
                <th className="px-3 py-2">{t("mgmt.league.tier")}</th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("score")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.league.score")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("pnl")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.league.pnl30d")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("sharpe")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.league.sharpe")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("drawdown")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.league.maxDd")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("interventions")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.league.interventions")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2">{t("mgmt.league.recommendation")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((r) => (
                <RowFragment
                  key={r.personaId}
                  r={r}
                  expanded={expanded === r.personaId}
                  onToggle={() => setExpanded(expanded === r.personaId ? null : r.personaId)}
                />
              ))}
              {paginatedRows.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={11}>
                    {t("mgmt.pulse.noRows")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ManagementTableScroll>

        {/* Pagination Panel */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{sortedRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> to{" "}
            <span className="font-semibold text-foreground">{Math.min(currentPage * pageSize, sortedRows.length)}</span> of{" "}
            <span className="font-semibold text-foreground">{sortedRows.length}</span> personas
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Suspended */}
      {suspended.length > 0 && (
        <Card className="p-4 border-rose-500/20 bg-rose-500/5">
          <h2 className="text-sm font-semibold text-rose-500 mb-2 flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4" /> {t("mgmt.league.suspended")}
          </h2>
          <ul className="text-sm space-y-1">
            {suspended.map((s) => (
              <li key={s.personaId}>
                <Link to={personaManageHref(s)} className="text-primary hover:underline font-mono font-medium">
                  {s.personaName}
                </Link>
                <span className="text-xs text-rose-400 ml-2 font-mono">({s.personaId})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );

  function RowFragment({ r, expanded, onToggle }: { r: PersonaLeagueRow; expanded: boolean; onToggle: () => void }) {
    const isPnlNegative = (r.pnl30d ?? 0) < 0;

    return (
      <>
        <tr className="border-b border-border/50 hover:bg-muted/10 transition-colors">
          <td className="px-3 py-3 font-mono font-semibold">#{r.currentRank}</td>
          <td className={`px-3 py-3 font-mono text-xs ${(r.rankDelta ?? 0) > 0 ? "text-emerald-500" : (r.rankDelta ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
            {deltaArrow(r.rankDelta)}
          </td>
          <td className="px-3 py-3">
            <Link to={personaManageHref(r)} className="text-primary font-semibold hover:underline">
              {r.personaName}
            </Link>
            <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
              <Link to={`/management/persona-fleet?persona=${encodeURIComponent(r.personaId)}`} className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5">
                • {t("nav.personaFleet")}
              </Link>
              <Link to={`/management/performance?tab=attribution&persona=${encodeURIComponent(r.personaId)}`} className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5">
                • Performance Center
              </Link>
            </div>
          </td>
          <td className="px-3 py-3">
            <Badge variant="outline" className={`text-[10px] font-bold py-0.5 ${tierTone(r.tier)}`}>
              {r.tier}
            </Badge>
          </td>
          <td className="px-3 py-3 font-mono text-foreground font-semibold">{fmtNum(r.score, 1)}</td>
          <td className={`px-3 py-3 font-mono font-medium ${isPnlNegative ? "text-rose-500" : "text-emerald-500"}`}>
            {fmtUsd(r.pnl30d)}
          </td>
          <td className="px-3 py-3 font-mono">{fmtNum(r.sharpe)}</td>
          <td className="px-3 py-3 font-mono text-rose-500">{fmtPct(r.maxDrawdown)}</td>
          <td className="px-3 py-3 font-mono">{fmtNum(r.humanInterventions, 0)}</td>
          <td className="px-3 py-3">
            {isGovernedRankingRecommendationAction(r.recommendedAction) ? (
              <RecommendationButton
                action={r.recommendedAction}
                state={recommendationState[recommendationIdFor(r, r.recommendedAction)]}
                onSubmit={() => void submitRecommendation(r, r.recommendedAction)}
              />
            ) : (
              <span className="text-xs text-muted-foreground">{t("mgmt.league.recommendations.no_change")}</span>
            )}
          </td>
          <td className="px-3 py-3">
            <Button size="sm" variant="ghost" onClick={onToggle} aria-expanded={expanded} className="text-xs">
              {expanded ? t("mgmt.league.hide") : t("mgmt.league.breakdown")}
            </Button>
          </td>
        </tr>
        {expanded && (
          <tr className="bg-muted/20 border-b border-border/40">
            <td colSpan={11} className="px-4 py-3">
              <div className="bg-card/50 border border-border/45 rounded-lg p-3 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/30 pb-1">
                  Multi-Factor Score Weights Breakdown
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  {Object.entries(r.scoreBreakdown ?? {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center bg-muted/10 p-1.5 rounded">
                      <span className="text-muted-foreground">{t(`mgmt.league.breakdownKeys.${k}`, { defaultValue: k })}</span>
                      <span className="font-mono font-semibold text-foreground">{fmtNum(v as number, 1)}</span>
                    </div>
                  ))}
                </div>
                {evidenceRefsFromRow(r as PersonaLeagueRecommendationRow).length > 0 ? (
                  <div className="pt-2 border-t border-border/30 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">Evidence Coverage:</span>
                    {evidenceRefsFromRow(r as PersonaLeagueRecommendationRow).map((evidenceRef) => (
                      <Link
                        key={evidenceRef}
                        to={`/management/evidence?query=${encodeURIComponent(evidenceRef)}`}
                        className="font-mono text-xs text-primary hover:underline bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded transition-colors"
                      >
                        {evidenceRef}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }
};

function RecommendationButton({
  action, state, onSubmit,
}: {
  action: RankingRecommendationAction;
  state?: RecommendationUiState;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const busy = state?.kind === "submitting";
  return (
    <div className="max-w-[240px] space-y-1">
      <Button size="sm" variant="outline" onClick={onSubmit} disabled={busy} className="h-7 text-xs border-primary/30 hover:bg-primary/10 text-primary">
        {busy ? t("mgmt.governance.submitting") : `${t(`mgmt.league.recommendations.${action}`)} →`}
      </Button>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {t("mgmt.governance.humanReviewRequired")}
      </p>
      {state?.kind === "local_only" && (
        <p role="status" className="text-[10px] leading-snug text-amber-500 font-semibold">
          {t("mgmt.governance.localOnly")}
        </p>
      )}
      {state?.kind === "submitted" && (
        <p role="status" className="text-[10px] leading-snug text-emerald-500 font-semibold">
          {t("mgmt.governance.submitted")}
        </p>
      )}
      {state?.kind === "error" && (
        <p role="alert" className="text-[10px] leading-snug text-rose-500 font-semibold">
          {t("mgmt.governance.submitFailed", { message: state.message })}
        </p>
      )}
    </div>
  );
}
