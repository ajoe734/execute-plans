import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, ExternalLink, Search } from "lucide-react";
import { getTradeJourney, getTradeJourneyEvidence, getTradeJourneyTimeline, listTradeJourneys, resolveTradeJourney, subscribeTradeJourneys, type JourneyDetailEnvelope, type JourneyListEnvelope, type JourneyLiveState, type JourneyMeta, type JourneyRow, type JourneyTimelineEnvelope } from "@/lib/bff-v1/tradeJourneys";

const STAGES = ["signal_generation", "trade_decision", "risk_evaluation", "order_submission", "broker_acknowledgement", "fill_management", "ledger_booking", "reconciliation"];
const VIEWS = [{ label: "Needs attention", value: "attention" }, { label: "Risk rejected", value: "risk_reject" }, { label: "Broker rejected", value: "broker_reject" }, { label: "Partial fills", value: "partial_fill" }, { label: "Recon mismatch", value: "recon_mismatch" }];
const baseInput = "rounded-md border border-border bg-background px-3 py-2 text-sm";

function ReadState({ meta }: { meta?: JourneyMeta }) {
  if (!meta) return null;
  const stale = Boolean(meta.snapshot_at) && Date.now() - Date.parse(meta.snapshot_at) > 5 * 60_000;
  if (meta.read_state === "formal" && !stale) return <span className="text-xs text-muted-foreground">Fresh · revision {meta.freshness.materializer_revision}</span>;
  return <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><strong>{meta.read_state === "formal" ? "Stale data" : `${meta.read_state} data`}</strong><span className="ml-2">Some journey evidence may be incomplete. {meta.warnings?.join(" · ")}</span></div>;
}

