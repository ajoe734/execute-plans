import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { mgmt } from "@/lib/bff-v1";
import {
  formatPersonaDisplayName,
  normalizePersonaIntentKind,
  normalizePersonaIntentRecord,
  type PersonaIntentAuditRecord,
  type PersonaIntentKind,
} from "@/lib/bff-v1/management";
import {
  outcomeLabel,
  reasonCodeLabel,
  resolveEnumLabel,
  statusBadgeClass,
  statusLabel,
  type TranslateFn,
} from "@/lib/enumLabels";
import type { PersonaIntentTrace } from "@/lib/v5/management/personaIntent";
import { useV5Live } from "@/management/pages/v5/useV5Live";

export type PersonaIntentFilterKind = PersonaIntentKind | "all";

const KIND_FILTER_ORDER: PersonaIntentFilterKind[] = [
  "trade_intent",
  "consultation",
  "meeting",
  "trainer",
  "all",
];

const KIND_BADGE_CLASS: Record<PersonaIntentKind, string> = {
  trade_intent: "bg-primary/15 text-primary border-primary/30",
  consultation: "bg-info/15 text-info border-info/30",
  meeting: "bg-accent/15 text-accent border-accent/30",
  trainer: "bg-status-warning/15 text-status-warning border-status-warning/30",
};

const isPlaceholderRedacted = (value?: string): boolean =>
  !value || /^\[(redacted|restricted|withheld)(?:\s+by\s+policy)?\]$/i.test(value.trim());

const parseInitialKindFilter = (raw: string | null): PersonaIntentFilterKind => {
  if (!raw) return "trade_intent";
  const lower = raw.trim().toLowerCase();
  if (lower === "all" || lower === "*") return "all";
  if (
    lower === "trade_intent" ||
    lower === "consultation" ||
    lower === "meeting" ||
    lower === "trainer"
  ) {
    return lower;
  }
  return normalizePersonaIntentKind({ kind: lower });
};

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

const formatTime = (createdAt?: string) => {
  const ts = createdAt?.trim();
  const d = ts ? new Date(ts) : null;
  return {
    iso: ts || undefined,
    label: d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "—",
  };
};

const formatAuditOutcome = (value: string | undefined, t: TranslateFn): string => {
  const clean = value?.trim();
  if (!clean || isPlaceholderRedacted(clean)) return "";
  const resolved = resolveEnumLabel("outcome", clean, t);
  if (resolved.isKnown) {
    return outcomeLabel(clean, t);
  }
  if (!clean.includes(" ") && clean.includes("_")) {
    return clean.replace(/_/g, " ");
  }
  return clean;
};

const resolveWithheldFieldLabel = (field: string, t: TranslateFn): string => {
  const norm = field
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
  const fallback = norm.replace(/_/g, " ");
  return t(`mgmt.personaIntent.withheldFieldsMap.${norm}`, { defaultValue: fallback });
};

