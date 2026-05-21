// 2026-05-20 revamp §6 — Core 7 Oversight pages (Phase 1).
// Replaces M1 stubs with real, data-driven UIs. Each page renders from a
// pure local view-model + minimal seed access so the routes are real.
//
// PersonaIntent + readiness pages live in their own files.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TRADING_BASELINE_DEFAULTS, TRADING_BASELINE_KINDS,
  baselineLabel, type TradingBaselineKind,
} from "@/lib/v5/management/tradingBaseline";

// =====================================================================
// One Ring Cockpit — top-level oversight aggregate.
// =====================================================================

const COCKPIT_KPIS = {
  autonomyState: "guarded" as const,
  humanPending: 3,
  criticalFindings: 1,
  ringBearers: 4,
  personas: 12,
};

const COCKPIT_SECTIONS = [
  { title: "Persona Fleet snapshot", href: "/management/persona-fleet", body: "12 personas across 4 ring bearers · 2 in OODA-Decide · 1 paused" },
  { title: "Trading Pulse", href: "/management/trading-pulse", body: "1 canary positive vs previous artifact · 1 paper drift watching" },
  { title: "Evolution summary", href: "/management/evolution-journal", body: "2 mutations landed this week · 1 reverted" },
];

export const OneRingCockpitPage = () => (
  <section className="p-6 space-y-4" aria-label="One Ring Cockpit">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">One Ring Cockpit</h1>
      <p className="text-sm text-muted-foreground">Is the AI trading organisation healthy? Who needs me right now?</p>
    </header>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Card className="p-3"><div className="text-xs text-muted-foreground">Autonomy</div><div className="text-lg font-semibold">{COCKPIT_KPIS.autonomyState}</div></Card>
      <Card className="p-3"><div className="text-xs text-muted-foreground">Human pending</div><div className="text-lg font-semibold">{COCKPIT_KPIS.humanPending}</div></Card>
      <Card className="p-3"><div className="text-xs text-muted-foreground">Critical findings</div><div className="text-lg font-semibold">{COCKPIT_KPIS.criticalFindings}</div></Card>
      <Card className="p-3"><div className="text-xs text-muted-foreground">Ring bearers</div><div className="text-lg font-semibold">{COCKPIT_KPIS.ringBearers}</div></Card>
      <Card className="p-3"><div className="text-xs text-muted-foreground">Personas</div><div className="text-lg font-semibold">{COCKPIT_KPIS.personas}</div></Card>
    </div>
    <div className="grid gap-3 lg:grid-cols-3">
      {COCKPIT_SECTIONS.map((s) => (
        <Card key={s.href} className="p-4">
          <h2 className="text-sm font-semibold text-foreground">{s.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
          <Link to={s.href} className="mt-2 inline-block text-xs text-primary underline-offset-4 hover:underline">Open →</Link>
        </Card>
      ))}
    </div>
  </section>
);

// =====================================================================
// Persona Fleet
// =====================================================================

interface FleetRow {
  personaId: string; ringBearer: string; ooda: "Observe" | "Orient" | "Decide" | "Act";
  autonomy: "manual" | "supervised" | "autonomous"; perfDelta: number; humanNeeded: boolean;
  lastMutation: string;
}

const FLEET: FleetRow[] = [
  { personaId: "alpha-trader", ringBearer: "research-1", ooda: "Decide", autonomy: "supervised", perfDelta: +0.024, humanNeeded: true, lastMutation: "2026-05-19" },
  { personaId: "risk-guard",   ringBearer: "research-1", ooda: "Observe", autonomy: "autonomous", perfDelta: +0.005, humanNeeded: false, lastMutation: "2026-05-12" },
  { personaId: "fx-scout",     ringBearer: "trading-1", ooda: "Orient",  autonomy: "supervised", perfDelta: -0.011, humanNeeded: false, lastMutation: "2026-05-17" },
  { personaId: "capital-steward", ringBearer: "capital-1", ooda: "Act", autonomy: "manual",     perfDelta: +0.002, humanNeeded: true,  lastMutation: "2026-05-15" },
];

export const PersonaFleetPage = () => (
  <section className="p-6 space-y-4" aria-label="Persona Fleet">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">Persona Fleet</h1>
      <p className="text-sm text-muted-foreground">All AI trading personas across ring bearers.</p>
    </header>
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Persona</th><th className="px-3 py-2">Ring bearer</th>
            <th className="px-3 py-2">OODA</th><th className="px-3 py-2">Autonomy</th>
            <th className="px-3 py-2">Δ Performance</th><th className="px-3 py-2">Last mutation</th>
            <th className="px-3 py-2">Human needed</th>
          </tr>
        </thead>
        <tbody>
          {FLEET.map((r) => (
            <tr key={r.personaId} className="border-b border-border/50">
              <td className="px-3 py-2 font-mono">{r.personaId}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.ringBearer}</td>
              <td className="px-3 py-2"><Badge variant="outline">{r.ooda}</Badge></td>
              <td className="px-3 py-2"><Badge variant="outline">{r.autonomy}</Badge></td>
              <td className={"px-3 py-2 " + (r.perfDelta >= 0 ? "text-status-success" : "text-status-failed")}>
                {(r.perfDelta * 100).toFixed(2)}%
              </td>
              <td className="px-3 py-2 text-muted-foreground">{r.lastMutation}</td>
              <td className="px-3 py-2">
                {r.humanNeeded
                  ? <Badge variant="outline" className="bg-status-warning/15 text-status-warning border-status-warning/30">yes</Badge>
                  : <span className="text-xs text-muted-foreground">no</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  </section>
);

// =====================================================================
// Human Inbox
// =====================================================================

interface InboxItem {
  id: string; kind: "approval" | "sentinel" | "ask";
  title: string; requiredRole: string;
  consequenceIfApproved: string; consequenceIfRejected: string; consequenceIfIgnored: string;
  href: string;
}

const INBOX: InboxItem[] = [
  { id: "appr-001", kind: "approval", title: "Approve mutation v3 for alpha-trader", requiredRole: "research-owner",
    consequenceIfApproved: "Mutation enters paper run", consequenceIfRejected: "Mutation discarded",
    consequenceIfIgnored: "Times out in 12h", href: "/management/approvals" },
  { id: "sent-019", kind: "sentinel", title: "Beta drift critical on momentum sleeve", requiredRole: "risk-owner",
    consequenceIfApproved: "Acknowledged + remediation", consequenceIfRejected: "Auto-paused",
    consequenceIfIgnored: "Auto-paused in 30m", href: "/management/sentinel" },
  { id: "ask-007", kind: "ask", title: "Persona asks: extend live-paper overlap?", requiredRole: "operator",
    consequenceIfApproved: "Overlap +2d", consequenceIfRejected: "Continue as planned",
    consequenceIfIgnored: "Default: continue", href: "/management/interventions" },
];

export const HumanInboxPage = () => (
  <section className="p-6 space-y-4" aria-label="Human Inbox">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">Human Inbox</h1>
      <p className="text-sm text-muted-foreground">One queue. Required role + consequences shown up front.</p>
    </header>
    {INBOX.map((it) => (
      <Card key={it.id} className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{it.kind}</Badge>
            <span className="text-sm font-medium text-foreground">{it.title}</span>
          </div>
          <Badge variant="outline">required role: {it.requiredRole}</Badge>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
          <div><dt className="text-muted-foreground">If approved</dt><dd className="text-foreground">{it.consequenceIfApproved}</dd></div>
          <div><dt className="text-muted-foreground">If rejected</dt><dd className="text-foreground">{it.consequenceIfRejected}</dd></div>
          <div><dt className="text-muted-foreground">If ignored</dt><dd className="text-foreground">{it.consequenceIfIgnored}</dd></div>
        </dl>
        <div className="mt-3 flex gap-2">
          <Button asChild size="sm" variant="outline"><Link to={it.href}>Open</Link></Button>
          <Button size="sm" variant="outline">Request more evidence</Button>
        </div>
      </Card>
    ))}
  </section>
);

// =====================================================================
// Trading Pulse — baselineKind enum + baselineLabel display.
// =====================================================================

interface PulseRow {
  surface: "paper" | "canary" | "live";
  current: number; baselineKind: TradingBaselineKind; baselineLabel?: string;
  baselineValue: number; rollbackReady: boolean; killSwitchReady: boolean;
}

const PULSE: PulseRow[] = [
  { surface: "paper",  current: 1.42, baselineKind: "previous_artifact", baselineValue: 1.31, rollbackReady: true,  killSwitchReady: true },
  { surface: "canary", current: 1.28, baselineKind: "7d_rolling",        baselineValue: 1.20, rollbackReady: true,  killSwitchReady: true },
  { surface: "live",   current: 1.05, baselineKind: "last_review",       baselineValue: 1.10, rollbackReady: true,  killSwitchReady: true },
];

export const TradingPulsePage = () => {
  const [selectedKind, setSelectedKind] = useState<TradingBaselineKind | "default">("default");
  const visible = useMemo(() => {
    if (selectedKind === "default") {
      return PULSE.filter((p) => TRADING_BASELINE_DEFAULTS.includes(p.baselineKind));
    }
    return PULSE.filter((p) => p.baselineKind === selectedKind);
  }, [selectedKind]);
  return (
    <section className="p-6 space-y-4" aria-label="Trading Pulse">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Trading Pulse</h1>
        <p className="text-sm text-muted-foreground">Paper / canary / live vs configured baseline.</p>
      </header>
      <Card className="p-4">
        <label className="text-xs text-muted-foreground" htmlFor="baseline-kind">Baseline</label>
        <select
          id="baseline-kind"
          value={selectedKind}
          onChange={(e) => setSelectedKind(e.target.value as TradingBaselineKind | "default")}
          className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="default">Default (3 cards)</option>
          {TRADING_BASELINE_KINDS.map((k) => (
            <option key={k} value={k}>{baselineLabel(k)}</option>
          ))}
        </select>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        {visible.map((p) => {
          const delta = p.current - p.baselineValue;
          return (
            <Card key={`${p.surface}-${p.baselineKind}`} className="p-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline">{p.surface}</Badge>
                <Badge variant="outline">{baselineLabel(p.baselineKind, p.baselineLabel)}</Badge>
              </div>
              <div className="mt-2 text-2xl font-semibold">{p.current.toFixed(2)}</div>
              <div className={"text-xs " + (delta >= 0 ? "text-status-success" : "text-status-failed")}>
                {delta >= 0 ? "+" : ""}{delta.toFixed(2)} vs {baselineLabel(p.baselineKind)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {p.rollbackReady && <Badge variant="outline" className="bg-status-success/15 text-status-success border-status-success/30">rollback ready</Badge>}
                {p.killSwitchReady && <Badge variant="outline" className="bg-status-success/15 text-status-success border-status-success/30">kill-switch ready</Badge>}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
};

// =====================================================================
// Evolution Journal
// =====================================================================

interface EvolutionEntry {
  id: string; mutation: string; before: number; after: number;
  verdict: "improved" | "degraded" | "inconclusive"; landedAt: string;
}

const EVOLUTION: EvolutionEntry[] = [
  { id: "ev-101", mutation: "Tune momentum lookback 30→45", before: 1.20, after: 1.31, verdict: "improved", landedAt: "2026-05-19" },
  { id: "ev-102", mutation: "Add ATR-based position sizing", before: 1.05, after: 1.04, verdict: "inconclusive", landedAt: "2026-05-17" },
  { id: "ev-103", mutation: "Switch to vol-target rebal weekly", before: 1.10, after: 0.98, verdict: "degraded", landedAt: "2026-05-15" },
];

const verdictTone = (v: EvolutionEntry["verdict"]) =>
  v === "improved" ? "bg-status-success/15 text-status-success border-status-success/30" :
  v === "degraded" ? "bg-status-failed/15 text-status-failed border-status-failed/30" :
                    "bg-muted text-muted-foreground border-border";

export const EvolutionJournalPage = () => (
  <section className="p-6 space-y-4" aria-label="Evolution Journal">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">Evolution Journal</h1>
      <p className="text-sm text-muted-foreground">How the AI trading system improved itself.</p>
    </header>
    {EVOLUTION.map((e) => (
      <Card key={e.id} className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            <span className="font-mono">{e.id}</span> · {e.mutation}
          </div>
          <Badge variant="outline" className={verdictTone(e.verdict)}>{e.verdict}</Badge>
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-muted-foreground">Before</dt><dd className="text-foreground">{e.before.toFixed(2)}</dd></div>
          <div><dt className="text-muted-foreground">After</dt><dd className="text-foreground">{e.after.toFixed(2)}</dd></div>
          <div><dt className="text-muted-foreground">Landed</dt><dd className="text-foreground">{e.landedAt}</dd></div>
        </dl>
      </Card>
    ))}
  </section>
);

// =====================================================================
// Evidence Explorer
// =====================================================================

interface EvidenceRow {
  id: string; kind: string; status: "verified" | "stale" | "missing";
  hash: string; linkedObject: string; createdAt: string;
}

const EVIDENCE: EvidenceRow[] = [
  { id: "ev:proposal-v3", kind: "MutationProposal", status: "verified", hash: "0xprop3", linkedObject: "persona:alpha-trader", createdAt: "2026-05-19" },
  { id: "ev:paper-14d",  kind: "Paper14dEvidence", status: "verified", hash: "0xpap14", linkedObject: "strategy:alpha-momentum", createdAt: "2026-05-19" },
  { id: "ev:legal-hold-1", kind: "PolicyEvidence", status: "verified", hash: "0xlegal1", linkedObject: "trace-003", createdAt: "2026-05-20" },
];

export const EvidenceExplorerPage = () => (
  <section className="p-6 space-y-4" aria-label="Evidence Explorer">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">Evidence Explorer</h1>
      <p className="text-sm text-muted-foreground">Proof packets, readiness evidence, and assertion history.</p>
    </header>
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">ID</th><th className="px-3 py-2">Kind</th>
            <th className="px-3 py-2">Status</th><th className="px-3 py-2">Hash</th>
            <th className="px-3 py-2">Linked object</th><th className="px-3 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {EVIDENCE.map((e) => (
            <tr key={e.id} className="border-b border-border/50">
              <td className="px-3 py-2 font-mono"><Link to={`/management/evidence/${encodeURIComponent(e.id)}`} className="text-primary underline-offset-4 hover:underline">{e.id}</Link></td>
              <td className="px-3 py-2">{e.kind}</td>
              <td className="px-3 py-2"><Badge variant="outline">{e.status}</Badge></td>
              <td className="px-3 py-2 font-mono text-xs">{e.hash}</td>
              <td className="px-3 py-2 font-mono text-xs">{e.linkedObject}</td>
              <td className="px-3 py-2 text-muted-foreground">{e.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  </section>
);

export const EvidencePacketDetailPage = () => (
  <section className="p-6 space-y-4" aria-label="Evidence Packet">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">Evidence Packet</h1>
      <p className="text-sm text-muted-foreground">Detail view (Phase 1 minimum).</p>
    </header>
    <Card className="p-4">
      <p className="text-sm">See list at <Link to="/management/evidence" className="text-primary underline-offset-4 hover:underline">Evidence Explorer</Link>.</p>
    </Card>
  </section>
);
