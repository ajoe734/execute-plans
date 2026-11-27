// Strategy Detail — Spec Part 3 §6 (11 tabs).
// Overview · Spec & Parameters · Experiments · Paper-Live · Risk & Alerts ·
// Incidents · Artifacts · Evolution · Governance · Lineage · Audit
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { canonicalCenterUrl } from "@/management/navigation/managementRouteManifest";
import { tradeJourneyHref } from "@/management/navigation/tradeJourneyLinks";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/platform/components/StatCard";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { DataTable } from "@/platform/components/DataTable";
import { StatusBadge } from "@/platform/components/StatusBadge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { bffWrites } from "@/lib/bff-v1/writes";
import { bffV1, highlightLineageNodesForRoot, managementConsoleReads, runActionSafe, type LineageRead } from "@/lib/bff-v1";
import { useLiveDetail } from "@/lib/bff-v1/useLiveDetail";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";
import { useT } from "@/platform/hooks";
import type { Strategy, AuditEvent, ApprovalRequest, Alert, Incident, Artifact, EvolutionProgram, ResearchExperiment } from "@/lib/bff-v1";
import { Inbox, ArrowRight, CheckCircle2, AlertTriangle, FileText, Zap } from "lucide-react";
import { toast } from "sonner";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { usePermissions } from "@/lib/usePermissions";
import { LineageGraph, type LineageNode, type LineageEdge } from "@/platform/components/LineageGraph";
import { useInspector } from "@/platform/components/RightDrawer";
import { strategyMachine, type StrategyState } from "@/lib/stateMachines";
import { nextTransitions, type Transition } from "@/lib/stateMachines/types";
import { AuditTimeline } from "@/platform/components/AuditTimeline";
import { LifecycleStepper } from "@/platform/components/LifecycleStepper";
import { StrategyRulesList, StrategySpecTab } from "@/management/components/detail/StrategySpecTab";
import {
  actionLabel,
  normalizeStrategyOperationalStatus,
  normalizeStrategyRuntimeStatus,
  strategyDeploymentLabel,
  strategyLifecycleLabel,
  strategyMetricsReasonText,
  strategyOperationalStatusClass,
  strategyReviewLabel,
  strategyRuntimeReasonText,
  strategyRuntimeStatusClass,
} from "@/lib/enumLabels";
import { deriveStrategyTriple, lifecycleOf } from "@/lib/v4/strategyTripleDerive";
import { explainTripleViolation, validateStrategyTriple } from "@/lib/v4/strategyInvariants";
import { StrategyDataFeaturesTab } from "@/management/components/detail/StrategyDataFeaturesTab";
import { StrategyPerformanceTab } from "@/management/components/detail/StrategyPerformanceTab";
import { StrategyPaperLiveTab } from "@/management/components/detail/StrategyPaperLiveTab";
import { LinkedBlock } from "@/management/components/detail/LinkedBlock";
import type { Watcher, DecisionJournalEntry } from "@/lib/bff-v1";
import { Eye, BookOpen } from "lucide-react";
import { safeDateTime } from "@/lib/utils";
import { DiscoverySections } from "@/management/components/discovery/DiscoveryPanels";

type SectionLoadStatus = "loading" | "ready" | "unavailable";

type SecondarySectionKey =
  | "watchers"
  | "journal"
  | "experiments"
  | "alerts"
  | "incidents"
  | "artifacts"
  | "evolution"
  | "approvals"
  | "lineage"
  | "audit";

const OVERVIEW_SECTIONS: SecondarySectionKey[] = ["watchers", "journal"];
const EXPERIMENTS_SECTIONS: SecondarySectionKey[] = ["experiments"];
const RISK_SECTIONS: SecondarySectionKey[] = ["alerts"];
const INCIDENTS_SECTIONS: SecondarySectionKey[] = ["incidents"];
const ARTIFACTS_SECTIONS: SecondarySectionKey[] = ["lineage", "artifacts"];
const EVOLUTION_SECTIONS: SecondarySectionKey[] = ["evolution"];
const GOVERNANCE_SECTIONS: SecondarySectionKey[] = ["approvals"];
const LINEAGE_SECTIONS: SecondarySectionKey[] = ["lineage"];
const AUDIT_SECTIONS: SecondarySectionKey[] = ["audit"];

function TabSectionLoader({
  sections,
  ensureLoaded,
  children,
}: {
  sections: SecondarySectionKey[];
  ensureLoaded: (keys: SecondarySectionKey[]) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    ensureLoaded(sections);
  }, [ensureLoaded, sections]);
  return <>{children}</>;
}

interface SectionState<T> {
  status: SectionLoadStatus;
  data: T;
  entityId?: string;
}

function beginSectionLoad<T>(
  prev: SectionState<T>,
  entityId: string,
  emptyFallback: T,
): SectionState<T> {
  if (prev.entityId === entityId && prev.status === "ready") {
    return prev;
  }
  return { status: "loading", data: emptyFallback, entityId };
}

function isLineageUnavailable(lin: LineageRead | null | undefined): boolean {
  if (!lin) return true;
  if (lin.meta?.status === "unavailable") return true;
  const surfaces = lin.meta?.surfaces as Record<string, { status?: string } | undefined> | undefined;
  return surfaces?.lineage?.status === "unavailable";
}

function isStrategyPayloadUnavailable(strat: Strategy | null | undefined): boolean {
  if (!strat || typeof strat !== "object") return false;
  const record = strat as unknown as {
    status?: unknown;
    meta?: {
      status?: unknown;
      surfaces?: Record<string, { status?: unknown } | undefined>;
    };
  };
  if (record.status === "unavailable" || record.meta?.status === "unavailable") {
    return true;
  }
  const surfaces = record.meta?.surfaces;
  return (
    surfaces?.strategy?.status === "unavailable" ||
    surfaces?.strategies?.status === "unavailable" ||
    surfaces?.strategies_detail?.status === "unavailable"
  );
}

