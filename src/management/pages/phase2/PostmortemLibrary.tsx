// Canonical Postmortem Library — durable list/detail reads keyed by postmortem_id.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  postmortemClient,
  type PostmortemPageInfo,
  type PostmortemRecord,
  type PostmortemResponseMeta,
} from "@/lib/bff-v1/postmortemClient";
import {
  normalizeEnumKey,
  postmortemStatusLabel,
  resolveEnumLabel,
  type EnumCategory,
} from "@/lib/enumLabels";
import { safeDateTime } from "@/lib/utils";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { useT } from "@/platform/hooks";
import { Field } from "../ObjectDetailLayout";

type LoadStatus = "loading" | "ready" | "error";
type TFunc = ReturnType<typeof useT>;

const DEFAULT_PAGE_SIZE = 50;
const POSTMORTEM_STATUS_OPTIONS = ["draft", "review", "approved", "published"] as const;
const KEY_VALUE_TOKEN_RE = /\b[a-z][a-z0-9_]{2,}=[^\s;,]+/i;
const RAW_DRIFT_EVIDENCE_RE = /\b(?:drift:[a-z0-9_.:-]+|DriftReport\s+drift-[a-z0-9_.:-]+)\b/i;
const ENUM_LOOKUP_CATEGORIES: readonly EnumCategory[] = [
  "reason",
  "status",
  "outcome",
  "action",
  "risk",
  "lineageNodeType",
  "lineageEdge",
];

export interface ResolvedPostmortemToken {
  label: string;
  rawCode: string;
  isKnown: boolean;
}

export interface PostmortemTitleDisplay {
  primary: string;
  secondary?: string;
  isKnown: boolean;
}

export interface PostmortemFactorItem {
  key: string;
  primary: string;
  secondary?: string;
}

function stripPostmortemDraftPrefix(rawTitle: string): string {
  const trimmed = (rawTitle ?? "").trim();
  const withoutPrefix = trimmed
    .replace(/^postmortem\s+draft\s*:\s*/i, "")
    .replace(/^事後檢討草稿\s*[：:]\s*/, "")
    .trim();
  const withoutTrailingPmId = withoutPrefix.replace(/\s+\(pm-[a-z0-9_.-]+\)\s*$/i, "").trim();
  return withoutTrailingPmId || withoutPrefix || trimmed;
}

function lookupTranslatedKey(t: TFunc, i18nKey: string): string | null {
  const out = t(i18nKey, { defaultValue: "" });
  if (typeof out === "string" && out.trim() && out !== i18nKey) {
    return out.trim();
  }
  return null;
}

function extractDriftKindCandidate(rawToken: string): string {
  let clean = rawToken.trim();
  if (/^drift:/i.test(clean)) {
    clean = clean.slice("drift:".length).trim();
  }
  if (clean.includes(":")) {
    const parts = clean.split(":").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      clean = /^\d+$/.test(last) ? parts[parts.length - 2] : last;
    }
  }
  return normalizeEnumKey(clean);
}

/**
 * Resolves a drift metric/check/reason token (e.g. `drift:runtime_state`, `drawdown`,
 * `fill_price`, `duplicate_execution`, `queue_lag_ms`, or any enum-helper code) into
 * a localized plain label in zh-TW and en-US, marking unknown tokens `isKnown: false`.
 */
export function resolvePostmortemKindLabel(rawKindToken: string, t: TFunc): ResolvedPostmortemToken {
  const trimmed = (rawKindToken ?? "").trim();
  if (!trimmed) {
    return { label: "", rawCode: "", isKnown: false };
  }
  const key = extractDriftKindCandidate(trimmed);
  if (!key) {
    return { label: trimmed, rawCode: trimmed, isKnown: false };
  }

  const fromPostmortemKinds = lookupTranslatedKey(t, `postmortem.driftKinds.${key}`);
  if (fromPostmortemKinds) {
    return { label: fromPostmortemKinds, rawCode: trimmed, isKnown: true };
  }

  const fromJourneyChecks = lookupTranslatedKey(t, `tradeJourneys.checks.${key}`);
  if (fromJourneyChecks) {
    return { label: fromJourneyChecks, rawCode: trimmed, isKnown: true };
  }

  const fromJourneyFields = lookupTranslatedKey(t, `tradeJourneys.evidenceFields.${key}`);
  if (fromJourneyFields) {
    return { label: fromJourneyFields, rawCode: trimmed, isKnown: true };
  }

  if (key !== "unknown") {
    const fromJourneyReasons = lookupTranslatedKey(t, `tradeJourneys.reasons.${key}`);
    if (fromJourneyReasons) {
      return { label: fromJourneyReasons, rawCode: trimmed, isKnown: true };
    }
  }

  for (const category of ENUM_LOOKUP_CATEGORIES) {
    const resolved = resolveEnumLabel(category, key, t);
    if (resolved.isKnown) {
      return { label: resolved.label, rawCode: trimmed, isKnown: true };
    }
  }

  return { label: trimmed, rawCode: trimmed, isKnown: false };
}

