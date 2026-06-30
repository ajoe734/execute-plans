// 2026-05-20 revamp §6 + design ruling §2 — Persona Intent Audit.
// HARD RULE: no reveal / expand / download / reconstruct UI. Visibility ⇒
// renderable fields strictly via intentDisplayRules().

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { intentDisplayRules, type PersonaIntentTrace, type PersonaIntentVisibility } from "@/lib/v5/management/personaIntent";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";

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

const sourceTypeKey = (sourceType?: string) => {
  switch (sourceType) {
    case "persona_trace":
      return "personaTrace";
    case "trainer_session":
      return "trainerSession";
    case "agora_session":
      return "agoraSession";
    default:
      return "unknownSource";
  }
};

const formatTime = (trace: PersonaIntentTrace) => {
  const ts = trace.createdAt;
  const d = ts ? new Date(ts) : null;
  return {
    iso: ts || undefined,
    label: d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "—",
  };
};

const protectionLabelKey = (visibility: PersonaIntentVisibility) => `mgmt.personaIntent.protection.${visibility}`;

const SummaryStat = ({ label, value }: { label: string; value: number }) => (
  <Card className="p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
  </Card>
);

const Trace = ({ trace }: { trace: PersonaIntentTrace }) => {
  const { t } = useTranslation();
  const r = intentDisplayRules(trace.visibility);
  const time = formatTime(trace);
  const sourceLabel = t(`mgmt.personaIntent.sourceTypes.${sourceTypeKey(trace.sourceType)}`);
  const displayTitle = r.showSummary
    ? trace.userIntentSummary
    : t("mgmt.personaIntent.restrictedRecordTitle");
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{sourceLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{trace.sourceStatus || t("mgmt.personaIntent.statusUnknown")}</span>
          </div>
          <h2 className="mt-1 break-words text-base font-semibold text-foreground">{displayTitle}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{t("mgmt.personaIntent.personaLabel")}: <span className="font-mono">{trace.ringPersonaId}</span></span>
            <span>{t("mgmt.personaIntent.recordLabel")}: <span className="font-mono">{trace.id}</span></span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={badgeTone(r.badge)}>{t(protectionLabelKey(r.badge))}</Badge>
          <time className="text-xs text-muted-foreground" dateTime={time.iso}>{time.label}</time>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-muted-foreground">{t("mgmt.personaIntent.sourceLabel")}</dt>
          <dd className="mt-1 font-medium text-foreground">{sourceLabel}</dd>
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-muted-foreground">{t("mgmt.personaIntent.protectionLabel")}</dt>
          <dd className="mt-1 font-medium text-foreground">{t(protectionLabelKey(r.badge))}</dd>
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-muted-foreground">{t("mgmt.personaIntent.riskFlagsLabel")}</dt>
          <dd className="mt-1 font-medium text-foreground">{trace.riskFlags?.length ?? 0}</dd>
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-muted-foreground">{t("mgmt.personaIntent.evidenceRefsLabel")}</dt>
          <dd className="mt-1 font-medium text-foreground">{trace.evidenceRefs?.length ?? 0}</dd>
        </div>
      </dl>

      {r.showOnlyMetadata ? (
        <dl className="mt-3 grid gap-2 rounded-md border border-status-failed/20 bg-status-failed/5 p-3 text-xs sm:grid-cols-2">
          <dt className="text-muted-foreground">{t("mgmt.personaIntent.restrictedReasonLabel")}</dt>
          <dd>{t("mgmt.personaIntent.restrictedReason")}</dd>
          {trace.redaction?.policyRef && (
            <>
              <dt className="text-muted-foreground">{t("mgmt.personaIntent.policyLabel")}</dt>
              <dd className="font-mono">{trace.redaction?.policyRef}</dd>
            </>
          )}
        </dl>
      ) : (
        <div className="mt-3 space-y-2">
          {r.showSummary && trace.title && trace.title !== trace.id && trace.title !== trace.userIntentSummary && (
            <p className="text-sm text-foreground">{trace.title}</p>
          )}
          {r.showInterpretation && trace.personaInterpretation && (
            <p className="text-sm text-muted-foreground">{t("mgmt.personaIntent.interpretationFmt", { text: trace.personaInterpretation })}</p>
          )}
          {r.showToolsUsed && (trace.toolsUsed?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">{t("mgmt.personaIntent.toolsFmt", { tools: (trace.toolsUsed ?? []).join(", ") })}</p>
          )}
          {r.showRiskFlags && (trace.riskFlags?.length ?? 0) > 0 && (
            <p className="text-xs">
              {(trace.riskFlags ?? []).map((f) => (
                <Badge key={f} variant="outline" className="mr-1 bg-status-warning/15 text-status-warning border-status-warning/30">{f}</Badge>
              ))}
            </p>
          )}
          {r.showEvidenceRefs && (trace.evidenceRefs?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("mgmt.personaIntent.evidenceLabel")} {(trace.evidenceRefs ?? []).map((e) => (
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

export const PersonaIntentTracesPage = () => {
  const { t } = useTranslation();
  const { data } = useV5Live(() => mgmt.personaIntent.list(() => TRACES), []);
  const traces = data ?? TRACES;
  const redactedCount = traces.filter((trace) => trace.visibility === "redacted").length;
  const restrictedCount = traces.filter((trace) => trace.visibility === "restricted").length;
  const riskFlagCount = traces.reduce((total, trace) => total + (trace.riskFlags?.length ?? 0), 0);
  const evidenceRefCount = traces.reduce((total, trace) => total + (trace.evidenceRefs?.length ?? 0), 0);
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.personaIntent.title")}>
      <header className="space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.personaIntent.title")}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">{t("mgmt.personaIntent.subtitle")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryStat label={t("mgmt.personaIntent.totalLabel")} value={traces.length} />
          <SummaryStat label={t("mgmt.personaIntent.redactedLabel")} value={redactedCount} />
          <SummaryStat label={t("mgmt.personaIntent.restrictedLabel")} value={restrictedCount} />
          <SummaryStat label={t("mgmt.personaIntent.riskFlagsLabel")} value={riskFlagCount} />
          <SummaryStat label={t("mgmt.personaIntent.evidenceRefsLabel")} value={evidenceRefCount} />
        </div>
      </header>
      {traces.map((tr) => <Trace key={tr.id} trace={tr} />)}
    </section>
  );
};

export const PersonaIntentTraceDetailPage = PersonaIntentTracesPage;
