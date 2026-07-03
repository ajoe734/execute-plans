// Persona Intent debug view. Do not apply extra frontend masking here: the page
// should show normalized fields and the BFF row as received.

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { intentDisplayRules, type PersonaIntentTrace, type PersonaIntentVisibility } from "@/lib/v5/management/personaIntent";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";

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

const redactedByKey = (redactedBy?: PersonaIntentTrace["redaction"]["redactedBy"]) =>
  `mgmt.personaIntent.redactedBy.${redactedBy ?? "unknown"}`;

const SummaryStat = ({ label, value }: { label: string; value: number }) => (
  <Card className="p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
  </Card>
);

const formatDebugValue = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "[]";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

const DebugField = ({ label, value, mono = false }: { label: string; value: unknown; mono?: boolean }) => (
  <div className="rounded-md bg-muted/40 p-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className={`mt-1 break-words text-sm text-foreground ${mono ? "font-mono" : ""}`}>
      {formatDebugValue(value)}
    </dd>
  </div>
);

const DebugJson = ({ label, value }: { label: string; value: unknown }) => (
  <div className="mt-4">
    <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
    <pre className="mt-2 max-h-[520px] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  </div>
);

const PurposePanel = () => {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.personaIntent.purposeTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("mgmt.personaIntent.purposeBody")}</p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">{t("mgmt.personaIntent.purposeQuestionLabel")}</dt>
            <dd className="mt-1 text-foreground">{t("mgmt.personaIntent.purposeQuestionIntent")}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">{t("mgmt.personaIntent.purposeProtectionLabel")}</dt>
            <dd className="mt-1 text-foreground">{t("mgmt.personaIntent.purposeQuestionProtection")}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">{t("mgmt.personaIntent.purposeFollowupLabel")}</dt>
            <dd className="mt-1 text-foreground">{t("mgmt.personaIntent.purposeQuestionFollowup")}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
};

const Trace = ({ trace }: { trace: PersonaIntentTrace }) => {
  const { t } = useTranslation();
  const r = intentDisplayRules(trace.visibility);
  const time = formatTime(trace);
  const sourceLabel = t(`mgmt.personaIntent.sourceTypes.${sourceTypeKey(trace.sourceType)}`);
  const redactedBy = t(redactedByKey(trace.redaction?.redactedBy));
  const policy = trace.redaction?.policyRef || t("mgmt.personaIntent.policyUnknown");
  const status = trace.sourceStatus || t("mgmt.personaIntent.statusUnknown");
  const displayTitle = trace.userIntentSummary || trace.title || trace.id;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{sourceLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{status}</span>
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
        <DebugField label={t("mgmt.personaIntent.sourceLabel")} value={`${sourceLabel} · ${status}`} />
        <DebugField label={t("mgmt.personaIntent.protectionLabel")} value={t(protectionLabelKey(r.badge))} />
        <DebugField label={t("mgmt.personaIntent.policyLabel")} value={policy} mono />
        <DebugField label={t("mgmt.personaIntent.followupSignalsLabel")} value={t("mgmt.personaIntent.followupSignalsFmt", {
          risks: trace.riskFlags?.length ?? 0,
          evidence: trace.evidenceRefs?.length ?? 0,
        })} />
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.5fr)]">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {t("mgmt.personaIntent.normalizedFieldsLabel")}
          </div>
          <dl className="mt-2 grid gap-3 sm:grid-cols-2">
            <DebugField label={t("mgmt.personaIntent.titleLabel")} value={trace.title} />
            <DebugField label={t("mgmt.personaIntent.summaryLabel")} value={trace.userIntentSummary} />
            <DebugField label={t("mgmt.personaIntent.interpretationLabel")} value={trace.personaInterpretation} />
            <DebugField label={t("mgmt.personaIntent.proposedActionLabel")} value={trace.proposedAction} />
            <DebugField label={t("mgmt.personaIntent.toolsUsedLabel")} value={trace.toolsUsed} mono />
            <DebugField label={t("mgmt.personaIntent.consultedPersonasLabel")} value={trace.consultedPersonas} mono />
            <DebugField label={t("mgmt.personaIntent.riskFlagsLabel")} value={trace.riskFlags} mono />
            <DebugField label={t("mgmt.personaIntent.policyViolationsLabel")} value={trace.policyViolations} mono />
          </dl>
          <div className="mt-3 rounded-md bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{t("mgmt.personaIntent.evidenceRefsLabel")}</div>
            <div className="mt-1 text-sm text-foreground">
              {(trace.evidenceRefs?.length ?? 0) > 0 ? (
                trace.evidenceRefs.map((e) => (
                  <Link key={e} to={`/management/evidence/${encodeURIComponent(e)}`} className="font-mono mr-2 text-primary underline-offset-4 hover:underline">{e}</Link>
                ))
              ) : (
                <span className="text-muted-foreground">{t("mgmt.personaIntent.emptyArray")}</span>
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {t("mgmt.personaIntent.backendStateLabel")}
          </div>
          <dl className="mt-2 grid gap-3">
            <DebugField label={t("mgmt.personaIntent.sourceIdLabel")} value={trace.sourceId} mono />
            <DebugField label={t("mgmt.personaIntent.ringBearerLabel")} value={trace.ringBearerId} mono />
            <DebugField label={t("mgmt.personaIntent.redactedByLabel")} value={redactedBy} />
            <DebugField label={t("mgmt.personaIntent.redactionStatusLabel")} value={trace.redaction?.status} />
            <DebugField label={t("mgmt.personaIntent.createdAtLabel")} value={trace.createdAt} mono />
          </dl>
        </div>
      </div>

      <DebugJson label={t("mgmt.personaIntent.rawRecordLabel")} value={trace.debugRecord ?? trace} />
    </Card>
  );
};

export const PersonaIntentTracesPage = () => {
  const { t } = useTranslation();
  const { data } = useV5Live(() => mgmt.personaIntent.listLiveOnly(), []);
  const traces = data ?? [];
  const redactedCount = traces.filter((trace) => trace.visibility === "redacted").length;
  const restrictedCount = traces.filter((trace) => trace.visibility === "restricted").length;
  const riskFlagCount = traces.reduce((total, trace) => total + (trace.riskFlags?.length ?? 0), 0);
  const evidenceRefCount = traces.reduce((total, trace) => total + (trace.evidenceRefs?.length ?? 0), 0);
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.personaIntent.title")}>
      <header className="space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.personaIntent.title")}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">{t("mgmt.personaIntent.subtitle")}</p>
        <PurposePanel />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryStat label={t("mgmt.personaIntent.totalLabel")} value={traces.length} />
          <SummaryStat label={t("mgmt.personaIntent.redactedLabel")} value={redactedCount} />
          <SummaryStat label={t("mgmt.personaIntent.restrictedLabel")} value={restrictedCount} />
          <SummaryStat label={t("mgmt.personaIntent.riskFlagsLabel")} value={riskFlagCount} />
          <SummaryStat label={t("mgmt.personaIntent.evidenceRefsLabel")} value={evidenceRefCount} />
        </div>
      </header>
      {traces.length > 0 ? (
        traces.map((tr) => <Trace key={tr.id} trace={tr} />)
      ) : (
        <div className="rounded-md border border-dashed border-border p-6">
          <h2 className="text-sm font-semibold text-foreground">{t("mgmt.personaIntent.emptyTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("mgmt.personaIntent.emptyBody")}</p>
        </div>
      )}
    </section>
  );
};

export const PersonaIntentTraceDetailPage = PersonaIntentTracesPage;