export const StrategyDetail = () => {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const location = useLocation();
  const { can } = usePermissions();
  const [auditState, setAuditState] = useState<SectionState<AuditEvent[]>>({ status: "loading", data: [] });
  const [approvalsState, setApprovalsState] = useState<SectionState<ApprovalRequest[]>>({ status: "loading", data: [] });
  const [alertsState, setAlertsState] = useState<SectionState<Alert[]>>({ status: "loading", data: [] });
  const [incidentsState, setIncidentsState] = useState<SectionState<Incident[]>>({ status: "loading", data: [] });
  const [artifactsCatalogState, setArtifactsCatalogState] = useState<SectionState<Artifact[]>>({ status: "loading", data: [] });
  const [experimentsState, setExperimentsState] = useState<SectionState<ResearchExperiment[]>>({ status: "loading", data: [] });
  const [evolutionsState, setEvolutionsState] = useState<SectionState<EvolutionProgram[]>>({ status: "loading", data: [] });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTr, setActiveTr] = useState<Transition<StrategyState> | null>(null);
  const [watchersState, setWatchersState] = useState<SectionState<Watcher[]>>({ status: "loading", data: [] });
  const [journalState, setJournalState] = useState<SectionState<DecisionJournalEntry[]>>({ status: "loading", data: [] });
  const [lineageState, setLineageState] = useState<SectionState<LineageRead | null>>({ status: "loading", data: null });
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [primaryLoadSeq, setPrimaryLoadSeq] = useState(0);

  const secondaryReqIdRef = useRef(0);
  const mountedRef = useRef(true);
  const lastLoadedStrategyRef = useRef<Strategy | undefined>(undefined);
  const loadedSectionsRef = useRef<{
    entityId: string;
    seq: number;
    sections: Set<SecondarySectionKey>;
  }>({ entityId: "", seq: -1, sections: new Set() });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      secondaryReqIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    secondaryReqIdRef.current += 1;
    lastLoadedStrategyRef.current = undefined;
    loadedSectionsRef.current = { entityId: id ?? "", seq: -1, sections: new Set() };
    setLoadErrors([]);
    setPrimaryLoadSeq(0);
    setAuditState({ status: "loading", data: [] });
    setApprovalsState({ status: "loading", data: [] });
    setAlertsState({ status: "loading", data: [] });
    setIncidentsState({ status: "loading", data: [] });
    setArtifactsCatalogState({ status: "loading", data: [] });
    setExperimentsState({ status: "loading", data: [] });
    setEvolutionsState({ status: "loading", data: [] });
    setWatchersState({ status: "loading", data: [] });
    setJournalState({ status: "loading", data: [] });
    setLineageState({ status: "loading", data: null });
  }, [id]);

  const { data: s, setData: setS, loading, isError, notFound } = useLiveDetail<Strategy>(
    id,
    async (entityId) => {
      try {
        const strat = await bffV1.strategies.get(entityId);
        if (isStrategyPayloadUnavailable(strat)) {
          throw new Error("Strategy unavailable");
        }
        lastLoadedStrategyRef.current = strat;
        if (mountedRef.current) {
          secondaryReqIdRef.current += 1;
          setLoadErrors([]);
          setPrimaryLoadSeq((seq) => seq + 1);
        }
        return strat;
      } catch (err) {
        if (lastLoadedStrategyRef.current && lastLoadedStrategyRef.current.id === entityId) {
          return lastLoadedStrategyRef.current;
        }
        secondaryReqIdRef.current += 1;
        throw err;
      }
    },
    { kinds: ["strategies"] },
  );

  const activeEntityId = id?.trim() || s?.id;
  const ensureSectionsLoaded = useCallback(
    (keys: SecondarySectionKey[]) => {
      if (!s || !activeEntityId || primaryLoadSeq <= 0) return;
      if (
        loadedSectionsRef.current.entityId !== activeEntityId ||
        loadedSectionsRef.current.seq !== primaryLoadSeq
      ) {
        loadedSectionsRef.current = {
          entityId: activeEntityId,
          seq: primaryLoadSeq,
          sections: new Set(),
        };
      }
      const seen = loadedSectionsRef.current.sections;
      const toStart = keys.filter((k) => !seen.has(k));
      if (toStart.length === 0) return;
      for (const k of toStart) {
        seen.add(k);
      }

      const entityId = activeEntityId;
      const reqId = secondaryReqIdRef.current;
      const isCurrent = () => mountedRef.current && secondaryReqIdRef.current === reqId;
      const recordFailure = (label: string) => {
        if (!isCurrent()) return;
        setLoadErrors((prev) => (prev.includes(label) ? prev : [...prev, label]));
      };

      for (const key of toStart) {
        switch (key) {
          case "watchers":
            setWatchersState((prev) => beginSectionLoad(prev, entityId, []));
            bffV1.watchers.forSubject("Strategy", entityId).then(
              (w) => {
                if (!isCurrent()) return;
                setWatchersState({
                  status: "ready",
                  data: Array.isArray(w) ? w : [],
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                recordFailure("Watchers");
                setWatchersState({ status: "unavailable", data: [], entityId });
              },
            );
            break;
          case "journal":
            setJournalState((prev) => beginSectionLoad(prev, entityId, []));
            bffV1.decisionJournal.forSubject("Strategy", entityId).then(
              (dj) => {
                if (!isCurrent()) return;
                setJournalState({
                  status: "ready",
                  data: Array.isArray(dj) ? dj : [],
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                recordFailure("Decision journal");
                setJournalState({ status: "unavailable", data: [], entityId });
              },
            );
            break;
          case "experiments":
            setExperimentsState((prev) => beginSectionLoad(prev, entityId, []));
            bffV1.research.list().then(
              (ex) => {
                if (!isCurrent()) return;
                const rows = Array.isArray(ex) ? ex : [];
                setExperimentsState({
                  status: "ready",
                  data: rows.slice(0, 6),
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                recordFailure("Research");
                setExperimentsState({ status: "unavailable", data: [], entityId });
              },
            );
            break;
          case "alerts":
            setAlertsState((prev) => beginSectionLoad(prev, entityId, []));
            bffV1.alerts.list().then(
              (al) => {
                if (!isCurrent()) return;
                const rows = Array.isArray(al) ? al : [];
                setAlertsState({
                  status: "ready",
                  data: rows.filter(
                    (x) =>
                      x.relatedTarget === entityId ||
                      (x.source ?? "").includes(entityId) ||
                      (x.title ?? "").includes(entityId),
                  ),
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                recordFailure("Alerts");
                setAlertsState({ status: "unavailable", data: [], entityId });
              },
            );
            break;
          case "incidents":
            setIncidentsState((prev) => beginSectionLoad(prev, entityId, []));
            bffV1.incidents.list().then(
              (inc) => {
                if (!isCurrent()) return;
                const rows = Array.isArray(inc) ? inc : [];
                setIncidentsState({
                  status: "ready",
                  data: rows.filter((x) => x.affected?.includes(entityId)),
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                recordFailure("Incidents");
                setIncidentsState({ status: "unavailable", data: [], entityId });
              },
            );
            break;
          case "artifacts":
            setArtifactsCatalogState((prev) => beginSectionLoad(prev, entityId, []));
            bffV1.artifacts.list().then(
              (ar) => {
                if (!isCurrent()) return;
                setArtifactsCatalogState({
                  status: "ready",
                  data: Array.isArray(ar) ? ar : [],
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                recordFailure("Artifacts");
                setArtifactsCatalogState({ status: "unavailable", data: [], entityId });
              },
            );
            break;
          case "evolution":
            setEvolutionsState((prev) => beginSectionLoad(prev, entityId, []));
            bffV1.evolution.list().then(
              (ev) => {
                if (!isCurrent()) return;
                setEvolutionsState({
                  status: "ready",
                  data: Array.isArray(ev) ? ev : [],
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                recordFailure("Evolution");
                setEvolutionsState({ status: "unavailable", data: [], entityId });
              },
            );
            break;
          case "approvals":
            setApprovalsState((prev) => beginSectionLoad(prev, entityId, []));
            bffV1.approvals.list().then(
              (ap) => {
                if (!isCurrent()) return;
                const rows = Array.isArray(ap) ? ap : [];
                setApprovalsState({
                  status: "ready",
                  data: rows.filter((x) => (x.subject ?? "").includes(entityId)),
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                recordFailure("Approvals");
                setApprovalsState({ status: "unavailable", data: [], entityId });
              },
            );
            break;
          case "lineage":
            setLineageState((prev) => beginSectionLoad(prev, entityId, null));
            managementConsoleReads.lineage(entityId).then(
              (lin) => {
                if (!isCurrent()) return;
                const unavailable = isLineageUnavailable(lin);
                setLineageState({
                  status: unavailable ? "unavailable" : "ready",
                  data: unavailable ? null : lin,
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                setLineageState({ status: "unavailable", data: null, entityId });
              },
            );
            break;
          case "audit":
            setAuditState((prev) => beginSectionLoad(prev, entityId, []));
            bffV1.audit.list().then(
              (a) => {
                if (!isCurrent()) return;
                const rows = Array.isArray(a) ? a : [];
                setAuditState({
                  status: "ready",
                  data: rows.filter((x) => x.target === entityId || (x.target ?? "").includes(entityId)),
                  entityId,
                });
              },
              () => {
                if (!isCurrent()) return;
                recordFailure("Audit");
                setAuditState({ status: "unavailable", data: [], entityId });
              },
            );
            break;
        }
      }
    },
    [activeEntityId, primaryLoadSeq, s],
  );

  const machineState: StrategyState = useMemo(() => {
    if (!s) return "discovered";
    // Pack C C008: derive lifecycle bucket from canonical triple (or legacy fallback).
    const lc = lifecycleOf(s);
    // strategyMachine still uses v3 lifecycle vocabulary — these names already align.
    return lc as StrategyState;
  }, [s]);

  const transitions = useMemo(
    () => nextTransitions(strategyMachine, machineState).filter((tr) => can(tr.action)),
    [machineState, can],
  );

  if (loading && !s) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;
  if (!s) {
    if (notFound) return <div role="alert" className="p-6">{t("mgmt.strategy.detailNotFound", { id })}</div>;
    return <div role="alert" className="p-6">{isError || loadErrors.includes("Strategy") ? "Strategy could not be loaded." : t("mgmt.strategy.detailNotFound", { id })}</div>;
  }

  const artifactsSectionStatus: SectionLoadStatus =
    artifactsCatalogState.status === "unavailable" || lineageState.status === "unavailable"
      ? "unavailable"
      : artifactsCatalogState.status === "loading" || lineageState.status === "loading"
        ? "loading"
        : "ready";
  const artifacts: Artifact[] = (() => {
    if (artifactsSectionStatus !== "ready") return [];
    const relatedArtifactIds = new Set(
      (lineageState.data?.nodes ?? []).filter((n) => n.type === "Artifact").map((n) => n.id),
    );
    return artifactsCatalogState.data.filter((a) => relatedArtifactIds.has(a.id));
  })();
  const evolutions =
    evolutionsState.status === "ready"
      ? evolutionsState.data.filter((e) => e.parentAlpha === s.alpha)
      : [];

  const paperLive: { metric: string; paper: string; live: string; delta: string }[] = [];
  const noData = t("common.noData");
  const normalizedOperationalStatus = normalizeStrategyOperationalStatus(s.operationalStatus);
  const boundPersonaEntries: Array<{ personaId: string; state: string }> =
    Array.isArray(s.personaStates) && s.personaStates.length > 0
      ? s.personaStates
          .filter((item) => item && typeof item.personaId === "string" && item.personaId.trim().length > 0)
          .map((item) => ({
            personaId: item.personaId.trim(),
            state: typeof item.state === "string" ? item.state.trim() : "",
          }))
      : (s.personaIds ?? [])
          .map((pid) => String(pid).trim())
          .filter(Boolean)
          .map((personaId) => ({ personaId, state: "" }));
  const personaDisplayNames = s.persona_display_names ?? {};
  const isStub = s.is_synthetic_or_stub === true;
  const stubReasonRaw = typeof s.stub_reason === "string" ? s.stub_reason.trim() : "";
  const stubReasonText = stubReasonRaw
    ? t(`strategyDetail.stubReason.${stubReasonRaw}`, { defaultValue: stubReasonRaw.replace(/_/g, " ") })
    : t("strategyDetail.stubReason.unspecified");
  const openSpecTab = () => {
    const trigger = document.querySelector<HTMLElement>('[role="tab"][id$="-trigger-spec"]');
    if (!trigger) return;
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, ctrlKey: false }));
    trigger.focus();
  };
  const joinList = (v: string[] | string | undefined | null): string =>
    (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map((x) => String(x).trim()).filter(Boolean).join(", ");
  const specScope = s.spec?.market_scope;
  const specMeta = s.spec?.metadata;
  const universeParts = [
    specMeta?.market ? `${specMeta.market}` : "",
    joinList(specMeta?.traits?.instruments) || joinList(specScope?.universe) || joinList(specScope?.symbols) || joinList(specScope?.markets) || joinList(s.symbols),
  ].filter(Boolean);
  const universeDisplay = universeParts.join(" · ") || noData;
  const execModeDisplay =
    s.spec?.execution_profile?.execution_mode_hint?.trim() ||
    s.spec?.execution_profile?.mode?.trim() ||
    specMeta?.execution_context?.trim() ||
    noData;
  const benchmarkName = s.spec?.evaluation_plan?.benchmark?.trim() || "";
  const alphaRaw = s.alpha?.trim() || "";
  const alphaDisplay = alphaRaw || noData;
  const poolIdRaw = s.capitalPoolId?.trim() || "";
  const poolDisplay = poolIdRaw || noData;
  const firstPersonaDisplayName = boundPersonaEntries
    .map((entry) => personaDisplayNames[entry.personaId]?.trim())
    .find(Boolean);
  const poolPrimaryLabel = poolIdRaw
    ? firstPersonaDisplayName
      ? t("strategyDetail.capitalPool.forPersona", { persona: firstPersonaDisplayName })
      : t("strategyDetail.capitalPool.bound")
    : noData;
  const ownerIsBoundPersona = Boolean(
    s.owner && boundPersonaEntries.some((entry) => entry.personaId === s.owner.trim()),
  );
  const headerObject = {
    ...s,
    owner: (s.owner && personaDisplayNames[s.owner]?.trim()) || s.owner,
  };

  const rawPnl = s.pnl;
  const hasPnl = typeof rawPnl === "number" && Number.isFinite(rawPnl);
  const rawDrawdown = s.drawdown;
  const hasDrawdown = typeof rawDrawdown === "number" && Number.isFinite(rawDrawdown);
  const rawTotalTrades = s.totalTrades ?? s.total_trades;
  const hasTotalTrades = typeof rawTotalTrades === "number" && Number.isFinite(rawTotalTrades);
  const metricsAsOfText = (s.metricsAsOf ?? s.metrics_as_of)?.trim() || "";
  const missingMetricReason = strategyMetricsReasonText(s.metricsReason ?? s.metrics_reason, t);
  const runtimeStatus = normalizeStrategyRuntimeStatus(s.runtimeStatus ?? s.runtime_status);
  const runtimeReason = strategyRuntimeReasonText(s.runtimeStatusReason ?? s.runtime_status_reason, t);
  const personaStageFallbackReason =
    !runtimeReason &&
    runtimeStatus === "none" &&
    normalizedOperationalStatus &&
    normalizedOperationalStatus !== "running"
      ? t(`strategy.operationalStatus.${normalizedOperationalStatus}`)
      : undefined;
  const runtimeReasonText = runtimeReason?.text ?? personaStageFallbackReason;
  const pnlTone = !hasPnl || rawPnl === 0 ? "default" : rawPnl > 0 ? "success" : "danger";
  const drawdownTone = !hasDrawdown || rawDrawdown === 0 ? "default" : "warning";
  const runtimeTone: "default" | "warning" | "danger" | "success" =
    runtimeStatus === "running"
      ? "success"
      : runtimeStatus === "paused_market_input" ||
          runtimeStatus === "paused_operator" ||
          runtimeStatus === "unknown"
        ? "warning"
        : "default";

  const hasPoolRule =
    Array.isArray(s.rules) &&
    s.rules.some((r) => r && (r.role === "pool_envelope" || r.role === "pool_member"));
  const runsThroughPersonaPool =
    !isStub &&
    (Boolean(poolIdRaw) ||
      hasPoolRule ||
      (boundPersonaEntries.length > 0 &&
        (runtimeStatus === "running" ||
          runtimeStatus === "paused_market_input" ||
          runtimeStatus === "paused_operator" ||
          normalizedOperationalStatus === "running")));

  const triple = deriveStrategyTriple({
    state: s.state,
    lifecycleStatus: s.lifecycleStatus as string | undefined,
    reviewStatus: s.reviewStatus as string | undefined,
    deploymentStatus: s.deploymentStatus as string | undefined,
  });
  const tripleValid = validateStrategyTriple(triple);
  const tripleViolation = tripleValid ? null : explainTripleViolation(triple);
  const lifecycleCls: Record<string, string> = {
    discovered: "bg-muted text-muted-foreground border-border",
    scaffolded: "bg-muted text-muted-foreground border-border",
    replicated: "bg-accent/15 text-accent border-accent/30",
    approved: "bg-status-success/15 text-status-success border-status-success/30",
    paper: "bg-status-running/15 text-status-running border-status-running/30",
    live: "bg-status-success/15 text-status-success border-status-success/30",
    degraded: "bg-status-warning/15 text-status-warning border-status-warning/30",
    retired: "bg-muted text-muted-foreground border-border",
  };
  const reviewCls: Record<string, string> = {
    none: "bg-muted text-muted-foreground border-border",
    pending: "bg-status-warning/15 text-status-warning border-status-warning/30",
    changes_requested: "bg-status-warning/15 text-status-warning border-status-warning/30",
    approved: "bg-status-success/15 text-status-success border-status-success/30",
  };
  const deployCls: Record<string, string> = {
    none: runsThroughPersonaPool
      ? "bg-status-running/15 text-status-running border-status-running/30"
      : "bg-muted text-muted-foreground border-border",
    paper_running: "bg-status-running/15 text-status-running border-status-running/30",
    live_running: "bg-status-success/15 text-status-success border-status-success/30",
    stopped: "bg-muted text-muted-foreground border-border",
    rollback_required: "bg-status-failed/15 text-status-failed border-status-failed/30",
  };

  return (
    <>
      {loadErrors.length > 0 && <div role="alert" className="px-6 py-3 text-sm text-status-warning">Some strategy data could not be loaded: {loadErrors.join(", ")}.</div>}
      <ObjectDetailLayout
        object={headerObject}
        headerOmit={{ owner: ownerIsBoundPersona }}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => useInspector.getState().open({
              id: s.id, type: "Strategy", name: s.name, state: s.state, risk: s.risk,
              owner: s.owner, updatedAt: s.updatedAt, availableActions: s.availableActions,
              meta: [{ label: t("nav.capital"), value: poolDisplay }],
            })}>
              <Inbox className="h-4 w-4 mr-1" />{t("strategyDetail.actions.inspect")}
            </Button>
            <NonProductionActionButton
              size="sm"
              variant="outline"
              reason={t("strategyDetail.actions.disabledReason.sweep")}
            >
              <Zap className="h-4 w-4 mr-1" />{t("strategy.sweep.run")}
            </NonProductionActionButton>
            {transitions.map((tr) => (
              <NonProductionActionButton
                key={tr.action}
                size="sm"
                variant={tr.risk === "critical" || tr.risk === "high" ? "default" : "outline"}
                reason={t("strategyDetail.actions.disabledReason.transition")}
              >
                {actionLabel(tr.action, t)}
              </NonProductionActionButton>
            ))}
            <span
              data-testid="strategy-actions-disabled-reason"
              className="text-xs text-muted-foreground"
            >
              {t("strategyDetail.actions.readOnlyHint")}
            </span>
          </>
        }
        tabs={[
          // ── 1. Overview ──
          {
            value: "overview", label: t("section.overview"),
            content: (
              <TabSectionLoader sections={OVERVIEW_SECTIONS} ensureLoaded={ensureSectionsLoaded}>
                {isStub && (
                  <div
                    role="note"
                    data-testid="strategy-stub-banner"
                    className="mb-4 rounded-md border border-status-warning/40 bg-status-warning/10 p-3 text-sm"
                  >
                    <div className="font-medium text-status-warning">{t("strategyDetail.stubBanner.title")}</div>
                    <div className="mt-1 text-muted-foreground" data-testid="strategy-stub-reason">
                      {t("strategyDetail.stubBanner.body", { reason: stubReasonText })}
                    </div>
                  </div>
                )}
                {!isStub && (
                  <Section title={t("strategyDetail.rulesSummary.title")}>
                    <div data-testid="strategy-rules-summary" className="space-y-2">
                      <StrategyRulesList rules={s.rules} variant="summary" />
                      <button
                        type="button"
                        onClick={openSpecTab}
                        data-testid="strategy-rules-summary-spec-link"
                        className="text-xs text-primary hover:underline"
                      >
                        {t("strategyDetail.rulesSummary.viewSpec")}
                      </button>
                    </div>
                  </Section>
                )}
                <DiscoverySections record={s} testId="strategy-discovery" />
                <Section>
                  <div className="mb-4 space-y-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("lifecycle.title")}</div>
                    <LifecycleStepper machine={strategyMachine} current={machineState} i18nPrefix="lifecycle.strategy" />
                    <div
                      data-testid="strategy-overview-operational-status"
                      className="grid gap-3 rounded-md border border-border/70 bg-muted/15 p-3 md:grid-cols-2"
                    >
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          {t("strategyDetail.operationalStatusLabel")}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {runtimeStatus ? (
                            <>
                              <Badge
                                variant="outline"
                                data-testid="strategy-detail-operational-status"
                                data-operational-status={normalizedOperationalStatus ?? runtimeStatus}
                                data-runtime-status={runtimeStatus}
                                className={strategyRuntimeStatusClass(runtimeStatus)}
                              >
                                {t(`strategy.runtimeStatus.${runtimeStatus}`)}
                              </Badge>
                              {runtimeReasonText && (
                                <span
                                  data-testid="strategy-overview-runtime-reason"
                                  title={runtimeReason ? `${runtimeReason.text} (${runtimeReason.code})` : undefined}
                                  className="text-xs text-muted-foreground"
                                >
                                  {runtimeReasonText}
                                </span>
                              )}
                            </>
                          ) : normalizedOperationalStatus ? (
                            <Badge
                              variant="outline"
                              data-testid="strategy-detail-operational-status"
                              data-operational-status={normalizedOperationalStatus}
                              className={strategyOperationalStatusClass(normalizedOperationalStatus)}
                            >
                              {t(`strategy.operationalStatus.${normalizedOperationalStatus}`)}
                            </Badge>
                          ) : (
                            <span
                              data-testid="strategy-detail-operational-status"
                              className="text-mono text-xs text-muted-foreground"
                            >
                              {noData}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1" data-testid="strategy-bound-personas">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          {t("strategyDetail.boundPersonasLabel")}
                        </div>
                        {boundPersonaEntries.length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            {t("strategy.operationalStatus.unbound")}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {boundPersonaEntries.map((entry) => (
                              <Link
                                key={entry.personaId}
                                to={`/management/personas/${entry.personaId}`}
                                data-testid={`strategy-bound-persona-${entry.personaId}`}
                                data-persona-state={entry.state || undefined}
                                className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-background px-2.5 py-1 text-xs hover:bg-muted/50"
                              >
                                {personaDisplayNames[entry.personaId] ? (
                                  <span className="flex flex-col leading-tight">
                                    <span
                                      className="text-primary underline-offset-2 hover:underline"
                                      data-testid={`strategy-bound-persona-name-${entry.personaId}`}
                                    >
                                      {personaDisplayNames[entry.personaId]}
                                    </span>
                                    <span className="text-mono text-[10px] text-muted-foreground">{entry.personaId}</span>
                                  </span>
                                ) : (
                                  <span className="flex flex-col leading-tight">
                                    <span className="text-primary underline-offset-2 hover:underline">
                                      {t("nav.personas")}
                                    </span>
                                    <span className="text-mono text-[10px] text-muted-foreground">{entry.personaId}</span>
                                  </span>
                                )}
                                {entry.state && (
                                  entry.state === "unknown" ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[11px] border-status-warning/40 text-status-warning"
                                    >
                                      {t("strategy.operationalStatus.unknown")}
                                    </Badge>
                                  ) : entry.state === "missing" ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[11px] border-status-warning/40 text-status-warning"
                                    >
                                      {t("strategyDetail.personaStateMissing")}
                                    </Badge>
                                  ) : (
                                    <StatusBadge state={entry.state} />
                                  )
                                )}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <Card className="p-3 space-y-2" data-testid="strategy-triple-state-card">
                      <div className="flex items-center justify-between">
                        <div className="text-xs tracking-wider text-muted-foreground">
                          {t("strategyDetail.tripleState.title")}
                        </div>
                        {tripleValid ? (
                          <span
                            data-testid="strategy-triple-invariant"
                            className="flex items-center gap-1 text-xs text-status-success"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> {t("strategyDetail.tripleState.invariantOk")}
                          </span>
                        ) : (
                          <span
                            data-testid="strategy-triple-invariant"
                            className="flex items-center gap-1 text-xs text-status-failed"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> {t("strategyDetail.tripleState.invariantViolated")}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-muted-foreground">{t("strategyDetail.tripleState.lifecycle")}</div>
                          <Badge
                            variant="outline"
                            data-testid="strategy-triple-lifecycle"
                            data-value={triple.lifecycleStatus}
                            className={lifecycleCls[triple.lifecycleStatus] ?? ""}
                          >
                            {strategyLifecycleLabel(triple.lifecycleStatus, t)}
                          </Badge>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-muted-foreground">{t("strategyDetail.tripleState.review")}</div>
                          <Badge
                            variant="outline"
                            data-testid="strategy-triple-review"
                            data-value={triple.reviewStatus}
                            className={reviewCls[triple.reviewStatus] ?? ""}
                          >
                            {strategyReviewLabel(triple.reviewStatus, t)}
                          </Badge>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[10px] text-muted-foreground">{t("strategyDetail.tripleState.deployment")}</div>
                          <Badge
                            variant="outline"
                            data-testid="strategy-triple-deployment"
                            data-value={
                              runsThroughPersonaPool && triple.deploymentStatus === "none"
                                ? "persona_pool"
                                : triple.deploymentStatus
                            }
                            className={deployCls[triple.deploymentStatus] ?? ""}
                          >
                            {strategyDeploymentLabel(triple.deploymentStatus, t, { runsThroughPersonaPool })}
                          </Badge>
                        </div>
                      </div>
                      {tripleViolation && (
                        <p className="text-xs text-status-failed">{tripleViolation}</p>
                      )}
                    </Card>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field
                      label={t("nav.capital")}
                      value={
                        poolIdRaw ? (
                          <div>
                            <div>{poolPrimaryLabel}</div>
                            <div
                              data-testid="strategy-capital-pool-id"
                              className="text-mono text-xs text-muted-foreground"
                            >
                              {poolIdRaw}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{noData}</span>
                        )
                      }
                    />
                  </div>
                </Section>
                <div
                  data-testid="strategy-performance-block"
                  className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4"
                >
                  <StatCard
                    label={t("strategyDetail.cumulativePaperPnl")}
                    value={
                      hasPnl ? (
                        rawPnl.toFixed(2)
                      ) : missingMetricReason ? (
                        <span
                          data-testid="strategy-result-missing"
                          data-metrics-reason={missingMetricReason.code}
                          title={missingMetricReason.code}
                        >
                          {missingMetricReason.text}
                        </span>
                      ) : (
                        noData
                      )
                    }
                    hint={metricsAsOfText ? t("strategyDetail.metricsAsOf", { asOf: metricsAsOfText }) : undefined}
                    tone={pnlTone}
                  />
                  <StatCard
                    label={t("table.drawdown")}
                    value={
                      hasDrawdown ? (
                        `${(rawDrawdown * 100).toFixed(2)}%`
                      ) : missingMetricReason ? (
                        <span
                          data-testid="strategy-drawdown-missing"
                          data-metrics-reason={missingMetricReason.code}
                          title={missingMetricReason.code}
                        >
                          {missingMetricReason.text}
                        </span>
                      ) : (
                        noData
                      )
                    }
                    tone={drawdownTone}
                  />
                  <StatCard
                    label={t("strategy.list.column.trades")}
                    value={
                      hasTotalTrades ? (
                        <span data-testid="strategy-trades">{rawTotalTrades}</span>
                      ) : (
                        <span
                          data-testid="strategy-trades"
                          title={missingMetricReason?.code}
                        >
                          {missingMetricReason ? missingMetricReason.text : noData}
                        </span>
                      )
                    }
                    hint={hasTotalTrades && rawTotalTrades === 0 && missingMetricReason ? missingMetricReason.text : undefined}
                    tone="default"
                  />
                  <StatCard
                    label={t("strategy.list.column.runtime")}
                    value={
                      runtimeStatus ? (
                        <span
                          data-testid="strategy-runtime-status"
                          data-runtime-status={runtimeStatus}
                          title={runtimeReason ? `${runtimeReason.text} (${runtimeReason.code})` : undefined}
                        >
                          {t(`strategy.runtimeStatus.${runtimeStatus}`)}
                          {runtimeReasonText && (
                            <span
                              data-testid="strategy-runtime-reason"
                              title={runtimeReason ? `${runtimeReason.text} (${runtimeReason.code})` : undefined}
                              className="mt-1 block font-sans text-xs font-normal text-muted-foreground"
                            >
                              {runtimeReasonText}
                            </span>
                          )}
                        </span>
                      ) : normalizedOperationalStatus ? (
                        <span
                          data-testid="strategy-runtime-status"
                          data-operational-status={normalizedOperationalStatus}
                        >
                          {t(`strategy.operationalStatus.${normalizedOperationalStatus}`)}
                        </span>
                      ) : (
                        <span data-testid="strategy-runtime-status">{noData}</span>
                      )
                    }
                    tone={runtimeTone}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2 mt-4">
                  <div
                    data-testid="strategy-watchers-section"
                    data-section-status={watchersState.status}
                  >
                    <LinkedBlock
                      icon={<Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                      title={t("phase13.strategy.linked.watchers")}
                      items={
                        watchersState.status === "ready"
                          ? watchersState.data.map((w) => ({ id: w.id, label: w.user, meta: safeDateTime(w.since, "date") }))
                          : []
                      }
                      emptyHint={
                        watchersState.status === "loading"
                          ? t("common.loading")
                          : watchersState.status === "unavailable"
                            ? t("strategyDetail.watchersUnavailable")
                            : t("empty.noResults")
                      }
                    />
                  </div>
                  <div
                    data-testid="strategy-journal-section"
                    data-section-status={journalState.status}
                  >
                    <LinkedBlock
                      icon={<BookOpen className="h-3.5 w-3.5 text-muted-foreground" />}
                      title={t("phase13.strategy.linked.journal")}
                      items={
                        journalState.status === "ready"
                          ? journalState.data
                              .slice(0, 4)
                              .map((d) => ({ id: d.id, label: d.title, meta: `${d.decidedBy} · ${safeDateTime(d.decidedAt, "date")}` }))
                          : []
                      }
                      emptyHint={
                        journalState.status === "loading"
                          ? t("common.loading")
                          : journalState.status === "unavailable"
                            ? t("strategyDetail.journalUnavailable")
                            : t("empty.noResults")
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button asChild variant="outline" size="sm">
                    <Link aria-label={`${s.id} trade journeys`} to={tradeJourneyHref(location, { strategyId: s.id }, `Strategy ${s.id}`)}>
                      {t("detail.tradeJourneys.viewTradeJourneys", { defaultValue: "View Trade Journeys" })} →
                    </Link>
                  </Button>
                </div>
              </TabSectionLoader>
            ),
          },

          // ── 2. Spec & Parameters (versioned + lock) ──
          {
            value: "spec", label: t("strategyDetail.spec"),
            content: (
              <>
                <Section title={t("strategyDetail.specTitle")}>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {alphaRaw ? t("strategyDetail.specBody", { alpha: alphaRaw }) : t("strategyDetail.specBodyNoAlpha")}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2">
                    <Field label={t("strategyDetail.universe")} value={universeDisplay} />
                    <Field label={t("strategyDetail.execMode")} value={execModeDisplay} />
                    <Field label={t("strategyDetail.benchmark")} value={benchmarkName || noData} />
                  </div>
                </Section>
                <StrategySpecTab strategy={s} />
              </>
            ),
          },
          { value: "dataFeatures", label: t("phase13.strategy.data.tab"), content: <StrategyDataFeaturesTab strategyId={s.id} /> },

          // ── v3 §13 — Costs & Slippage ──
          {
            value: "costs", label: t("strategyDetail.costsTab", { defaultValue: "Costs & Slippage" }),
            content: (
              <Section title={t("strategyDetail.costsTab", { defaultValue: "Costs & Slippage" })}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Avg fee (bps)" value="—" />
                  <StatCard label="Avg slippage (bps)" value="—" />
                  <StatCard label="Funding (30d)" value="—" />
                  <StatCard label="Borrow cost (30d)" value="—" />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  {t("common.awaitingData", { defaultValue: "No data yet" })}
                </p>
              </Section>
            ),
          },
          { value: "performance", label: t("phase13.strategy.perf.tab"), content: <StrategyPerformanceTab strategyId={s.id} benchmarkName={benchmarkName || undefined} /> },

          // ── 3. Experiments ──
          {
            value: "experiments", label: t("nav.experiments"),
            content: (
              <TabSectionLoader sections={EXPERIMENTS_SECTIONS} ensureLoaded={ensureSectionsLoaded}>
                <div
                  data-testid="strategy-experiments-section"
                  data-section-status={experimentsState.status}
                >
                  <DataTable<ResearchExperiment>
                    rows={experimentsState.status === "ready" ? experimentsState.data : []}
                    loading={experimentsState.status === "loading"}
                    loadingText={t("common.loading")}
                    onRowClick={(r) => nav(`/management/experiments/${r.experiment_id || r.id}`)}
                    columns={[
                      { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.experiment_id || r.id}</span> },
                      { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.experiment_name || r.name}</div> },
                      { key: "hyp", header: t("strategyDetail.hypothesis"), cell: (r) => <span className="text-xs text-muted-foreground">{r.hypothesis}</span> },
                      { key: "metric", header: t("table.metric"), cell: (r) => <span className="text-mono text-xs">{r.metric}: {(r.metricValue ?? 0).toFixed(3)}</span> },
                      { key: "status", header: t("table.status"), cell: (r) => <StatusBadge state={r.status} /> },
                    ]}
                    empty={
                      experimentsState.status === "unavailable"
                        ? t("strategyDetail.experimentsUnavailable")
                        : t("empty.noResults")
                    }
                  />
                </div>
              </TabSectionLoader>
            ),
          },

          // ── 4. Paper-Live ──
          {
            value: "paperLive", label: t("strategyDetail.paperLive"),
            content: (
              <>
                <StrategyPaperLiveTab strategyId={s.id} />
                <Card className="overflow-hidden mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left p-3">{t("table.metric")}</th>
                        <th className="text-right p-3">{t("strategyDetail.paper")}</th>
                        <th className="text-right p-3">{t("strategyDetail.live")}</th>
                        <th className="text-right p-3">{t("section.changeSummary")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paperLive.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-xs text-muted-foreground">
                            {t("common.awaitingData", { defaultValue: "No comparison metrics available" })}
                          </td>
                        </tr>
                      ) : (
                        paperLive.map((row, i) => (
                          <tr key={i} className="border-b border-border/50 text-xs">
                            <td className="p-3 font-medium">{row.metric}</td>
                            <td className="p-3 text-right font-mono">{row.paper}</td>
                            <td className="p-3 text-right font-mono">{row.live}</td>
                            <td className="p-3 text-right font-mono text-muted-foreground">{row.delta}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Card>
                <div className="flex justify-end mt-4">
                  <Button asChild variant="outline" size="sm">
                    <Link to={canonicalCenterUrl("performance", "attribution", { strategy: s.id })}>
                      {t("strategyDetail.openFormalAttribution", { defaultValue: "View Formal Attribution" })} →
                    </Link>
                  </Button>
                </div>
              </>
            ),
          },

          // ── 5. Risk & Alerts ──
          {
            value: "risk", label: t("strategyDetail.riskAlerts"),
            content: (
              <TabSectionLoader sections={RISK_SECTIONS} ensureLoaded={ensureSectionsLoaded}>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label={t("strategyDetail.var95")} value="—" />
                  <StatCard label={t("strategyDetail.beta")} value="—" />
                  <StatCard label={t("strategyDetail.exposure")} value="—" />
                </div>
                <Section title={t("strategyDetail.activeAlerts")}>
                  <div
                    data-testid="strategy-alerts-section"
                    data-section-status={alertsState.status}
                  >
                    <DataTable<Alert>
                      rows={alertsState.status === "ready" ? alertsState.data : []}
                      loading={alertsState.status === "loading"}
                      loadingText={t("common.loading")}
                      columns={[
                        { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                        { key: "t", header: t("table.title"), cell: (r) => <div className="font-medium">{r.title}</div> },
                        { key: "src", header: t("table.source"), cell: (r) => <span className="text-mono text-xs">{r.source}</span> },
                        { key: "ts", header: t("table.opened"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.openedAt)}</span> },
                        { key: "act", header: "", cell: (r) => (
                          <div className="flex gap-1 justify-end">
                            {!r.acknowledged && (
                              <NonProductionActionButton size="sm" variant="ghost" reason={t("strategyDetail.actions.disabledReason.alertOrIncident")}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />{t("table_actions.acknowledge")}
                              </NonProductionActionButton>
                            )}
                            <NonProductionActionButton size="sm" variant="outline" reason={t("strategyDetail.actions.disabledReason.alertOrIncident")}>
                              <AlertTriangle className="h-3.5 w-3.5 mr-1" />{t("table_actions.escalateIncident")}
                            </NonProductionActionButton>
                          </div>
                        ) },
                      ]}
                      empty={
                        alertsState.status === "unavailable"
                          ? t("strategyDetail.alertsUnavailable")
                          : t("empty.noResults")
                      }
                    />
                  </div>
                </Section>
              </TabSectionLoader>
            ),
          },

          // ── 6. Incidents ──
          {
            value: "incidents", label: t("nav.incidents"),
            content: (
              <TabSectionLoader sections={INCIDENTS_SECTIONS} ensureLoaded={ensureSectionsLoaded}>
                <div
                  data-testid="strategy-incidents-section"
                  data-section-status={incidentsState.status}
                >
                  <DataTable<Incident>
                    rows={incidentsState.status === "ready" ? incidentsState.data : []}
                    loading={incidentsState.status === "loading"}
                    loadingText={t("common.loading")}
                    onRowClick={(r) => nav(`/management/incidents/${r.id}`)}
                    empty={
                      incidentsState.status === "unavailable"
                        ? t("strategyDetail.incidentsUnavailable")
                        : t("strategyDetail.noIncidents")
                    }
                    columns={[
                      { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
                      { key: "title", header: t("table.title"), cell: (r) => <div className="font-medium">{r.title}</div> },
                      { key: "st", header: t("table.status"), cell: (r) => <StatusBadge state={r.status === "resolved" ? "success" : r.status === "mitigating" ? "running" : "warning"} /> },
                      { key: "cmd", header: t("table.commander"), cell: (r) => <span className="text-mono text-xs">{r.commander ?? "—"}</span> },
                      { key: "ts", header: t("table.opened"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.openedAt)}</span> },
                      { key: "act", header: "", cell: (r) => (
                        <div className="flex gap-1 justify-end">
                          <NonProductionActionButton size="sm" variant="ghost" reason={t("strategyDetail.actions.disabledReason.alertOrIncident")}>
                            {r.status === "open" ? t("table_actions.startMitigation") : t("table_actions.resolve")}
                          </NonProductionActionButton>
                          <NonProductionActionButton size="sm" variant="outline" reason={t("strategyDetail.actions.disabledReason.alertOrIncident")}>
                            <FileText className="h-3.5 w-3.5 mr-1" />{t("incident.postmortem.add")}
                          </NonProductionActionButton>
                        </div>
                      ) },
                    ]}
                  />
                </div>
              </TabSectionLoader>
            ),
          },

          // ── 7. Artifacts ──
          {
            value: "artifacts", label: t("nav.artifacts"),
            content: (
              <TabSectionLoader sections={ARTIFACTS_SECTIONS} ensureLoaded={ensureSectionsLoaded}>
                <div
                  data-testid="strategy-artifacts-section"
                  data-section-status={artifactsSectionStatus}
                >
                  <DataTable<Artifact>
                    rows={artifacts}
                    loading={artifactsSectionStatus === "loading"}
                    loadingText={t("common.loading")}
                    onRowClick={(r) => nav(`/management/artifacts/${r.id}`)}
                    columns={[
                      { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
                      { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                      { key: "kind", header: t("table.kind"), cell: (r) => <Badge variant="outline" className="text-[10px]">{r.kind || noData}</Badge> },
                      { key: "ver", header: t("table.version"), cell: (r) => <span className="text-mono text-xs">{r.version || noData}</span> },
                      {
                        key: "size",
                        header: t("strategyDetail.size"),
                        cell: (r) => (
                          <span className="text-mono text-xs">
                            {typeof r.sizeMb === "number" && Number.isFinite(r.sizeMb)
                              ? `${r.sizeMb.toFixed(1)} MB`
                              : noData}
                          </span>
                        ),
                      },
                    ]}
                    empty={
                      artifactsSectionStatus === "unavailable"
                        ? t("strategyDetail.artifactsUnavailable")
                        : t("empty.noResults")
                    }
                  />
                </div>
              </TabSectionLoader>
            ),
          },

          // ── 8. Evolution ──
          {
            value: "evolution", label: t("nav.evolution"),
            content: (
              <TabSectionLoader sections={EVOLUTION_SECTIONS} ensureLoaded={ensureSectionsLoaded}>
                <div
                  data-testid="strategy-evolution-section"
                  data-section-status={evolutionsState.status}
                >
                  {evolutionsState.status === "loading" ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground" data-testid="strategy-evolution-loading">
                      {t("common.loading")}
                    </Card>
                  ) : evolutionsState.status === "unavailable" ? (
                    <Card className="p-8 text-center text-sm text-muted-foreground" data-testid="strategy-evolution-unavailable">
                      {t("strategyDetail.evolutionUnavailable")}
                    </Card>
                  ) : evolutions.length ? (
                    <DataTable<EvolutionProgram>
                      rows={evolutions}
                      onRowClick={(r) => nav(`/management/evolution/${r.id}`)}
                      columns={[
                        { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
                        { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
                        { key: "gen", header: t("strategyDetail.generation"), cell: (r) => <span className="text-mono text-xs">{r.generation}</span> },
                        { key: "fit", header: t("strategyDetail.bestFitness"), cell: (r) => <span className="text-mono text-xs">{(r.bestFitness ?? 0).toFixed(3)}</span> },
                        { key: "prog", header: t("table.progress"), cell: (r) => <span className="text-mono text-xs">{(r.progress * 100).toFixed(0)}%</span> },
                      ]}
                    />
                  ) : (
                    <Card className="p-8 text-center">
                      <div className="text-sm text-muted-foreground mb-3">{t("strategyDetail.noEvolution", { alpha: alphaDisplay })}</div>
                      <Button size="sm" variant="outline" onClick={() => nav("/management/evolution")}>
                        {t("strategyDetail.startEvolution")} <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Card>
                  )}
                </div>
              </TabSectionLoader>
            ),
          },

          // ── 9. Governance ──
          {
            value: "governance", label: t("nav.governance"),
            content: (
              <TabSectionLoader sections={GOVERNANCE_SECTIONS} ensureLoaded={ensureSectionsLoaded}>
                <div
                  data-testid="strategy-governance-section"
                  data-section-status={approvalsState.status}
                >
                  <DataTable<ApprovalRequest>
                    rows={approvalsState.status === "ready" ? approvalsState.data : []}
                    loading={approvalsState.status === "loading"}
                    loadingText={t("common.loading")}
                    onRowClick={(r) => nav(`/management/governance/${r.id}`)}
                    columns={[
                      { key: "kind", header: t("table.kind"), cell: (r) => <span className="text-mono text-xs">{r.kind}</span> },
                      { key: "subject", header: t("table.subject"), cell: (r) => <div className="font-medium">{r.subject}</div> },
                      { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.riskLevel} /> },
                      { key: "state", header: t("table.state"), cell: (r) => <StatusBadge state={r.state} /> },
                      { key: "req", header: t("table.requester"), cell: (r) => <span className="text-mono text-xs">{r.requester}</span> },
                    ]}
                    empty={
                      approvalsState.status === "unavailable"
                        ? t("strategyDetail.governanceUnavailable")
                        : t("strategyDetail.noGovernance")
                    }
                  />
                </div>
              </TabSectionLoader>
            ),
          },

          // ── 10. Lineage ──
          {
            value: "lineage", label: t("section.lineage"),
            content: (
              <TabSectionLoader sections={LINEAGE_SECTIONS} ensureLoaded={ensureSectionsLoaded}>
                <div
                  data-testid="strategy-lineage-section"
                  data-section-status={lineageState.status}
                >
                  {lineageState.status === "loading" ? (
                    <div
                      data-testid="strategy-lineage-loading"
                      className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
                    >
                      {t("common.loading")}
                    </div>
                  ) : lineageState.status === "unavailable" ? (
                    <div
                      data-testid="strategy-lineage-unavailable"
                      className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
                    >
                      {t("strategyDetail.lineageUnavailable")}
                    </div>
                  ) : (() => {
                    const nodes: LineageNode[] = highlightLineageNodesForRoot(
                      lineageState.data?.nodes ?? [],
                      s.id,
                    );
                    const nodeIds = new Set(nodes.map((node) => node.id));
                    const edges: LineageEdge[] = (lineageState.data?.edges ?? []).filter(
                      (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to),
                    );
                    return (
                      <LineageGraph nodes={nodes} edges={edges} onSelect={(n) => useInspector.getState().open({
                        id: n.id, type: n.type, name: n.display_name || n.label, state: n.state, risk: n.risk,
                      })} />
                    );
                  })()}
                </div>
              </TabSectionLoader>
            ),
          },

          // ── 11. Audit ──
          {
            value: "audit", label: t("nav.audit"),
            content: (
              <TabSectionLoader sections={AUDIT_SECTIONS} ensureLoaded={ensureSectionsLoaded}>
                <div
                  data-testid="strategy-audit-section"
                  data-section-status={auditState.status}
                >
                  <AuditTimeline
                    entries={auditState.status === "ready" ? auditState.data : []}
                    emptyText={
                      auditState.status === "loading"
                        ? t("common.loading")
                        : auditState.status === "unavailable"
                          ? t("strategyDetail.auditUnavailable")
                          : undefined
                    }
                  />
                </div>
              </TabSectionLoader>
            ),
          },
        ]}
      />

      {activeTr && (() => {
        // Map state-machine action → v3 dotted actionId for confirm-token flow.
        const v3ActionMap: Record<string, string> = {
          promote_paper: "strategy.promote_paper",
          promote_live: "strategy.deploy_live",
          rollback_to_paper: "strategy.rollback_live",
          retire_live: "strategy.retire",
          replace_strategy: "strategy.deploy_live",
        };
        const v3ActionId = v3ActionMap[activeTr.action];
        return (
          <HighRiskConfirm
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            operation={activeTr.action}
            target={{ type: "Strategy", id: s.id, name: s.name }}
            currentState={machineState}
            newState={activeTr.to}
            risk={activeTr.risk ?? "medium"}
            riskImpact={activeTr.requiresApproval ? "Requires approval before commit." : undefined}
            requiredApproval={activeTr.requiresApproval ? ["risk", "ops"] : undefined}
            rollbackTarget={activeTr.uiPattern === "rollback_modal" ? `${s.id}@previous` : undefined}
            affected={{ strategies: [s.id], capitalPools: [s.capitalPoolId], personas: s.personaIds }}
            destructive={activeTr.uiPattern === "destructive_modal"}
            actionId={v3ActionId}
            confirmEntity={v3ActionId ? { type: "strategy", id: s.id } : undefined}
            onConfirm={async (memo, token) => {
              const receipt = await runActionSafe({
                kind: "Strategy", id: s.id, action: activeTr.action,
                newState: ["paused", "deployed", "approved", "review", "draft", "retired"].includes(activeTr.to)
                  ? activeTr.to : undefined,
                memo,
              }, {
                confirmToken: token,
                successTitle: `${activeTr.action} requested`,
              });
              if (!receipt.ok) return;
              const fresh = await bffV1.strategies.get(s.id);
              if (fresh) setS(fresh);
              const a = await bffV1.audit.list();
              setAuditState({
                status: "ready",
                data: a.filter((x) => x.target === s.id),
                entityId: s.id,
              });
            }}
          />
        );
      })()}
    </>
  );
};