function Status({ row }: { row: JourneyRow }) {
  const activeFlags = Object.entries(row.flags || {}).filter(([, active]) => active).map(([name]) => name);
  const bad = /reject|mismatch|fail|block/i.test(`${row.status} ${activeFlags.join(" ")}`);
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${bad ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{bad ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{row.status}</span>;
}

export function TradeJourneysPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<JourneyListEnvelope>();
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [liveState, setLiveState] = useState<JourneyLiveState>("connecting");
  const [liveRevision, setLiveRevision] = useState(0);
  const tenant = params.get("tenant_id") || "default";
  const environment = params.get("environment") || "paper";
  const personaFocus = params.get("persona_id") || undefined;
  const strategyFocus = params.get("strategy_id") || undefined;
  const decisionFocus = params.get("decision_id") || undefined;
  const orderFocus = params.get("order_id") || undefined;
  const brokerOrderFocus = params.get("broker_order_id") || undefined;
  const hasFocus = Boolean(personaFocus || strategyFocus || decisionFocus || orderFocus || brokerOrderFocus);
  const cursorHistory = useMemo(() => { try { const value = JSON.parse(params.get("cursor_history") || "[]"); return Array.isArray(value) && value.every(x => typeof x === "string") ? value as string[] : []; } catch { return []; } }, [params]);
  const set = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); next.delete("page_token"); next.delete("cursor_history"); setParams(next); };
  const goNext = () => { const token = payload?.page_info.next_page_token; if (!token) return; const next = new URLSearchParams(params); next.set("page_token", token); next.set("cursor_history", JSON.stringify([...cursorHistory, params.get("page_token") || ""])); setParams(next); };
  const goPrevious = () => { if (!cursorHistory.length) return; const history = cursorHistory.slice(0, -1); const token = cursorHistory[cursorHistory.length - 1]; const next = new URLSearchParams(params); if (token) next.set("page_token", token); else next.delete("page_token"); if (history.length) next.set("cursor_history", JSON.stringify(history)); else next.delete("cursor_history"); setParams(next); };
  const query = useMemo(() => ({ tenant_id: tenant, environment, q: params.get("q") || undefined, status: params.get("status") || undefined, attention: params.get("view") || undefined, persona_id: personaFocus, strategy_id: strategyFocus, decision_id: decisionFocus, order_id: orderFocus, broker_order_id: brokerOrderFocus, page_token: params.get("page_token") || undefined, page_size: 25, sort: "updated_at_desc" }), [params, tenant, environment, personaFocus, strategyFocus, decisionFocus, orderFocus, brokerOrderFocus]);
  useEffect(() => { const c = new AbortController(); setError(""); listTradeJourneys(query, c.signal).then(setPayload).catch(e => { if (e?.name !== "AbortError") setError(e.message); }); return () => c.abort(); }, [query, liveRevision]);
  useEffect(() => subscribeTradeJourneys({ tenant_id: tenant, environment }, { onInvalidate: () => setLiveRevision(value => value + 1), onState: setLiveState }).close, [tenant, environment]);
  const resolve = async () => { const q = params.get("resolve")?.trim(); if (!q) return; setResolving(true); setError(""); try { const { data } = await resolveTradeJourney({ q, tenant_id: tenant, environment }); if (data.journey_ids.length === 1) { const id = data.journey_ids[0]; navigate(`/management/trade-journeys/${encodeURIComponent(id)}?tenant_id=${encodeURIComponent(tenant)}&environment=${encodeURIComponent(environment)}`); } else if (data.ambiguous || data.journey_ids.length > 1) setError(`Ambiguous identifier: ${data.journey_ids.join(", ")}`); else setError("No journey matched that identifier."); } catch (e) { setError((e as Error).message); } finally { setResolving(false); } };
  return <section className="mx-auto w-full max-w-[1500px] space-y-4 p-4 md:p-6">
    <header><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Execution observability</p><div className="flex items-center gap-3"><h1 className="text-2xl font-semibold">Trade Journeys</h1><span role="status" className={`rounded-full px-2 py-1 text-xs ${liveState === "live" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{liveState === "live" ? "Live" : liveState === "stale" ? "Live updates stale" : "Connecting"}</span></div><p className="text-sm text-muted-foreground">Canonical signal-to-reconciliation truth. No browser-side domain joins.</p></header>
    {hasFocus && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <span>Focused: {[personaFocus && `persona ${personaFocus}`, strategyFocus && `strategy ${strategyFocus}`, decisionFocus && `decision ${decisionFocus}`, orderFocus && `order ${orderFocus}`, brokerOrderFocus && `broker order ${brokerOrderFocus}`].filter(Boolean).join(" · ")} · {payload?.page_info.total ?? 0} journeys</span>
      <Link className="text-primary hover:underline" to={`/management/trade-journeys?tenant_id=${encodeURIComponent(tenant)}&environment=${encodeURIComponent(environment)}`}>Show all journeys</Link>
    </div>}
    <ReadState meta={payload?.meta} />
    <div className="grid gap-3 rounded-lg border bg-card p-4 lg:grid-cols-[1fr_auto_auto]">
      <label className="relative"><span className="sr-only">Search journeys</span><Search className="absolute left-3 top-3" size={16}/><input className={`${baseInput} w-full pl-9`} value={params.get("q") || ""} onChange={e => set("q", e.target.value)} placeholder="Search symbol, persona or order ID" /></label>
      <select aria-label="Environment" className={baseInput} value={environment} onChange={e => set("environment", e.target.value)}><option value="paper">Paper</option><option value="canary">Canary</option><option value="live">Live</option></select>
      <select aria-label="Saved attention view" className={baseInput} value={params.get("view") || ""} onChange={e => set("view", e.target.value)}><option value="">All journeys</option>{VIEWS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}</select>
      <div className="flex gap-2 lg:col-span-3"><input aria-label="Resolve any identifier" className={`${baseInput} min-w-0 flex-1`} value={params.get("resolve") || ""} onChange={e => set("resolve", e.target.value)} onKeyDown={e => e.key === "Enter" && resolve()} placeholder="Resolve decision, client order, broker order or fill ID"/><button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={resolve} disabled={resolving}>{resolving ? "Resolving…" : "Resolve"}</button></div>
    </div>
    {error && <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</div>}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-muted/50"><tr>{["Journey", "Instrument", "Stage", "Status", "Updated"].map(x => <th className="p-3 font-medium" key={x}>{x}</th>)}</tr></thead><tbody>{payload?.data.items.map(row => <tr key={row.journey_id} className="border-t"><td className="p-3"><Link className="font-medium text-primary hover:underline" to={`${encodeURIComponent(row.journey_id)}?tenant_id=${encodeURIComponent(tenant)}&environment=${encodeURIComponent(environment)}`}>{row.journey_id}</Link><div className="text-xs text-muted-foreground">{row.persona_id || "Unknown persona"}</div></td><td className="p-3">{row.symbol || "Unknown"}<div className="text-xs text-muted-foreground">{row.side || "—"} {row.quantity ?? "—"}</div></td><td className="p-3">{row.current_stage || "Unknown"}</td><td className="p-3"><Status row={row}/>{row.read_state && row.read_state !== "formal" && <div className="mt-1 text-xs text-amber-600">{row.read_state}</div>}</td><td className="p-3">{row.updated_at ? new Date(row.updated_at).toLocaleString() : "Unknown"}</td></tr>)}{payload && payload.data.items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No journeys match these filters.</td></tr>}</tbody></table></div>
    <footer aria-label="Journey pagination" className="flex items-center justify-between gap-3 text-sm"><span>{payload?.page_info.total ?? 0} journeys</span><div className="flex gap-2"><button className="rounded border px-3 py-1 disabled:opacity-50" disabled={!cursorHistory.length} onClick={goPrevious}>Previous page</button><button className="rounded border px-3 py-1 disabled:opacity-50" disabled={!payload?.page_info.next_page_token} onClick={goNext}>Next page</button></div></footer>
  </section>;
}

export function TradeJourneyDetailPage() {
  const { journeyId = "" } = useParams(); const [params] = useSearchParams();
  const tenant = params.get("tenant_id") || "default", environment = params.get("environment") || "paper";
  const [detail, setDetail] = useState<JourneyDetailEnvelope>(); const [timeline, setTimeline] = useState<JourneyTimelineEnvelope>(); const [evidence, setEvidence] = useState<Record<string, unknown>>(); const [error, setError] = useState("");
  useEffect(() => { const c = new AbortController(); const q = { tenant_id: tenant, environment }; Promise.all([getTradeJourney(journeyId, q, c.signal), getTradeJourneyTimeline(journeyId, { ...q, page_size: 100 }, c.signal), getTradeJourneyEvidence(journeyId, q, c.signal)]).then(([d,t,e]) => { setDetail(d); setTimeline(t); setEvidence(e.data); }).catch(e => setError(e.message)); return () => c.abort(); }, [journeyId, tenant, environment]);
  const row = detail?.data;
  return <section className="mx-auto w-full max-w-[1400px] space-y-5 p-4 md:p-6"><Link className="inline-flex items-center gap-1 text-sm text-primary" to={`/management/trade-journeys?tenant_id=${encodeURIComponent(tenant)}&environment=${encodeURIComponent(environment)}`}><ArrowLeft size={15}/>All journeys</Link>
    {error && <div role="alert" className="rounded border border-red-500/40 bg-red-500/10 p-3">{error}</div>}{row && <><header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-xs uppercase text-muted-foreground">{row.environment} · revision {row.revision ?? "unknown"}</p><h1 className="break-all text-2xl font-semibold">{row.journey_id}</h1><p>{row.symbol || "Unknown instrument"} · {row.side || "Unknown side"} {row.quantity ?? "Unknown quantity"}</p></div><Status row={row}/></header><ReadState meta={detail.meta}/>
    <div aria-label="Journey stages" className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">{STAGES.map(stage => { const status = row.stages?.[stage]?.status; const complete = /complete|filled|reconciled|accepted|acknowledged/i.test(status || ""); const adverse = /reject|mismatch|fail|block|cancel/i.test(status || ""); return <div key={stage} aria-label={`${stage.replaceAll("_", " ")}: ${status || "unknown"}`} className={`rounded border p-2 text-xs ${adverse ? "border-red-500/50 bg-red-500/10" : complete ? "border-primary/40 bg-primary/5" : "opacity-65"}`}>{complete ? <CheckCircle2 size={15}/> : adverse ? <AlertTriangle size={15}/> : <CircleDashed size={15}/>}<span className="mt-1 block break-words">{stage.replaceAll("_", " ")}</span><span className="block font-medium">{status || "Unknown"}</span></div>; })}</div>
    {(Object.values(row.flags || {}).some(Boolean) || row.completeness?.missing_stages?.length) && <aside className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"><h2 className="font-semibold">Attention required</h2><p className="text-sm">{[...Object.entries(row.flags || {}).filter(([, active]) => active).map(([name]) => name), ...(row.completeness?.missing_stages || []).map(x => `Missing ${x}`)].join(" · ")}</p></aside>}
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]"><div className="rounded-lg border p-4"><h2 className="mb-3 text-lg font-semibold">Timeline</h2><ol className="space-y-3">{timeline?.data.items.map(event => <li key={event.event_id} className="border-l-2 border-primary/30 pl-4"><strong>{event.stage || "Unknown stage"} · {event.stage_status || "Unknown status"}</strong><div className="text-sm text-muted-foreground">Occurred {event.occurred_at ? new Date(event.occurred_at).toLocaleString() : "unknown"}{event.recorded_at && <> · recorded {new Date(event.recorded_at).toLocaleString()}</>}</div><div className="text-xs text-muted-foreground">{event.source || "Unknown source"} · {event.event_id}</div></li>)}</ol></div><aside className="rounded-lg border p-4"><h2 className="mb-3 text-lg font-semibold">Evidence</h2>{evidence ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(evidence, null, 2)}</pre> : <p className="text-sm text-muted-foreground">Evidence unavailable.</p>}<Link className="mt-3 inline-flex items-center gap-1 text-sm text-primary" to={`/management/evidence?journey_id=${encodeURIComponent(journeyId)}`}>Open Evidence Explorer <ExternalLink size={14}/></Link></aside></div></>}
  </section>;
}
