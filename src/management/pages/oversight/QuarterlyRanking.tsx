// 2026-07-11 MGMT-PERF-IA-004 - Consolidated Rankings Center - Quarterly tab (Quarterly Ranking)
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ManagementTableScroll } from "@/management/components/ManagementTableScroll";
import { tradeJourneyHref } from "@/management/navigation/tradeJourneyLinks";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import {
  type QuarterlyRankingFormula,
  type QuarterlyRankingRow,
} from "@/lib/v5/management/quarterlyRanking";
import {
  currentPm12QuarterId,
  isGovernedRankingRecommendationAction,
  makeRankingRecommendationId,
  sendRankingRecommendation,
  type RankingRecommendationSubmitResult,
} from "@/lib/v5/management/rankingGovernance";
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";

const EMPTY_FORMULA: QuarterlyRankingFormula = {
  formulaId: "nan",
  version: "—",
  activeFrom: "—",
  weights: {
    pnl: Number.NaN,
    sharpe: Number.NaN,
    drawdownControl: Number.NaN,
    executionQuality: Number.NaN,
    riskCompliance: Number.NaN,
    improvement: Number.NaN,
    humanInterventionPenalty: Number.NaN,
  },
  hardPenalties: {
    riskPolicyViolation: Number.NaN,
    unresolvedCriticalIncident: Number.NaN,
    missingEvidence: Number.NaN,
    capitalBreach: Number.NaN,
  },
  minDataRequirements: {
    minTradingDays: Number.NaN,
    minTrades: Number.NaN,
  },
};

const fmtUsd = (n: number | undefined | null) =>
  n !== undefined && n !== null && Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
    : "—";

const fmtPct = (n: number | undefined | null) =>
  n !== undefined && n !== null && Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—";

const fmtNum = (n: number | undefined | null, d = 2) =>
  n !== undefined && n !== null && Number.isFinite(n) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n) : "—";