export function resolvePostmortemServiceLabel(rawServiceToken: string, t: TFunc): ResolvedPostmortemToken {
  const trimmed = (rawServiceToken ?? "").trim();
  if (!trimmed) {
    return { label: "", rawCode: "", isKnown: false };
  }
  const key = normalizeEnumKey(trimmed);
  if (!key) {
    return { label: trimmed, rawCode: trimmed, isKnown: false };
  }
  const fromServices = lookupTranslatedKey(t, `postmortem.services.${key}`);
  if (fromServices) {
    return { label: fromServices, rawCode: trimmed, isKnown: true };
  }
  return { label: trimmed, rawCode: trimmed, isKnown: false };
}

/**
 * Formats a postmortem title into plain localized primary text and optional secondary
 * identifier/raw-kind text (binding id, service id, or unknown kind code).
 */
export function formatPostmortemTitle(
  rawTitle: string,
  t?: TFunc,
  fallbackBindingId?: string,
): PostmortemTitleDisplay {
  const core = stripPostmortemDraftPrefix(rawTitle);
  if (!t || !core) {
    return { primary: core, isKnown: true };
  }

  // 1. "Drift threshold breach: <kind> [for <bindingId>]" / "Threshold breach: <kind> [for <bindingId>]"
  const breachMatch = /^(drift\s+threshold\s+breach(?:ed)?|threshold\s+breach(?:ed)?)\s*:\s*(.+?)(?:\s+for\s+([A-Za-z0-9_.:@-]+))?$/i.exec(
    core,
  );
  if (breachMatch) {
    const isDrift = /^drift/i.test(breachMatch[1]) || /^drift:/i.test(breachMatch[2].trim());
    const rawKindToken = breachMatch[2].trim();
    const bindingId = (breachMatch[3]?.trim() || fallbackBindingId?.trim() || "") || undefined;
    const resolvedKind = resolvePostmortemKindLabel(rawKindToken, t);
    if (resolvedKind.isKnown) {
      const primary = t(
        isDrift
          ? "postmortem.titles.driftThresholdBreachWithKind"
          : "postmortem.titles.thresholdBreachWithKind",
        { kind: resolvedKind.label },
      );
      return { primary, secondary: bindingId, isKnown: true };
    }
    const primary = t(
      isDrift
        ? "postmortem.titles.driftThresholdBreachGeneric"
        : "postmortem.titles.thresholdBreachGeneric",
    );
    const secondary = [rawKindToken, bindingId].filter(Boolean).join(" · ") || undefined;
    return { primary, secondary, isKnown: false };
  }

  // 2. "[Paper vs live] Drift threshold breach(ed) on <target>"
  const onTargetMatch = /^(?:paper\s+vs\s+live\s+)?drift\s+threshold\s+breach(?:ed)?\s+on\s+(.+)$/i.exec(core);
  if (onTargetMatch) {
    const target = onTargetMatch[1].trim();
    return {
      primary: t("postmortem.titles.driftThresholdBreachOnTarget", { target }),
      secondary: fallbackBindingId?.trim() || undefined,
      isKnown: true,
    };
  }

  // 3. "<Paper|Canary|Live> reconciliation threshold breach [for <bindingId>]"
  const stageReconMatch = /^(paper|canary|live)\s+reconciliation\s+threshold\s+breach(?:ed)?(?:\s+for\s+([A-Za-z0-9_.:@-]+))?$/i.exec(
    core,
  );
  if (stageReconMatch) {
    const stageLabel = formatDeploymentStage(stageReconMatch[1], t);
    const bindingId = (stageReconMatch[2]?.trim() || fallbackBindingId?.trim() || "") || undefined;
    return {
      primary: t("postmortem.titles.reconciliationThresholdBreach", { stage: stageLabel }),
      secondary: bindingId,
      isKnown: true,
    };
  }

  // 4. "BFF downstream degradation[: <SERVICE>]" / "Infrastructure degradation[: <SERVICE>]" / "downstream degradation"
  const degradationMatch = /^(?:bff\s+downstream\s+degradation|infrastructure\s+degradation|downstream\s+degradation)(?:\s*:\s*(.+?)|\s+(#\d+))?$/i.exec(
    core,
  );
  if (degradationMatch) {
    if (degradationMatch[1]) {
      const rawService = degradationMatch[1].trim();
      const timeoutMatch = /^(.+?)\s+timeout$/i.exec(rawService);
      const serviceSlug = timeoutMatch ? timeoutMatch[1].trim() : rawService;
      const hasTimeout = Boolean(timeoutMatch);
      const resolvedService = resolvePostmortemServiceLabel(serviceSlug, t);
      if (resolvedService.isKnown) {
        const primary = t(
          hasTimeout
            ? "postmortem.titles.downstreamDegradationServiceTimeout"
            : "postmortem.titles.downstreamDegradationWithService",
          { service: resolvedService.label },
        );
        return { primary, secondary: rawService, isKnown: true };
      }
      return {
        primary: t("postmortem.titles.downstreamDegradationGeneric"),
        secondary: rawService,
        isKnown: false,
      };
    }
    return {
      primary: t("postmortem.titles.downstreamDegradationGeneric"),
      secondary: degradationMatch[2]?.trim() || undefined,
      isKnown: true,
    };
  }

  return { primary: core, isKnown: true };
}

/** Strip the automatic "Postmortem draft:" prefix and localize known drift/degradation titles. */
export function plainPostmortemTitle(
  rawTitle: string,
  t?: TFunc,
  fallbackBindingId?: string,
): string {
  return formatPostmortemTitle(rawTitle, t, fallbackBindingId).primary;
}

/** published_at when the record was published; otherwise created_at (never labelled as closed). */
function displayedAt(item: PostmortemRecord): { at: string; kind: "published" | "created" } {
  return item.published_at
    ? { at: item.published_at, kind: "published" }
    : { at: item.created_at, kind: "created" };
}

function listSurface(meta: PostmortemResponseMeta | undefined) {
  return meta?.surfaces?.postmortems;
}

function statusLabel(t: ReturnType<typeof useT>, rawStatus: string): string {
  return postmortemStatusLabel(rawStatus, t);
}

function formatDeploymentStage(stage: string | undefined, t: ReturnType<typeof useT>): string {
  const normalized = (stage ?? "").trim().toLowerCase();
  if (!normalized || normalized === "unavailable" || normalized === "unknown") {
    return t("common.notReported");
  }
  const translated = t(`postmortem.stages.${normalized}`, { defaultValue: "" });
  if (translated && translated !== `postmortem.stages.${normalized}`) {
    return translated;
  }
  return stage ?? t("common.notReported");
}

function formatPostmortemAuthors(authors: string[], t: ReturnType<typeof useT>): string {
  if (!authors || authors.length === 0) {
    return t("postmortem.unassigned");
  }
  return authors
    .map((author) => {
      const normalized = author.trim().toLowerCase().replace(/-/g, "_");
      if (normalized === "postmortem_draft_worker") {
        return t("postmortem.authors.postmortem_draft_worker");
      }
      return author;
    })
    .join(", ");
}

function formatPostmortemRowAuthors(authors: string[] | undefined): string {
  if (!authors || authors.length === 0) {
    return "";
  }
  const humanAuthors = authors
    .map((author) => author.trim())
    .filter((author) => {
      if (!author) return false;
      const normalized = author.toLowerCase().replace(/-/g, "_");
      return normalized !== "postmortem_draft_worker";
    });
  return humanAuthors.join(", ");
}

function formatPostmortemRootCause(rawRootCause: string | undefined, t: ReturnType<typeof useT>): string {
  const trimmed = (rawRootCause ?? "").trim();
  if (
    !trimmed ||
    /^draft generated from resolved incident\b.*;\s*root cause pending analysis\.?$/i.test(trimmed) ||
    /\broot cause pending analysis\.?$/i.test(trimmed)
  ) {
    return t("postmortem.rootCauseNotAnalysed");
  }
  const withoutMachinePrefix = trimmed.replace(/^draft generated from resolved incident\s+\S+\s*;\s*/i, "").trim();
  return withoutMachinePrefix || trimmed;
}

function formatSeverityValue(rawSeverity: string, t: ReturnType<typeof useT>): string {
  const key = rawSeverity.trim().toLowerCase();
  if (["info", "low", "medium", "high", "critical", "warning", "unavailable", "unknown"].includes(key)) {
    return t(`risk.${key}`, { defaultValue: rawSeverity });
  }
  return rawSeverity;
}

export function resolveClusterDisplay(rawCluster: string, t: TFunc): PostmortemTitleDisplay {
  const trimmed = (rawCluster ?? "").trim();
  const normalized = trimmed.toLowerCase();
  if (normalized.startsWith("drift:")) {
    const resolvedKind = resolvePostmortemKindLabel(trimmed, t);
    if (resolvedKind.isKnown) {
      return {
        primary: t("postmortem.clusters.driftWithKind", { kind: resolvedKind.label }),
        isKnown: true,
      };
    }
    return {
      primary: t("postmortem.clusters.driftGeneric"),
      secondary: trimmed,
      isKnown: false,
    };
  }
  if (normalized.startsWith("infrastructure:") || normalized.startsWith("infra-cluster:")) {
    return {
      primary: t("postmortem.clusters.infrastructure"),
      isKnown: true,
    };
  }
  const resolvedDirect = resolvePostmortemKindLabel(trimmed, t);
  if (resolvedDirect.isKnown) {
    return {
      primary: resolvedDirect.label,
      isKnown: true,
    };
  }
  return {
    primary: t("postmortem.clusters.unknown"),
    secondary: trimmed,
    isKnown: false,
  };
}

export function formatClusterValue(rawCluster: string, t: TFunc): string {
  return resolveClusterDisplay(rawCluster, t).primary;
}

function partitionContributingFactors(
  record: PostmortemRecord,
  t: TFunc,
): { visibleFactors: PostmortemFactorItem[]; rawKeyValues: string[] } {
  const visibleFactors: PostmortemFactorItem[] = [];
  const rawKeyValues: string[] = [];

  for (const rawFactor of record.contributing_factors ?? []) {
    const factor = rawFactor.trim();
    if (!factor) continue;
    const kvMatch = factor.match(/^([a-z][a-z0-9_]*)\s*=\s*(.*)$/i);
    if (kvMatch) {
      rawKeyValues.push(factor);
      const key = kvMatch[1].toLowerCase();
      const val = kvMatch[2].trim();
      if (key === "incident_severity" && val) {
        visibleFactors.push({
          key: factor,
          primary: t("postmortem.factors.incidentSeverity", { value: formatSeverityValue(val, t) }),
        });
      } else if (key === "incident_cluster_id" && val) {
        const clusterDisplay = resolveClusterDisplay(val, t);
        visibleFactors.push({
          key: factor,
          primary: t("postmortem.factors.incidentCluster", { value: clusterDisplay.primary }),
          secondary: clusterDisplay.secondary,
        });
      } else if (
        key === "incident_evidence_summary" &&
        val &&
        !KEY_VALUE_TOKEN_RE.test(val) &&
        !RAW_DRIFT_EVIDENCE_RE.test(val)
      ) {
        visibleFactors.push({
          key: factor,
          primary: t("postmortem.factors.evidenceSummary", { value: val }),
        });
      }
      continue;
    }

    if (/^(?:drift:|infrastructure:|infra-cluster:)/i.test(factor)) {
      rawKeyValues.push(factor);
      const clusterDisplay = resolveClusterDisplay(factor, t);
      visibleFactors.push({
        key: factor,
        primary: t("postmortem.factors.incidentCluster", { value: clusterDisplay.primary }),
        secondary: clusterDisplay.secondary,
      });
      continue;
    }

    if (KEY_VALUE_TOKEN_RE.test(factor) || RAW_DRIFT_EVIDENCE_RE.test(factor)) {
      rawKeyValues.push(factor);
      continue;
    }

    visibleFactors.push({ key: factor, primary: factor });
  }

  const evidenceSummary = (record.incident_evidence_summary ?? "").trim();
  if (
    evidenceSummary &&
    (KEY_VALUE_TOKEN_RE.test(evidenceSummary) || RAW_DRIFT_EVIDENCE_RE.test(evidenceSummary))
  ) {
    const kvLine = `incident_evidence_summary=${evidenceSummary}`;
    if (!rawKeyValues.includes(kvLine) && !rawKeyValues.includes(evidenceSummary)) {
      rawKeyValues.push(kvLine);
    }
  }

  return { visibleFactors, rawKeyValues };
}

function translatePostmortemAction(action: string, t: ReturnType<typeof useT>): string {
  const trimmed = action.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "complete root cause analysis" || lower === "complete root cause analysis.") {
    return t("postmortem.defaultActions.completeRootCause");
  }
  if (
    lower === "validate remediation against linked telemetry and reconciliation evidence" ||
    lower === "validate remediation against linked telemetry and reconciliation evidence."
  ) {
    return t("postmortem.defaultActions.validateRemediation");
  }
  return trimmed;
}

