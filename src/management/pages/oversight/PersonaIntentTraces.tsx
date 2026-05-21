// 2026-05-20 revamp §6 + design ruling §2 — Persona Intent Traces.
// HARD RULE: no reveal / expand / download / reconstruct UI. Visibility ⇒
// renderable fields strictly via intentDisplayRules().

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { intentDisplayRules, type PersonaIntentTrace } from "@/lib/v5/management/personaIntent";

// Phase 1 deterministic mock list.
const TRACES: PersonaIntentTrace[] = [
  {
    id: "trace-001",
    ringPersonaId: "persona:alpha-trader",
    ringBearerId: "ringbearer:research-1",
    userIntentSummary: "Rebalance momentum sleeve toward higher beta names.",
    personaInterpretation: "Increase momentum sleeve gross to 1.2x; rotate into TSMC, NVDA.",
    proposedAction: "Submit rebalance proposal v3 to risk-owner.",
    toolsUsed: ["screener.momentum", "risk.var-projection"],
    consultedPersonas: ["persona:risk-guard"],
    visibility: "summary",
    redaction: { status: "not_required" },
    evidenceRefs: ["ev:proposal-v3"],
    riskFlags: ["beta-drift"],
    policyViolations: [],
    createdAt: "2026-05-20T09:15:00Z",
  },
  {
    id: "trace-002",
    ringPersonaId: "persona:fx-scout",
    ringBearerId: "ringbearer:trading-1",
    userIntentSummary: "[redacted by policy]",
    toolsUsed: [],
    consultedPersonas: [],
    visibility: "redacted",
    redaction: { status: "redacted", policyRef: "policy:pii-v2", redactedBy: "policy_engine" },
    evidenceRefs: [],
    riskFlags: ["policy-flag"],
    policyViolations: [],
    createdAt: "2026-05-20T10:00:00Z",
  },
  {
    id: "trace-003",
    ringPersonaId: "persona:capital-steward",
    ringBearerId: "ringbearer:capital-1",
    userIntentSummary: "[restricted]",
    toolsUsed: [],
    consultedPersonas: [],
    visibility: "restricted",
    redaction: { status: "restricted", policyRef: "policy:trade-secret", redactedBy: "bff" },
    evidenceRefs: ["ev:legal-hold-1"],
    riskFlags: [],
    policyViolations: ["confidentiality"],
    createdAt: "2026-05-20T11:00:00Z",
  },
];

const badgeTone = (b: "summary" | "redacted" | "restricted") =>
  b === "summary" ? "bg-status-success/15 text-status-success border-status-success/30" :
  b === "redacted" ? "bg-status-warning/15 text-status-warning border-status-warning/30" :
                    "bg-status-failed/15 text-status-failed border-status-failed/30";

const Trace = ({ trace }: { trace: PersonaIntentTrace }) => {
  const r = intentDisplayRules(trace.visibility);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-mono text-foreground">{trace.id}</span>
          {" · "}
          <span className="text-muted-foreground">{trace.ringPersonaId}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={badgeTone(r.badge)}>{r.badge}</Badge>
          <time className="text-xs text-muted-foreground" dateTime={trace.createdAt}>
            {new Date(trace.createdAt).toLocaleString()}
          </time>
        </div>
      </div>

      {r.showOnlyMetadata ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <dt className="text-muted-foreground">persona</dt><dd className="font-mono">{trace.ringPersonaId}</dd>
          <dt className="text-muted-foreground">visibility</dt><dd>{trace.visibility}</dd>
          <dt className="text-muted-foreground">riskFlags</dt><dd>{trace.riskFlags.length}</dd>
          <dt className="text-muted-foreground">evidenceRefs</dt><dd>{trace.evidenceRefs.length}</dd>
          {trace.redaction.policyRef && (
            <>
              <dt className="text-muted-foreground">policyRef</dt>
              <dd className="font-mono">{trace.redaction.policyRef}</dd>
            </>
          )}
        </dl>
      ) : (
        <div className="mt-3 space-y-2">
          {r.showSummary && <p className="text-sm text-foreground">{trace.userIntentSummary}</p>}
          {r.showInterpretation && trace.personaInterpretation && (
            <p className="text-sm text-muted-foreground">Interpretation: {trace.personaInterpretation}</p>
          )}
          {r.showToolsUsed && trace.toolsUsed.length > 0 && (
            <p className="text-xs text-muted-foreground">Tools: {trace.toolsUsed.join(", ")}</p>
          )}
          {r.showRiskFlags && trace.riskFlags.length > 0 && (
            <p className="text-xs">
              {trace.riskFlags.map((f) => (
                <Badge key={f} variant="outline" className="mr-1 bg-status-warning/15 text-status-warning border-status-warning/30">{f}</Badge>
              ))}
            </p>
          )}
          {r.showEvidenceRefs && trace.evidenceRefs.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Evidence: {trace.evidenceRefs.map((e) => (
                <Link key={e} to={`/management/evidence/${encodeURIComponent(e)}`} className="font-mono mr-2 text-primary underline-offset-4 hover:underline">{e}</Link>
              ))}
            </p>
          )}
        </div>
      )}
      {/* HARD RULE: no Reveal/Expand/Download/Reconstruct buttons here. */}
    </Card>
  );
};

export const PersonaIntentTracesPage = () => (
  <section className="p-6 space-y-4" aria-label="Persona Intent Traces">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">Persona Intent Traces</h1>
      <p className="text-sm text-muted-foreground">
        Trade-relevant persona intent. Already redacted by BFF / policy engine. No reveal affordance.
      </p>
    </header>
    {TRACES.map((t) => <Trace key={t.id} trace={t} />)}
  </section>
);

export const PersonaIntentTraceDetailPage = PersonaIntentTracesPage;
