import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, Copy, ExternalLink, RefreshCw, Search } from "lucide-react";
import { useT } from "@/platform/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import { signedTenantId } from "@/lib/auth/bffBrowserSession";
import { getAuthProvider } from "@/lib/bff-v1/headers";
import {
  actionText,
  effectiveCurrentStage,
  instrumentFiguresText,
  isPreBrokerRefusal,
  journeyTitle,
  nextStepHref,
  outcomeView,
  readStateText,
  resolveDetailStagesAndTimeline,
  sourceText,
  UPSTREAM_STAGES,
  type OutcomeTone,
} from "./journeyReadable";
import {
  getTradeJourney,
  getTradeJourneyEvidence,
  getTradeJourneyTimeline,
  listTradeJourneys,
  resolveTradeJourney,
  subscribeTradeJourneys,
  type JourneyDetailEnvelope,
  type JourneyListEnvelope,
  type JourneyLiveState,
  type JourneyMeta,
  type JourneyRow,
  type JourneyTimelineEnvelope,
} from "@/lib/bff-v1/tradeJourneys";

function useTradeJourneyTenant(params: URLSearchParams): string {
  const { bffSession, session } = useAuth();
  return (
    params.get("tenant_id")?.trim() ||
    bffSession?.identity?.tenantId?.trim() ||
    signedTenantId(session) ||
    getAuthProvider().getTenantId()?.trim() ||
    "default"
  );
}

const STAGES = [
  "signal_generation",
  "trade_decision",
  "risk_evaluation",
  "order_submission",
  "broker_acknowledgement",
  "fill_management",
  "ledger_booking",
  "reconciliation",
];
const VIEWS = [
  { labelKey: "tradeJourneys.filters.viewAttention", value: "attention" },
  { labelKey: "tradeJourneys.filters.viewRiskReject", value: "risk_reject" },
  { labelKey: "tradeJourneys.filters.viewBrokerReject", value: "broker_reject" },
  { labelKey: "tradeJourneys.filters.viewPartialFill", value: "partial_fill" },
  { labelKey: "tradeJourneys.filters.viewReconMismatch", value: "recon_mismatch" },
];
const baseInput = "rounded-md border border-border bg-background px-3 py-2 text-sm";

function ReadState({ meta, lackingRows }: { meta?: JourneyMeta; lackingRows?: number }) {
  const t = useT();
  if (!meta) return null;
  const stale = Boolean(meta.snapshot_at) && Date.now() - Date.parse(meta.snapshot_at) > 5 * 60_000;
  if (meta.read_state === "formal" && !stale) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("tradeJourneys.freshRevision", { revision: meta.freshness.materializer_revision })}
      </span>
    );
  }
  return (
    <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <strong>
        {meta.read_state === "formal"
          ? t("tradeJourneys.staleData")
          : lackingRows
            ? t("tradeJourneys.rowsLackStages", { count: lackingRows })
            : t("tradeJourneys.readStateData", { state: readStateText(meta.read_state, t) })}
      </strong>
      <span className="ml-2">
        {t("tradeJourneys.incompleteEvidence")} {meta.warnings?.join(" · ")}
      </span>
    </div>
  );
}

function Status({ row }: { row: JourneyRow }) {
  const t = useT();
  const activeFlags = Object.entries(row.flags || {})
    .filter(([, active]) => active)
    .map(([name]) => name);
  const bad = row.status === "failed" || /reject|mismatch|fail|block/i.test(`${row.status} ${activeFlags.join(" ")}`);
  const warn = !bad && (row.status === "completed_with_variance" || row.status === "unreconciled");
  const ok = !bad && !warn && row.status === "completed";
  const tone = bad
    ? "bg-red-500/10 text-red-700 dark:text-red-300"
    : warn
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : ok
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "bg-muted text-muted-foreground";
  const label = row.status ? t(`tradeJourneys.statuses.${row.status}`, { defaultValue: row.status }) : "";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${tone}`}>
      {bad || warn ? <AlertTriangle size={13} /> : ok ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
      {label}
    </span>
  );
}

const TONE_CLASS: Record<OutcomeTone, string> = {
  gray: "bg-muted text-muted-foreground",
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  neutral: "bg-muted text-muted-foreground",
};

/** Status badge plus one plain sentence saying why; rows without an outcome keep the plain badge. */
function StatusCell({ row }: { row: JourneyRow }) {
  const t = useT();
  const view = outcomeView(row, t);
  if (!view) return <Status row={row} />;
  return (
    <div className="space-y-1">
      {view.badge ? (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${TONE_CLASS[view.tone]}`}>
          {view.badge}
        </span>
      ) : (
        <Status row={row} />
      )}
      {view.sentence && <p className={`text-xs ${view.tone === "gray" ? "text-muted-foreground" : ""}`}>{view.sentence}</p>}
    </div>
  );
}