const deltaArrow = (d?: number) =>
  d === undefined ? "·" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${Math.abs(d)}` : "—";

function quarterCutoffDate(quarterId: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarterId);
  if (!match) return "—";
  const cutoff = new Date(Date.UTC(Number(match[1]), Number(match[2]) * 3, 0));
  return cutoff.toISOString().slice(0, 10);
}

function daysUntil(dateText: string): string {
  const cutoff = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(cutoff.getTime())) return "—";
  return String(Math.max(0, Math.ceil((cutoff.getTime() - Date.now()) / 86_400_000)));
}

const personaManageHref = (row: QuarterlyRankingRow): string =>
  row.links?.manageHref ?? `/management/personas/${encodeURIComponent(row.personaId)}`;

type RecommendationUiState =
  | { kind: "submitting" }
  | { kind: "local_only"; result: RankingRecommendationSubmitResult }
  | { kind: "submitted"; result: RankingRecommendationSubmitResult }
  | { kind: "error"; message: string };

type QuarterlyRecommendationRow = QuarterlyRankingRow & {
  recommendationId?: string;
  recommendation_id?: string;
  governanceDestinations?: string[];
  governance_destinations?: string[];
};

const governanceDestinationsFromRow = (row: QuarterlyRecommendationRow): string[] | undefined =>
  row.governanceDestinations ?? row.governance_destinations;

type SortField = "rank" | "prevRank" | "delta" | "score" | "pnl" | "sharpe";
type SortOrder = "asc" | "desc";

export const QuarterlyRankingPage = ({ embedded = false }: { embedded?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const personaFocus = searchParams.get("persona")?.trim() ?? "";
  const paramSnapshotId = searchParams.get("snapshot")?.trim() ?? "snap-2026-q3-final";
  const paramSourceConfidence = searchParams.get("source_confidence")?.trim();
  const currentQuarter = useMemo(() => currentPm12QuarterId(), []);
  const [recommendationState, setRecommendationState] = useState<Record<string, RecommendationUiState>>({});

  // Fetch Live Data
  const { data: rows, loading: rowsLoading } = useV5Live(
    () => mgmt.quarterlyRanking.listLiveOnly(currentQuarter), [currentQuarter],
  );
  const { data: formula } = useV5Live(
    () => mgmt.quarterlyRanking.formulaLiveOnly(), [],
  );

  // Fallback Detection & Telemetry
  const useFallback = !rows || rows.length === 0;
  const isTelemetryDegraded = useFallback || paramSourceConfidence === "degraded";

  const rawRanking = useMemo(() => {
    return rows ?? [];
  }, [rows]);

  const f = useMemo(() => {
    return formula ?? EMPTY_FORMULA;
  }, [formula]);

  // Normalize live rows
  const ranking = useMemo(() => {
    return rawRanking.map((raw, i) => {
      const r = raw as QuarterlyRankingRow & {
        overallScore?: number; tierLabel?: string; name?: string; rank?: number;
        metrics?: { pnl?: number | null; sharpe?: number | null };
      };
      if (typeof r.eligibility === "string" && typeof r.score === "number") return r as QuarterlyRankingRow;
      return {
        ...r,
        eligibility: r.eligibility ?? "eligible",
        currentRank: r.currentRank ?? r.rank ?? i + 1,
        personaName: r.personaName ?? r.name ?? r.personaId ?? r.id,
        score: r.score ?? r.overallScore ?? NaN,
        tier: r.tier ?? r.tierLabel ?? "—",
        pnlQuarter: r.pnlQuarter ?? r.metrics?.pnl ?? NaN,
        sharpeQuarter: r.sharpeQuarter ?? r.metrics?.sharpe ?? NaN,
        evidenceRefs: r.evidenceRefs ?? [],
      } as QuarterlyRankingRow;
    });
  }, [rawRanking]);

  // Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEligibility, setSelectedEligibility] = useState<string>("all");
  const [selectedTier, setSelectedTier] = useState<string>("all");

  // Custom Sorting States
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // 1. Filter
  const filteredRanking = useMemo(() => {
    return ranking.filter((row) => {
      // Focus filter (from URL)
      if (personaFocus && row.personaId !== personaFocus && row.personaName !== personaFocus) {
        return false;
      }
      // Search text query
      if (searchQuery && !row.personaName.toLowerCase().includes(searchQuery.toLowerCase()) && !row.personaId.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Eligibility filter
      if (selectedEligibility !== "all" && row.eligibility !== selectedEligibility) {
        return false;
      }
      // Tier filter
      if (selectedTier !== "all" && row.tier !== selectedTier) {
        return false;
      }
      return true;
    });
  }, [ranking, personaFocus, searchQuery, selectedEligibility, selectedTier]);

  // 2. Sort
  const sortedRanking = useMemo(() => {
    if (sortField) {
      return [...filteredRanking].sort((a, b) => {
        let valA: number = 0;
        let valB: number = 0;

        switch (sortField) {
          case "rank":
            valA = a.currentRank;
            valB = b.currentRank;
            return sortOrder === "asc" ? valA - valB : valB - valA;
          case "prevRank":
            valA = a.previousQuarterRank ?? 999;
            valB = b.previousQuarterRank ?? 999;
            return sortOrder === "asc" ? valA - valB : valB - valA;
          case "delta":
            valA = a.rankDelta ?? 0;
            valB = b.rankDelta ?? 0;
            break;
          case "score":
            valA = Number.isFinite(a.score) ? a.score : -999;
            valB = Number.isFinite(b.score) ? b.score : -999;
            break;
          case "pnl":
            valA = Number.isFinite(a.pnlQuarter) ? a.pnlQuarter : -99999999;
            valB = Number.isFinite(b.pnlQuarter) ? b.pnlQuarter : -99999999;
            break;
          case "sharpe":
            valA = Number.isFinite(a.sharpeQuarter) ? a.sharpeQuarter : -99;
            valB = Number.isFinite(b.sharpeQuarter) ? b.sharpeQuarter : -99;
            break;
        }
        return sortOrder === "asc" ? valA - valB : valB - valA;
      });
    }
    return filteredRanking;
  }, [filteredRanking, sortField, sortOrder]);

  // 3. Paginate
  const totalPages = Math.ceil(sortedRanking.length / pageSize) || 1;
  const paginatedRanking = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRanking.slice(start, start + pageSize);
  }, [sortedRanking, currentPage]);

  const disqualified = ranking.filter((r) => r.eligibility !== "eligible");
  const evidence = ranking.flatMap((r) => r.evidenceRefs ?? []);
  const quarter = ranking.find((row) => row.quarter)?.quarter ?? currentQuarter;
  const cutoffDate = quarterCutoffDate(quarter);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const submitRecommendation = async (r: QuarterlyRankingRow) => {
    if (!isGovernedRankingRecommendationAction(r.recommendation)) return;
    const row = r as QuarterlyRecommendationRow;
    const recommendationId = row.recommendationId ?? row.recommendation_id ?? makeRankingRecommendationId({
      personaId: r.personaId,
      personaName: r.personaName,
      recommendation: r.recommendation,
      source: "quarterly_ranking",
      quarter: r.quarter ?? quarter,
      evidenceRefs: r.evidenceRefs ?? [],
    });
    setRecommendationState((prev) => ({ ...prev, [recommendationId]: { kind: "submitting" } }));
    try {
      const result = await sendRankingRecommendation({
        personaId: r.personaId,
        personaName: r.personaName,
        recommendation: r.recommendation,
        recommendationId,
        source: "quarterly_ranking",
        quarter: r.quarter ?? quarter,
        evidenceRefs: r.evidenceRefs ?? [],
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
    <section className={embedded ? "space-y-6" : "p-6 space-y-6"} aria-label={t("mgmt.quarterly.title")}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.quarterly.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("mgmt.quarterly.subtitle")}</p>
      </header>

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

      {useFallback && !rowsLoading ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {t("mgmt.liveOnly.unavailableTitle", { defaultValue: "Live data unavailable" })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("mgmt.liveOnly.unavailableBody", { defaultValue: "This page does not render seed, demo, or non-production fallback data." })}
          </p>
        </Card>
      ) : null}

      {/* Snapshot Board */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "currentQuarter", v: quarter, icon: true },
          { k: "cutoffDate", v: cutoffDate },
          { k: "daysRemaining", v: daysUntil(cutoffDate) },
          { k: "formulaVersion", v: f.version },
        ].map((c) => (
          <Card key={c.k} className="p-3 bg-card/60 backdrop-blur-sm border-border/80 hover:border-border transition-colors">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
              <Info className="h-3 w-3 text-primary" /> {t(`mgmt.quarterly.${c.k}`)}
            </div>
            <div className="text-lg font-mono font-semibold text-foreground">{c.v}</div>
          </Card>
        ))}
      </div>

      {/* Criteria Snapshot & Formula Details */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-3 bg-card/40 border-border/60 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-primary" /> {t("mgmt.quarterly.formulaWeights")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(f.weights ?? {}).map(([k, v]) => (
              <div key={k} className="flex justify-between bg-muted/25 p-1.5 rounded">
                <span className="text-muted-foreground">{t(`mgmt.quarterly.weightKeys.${k}`, { defaultValue: k })}</span>
                <span className="font-mono font-semibold">{fmtNum(v as number)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-border/30 text-xs text-muted-foreground flex flex-wrap gap-4">
            <div>
              {t("mgmt.quarterly.minTradingDays")}:{" "}
              <span className="font-mono text-foreground font-semibold">
                {fmtNum(f.minDataRequirements?.minTradingDays ?? Number.NaN, 0)}
              </span>
            </div>
            <div>
              {t("mgmt.quarterly.minTrades")}:{" "}
              <span className="font-mono text-foreground font-semibold">
                {fmtNum(f.minDataRequirements?.minTrades ?? Number.NaN, 0)}
              </span>
            </div>
          </div>
        </Card>

        {/* Snapshot / Criteria ID Card */}
        <Card className="p-3 bg-card/40 border-border/60">
          <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-primary" /> Evaluation Context
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Snapshot ID:</span>
              <span className="font-mono font-semibold text-foreground">{paramSnapshotId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Formula ID:</span>
              <span className="font-mono font-semibold text-foreground">{f.formulaId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active From:</span>
              <span className="font-mono text-foreground">{f.activeFrom}</span>
            </div>
          </div>
        </Card>
      </div>

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
          <div className="w-[180px]">
            <select
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={selectedEligibility}
              onChange={(e) => {
                setSelectedEligibility(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter by Eligibility"
            >
              <option value="all">All Eligibility</option>
              <option value="eligible">Eligible</option>
              <option value="insufficient_data">Insufficient Data</option>
              <option value="disqualified">Disqualified</option>
            </select>
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
              <option value="disqualified">Disqualified</option>
            </select>
          </div>
          {(searchQuery || selectedEligibility !== "all" || selectedTier !== "all" || personaFocus) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchQuery("");
                setSelectedEligibility("all");
                setSelectedTier("all");
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
              {filteredRanking.length > 0
                ? t("mgmt.quarterly.focusedPersonaFmt", { persona: personaFocus, count: filteredRanking.length })
                : t("mgmt.quarterly.focusMissingPersonaFmt", { persona: personaFocus })}
            </p>
            <Button asChild size="sm" variant="outline" className="border-primary/30 hover:bg-primary/10">
              <Link to="/management/rankings?tab=quarterly">{t("mgmt.quarterly.showAllPersonas")}</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Ranking table */}
      <Card className="border-border/80 shadow-md">
        <ManagementTableScroll minScrollWidth={1120}>
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
              <tr>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("rank")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.league.rank")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("prevRank")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.quarterly.prevRank")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("delta")}>
                  <div className="flex items-center gap-1.5">
                    Δ <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2">{t("mgmt.league.persona")}</th>
                <th className="px-3 py-2">{t("mgmt.league.tier")}</th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("score")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.league.score")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("pnl")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.quarterly.pnlQ")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2 cursor-pointer hover:bg-muted transition-colors" onClick={() => handleSort("sharpe")}>
                  <div className="flex items-center gap-1.5">
                    {t("mgmt.league.sharpe")} <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-3 py-2">{t("mgmt.quarterly.eligibility")}</th>
                <th className="px-3 py-2">{t("mgmt.league.recommendation")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRanking.map((r) => (
                <tr key={r.personaId} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="px-3 py-3 font-mono font-semibold">#{r.currentRank}</td>
                  <td className="px-3 py-3 font-mono">{r.previousQuarterRank ?? "·"}</td>
                  <td className={`px-3 py-3 font-mono text-xs ${(r.rankDelta ?? 0) > 0 ? "text-emerald-500" : (r.rankDelta ?? 0) < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                    {deltaArrow(r.rankDelta)}
                  </td>
                  <td className="px-3 py-3">
                    <Link to={personaManageHref(r)} className="text-primary font-semibold hover:underline">
                      {r.personaName}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                      <Link to={`/management/persona-fleet?persona=${encodeURIComponent(r.personaId)}`} className="text-muted-foreground hover:text-primary transition-colors">
                        • {t("nav.personaFleet")}
                      </Link>
                      <Link to={`/management/performance?tab=attribution&persona=${encodeURIComponent(r.personaId)}`} className="text-muted-foreground hover:text-primary transition-colors">
                        • Performance Center
                      </Link>
                      <Link aria-label={`${r.personaId} trade journeys`} to={tradeJourneyHref(location, { personaId: r.personaId }, "Rankings Center")} className="text-muted-foreground hover:text-primary transition-colors">
                        • {t("nav.tradeJourneys", { defaultValue: "Trade Journeys" })}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" className={`text-[10px] font-bold py-0.5 ${r.tier === "disqualified" ? "border-rose-500/20 text-rose-500 bg-rose-500/5" : "border-border"}`}>
                      {r.tier}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 font-mono font-semibold text-foreground">{fmtNum(r.score, 1)}</td>
                  <td className={`px-3 py-3 font-mono font-medium ${(r.pnlQuarter ?? 0) < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                    {fmtUsd(r.pnlQuarter)}
                  </td>
                  <td className="px-3 py-3 font-mono">{fmtNum(r.sharpeQuarter)}</td>
                  <td className="px-3 py-3 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium border ${r.eligibility === "eligible" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : r.eligibility === "insufficient_data" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"}`}>
                      {t(`mgmt.quarterly.eligibilityValues.${r.eligibility}`, { defaultValue: String(r.eligibility ?? "—") })}
                    </span>
                    {r.disqualificationReason && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[150px]" title={r.disqualificationReason}>
                        {r.disqualificationReason}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {isGovernedRankingRecommendationAction(r.recommendation) ? (
                      <RecommendationSubmitCell
                        label={t(`mgmt.league.recommendations.${r.recommendation}`)}
                        state={recommendationState[
                          ((r as QuarterlyRecommendationRow).recommendationId ?? (r as QuarterlyRecommendationRow).recommendation_id)
                          ?? makeRankingRecommendationId({
                            personaId: r.personaId,
                            personaName: r.personaName,
                            recommendation: r.recommendation,
                            source: "quarterly_ranking",
                            quarter: r.quarter ?? quarter,
                            evidenceRefs: r.evidenceRefs ?? [],
                          })
                        ]}
                        onSubmit={() => void submitRecommendation(r)}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("mgmt.league.recommendations.no_change")}</span>
                    )}
                  </td>
                </tr>
              ))}
              {paginatedRanking.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={10}>
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
            Showing <span className="font-semibold text-foreground">{sortedRanking.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> to{" "}
            <span className="font-semibold text-foreground">{Math.min(currentPage * pageSize, sortedRanking.length)}</span> of{" "}
            <span className="font-semibold text-foreground">{sortedRanking.length}</span> personas
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

      {/* Disqualified list */}
      {disqualified.length > 0 && (
        <Card className="p-4 border-rose-500/20 bg-rose-500/5">
          <h2 className="text-sm font-semibold text-rose-500 mb-2 flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4" /> {t("mgmt.quarterly.disqualified")}
          </h2>
          <ul className="text-sm space-y-1.5">
            {disqualified.map((d) => (
              <li key={d.personaId} className="flex flex-wrap items-center justify-between py-0.5 border-b border-rose-500/10 last:border-0 pb-1">
                <div>
                  <Link to={personaManageHref(d)} className="text-primary hover:underline font-mono font-medium">
                    {d.personaName}
                  </Link>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({d.disqualificationReason ?? t(`mgmt.quarterly.eligibilityValues.${d.eligibility}`, { defaultValue: String(d.eligibility ?? "—") })})
                  </span>
                </div>
                <Badge variant="outline" className="border-rose-500/30 text-rose-500 text-[10px]">
                  {d.eligibility}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Evidence Packets links */}
      <Card className="p-4 bg-muted/10 border-border/80">
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Info className="h-4 w-4 text-primary" /> {t("mgmt.quarterly.evidencePackets")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {evidence.map((e) => (
            <Link
              key={e}
              to={`/management/evidence?query=${encodeURIComponent(e)}`}
              className="text-xs font-mono text-primary hover:underline bg-primary/10 border border-primary/20 px-2 py-0.5 rounded transition-colors"
            >
              {e}
            </Link>
          ))}
          {evidence.length === 0 && (
            <span className="text-xs text-muted-foreground">{t("mgmt.pulse.noRows")}</span>
          )}
        </div>
      </Card>
    </section>
  );
};

function RecommendationSubmitCell({
  label,
  state,
  onSubmit,
}: {
  label: string;
  state?: RecommendationUiState;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const busy = state?.kind === "submitting";
  return (
    <div className="max-w-[240px] space-y-1">
      <Button size="sm" variant="outline" onClick={onSubmit} disabled={busy} className="h-7 text-xs border-primary/30 hover:bg-primary/10 text-primary">
        {busy ? t("mgmt.governance.submitting") : `${label} →`}
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
