// 2026-05-20 revamp §6 — Core 7 Oversight pages (Phase 1).
// Cockpit upgraded by PM-3 (composeCockpit + SystemStateStrip / LoopFlowMap /
// PersonaOodaMatrix / CriticalAnomalyPanel).
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
import { composeCockpit, defaultCockpitSeed } from "@/lib/v5/management/cockpit";
import { SystemStateStrip } from "@/management/components/cockpit/SystemStateStrip";
import { LoopFlowMap } from "@/management/components/cockpit/LoopFlowMap";
import { PersonaOodaMatrix } from "@/management/components/cockpit/PersonaOodaMatrix";
import { CriticalAnomalyPanel } from "@/management/components/cockpit/CriticalAnomalyPanel";
import { defaultPulseRankings } from "@/lib/v5/management/tradingRankings";
import {
  HUMAN_INBOX_KINDS, humanInboxRank, type HumanInboxItem, type HumanInboxKind,
} from "@/lib/v5/management/humanInbox";
import { buildLinkSet } from "@/lib/v5/management/links";

// =====================================================================
// Pathreon Management Cockpit (PM-3)
// =====================================================================

export const OneRingCockpitPage = () => {
  const model = useMemo(() => composeCockpit(defaultCockpitSeed()), []);
  return (
    <section className="p-6 space-y-4" aria-label="Pathreon Management Cockpit">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Pathreon Management Cockpit</h1>
        <p className="text-sm text-muted-foreground">Is the AI trading organisation healthy? Who needs me right now?</p>
      </header>
      <SystemStateStrip model={model.strip} />
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

interface FleetRow {
  personaId: string; owner: string; ooda: "Observe" | "Orient" | "Decide" | "Act";
  autonomy: "manual" | "supervised" | "autonomous"; perfDelta: number; humanNeeded: boolean;
  lastMutation: string;
}

const FLEET: FleetRow[] = [
  { personaId: "alpha-trader", owner: "research-1", ooda: "Decide", autonomy: "supervised", perfDelta: +0.024, humanNeeded: true, lastMutation: "2026-05-19" },
  { personaId: "risk-guard",   owner: "research-1", ooda: "Observe", autonomy: "autonomous", perfDelta: +0.005, humanNeeded: false, lastMutation: "2026-05-12" },
  { personaId: "fx-scout",     owner: "trading-1", ooda: "Orient",  autonomy: "supervised", perfDelta: -0.011, humanNeeded: false, lastMutation: "2026-05-17" },
  { personaId: "capital-steward", owner: "capital-1", ooda: "Act", autonomy: "manual",     perfDelta: +0.002, humanNeeded: true,  lastMutation: "2026-05-15" },
];

export const PersonaFleetPage = () => (
  <section className="p-6 space-y-4" aria-label="Persona Fleet">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">Persona Fleet</h1>
      <p className="text-sm text-muted-foreground">All AI trading personas across persona owners.</p>
    </header>
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Persona</th><th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">OODA</th><th className="px-3 py-2">Autonomy</th>
            <th className="px-3 py-2">Δ Performance</th><th className="px-3 py-2">Last mutation</th>
            <th className="px-3 py-2">Human needed</th>
          </tr>
        </thead>

        <tbody>
          {FLEET.map((r) => (
            <tr key={r.personaId} className="border-b border-border/50">
              <td className="px-3 py-2 font-mono">{r.personaId}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.owner}</td>
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
  const sorted = useMemo(() => [...INBOX].sort((a, b) => humanInboxRank(b.kind) - humanInboxRank(a.kind)), []);
  return (
    <section className="p-6 space-y-4" aria-label="Human Inbox">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Human Inbox</h1>
        <p className="text-sm text-muted-foreground">
          {HUMAN_INBOX_KINDS.length} kinds · required role + consequences shown up front · deep links to the page that fixes it.
        </p>
      </header>
      {sorted.map((it) => (
        <Card key={it.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{it.kind}</Badge>
              <span className="text-sm font-medium text-foreground">{it.title}</span>
              {!it.canProceed && (
                <Badge variant="outline" className="bg-status-failed/15 text-status-failed border-status-failed/30">
                  cannot proceed
                </Badge>
              )}
            </div>
            <Badge variant="outline">required role: {it.requiredRole}</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
            <div><dt className="text-muted-foreground">If approved</dt><dd className="text-foreground">{it.consequenceIfApproved}</dd></div>
            <div><dt className="text-muted-foreground">If rejected</dt><dd className="text-foreground">{it.consequenceIfRejected}</dd></div>
            <div><dt className="text-muted-foreground">If ignored</dt><dd className="text-foreground">{it.consequenceIfIgnored}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link to={it.detailHref}>Open detail</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to={it.links.manageHref}>Manage</Link></Button>
            {it.links.evidenceHref ? (
              <Button asChild size="sm" variant="outline"><Link to={it.links.evidenceHref}>Evidence</Link></Button>
            ) : (
              <span className="text-xs text-muted-foreground self-center">Evidence missing</span>
            )}
          </div>
        </Card>
      ))}
    </section>
  );
};

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