export const PostmortemLibraryPage = () => {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("item")?.trim() ?? "";
  const [items, setItems] = useState<PostmortemRecord[]>([]);
  const [pageInfo, setPageInfo] = useState<PostmortemPageInfo>();
  const [active, setActive] = useState<PostmortemRecord | null>(null);
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status")?.trim() ?? "");
  const [includeInfrastructure, setIncludeInfrastructure] = useState(
    () => searchParams.get("include_infrastructure") === "true",
  );
  const [pageToken, setPageToken] = useState(() => searchParams.get("page_token")?.trim() ?? "");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [listStatus, setListStatus] = useState<LoadStatus>("loading");
  const [detailStatus, setDetailStatus] = useState<"idle" | LoadStatus>("idle");
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [listMeta, setListMeta] = useState<PostmortemResponseMeta>();
  const [detailMeta, setDetailMeta] = useState<PostmortemResponseMeta>();
  const requestSeqRef = useRef(0);

  const loadList = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setListStatus("loading");
    setListError("");
    try {
      const result = await postmortemClient.list({
        page_size: DEFAULT_PAGE_SIZE,
        page_token: pageToken || undefined,
        q: q.trim() || undefined,
        status: statusFilter || undefined,
        ...(includeInfrastructure ? { include_infrastructure: true } : {}),
      });
      if (seq !== requestSeqRef.current) return;
      setItems(result.items);
      setPageInfo(result.page_info);
      setListMeta(result.meta);
      setListStatus("ready");
    } catch (error) {
      if (seq !== requestSeqRef.current) return;
      setItems([]);
      setPageInfo(undefined);
      setListStatus("error");
      setListError(error instanceof Error ? error.message : String(error));
    }
  }, [includeInfrastructure, pageToken, q, statusFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    let current = true;
    if (!selectedId) {
      setActive(null);
      setDetailMeta(undefined);
      setDetailError("");
      setDetailStatus("idle");
      return () => { current = false; };
    }

    setActive(null);
    setDetailStatus("loading");
    setDetailError("");
    postmortemClient.get(selectedId)
      .then((result) => {
        if (!current) return;
        setActive(result.item);
        setDetailMeta(result.meta);
        setDetailStatus("ready");
      })
      .catch((error: unknown) => {
        if (!current) return;
        setDetailStatus("error");
        setDetailError(error instanceof Error ? error.message : String(error));
      });
    return () => { current = false; };
  }, [selectedId]);

  const handleSearchChange = (value: string) => {
    setQ(value);
    setPageToken("");
    setCursorHistory([]);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPageToken("");
    setCursorHistory([]);
  };

  const handleToggleInfrastructure = () => {
    setIncludeInfrastructure((prev) => !prev);
    setPageToken("");
    setCursorHistory([]);
  };

  const goNextPage = () => {
    const nextToken = pageInfo?.next_page_token;
    if (!nextToken) return;
    setCursorHistory((prev) => [...prev, pageToken]);
    setPageToken(nextToken);
  };

  const goPreviousPage = () => {
    if (cursorHistory.length === 0) return;
    const prevToken = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((prev) => prev.slice(0, -1));
    setPageToken(prevToken);
  };

  const selectPostmortem = (item: PostmortemRecord) => {
    const next = new URLSearchParams(searchParams);
    next.set("item", item.postmortem_id);
    setSearchParams(next, { replace: true });
  };

  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("item");
    setSearchParams(next, { replace: true });
  };

  const surface = listSurface(listMeta);
  const listDegraded = Boolean(surface?.status && surface.status !== "ok");
  const surfaceUnavailable = surface?.status === "unavailable";
  const totalCount = pageInfo?.total ?? listMeta?.total ?? items.length;
  const nextPageToken = pageInfo?.next_page_token ?? null;
  const rawHiddenCount = listMeta?.hidden_infrastructure_count;
  const hasHiddenCount =
    typeof rawHiddenCount === "number" && Number.isFinite(rawHiddenCount) && rawHiddenCount >= 0;

  const toggleLabel = includeInfrastructure
    ? t("postmortem.hideSystemIncidents")
    : hasHiddenCount
      ? t("postmortem.showSystemIncidentsWithCount", { count: rawHiddenCount })
      : t("postmortem.showSystemIncidentsNoCount");

  const scopeNote = includeInfrastructure
    ? t("postmortem.showingSystemIncidents")
    : hasHiddenCount
      ? t("postmortem.strategyScopeWithHiddenCount", { count: rawHiddenCount })
      : t("postmortem.strategyScopeDefault");

  const activeTitleDisplay = active ? formatPostmortemTitle(active.title, t, active.binding_id) : null;
  const activeFactors = active ? partitionContributingFactors(active, t) : { visibleFactors: [], rawKeyValues: [] };
  const activeTechnicalIds = active
    ? [
        { key: "postmortem_id", value: active.postmortem_id },
        { key: "incident_id", value: active.incident_id },
        { key: "artifact_id", value: active.artifact_id },
        { key: "artifact_version", value: active.artifact_version },
        { key: "runtime_id", value: active.runtime_id },
        { key: "binding_id", value: active.binding_id },
        { key: "deployment_plan_id", value: active.deployment_plan_id },
        { key: "capital_pool_id", value: active.capital_pool_id },
        { key: "persona_capital_binding_id", value: active.persona_capital_binding_id },
        { key: "trace_id", value: active.trace_id },
        { key: "lineage_ref", value: active.lineage_ref },
        { key: "incident_cluster_id", value: active.incident_cluster_id ?? undefined },
      ].filter((entry): entry is { key: string; value: string } => Boolean(entry.value))
    : [];

  return (
    <>
      <PageHeader
        title={t("nav.postmortems")}
        subtitle={t("postmortem.subtitle")}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={t("postmortem.search")}
              aria-label={t("postmortem.search")}
              className="w-48"
            />
            <select
              aria-label={t("postmortem.statusFilter", { defaultValue: "Filter status" })}
              value={statusFilter}
              onChange={(event) => handleStatusChange(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs"
            >
              <option value="">{t("postmortem.status.all", { defaultValue: "All statuses" })}</option>
              {POSTMORTEM_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {statusLabel(t, st)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant={includeInfrastructure ? "secondary" : "outline"}
              onClick={handleToggleInfrastructure}
              aria-pressed={includeInfrastructure}
              data-testid="postmortem-infra-toggle"
            >
              {toggleLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadList()}
              disabled={listStatus === "loading"}
              aria-label={t("postmortem.reload")}
            >
              {listStatus === "loading"
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        )}
      />
      <PageBody className="shrink-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span data-testid="postmortem-scope-note">{scopeNote}</span>
          <span data-testid="postmortem-no-review-flow-notice">{t("postmortem.noReviewFlowNotice")}</span>
        </div>
        {listStatus === "error" && (
          <Card role="alert" data-testid="postmortem-list-error" className="p-4 mb-4 border-status-failed/40 bg-status-failed/5 text-xs text-status-failed flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {t("postmortem.listError", { defaultValue: "Canonical postmortem transport unavailable." })}{listError ? ` ${listError}` : ""}
          </Card>
        )}
        {listDegraded && (
          <Card role="status" data-testid="postmortem-surface-banner" className="p-4 mb-4 border-status-warning/40 bg-status-warning/5 text-xs text-status-warning flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {t("postmortem.surfaceBanner", { status: surface?.status ?? "" })}
            {surface?.source ? ` · ${surface.source}` : ""}
            {surface?.reason || surface?.message ? ` · ${surface.reason || surface.message}` : ""}
          </Card>
        )}
        {listStatus !== "error" && !surfaceUnavailable && (
          <Card className="overflow-hidden" data-testid="postmortem-table-card">
            <table className="w-full table-fixed caption-bottom text-sm" data-testid="postmortem-table">
              <TableHeader className="bg-card">
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[42%] text-xs uppercase tracking-wider whitespace-nowrap">
                    {t("table.title")}
                  </TableHead>
                  <TableHead className="w-[11%] text-xs uppercase tracking-wider whitespace-nowrap">
                    {t("table.status")}
                  </TableHead>
                  <TableHead className="w-[22%] text-xs uppercase tracking-wider whitespace-nowrap">
                    {t("postmortem.incident")}
                  </TableHead>
                  <TableHead className="w-[25%] text-xs uppercase tracking-wider whitespace-nowrap">
                    {t("postmortem.time", { defaultValue: "Time" })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      aria-busy={listStatus === "loading" || undefined}
                      data-testid={listStatus === "loading" ? "data-table-loading" : "data-table-empty"}
                      className="text-center text-muted-foreground py-8"
                    >
                      {listStatus === "loading" ? t("postmortem.loading") : t("postmortem.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => {
                    const { at, kind } = displayedAt(row);
                    const titleDisplay = formatPostmortemTitle(row.title, t, row.binding_id);
                    const rowAuthorLabel = formatPostmortemRowAuthors(row.author_ids);
                    const timeLabel = kind === "published"
                      ? t("postmortem.publishedAt", { defaultValue: "Published" })
                      : t("postmortem.createdAt", { defaultValue: "Created" });
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => selectPostmortem(row)}
                      >
                        <TableCell className="py-1.5 overflow-hidden">
                          <div className="min-w-0 py-0.5">
                            <div
                              className="font-medium text-sm leading-5 truncate"
                              data-testid="postmortem-plain-title"
                              title={titleDisplay.primary}
                            >
                              {titleDisplay.primary}
                            </div>
                            <div className="flex items-center gap-1.5 text-mono text-[11px] leading-4 text-muted-foreground truncate">
                              <span
                                className="shrink-0"
                                data-testid="postmortem-secondary-id"
                              >
                                {row.postmortem_id}
                              </span>
                              {titleDisplay.secondary && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    className="truncate"
                                    data-testid="postmortem-secondary-context"
                                    title={titleDisplay.secondary}
                                  >
                                    {titleDisplay.secondary}
                                  </span>
                                </>
                              )}
                              {rowAuthorLabel && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    className="truncate"
                                    data-testid="postmortem-secondary-author"
                                    title={rowAuthorLabel}
                                  >
                                    {rowAuthorLabel}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 overflow-hidden">
                          <Badge variant="outline" className="whitespace-nowrap shrink-0">
                            {statusLabel(t, row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 overflow-hidden">
                          {row.incident_id ? (
                            <div className="min-w-0 py-0.5">
                              <Link
                                to={`/management/incidents/${encodeURIComponent(row.incident_id)}`}
                                onClick={(event) => event.stopPropagation()}
                                className="block text-xs font-medium leading-5 text-primary underline underline-offset-2 hover:text-primary/80 truncate"
                                data-testid="postmortem-incident-link"
                              >
                                {t("postmortem.openIncident")}
                              </Link>
                              <div
                                className="text-mono text-[11px] leading-4 text-muted-foreground truncate"
                                data-testid="postmortem-secondary-incident-id"
                                title={row.incident_id}
                              >
                                {row.incident_id}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("common.notReported")}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 overflow-hidden">
                          <div
                            className="min-w-0 py-0.5 text-mono text-xs leading-4 text-muted-foreground break-words"
                            data-time-kind={kind}
                          >
                            <span className="inline-block">{safeDateTime(at)}</span>{" "}
                            <span className="inline-block">({timeLabel})</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </table>
            <footer
              aria-label={t("postmortem.pagination.label", { defaultValue: "Postmortem pagination" })}
              className="flex items-center justify-between gap-3 px-4 py-3 border-t text-xs text-muted-foreground"
            >
              <span data-testid="postmortem-total-count">
                {t("postmortem.pagination.total", {
                  total: totalCount,
                  defaultValue: `${totalCount} postmortems`,
                })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cursorHistory.length === 0 || listStatus === "loading"}
                  onClick={goPreviousPage}
                >
                  {t("postmortem.pagination.previous", { defaultValue: "Previous" })}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!nextPageToken || listStatus === "loading"}
                  onClick={goNextPage}
                >
                  {t("postmortem.pagination.next", { defaultValue: "Next" })}
                </Button>
              </div>
            </footer>
          </Card>
        )}
      </PageBody>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => { if (!open) closeDetail(); }}>
        <SheetContent className="w-full sm:!max-w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {activeTitleDisplay ? activeTitleDisplay.primary : t("postmortem.detailTitleFallback", { id: selectedId })}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {t("postmortem.detailDescription", { id: selectedId })}
            </SheetDescription>
          </SheetHeader>

          {detailStatus === "loading" && (
            <div role="status" data-testid="postmortem-detail-loading" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />{t("postmortem.detailLoading")}
            </div>
          )}
          {detailStatus === "error" && (
            <Card role="alert" data-testid="postmortem-detail-error" className="mt-4 p-4 border-status-failed/40 bg-status-failed/5 text-sm text-status-failed">
              {t("postmortem.detailError", { id: selectedId })}{detailError ? ` ${detailError}` : ""}
            </Card>
          )}
          {active && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{statusLabel(t, active.status)}</Badge>
                <span className="text-mono text-xs text-muted-foreground" data-testid="postmortem-detail-secondary-id">
                  {active.postmortem_id}
                </span>
                {activeTitleDisplay?.secondary && (
                  <span
                    className="text-mono text-xs text-muted-foreground"
                    data-testid="postmortem-detail-secondary-context"
                  >
                    {activeTitleDisplay.secondary}
                  </span>
                )}
              </div>

              {active.status === "draft" && (
                <div
                  className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                  data-testid="postmortem-detail-draft-notice"
                >
                  {t("postmortem.noReviewFlowNotice")}
                </div>
              )}

              {detailMeta?.staleness && (
                <Card role="status" className="p-3 border-status-warning/40 bg-status-warning/5 text-xs text-status-warning">
                  {t("postmortem.stalenessServedFrom", { source: detailMeta.staleness.served_from || "stale readback" })}
                  {detailMeta.staleness.last_known_at
                    ? ` · ${t("postmortem.stalenessLastKnown", { time: safeDateTime(detailMeta.staleness.last_known_at) })}`
                    : ""}
                </Card>
              )}

              <Card className="p-3 grid grid-cols-2 gap-3">
                <Field
                  label={t("postmortem.incident")}
                  value={
                    active.incident_id ? (
                      <div className="min-w-0">
                        <Link
                          to={`/management/incidents/${encodeURIComponent(active.incident_id)}`}
                          className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                          data-testid="postmortem-detail-incident-link"
                        >
                          {t("postmortem.openIncident")}
                        </Link>
                        <div className="text-mono text-[11px] text-muted-foreground truncate">
                          {active.incident_id}
                        </div>
                      </div>
                    ) : (
                      t("common.notReported")
                    )
                  }
                />
                <Field label={t("postmortem.author")} value={formatPostmortemAuthors(active.author_ids, t)} />
                <Field
                  label={displayedAt(active).kind === "published"
                    ? t("postmortem.publishedAt", { defaultValue: "Published" })
                    : t("postmortem.createdAt", { defaultValue: "Created" })}
                  value={safeDateTime(displayedAt(active).at)}
                  mono
                />
                <Field label={t("postmortem.deploymentStage")} value={formatDeploymentStage(active.deployment_stage, t)} />
              </Card>
              <Card className="p-3 space-y-2.5">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("postmortem.rootCause")}</div>
                  <div className="text-sm mt-1" data-testid="postmortem-detail-root-cause">
                    {formatPostmortemRootCause(active.root_cause, t)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("postmortem.contributingFactors")}</div>
                  {activeFactors.visibleFactors.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {activeFactors.visibleFactors.map((factor) => (
                        <li key={factor.key} className="text-sm">
                          {factor.secondary ? (
                            <>
                              <span>• {factor.primary}</span>
                              <span
                                className="ml-1.5 text-mono text-xs text-muted-foreground"
                                data-testid="postmortem-factor-secondary"
                              >
                                {factor.secondary}
                              </span>
                            </>
                          ) : (
                            `• ${factor.primary}`
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm mt-1 text-muted-foreground">{t("postmortem.noContributingFactors")}</div>
                  )}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t("postmortem.followUps")}</div>
                {active.action_items.length > 0
                  ? (
                    <ul className="space-y-1">
                      {active.action_items.map((action) => (
                        <li key={action} className="text-sm">• {translatePostmortemAction(action, t)}</li>
                      ))}
                    </ul>
                  )
                  : <p className="text-sm text-muted-foreground">{t("postmortem.noActionItems")}</p>}
              </Card>

              {(activeFactors.rawKeyValues.length > 0 || activeTechnicalIds.length > 0) && (
                <Card className="p-3">
                  <details data-testid="postmortem-technical-details">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                      {t("postmortem.technicalDetails")}
                    </summary>
                    <div className="mt-3 space-y-3 text-xs">
                      {activeFactors.rawKeyValues.length > 0 && (
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                            {t("postmortem.technicalKeyValuesTitle")}
                          </div>
                          <ul className="space-y-1 font-mono text-[11px] text-muted-foreground break-all" data-testid="postmortem-technical-kv-list">
                            {activeFactors.rawKeyValues.map((kv) => (
                              <li key={kv}>{kv}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {activeTechnicalIds.length > 0 && (
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                            {t("postmortem.technicalIdsTitle")}
                          </div>
                          <dl className="grid grid-cols-1 gap-1 font-mono text-[11px] text-muted-foreground break-all">
                            {activeTechnicalIds.map((entry) => (
                              <div key={entry.key} className="flex justify-between gap-2">
                                <dt>{entry.key}</dt>
                                <dd>{entry.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                    </div>
                  </details>
                </Card>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