const ensureAuditRecord = (
  item: PersonaIntentTrace | PersonaIntentAuditRecord | Record<string, unknown>,
): PersonaIntentAuditRecord => {
  const asRecord = item as Record<string, unknown>;
  const debugRecord =
    typeof asRecord.debugRecord === "object" && asRecord.debugRecord !== null
      ? (asRecord.debugRecord as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = {
    ...debugRecord,
    ...asRecord,
  };
  const normalized = normalizePersonaIntentRecord(merged);
  if (normalized) return normalized;

  const fallbackId = String(asRecord.id ?? "unknown");
  const ringPersonaId = String(asRecord.ringPersonaId ?? asRecord.persona_id ?? "unassigned");
  return {
    id: fallbackId,
    title: String(asRecord.title ?? fallbackId),
    kind: normalizePersonaIntentKind(merged),
    personaName: formatPersonaDisplayName(
      ringPersonaId,
      typeof asRecord.personaName === "string" ? asRecord.personaName : undefined,
    ),
    topic: String(asRecord.topic ?? asRecord.title ?? asRecord.userIntentSummary ?? fallbackId),
    outcome: typeof asRecord.outcome === "string" ? asRecord.outcome : undefined,
    decision: typeof asRecord.decision === "string" ? asRecord.decision : undefined,
    sourceType: typeof asRecord.sourceType === "string" ? asRecord.sourceType : "unknown",
    sourceId: String(asRecord.sourceId ?? fallbackId),
    sourceStatus: typeof asRecord.sourceStatus === "string" ? asRecord.sourceStatus : "",
    ringPersonaId,
    ringBearerId: String(asRecord.ringBearerId ?? fallbackId),
    userIntentSummary: String(asRecord.userIntentSummary ?? ""),
    proposedAction: typeof asRecord.proposedAction === "string" ? asRecord.proposedAction : undefined,
    toolsUsed: Array.isArray(asRecord.toolsUsed) ? (asRecord.toolsUsed as string[]) : [],
    consultedPersonas: Array.isArray(asRecord.consultedPersonas)
      ? (asRecord.consultedPersonas as string[])
      : [],
    consultedPersonaEntries: Array.isArray(asRecord.consultedPersonas)
      ? (asRecord.consultedPersonas as string[]).map((name) => ({
          id: String(name),
          name: formatPersonaDisplayName(String(name)),
        }))
      : [],
    withheldFields: [],
    withheldReasonCodes: [],
    visibility: "redacted",
    redaction: { status: "redacted" },
    evidenceRefs: Array.isArray(asRecord.evidenceRefs) ? (asRecord.evidenceRefs as string[]) : [],
    riskFlags: Array.isArray(asRecord.riskFlags) ? (asRecord.riskFlags as string[]) : [],
    policyViolations: Array.isArray(asRecord.policyViolations)
      ? (asRecord.policyViolations as string[])
      : [],
    createdAt: String(asRecord.createdAt ?? ""),
  };
};

const getWithheldReasonForField = (
  record: PersonaIntentAuditRecord,
  t: TranslateFn,
  ...aliases: string[]
): string | undefined => {
  const aliasSet = new Set(aliases.map((a) => a.toLowerCase()));
  const matched = record.withheldFields.find((wf) => aliasSet.has(wf.field.toLowerCase()));
  if (!matched) return undefined;
  return reasonCodeLabel(matched.reasonCode, t);
};

const SummaryStat = ({ label, value }: { label: string; value: number }) => (
  <Card className="p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
  </Card>
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

const AuditCard = ({ record }: { record: PersonaIntentAuditRecord }) => {
  const { t } = useTranslation();
  const time = formatTime(record.createdAt);
  const sourceLabel = t(`mgmt.personaIntent.sourceTypes.${sourceTypeKey(record.sourceType)}`);
  const kindBadgeLabel = t(`mgmt.personaIntent.kindBadges.${record.kind}`);
  const statusText = record.sourceStatus
    ? statusLabel(record.sourceStatus, t)
    : t("mgmt.personaIntent.statusUnknown");

  const topicWithheldReason = getWithheldReasonForField(record, t, "topic", "title");
  const topicText = !isPlaceholderRedacted(record.topic)
    ? record.topic
    : topicWithheldReason || record.title || "—";

  const proposedActionWithheldReason = getWithheldReasonForField(
    record,
    t,
    "proposed_action",
    "proposedaction",
    "action",
    "recommendation",
  );
  const hasProposedAction = Boolean(record.proposedAction && !isPlaceholderRedacted(record.proposedAction));
  const proposedActionText = hasProposedAction
    ? record.proposedAction!
    : proposedActionWithheldReason || t("mgmt.personaIntent.noProposedAction");

  const outcomeWithheldReason = getWithheldReasonForField(record, t, "outcome", "decision");
  const formattedOutcome = formatAuditOutcome(record.outcome, t);
  const formattedDecision = formatAuditOutcome(record.decision, t);
  const outcomeDisplay =
    formattedOutcome && formattedDecision && formattedDecision !== formattedOutcome
      ? `${formattedOutcome} · ${formattedDecision}`
      : formattedOutcome || formattedDecision;
  const outcomeText = outcomeDisplay || outcomeWithheldReason || t("mgmt.personaIntent.noOutcome");

  const toolsWithheldReason = getWithheldReasonForField(record, t, "tools_used", "toolsused", "tool_path");
  const consultedWithheldReason = getWithheldReasonForField(
    record,
    t,
    "consulted_personas",
    "consultedpersonas",
  );

  const canLinkPersona =
    Boolean(record.ringPersonaId) &&
    record.ringPersonaId !== "unassigned" &&
    record.ringPersonaId !== "unknown";

  return (
    <Card className="p-5 space-y-4" data-testid={`persona-intent-card-${record.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={KIND_BADGE_CLASS[record.kind]}>
              {kindBadgeLabel}
            </Badge>
            {record.sourceStatus && (
              <Badge variant="outline" className={statusBadgeClass(record.sourceStatus)}>
                {statusText}
              </Badge>
            )}
            {sourceLabel.toLowerCase() !== kindBadgeLabel.toLowerCase() && (
              <span className="text-xs text-muted-foreground">{sourceLabel}</span>
            )}
          </div>
          <h2 className="break-words text-base font-semibold text-foreground">{topicText}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{t("mgmt.personaIntent.personaLabel")}:</span>
            {canLinkPersona ? (
              <Link
                to={`/management/personas/${encodeURIComponent(record.ringPersonaId)}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {record.personaName}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{record.personaName}</span>
            )}
          </div>
        </div>
        <time className="shrink-0 text-xs text-muted-foreground" dateTime={time.iso}>
          {time.label}
        </time>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-xs font-medium text-muted-foreground">{t("mgmt.personaIntent.topicLabel")}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{topicText}</dd>
        </div>

        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-xs font-medium text-muted-foreground">{t("mgmt.personaIntent.proposedActionLabel")}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{proposedActionText}</dd>
        </div>

        <div className="rounded-md bg-muted/40 p-3">
          <dt className="text-xs font-medium text-muted-foreground">{t("mgmt.personaIntent.outcomeLabel")}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{outcomeText}</dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-muted/40 p-3">
          <div className="text-xs font-medium text-muted-foreground">{t("mgmt.personaIntent.toolsUsedLabel")}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-sm text-foreground">
            {record.toolsUsed.length > 0 ? (
              record.toolsUsed.map((tool) => (
                <Badge key={tool} variant="secondary" className="font-normal">
                  {tool}
                </Badge>
              ))
            ) : toolsWithheldReason ? (
              <span className="text-muted-foreground">{toolsWithheldReason}</span>
            ) : (
              <span className="text-muted-foreground">{t("mgmt.personaIntent.noToolsUsed")}</span>
            )}
          </div>
        </div>

        <div className="rounded-md bg-muted/40 p-3">
          <div className="text-xs font-medium text-muted-foreground">{t("mgmt.personaIntent.consultedPersonasLabel")}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-sm text-foreground">
            {record.consultedPersonaEntries.length > 0 ? (
              record.consultedPersonaEntries.map((peer) => (
                <Badge key={peer.id || peer.name} variant="outline" className="font-normal">
                  {peer.name}
                </Badge>
              ))
            ) : consultedWithheldReason ? (
              <span className="text-muted-foreground">{consultedWithheldReason}</span>
            ) : (
              <span className="text-muted-foreground">{t("mgmt.personaIntent.noConsultedPersonas")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-muted/40 p-3">
          <div className="text-xs font-medium text-muted-foreground">{t("mgmt.personaIntent.riskFlagsLabel")}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-sm">
            {record.riskFlags.length > 0 || record.policyViolations.length > 0 ? (
              <>
                {record.riskFlags.map((flag) => (
                  <Badge
                    key={`risk-${flag}`}
                    variant="outline"
                    className="bg-status-warning/15 text-status-warning border-status-warning/30"
                  >
                    {flag}
                  </Badge>
                ))}
                {record.policyViolations.map((violation) => (
                  <Badge
                    key={`policy-${violation}`}
                    variant="outline"
                    className="bg-status-failed/15 text-status-failed border-status-failed/30"
                  >
                    {violation}
                  </Badge>
                ))}
              </>
            ) : (
              <span className="text-muted-foreground">{t("mgmt.personaIntent.noRiskFlags")}</span>
            )}
          </div>
        </div>

        <div className="rounded-md bg-muted/40 p-3">
          <div className="text-xs font-medium text-muted-foreground">{t("mgmt.personaIntent.evidenceRefsLabel")}</div>
          <div className="mt-1.5 flex flex-wrap gap-2 text-sm text-foreground">
            {record.evidenceRefs.length > 0 ? (
              record.evidenceRefs.map((ref) => (
                <Link
                  key={ref}
                  to={`/management/evidence/${encodeURIComponent(ref)}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {ref}
                </Link>
              ))
            ) : (
              <span className="text-muted-foreground">{t("mgmt.personaIntent.noEvidenceRefs")}</span>
            )}
          </div>
        </div>
      </div>

      {record.withheldFields.length > 0 && (
        <div className="rounded-md border border-border/70 bg-muted/20 p-3" data-testid="persona-intent-withheld-fields">
          <div className="text-xs font-medium text-muted-foreground">
            {t("mgmt.personaIntent.withheldFieldsLabel")}
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {record.withheldFields.map((wf) => (
              <li key={`${wf.field}:${wf.reasonCode}`} className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-medium text-foreground">
                  {resolveWithheldFieldLabel(wf.field, t)}:
                </span>
                <span>{reasonCodeLabel(wf.reasonCode, t)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};

export const PersonaIntentTracesPage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedKind, setSelectedKind] = useState<PersonaIntentFilterKind>(() =>
    parseInitialKindFilter(searchParams.get("kind")),
  );

  const { data } = useV5Live(
    (signal) => mgmt.personaIntent.listLiveOnly({ kind: selectedKind, signal }),
    [selectedKind],
    {
      cacheKey: "oversight.personaIntent.list",
    },
  );

  const allRecords = useMemo(
    () => (data ?? []).map((item) => ensureAuditRecord(item)),
    [data],
  );

  const visibleRecords = useMemo(() => {
    if (selectedKind === "all") return allRecords;
    return allRecords.filter((rec) => rec.kind === selectedKind);
  }, [allRecords, selectedKind]);

  const handleSelectKind = (kind: PersonaIntentFilterKind) => {
    setSelectedKind(kind);
    const next = new URLSearchParams(searchParams);
    if (kind === "trade_intent") {
      next.delete("kind");
    } else {
      next.set("kind", kind);
    }
    setSearchParams(next, { replace: true });
  };

  const withProposalCount = visibleRecords.filter(
    (rec) => Boolean(rec.proposedAction && !isPlaceholderRedacted(rec.proposedAction)),
  ).length;
  const withConsultedCount = visibleRecords.filter(
    (rec) => rec.consultedPersonaEntries.length > 0,
  ).length;
  const riskFlagCount = visibleRecords.reduce(
    (total, rec) => total + rec.riskFlags.length + rec.policyViolations.length,
    0,
  );
  const evidenceRefCount = visibleRecords.reduce(
    (total, rec) => total + rec.evidenceRefs.length,
    0,
  );

  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.personaIntent.title")}>
      <header className="space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.personaIntent.title")}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">{t("mgmt.personaIntent.subtitle")}</p>
        <PurposePanel />

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t("mgmt.personaIntent.kindFilterLabel")}
        >
          {KIND_FILTER_ORDER.map((kind) => {
            const active = selectedKind === kind;
            return (
              <button
                key={kind}
                type="button"
                data-testid={`persona-intent-kind-${kind}`}
                aria-pressed={active}
                onClick={() => handleSelectKind(kind)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`mgmt.personaIntent.kinds.${kind}`)}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryStat label={t("mgmt.personaIntent.totalLabel")} value={visibleRecords.length} />
          <SummaryStat label={t("mgmt.personaIntent.withProposalLabel")} value={withProposalCount} />
          <SummaryStat label={t("mgmt.personaIntent.withConsultationLabel")} value={withConsultedCount} />
          <SummaryStat label={t("mgmt.personaIntent.riskFlagsLabel")} value={riskFlagCount} />
          <SummaryStat label={t("mgmt.personaIntent.evidenceRefsLabel")} value={evidenceRefCount} />
        </div>
      </header>
      {visibleRecords.length > 0 ? (
        visibleRecords.map((record) => <AuditCard key={record.id} record={record} />)
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