function JourneyId({ id }: { id: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <code className="break-all">{id}</code>
      <button
        type="button"
        aria-label={t("tradeJourneys.copyId")}
        title={copied ? t("tradeJourneys.copied") : t("tradeJourneys.copyId")}
        onClick={copy}
        className="rounded p-0.5 hover:bg-muted"
      >
        <Copy size={11} />
      </button>
    </span>
  );
}

export function TradeJourneysPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<JourneyListEnvelope>();
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [liveState, setLiveState] = useState<JourneyLiveState>("connecting");
  const [liveRevision, setLiveRevision] = useState(0);
  const tenant = useTradeJourneyTenant(params);
  const environment = params.get("environment") || "paper";
  const personaFocus = params.get("persona_id") || undefined;
  const strategyFocus = params.get("strategy_id") || undefined;
  const decisionFocus = params.get("decision_id") || undefined;
  const orderFocus = params.get("order_id") || undefined;
  const brokerOrderFocus = params.get("broker_order_id") || undefined;
  const returnTo = params.get("return_to") || undefined;
  const returnLabel = params.get("return_label") || undefined;
  const detailContext = useMemo(() => {
    const next = new URLSearchParams();
    next.set("tenant_id", tenant);
    next.set("environment", environment);
    if (returnTo) next.set("return_to", returnTo);
    if (returnLabel) next.set("return_label", returnLabel);
    return next.toString();
  }, [tenant, environment, returnTo, returnLabel]);
  const hasFocus = Boolean(personaFocus || strategyFocus || decisionFocus || orderFocus || brokerOrderFocus);
  const cursorHistory = useMemo(() => {
    try {
      const value = JSON.parse(params.get("cursor_history") || "[]");
      return Array.isArray(value) && value.every(x => typeof x === "string") ? (value as string[]) : [];
    } catch {
      return [];
    }
  }, [params]);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page_token");
    next.delete("cursor_history");
    setParams(next);
  };
  const goNext = () => {
    const token = payload?.page_info.next_page_token;
    if (!token) return;
    const next = new URLSearchParams(params);
    next.set("page_token", token);
    next.set("cursor_history", JSON.stringify([...cursorHistory, params.get("page_token") || ""]));
    setParams(next);
  };
  const goPrevious = () => {
    if (!cursorHistory.length) return;
    const history = cursorHistory.slice(0, -1);
    const token = cursorHistory[cursorHistory.length - 1];
    const next = new URLSearchParams(params);
    if (token) next.set("page_token", token);
    else next.delete("page_token");
    if (history.length) next.set("cursor_history", JSON.stringify(history));
    else next.delete("cursor_history");
    setParams(next);
  };
  const query = useMemo(
    () => ({
      tenant_id: tenant,
      environment,
      q: params.get("q") || undefined,
      status: params.get("status") || undefined,
      attention: params.get("view") || undefined,
      include_probe: params.get("include_probe") === "true" ? "true" : undefined,
      persona_id: personaFocus,
      strategy_id: strategyFocus,
      decision_id: decisionFocus,
      order_id: orderFocus,
      broker_order_id: brokerOrderFocus,
      page_token: params.get("page_token") || undefined,
      page_size: 25,
      sort: "updated_at_desc",
    }),
    [params, tenant, environment, personaFocus, strategyFocus, decisionFocus, orderFocus, brokerOrderFocus],
  );
  // Live invalidation must not abort a same-scope read that is still pending:
  // that restarted its clock on every invalidation and starved slow reads.
  // Invalidations coalesce into one refetch after the in-flight read settles;
  // a scope (query/tenant/environment) change or unmount still aborts.
  const refreshList = useRef<() => void>(() => {});
  useEffect(() => {
    const c = new AbortController();
    let inflight = false,
      dirty = false;
    const load = (replacement = false) => {
      inflight = true;
      dirty = false;
      // A failed read stays visible while its queued replacement is pending or failing;
      // only a valid completed current-scope response clears it.
      if (!replacement) setError("");
      listTradeJourneys(query, c.signal)
        .then(result => {
          if (!c.signal.aborted) {
            setPayload(result);
            setError("");
          }
        })
        .catch(e => {
          if (e?.name !== "AbortError" && !c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          inflight = false;
          if (dirty && !c.signal.aborted) load(true);
        });
    };
    refreshList.current = () => {
      if (inflight) dirty = true;
      else load(true);
    };
    load();
    return () => {
      c.abort();
      refreshList.current = () => {};
    };
  }, [query]);
  useEffect(() => {
    if (liveRevision) refreshList.current();
  }, [liveRevision]);
  useEffect(
    () =>
      subscribeTradeJourneys(
        { tenant_id: tenant, environment },
        { onInvalidate: () => setLiveRevision(value => value + 1), onState: setLiveState },
      ).close,
    [tenant, environment],
  );
  const resolve = async () => {
    const q = params.get("resolve")?.trim();
    if (!q) return;
    setResolving(true);
    setError("");
    try {
      const { data } = await resolveTradeJourney({ q, tenant_id: tenant, environment });
      if (data.journey_ids.length === 1) {
        const id = data.journey_ids[0];
        navigate(`/management/trade-journeys/${encodeURIComponent(id)}?${detailContext}`);
      } else if (data.ambiguous || data.journey_ids.length > 1) {
        setError(t("tradeJourneys.resolveErrors.ambiguous", { ids: data.journey_ids.join(", ") }));
      } else {
        setError(t("tradeJourneys.resolveErrors.noMatch"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResolving(false);
    }
  };
  const stageName = (stage?: string | null) =>
    stage ? t(`tradeJourneys.stages.${stage}`, { defaultValue: stage.replaceAll("_", " ") }) : "";
  const focusParts = [
    personaFocus && t("tradeJourneys.focused.persona", { id: personaFocus }),
    strategyFocus && t("tradeJourneys.focused.strategy", { id: strategyFocus }),
    decisionFocus && t("tradeJourneys.focused.decision", { id: decisionFocus }),
    orderFocus && t("tradeJourneys.focused.order", { id: orderFocus }),
    brokerOrderFocus && t("tradeJourneys.focused.brokerOrder", { id: brokerOrderFocus }),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-4 p-4 md:p-6">
      <header>
        {returnTo && (
          <Link className="mb-1 inline-flex items-center gap-1 text-sm text-primary hover:underline" to={returnTo}>
            <ArrowLeft size={14} />
            {t("tradeJourneys.backTo", { label: returnLabel || t("tradeJourneys.origin") })}
          </Link>
        )}
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("tradeJourneys.kicker")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t("tradeJourneys.title")}</h1>
          <span
            role="status"
            className={`rounded-full px-2 py-1 text-xs ${liveState === "live" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}
          >
            {t(`tradeJourneys.live.${liveState}`)}
          </span>
          <button
            type="button"
            onClick={() => refreshList.current()}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
          >
            <RefreshCw size={12} />
            {t("tradeJourneys.refresh")}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{t("tradeJourneys.subtitle")}</p>
      </header>
      {hasFocus && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <span>{t("tradeJourneys.focused.summary", { parts: focusParts, count: payload?.page_info.total ?? 0 })}</span>
          <Link className="text-primary hover:underline" to={`/management/trade-journeys?${detailContext}`}>
            {t("tradeJourneys.focused.showAll")}
          </Link>
        </div>
      )}
      <ReadState
        meta={payload?.meta}
        lackingRows={payload?.data.items.filter(r => r.read_state && r.read_state !== "formal").length}
      />
      <div className="grid gap-3 rounded-lg border bg-card p-4 lg:grid-cols-[1fr_auto_auto]">
        <label className="relative">
          <span className="sr-only">{t("tradeJourneys.filters.searchLabel")}</span>
          <Search className="absolute left-3 top-3" size={16} />
          <input
            className={`${baseInput} w-full pl-9`}
            value={params.get("q") || ""}
            onChange={e => set("q", e.target.value)}
            placeholder={t("tradeJourneys.filters.searchPlaceholder")}
          />
        </label>
        <select
          aria-label={t("tradeJourneys.filters.environment")}
          className={baseInput}
          value={environment}
          onChange={e => set("environment", e.target.value)}
        >
          <option value="paper">{t("tradeJourneys.filters.envPaper")}</option>
          <option value="canary">{t("tradeJourneys.filters.envCanary")}</option>
          <option value="live">{t("tradeJourneys.filters.envLive")}</option>
        </select>
        <select
          aria-label={t("tradeJourneys.filters.viewLabel")}
          className={baseInput}
          value={params.get("view") || ""}
          onChange={e => set("view", e.target.value)}
        >
          <option value="">{t("tradeJourneys.filters.viewAll")}</option>
          {VIEWS.map(v => (
            <option key={v.value} value={v.value}>
              {t(v.labelKey)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm lg:col-span-3">
          <input
            type="checkbox"
            checked={params.get("include_probe") === "true"}
            onChange={e => set("include_probe", e.target.checked ? "true" : "")}
          />
          {t("tradeJourneys.filters.includeProbe")}
        </label>
        <div className="flex gap-2 lg:col-span-3">
          <input
            aria-label={t("tradeJourneys.filters.resolveLabel")}
            className={`${baseInput} min-w-0 flex-1`}
            value={params.get("resolve") || ""}
            onChange={e => set("resolve", e.target.value)}
            onKeyDown={e => e.key === "Enter" && resolve()}
            placeholder={t("tradeJourneys.filters.resolvePlaceholder")}
          />
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={resolve}
            disabled={resolving}
          >
            {resolving ? t("tradeJourneys.filters.resolving") : t("tradeJourneys.filters.resolve")}
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["journey", "instrument", "stage", "status", "updated"].map(x => (
                <th className="p-3 font-medium" key={x}>
                  {t(`tradeJourneys.table.${x}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload?.data.items.map(row => (
              <tr key={row.journey_id} className="border-t">
                <td className="p-3">
                  <Link className="font-medium text-primary hover:underline" to={`${encodeURIComponent(row.journey_id)}?${detailContext}`}>
                    {journeyTitle(row, t)}
                  </Link>
                  <div>
                    <JourneyId id={row.journey_id} />
                  </div>
                </td>
                <td className="p-3">
                  {row.symbol || t("tradeJourneys.table.unknown")}
                  <div className="text-xs text-muted-foreground">{instrumentFiguresText(row, t)}</div>
                </td>
                <td className="p-3">{stageName(effectiveCurrentStage(row)) || t("tradeJourneys.table.unknown")}</td>
                <td className="p-3">
                  <StatusCell row={row} />
                  {row.read_state && row.read_state !== "formal" && (
                    <div className="mt-1 text-xs text-amber-600">{readStateText(row.read_state, t)}</div>
                  )}
                </td>
                <td className="p-3">{row.updated_at ? new Date(row.updated_at).toLocaleString() : t("tradeJourneys.table.unknown")}</td>
              </tr>
            ))}
            {payload && payload.data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                  {t("tradeJourneys.table.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer aria-label={t("tradeJourneys.pagination.label")} className="flex items-center justify-between gap-3 text-sm">
        <span>{t("tradeJourneys.pagination.count", { count: payload?.page_info.total ?? 0 })}</span>
        <div className="flex gap-2">
          <button className="rounded border px-3 py-1 disabled:opacity-50" disabled={!cursorHistory.length} onClick={goPrevious}>
            {t("tradeJourneys.pagination.previous")}
          </button>
          <button className="rounded border px-3 py-1 disabled:opacity-50" disabled={!payload?.page_info.next_page_token} onClick={goNext}>
            {t("tradeJourneys.pagination.next")}
          </button>
        </div>
      </footer>
    </section>
  );
}

/** Answers three questions before any raw data: what happened, who handles it, what the operator does. */
function SummaryPanel({ row }: { row: JourneyRow }) {
  const t = useT();
  const view = outcomeView(row, t);
  const kind = view?.kind ?? row.outcome?.kind ?? "normal";
  const isDeferred = Boolean(view ? view.isDeferred : kind === "reconciliation_deferred");
  const step =
    row.next_step ??
    (view?.isUnverified && row.persona_id
      ? { action_needed: "review_reconciliation_variance", href: `/personas/${row.persona_id}` }
      : null);
  const what =
    view?.sentence ||
    (kind === "open"
      ? t("tradeJourneys.summary.openWhat")
      : kind === "normal"
        ? t("tradeJourneys.summary.normalWhat")
        : t("tradeJourneys.summary.unknownWhat"));
  const title = view?.badge ? `${view.badge}：` : "";
  const who = isDeferred
    ? t("tradeJourneys.summary.whoSystem")
    : step
      ? step.href.includes("/incidents/")
        ? t("tradeJourneys.summary.whoIncident")
        : t("tradeJourneys.summary.whoNobody")
      : view?.isUnverified
        ? t("tradeJourneys.summary.whoNobody")
        : t("tradeJourneys.summary.whoNone");
  const adverse = kind === "rejected" || (kind === "variance" && !view?.isUnverified);
  const todo = isDeferred ? (
    t("tradeJourneys.summary.todoWait")
  ) : step ? (
    <>
      {actionText(step.action_needed, t, row)}{" "}
      <Link className="inline-flex items-center gap-1 text-primary hover:underline" to={nextStepHref(step.href)}>
        {t("tradeJourneys.summary.todoOpen")} <ExternalLink size={13} />
      </Link>
    </>
  ) : view?.isUnverified ? (
    t("tradeJourneys.actions.review_missing_reconciliation_evidence")
  ) : (
    t("tradeJourneys.summary.todoNone")
  );
  return (
    <section
      aria-label={t("tradeJourneys.summary.label")}
      className={`rounded-lg border p-4 ${adverse ? "border-red-500/40 bg-red-500/5" : view ? "border-amber-500/40 bg-amber-500/5" : "bg-card"}`}
    >
      <dl className="grid gap-3 md:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">{t("tradeJourneys.summary.what")}</dt>
          <dd className="text-sm">
            {title}
            {what}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">{t("tradeJourneys.summary.who")}</dt>
          <dd className="text-sm">{who}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">{t("tradeJourneys.summary.todo")}</dt>
          <dd className="text-sm">{todo}</dd>
        </div>
      </dl>
    </section>
  );
}

export function TradeJourneyDetailPage() {
  const t = useT();
  const { journeyId = "" } = useParams();
  const [params] = useSearchParams();
  const tenant = useTradeJourneyTenant(params),
    environment = params.get("environment") || "paper";
  const returnTo = params.get("return_to") || undefined,
    returnLabel = params.get("return_label") || undefined;
  const listContext = useMemo(() => {
    const next = new URLSearchParams();
    next.set("tenant_id", tenant);
    next.set("environment", environment);
    if (returnTo) next.set("return_to", returnTo);
    if (returnLabel) next.set("return_label", returnLabel);
    return next.toString();
  }, [tenant, environment, returnTo, returnLabel]);
  const [detail, setDetail] = useState<JourneyDetailEnvelope>();
  const [timeline, setTimeline] = useState<JourneyTimelineEnvelope>();
  const [evidence, setEvidence] = useState<Record<string, unknown>>();
  const [error, setError] = useState("");
  const [liveRevision, setLiveRevision] = useState(0);
  const refreshDetail = useRef<() => void>(() => {});

  useEffect(() => {
    const c = new AbortController();
    let inflight = false,
      dirty = false;
    const q = { tenant_id: tenant, environment };
    const load = (replacement = false) => {
      inflight = true;
      dirty = false;
      if (!replacement) setError("");
      Promise.all([
        getTradeJourney(journeyId, q, c.signal),
        getTradeJourneyTimeline(journeyId, { ...q, page_size: 100 }, c.signal),
        getTradeJourneyEvidence(journeyId, q, c.signal),
      ])
        .then(([d, tl, e]) => {
          if (!c.signal.aborted) {
            setDetail(d);
            setTimeline(tl);
            setEvidence(e.data);
            setError("");
          }
        })
        .catch(e => {
          if (e?.name !== "AbortError" && !c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          inflight = false;
          if (dirty && !c.signal.aborted) load(true);
        });
    };
    refreshDetail.current = () => {
      if (inflight) dirty = true;
      else load(true);
    };
    load();
    return () => {
      c.abort();
      refreshDetail.current = () => {};
    };
  }, [journeyId, tenant, environment]);

  useEffect(() => {
    if (liveRevision) refreshDetail.current();
  }, [liveRevision]);

  useEffect(
    () =>
      subscribeTradeJourneys(
        { tenant_id: tenant, environment },
        { onInvalidate: () => setLiveRevision(value => value + 1), onState: () => {} },
      ).close,
    [tenant, environment],
  );

  const row = detail?.data;
  const stageName = (stage: string) => t(`tradeJourneys.stages.${stage}`, { defaultValue: stage.replaceAll("_", " ") });
  const resolved = useMemo(
    () => resolveDetailStagesAndTimeline(row, timeline?.data.items, t),
    [row, timeline?.data.items, t],
  );
  const view = useMemo(() => (row ? outcomeView(row, t) : undefined), [row, t]);
  const preBroker = useMemo(() => isPreBrokerRefusal(row), [row]);
  const upstreamUnlinked =
    Array.isArray(row?.diagnostics) && row.diagnostics.some(d => d?.code === "upstream_lineage_unlinked");
  const missingStages = (row?.completeness?.missing_stages || []).filter(
    x => !UPSTREAM_STAGES.includes(x) && !(preBroker && x === "risk_evaluation"),
  );
  const lineageGap =
    upstreamUnlinked || Boolean(row?.completeness?.missing_stages?.some(x => UPSTREAM_STAGES.includes(x)));

  const preFillAllSucceeded =
    resolved.stages.risk_evaluation?.status === "succeeded" &&
    resolved.stages.order_submission?.status === "succeeded" &&
    resolved.stages.broker_acknowledgement?.status === "succeeded";

  const activeFlags = Object.entries(row?.flags || {})
    .filter(([name, active]) => {
      if (!active) return false;
      if (name === "rejected" && preFillAllSucceeded) return false;
      if ((name === "mismatch" || name === "rejected") && view?.isDeferred) return false;
      return true;
    })
    .map(([name]) => {
      if (name === "rejected" && preBroker) {
        return t("tradeJourneys.flagNames.pre_broker_rejected");
      }
      if (name === "mismatch" && view?.isUnverified) {
        return t("tradeJourneys.flagNames.unverified_reconciliation");
      }
      return t(`tradeJourneys.flagNames.${name}`, { defaultValue: name });
    });

  return (
    <section className="mx-auto w-full max-w-[1400px] space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Link className="inline-flex items-center gap-1 text-sm text-primary" to={`/management/trade-journeys?${listContext}`}>
            <ArrowLeft size={15} />
            {t("tradeJourneys.detail.allJourneys")}
          </Link>
          {returnTo && (
            <Link className="inline-flex items-center gap-1 text-sm text-primary hover:underline" to={returnTo}>
              <ArrowLeft size={15} />
              {t("tradeJourneys.backTo", { label: returnLabel || t("tradeJourneys.origin") })}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => refreshDetail.current()}
          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
        >
          <RefreshCw size={12} />
          {t("tradeJourneys.refresh")}
        </button>
      </div>
      {error && (
        <div role="alert" className="rounded border border-red-500/40 bg-red-500/10 p-3">
          {error}
        </div>
      )}
      {row && (
        <>
          <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase text-muted-foreground">
                {t("tradeJourneys.detail.envRevision", {
                  environment: row.environment,
                  revision: row.revision ?? t("tradeJourneys.detail.unknownRevision"),
                })}
              </p>
              <h1 className="break-all text-2xl font-semibold">{row.persona_name ? journeyTitle(row, t) : row.journey_id}</h1>
              {row.persona_name && <JourneyId id={row.journey_id} />}
              <p>
                {row.symbol || t("tradeJourneys.detail.unknownInstrument")} · {instrumentFiguresText(row, t)}
              </p>
            </div>
            <StatusCell row={row} />
          </header>
          <SummaryPanel row={row} />
          <ReadState meta={detail.meta} />
          <div aria-label={t("tradeJourneys.detail.stagesLabel")} className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
            {STAGES.map(stage => {
              const sv = resolved.stageViews[stage] ?? {
                label: t("tradeJourneys.detail.unknownStatus"),
                tone: "neutral" as const,
              };
              const isDanger = sv.tone === "danger";
              const isWarning = sv.tone === "warning";
              const isSuccess = sv.tone === "success";
              return (
                <div
                  key={stage}
                  aria-label={`${stageName(stage)}: ${sv.label}`}
                  className={`rounded border p-2 text-xs ${
                    isDanger
                      ? "border-red-500/50 bg-red-500/10"
                      : isWarning
                        ? "border-amber-500/50 bg-amber-500/10"
                        : isSuccess
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "opacity-65"
                  }`}
                >
                  {isSuccess ? (
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  ) : isDanger ? (
                    <AlertTriangle size={15} className="text-red-600" />
                  ) : isWarning ? (
                    <AlertTriangle size={15} className="text-amber-600" />
                  ) : (
                    <CircleDashed size={15} />
                  )}
                  <span className="mt-1 block break-words">{stageName(stage)}</span>
                  <span
                    className={`block font-medium ${
                      isDanger
                        ? "text-red-700 dark:text-red-300"
                        : isWarning
                          ? "text-amber-700 dark:text-amber-300"
                          : isSuccess
                            ? "text-emerald-700 dark:text-emerald-300"
                            : ""
                    }`}
                  >
                    {sv.label}
                  </span>
                  {sv.reason && <span className="mt-1 block text-[11px] text-muted-foreground">{sv.reason}</span>}
                </div>
              );
            })}
          </div>
          {(activeFlags.length > 0 || missingStages.length > 0) && (
            <aside className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <h2 className="font-semibold">{t("tradeJourneys.detail.attentionRequired")}</h2>
              <p className="text-sm">
                {[...activeFlags, ...missingStages.map(x => t("tradeJourneys.detail.missingStage", { stage: stageName(x) }))].join(
                  " · ",
                )}
              </p>
            </aside>
          )}
          {lineageGap && <p className="text-xs text-muted-foreground">{t("tradeJourneys.detail.lineageUnlinked")}</p>}
          <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-lg border p-4">
              <h2 className="mb-3 text-lg font-semibold">{t("tradeJourneys.detail.timeline")}</h2>
              <ol className="space-y-3">
                {resolved.timeline.map(event => (
                  <li key={event.event_id} className="border-l-2 border-primary/30 pl-4">
                    <strong>
                      {event.displayStage ? stageName(event.displayStage) : t("tradeJourneys.detail.unknownStage")} ·{" "}
                      {event.displayStatusLabel}
                    </strong>
                    {event.displayReason && <div className="text-sm">{event.displayReason}</div>}
                    <div className="text-sm text-muted-foreground">
                      {t("tradeJourneys.detail.occurred", {
                        time: event.occurred_at ? new Date(event.occurred_at).toLocaleString() : t("tradeJourneys.detail.unknownTime"),
                      })}
                      {event.recorded_at && (
                        <>
                          {" "}
                          · {t("tradeJourneys.detail.recorded", { time: new Date(event.recorded_at).toLocaleString() })}
                        </>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[sourceText(event.source, t), event.source_event_id || event.event_id].filter(Boolean).join(" · ")}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <aside className="rounded-lg border p-4">
              <h2 className="mb-3 text-lg font-semibold">{t("tradeJourneys.detail.evidence")}</h2>
              {evidence ? (
                <details>
                  <summary className="cursor-pointer text-sm">{t("tradeJourneys.detail.rawData")}</summary>
                  <pre
                    aria-label={t("tradeJourneys.detail.evidence")}
                    tabIndex={0}
                    className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs"
                  >
                    {JSON.stringify(evidence, null, 2)}
                  </pre>
                </details>
              ) : (
                <p className="text-sm text-muted-foreground">{t("tradeJourneys.detail.evidenceUnavailable")}</p>
              )}
              <Link
                className="mt-3 inline-flex items-center gap-1 text-sm text-primary"
                to={`/management/evidence?journey_id=${encodeURIComponent(journeyId)}`}
              >
                {t("tradeJourneys.detail.openEvidenceExplorer")} <ExternalLink size={14} />
              </Link>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
