// Meeting action follow-through views shared by the meeting detail page and the
// original Human Inbox (FE-MEETING-ACTION-FOLLOWTHROUGH-20261123).
// Mutable progress belongs to the research-ticket owner; these views only render
// what the BFF returns and never invent a zero/complete state when the source is unavailable.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MEETING_ACTION_NOTE_BODY_MAX,
  MEETING_ACTION_NOTE_TITLE_MAX,
  getMeetingActionTicket,
  resolveMeetingActionEvidenceHref,
  submitMeetingActionResponse,
  validateMeetingActionResponse,
  type MeetingActionEvidenceRef,
  type MeetingActionItem,
  type MeetingActionResponseResult,
  type MeetingActionsRead,
  type MeetingParticipantCapability,
} from "@/lib/bff-v1/meetings";
import { idempotencyKey as mintIdempotencyKey } from "@/lib/bff-v1/headers";
import type { HumanInboxMeetingAction } from "@/lib/v5/management/humanInbox";

const FT = "meetingsCenter.detail.followThrough";

function formatWhen(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 16).replace("T", " ");
}

function EvidenceLink({
  href,
  label,
  kind,
}: {
  href: string;
  label?: string;
  kind?: string | null;
}) {
  const resolved = resolveMeetingActionEvidenceHref(kind, label ?? href, href) ?? href;
  const text = label || href;
  if (resolved.startsWith("/management/")) {
    return (
      <Link to={resolved} className="break-all text-primary underline-offset-4 hover:underline">
        {text}
      </Link>
    );
  }
  if (/^https?:\/\//i.test(resolved)) {
    return (
      <a
        href={resolved}
        target="_blank"
        rel="noreferrer"
        className="break-all text-primary underline-offset-4 hover:underline"
      >
        {text}
      </a>
    );
  }
  return <span className="break-all font-mono text-xs">{text}</span>;
}

export function MeetingActionRow({
  action,
  focused = false,
}: {
  action: MeetingActionItem;
  focused?: boolean;
}) {
  const { t } = useTranslation();
  const due = formatWhen(action.due_at);
  const review = formatWhen(action.next_review);
  // submitted ≠ accepted: evidence exists, but only an authorized review accepts it.
  const stateBadge = t(`${FT}.state.${action.state}`, {
    defaultValue: t(`${FT}.state.unknown`),
  });
  const resultLabel =
    action.state === "accepted"
      ? t(`${FT}.result.accepted`)
      : action.state === "returned"
        ? t(`${FT}.result.returned`)
        : action.state === "submitted"
          ? t(`${FT}.result.submittedAwaitingReview`)
          : action.state === "dispatch_pending"
            ? t(`${FT}.result.dispatchPending`)
            : action.executed
              ? t(`${FT}.result.executed`)
              : t(`${FT}.result.notExecuted`);

  const evidenceItems: MeetingActionEvidenceRef[] =
    action.evidence_items && action.evidence_items.length > 0
      ? action.evidence_items
      : action.evidence_refs.map((ref) => ({
          id: ref,
          kind: null,
          href: resolveMeetingActionEvidenceHref(null, ref, ref),
        }));
  const live = action.live_owner_status;
  const hasRealTicket =
    action.state !== "dispatch_pending" &&
    action.ticket_id !== null &&
    Boolean(action.ticket_id ?? action.action_id);

  return (
    <li
      className={`space-y-2 rounded-md border p-3 text-sm ${
        focused ? "border-primary bg-primary/5" : "border-border"
      }`}
      data-testid={`meeting-action-${action.action_id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium break-words">
          {action.title || action.deliverable || action.action_id}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {action.overdue ? (
            <Badge variant="destructive" data-testid="meeting-action-overdue">
              {t(`${FT}.overdueBadge`)}
            </Badge>
          ) : null}
          <Badge
            variant={action.state === "accepted" ? "secondary" : "outline"}
            data-testid="meeting-action-state"
          >
            {stateBadge}
          </Badge>
        </div>
      </div>
      {action.decision_kind === "retain_pool" ? (
        <p className="text-xs font-medium text-foreground" data-testid="meeting-action-retain-pool">
          {t(`${FT}.retainPoolDecision`)}
        </p>
      ) : null}
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t(`${FT}.owner`)}</dt>
          <dd data-testid="meeting-action-owner">{action.owner_label || t(`${FT}.ownerMissing`)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t(`${FT}.deliverable`)}</dt>
          <dd className="break-words">{action.deliverable || t(`${FT}.notRecorded`)}</dd>
        </div>
        {action.acceptance_criterion ? (
          <div>
            <dt className="text-muted-foreground">{t(`${FT}.criterion`)}</dt>
            <dd className="break-words">{action.acceptance_criterion}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">{t(`${FT}.due`)}</dt>
          <dd>
            {due ?? (review ? t(`${FT}.nextReviewAt`, { when: review }) : t(`${FT}.notRecorded`))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t(`${FT}.executedLabel`)}</dt>
          <dd data-testid="meeting-action-result">{resultLabel}</dd>
        </div>
        {action.review_reason ? (
          <div>
            <dt className="text-muted-foreground">{t(`${FT}.reviewReason`)}</dt>
            <dd className="break-words" data-testid="meeting-action-review-reason">
              {action.review_reason}
            </dd>
          </div>
        ) : null}
        {action.human_requirement ? (
          <div>
            <dt className="text-muted-foreground">{t(`${FT}.humanRequirement`)}</dt>
            <dd className="break-words">{action.human_requirement}</dd>
          </div>
        ) : null}
        {live ? (
          <div>
            <dt className="text-muted-foreground">{t(`${FT}.liveOwnerStatusLabel`)}</dt>
            <dd data-testid="meeting-action-live-status">
              {live.status === "denied" || live.status === "forbidden"
                ? t(`${FT}.liveOwnerForbidden`)
                : live.status === "unavailable"
                  ? t(`${FT}.liveOwnerUnavailable`, { reason: live.reason ?? "unavailable" })
                  : live.state
                    ? t(`${FT}.state.${live.state}`, { defaultValue: live.state })
                    : live.status}
            </dd>
          </div>
        ) : null}
      </dl>
      {action.dispatch_error ? (
        <p
          className="text-xs text-status-warning"
          role="status"
          data-testid="meeting-action-dispatch-error"
        >
          {t(`${FT}.dispatchError`, { reason: action.dispatch_error })}
        </p>
      ) : null}
      {evidenceItems.length > 0 ? (
        <div className="space-y-1 text-xs" data-testid="meeting-action-evidence">
          <span className="text-muted-foreground">{t(`${FT}.evidence`)}</span>
          <ul className="space-y-0.5">
            {evidenceItems.map((item) => (
              <li key={item.id}>
                <EvidenceLink href={item.href ?? item.id} label={item.id} kind={item.kind} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {action.evidence_notes && action.evidence_notes.length > 0 ? (
        <div className="space-y-1 text-xs" data-testid="meeting-action-evidence-notes">
          {action.evidence_notes.map((note) => (
            <div key={note.note_id} className="rounded border border-border bg-muted/20 p-2">
              {note.title ? <div className="font-medium text-foreground">{note.title}</div> : null}
              {note.body ? (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
                  {note.body}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {action.evidence_omitted ? (
        <p className="text-xs text-status-warning" data-testid="meeting-action-evidence-omitted">
          {t(`${FT}.evidenceOmitted`)}
        </p>
      ) : action.evidence_available === false ? (
        <p className="text-xs text-status-warning" data-testid="meeting-action-evidence-unavailable">
          {t(`${FT}.evidenceUnavailable`)}
        </p>
      ) : null}
      {action.required_actor && action.state !== "accepted" ? (
        <p className="text-xs text-muted-foreground" data-testid="meeting-action-next">
          {t(`${FT}.nextStep`, { actor: action.required_actor })}
          {action.missing_input ? ` — ${action.missing_input}` : ""}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {hasRealTicket && action.ticket_href ? (
          <Link to={action.ticket_href} className="text-primary underline-offset-4 hover:underline">
            {t(`${FT}.openTicket`)}
          </Link>
        ) : null}
        <span className="ml-2 font-mono">{action.ticket_id ?? action.action_id}</span>
      </p>
    </li>
  );
}

export function PriorActionsSection({
  read,
  focusedActionId,
}: {
  read: MeetingActionsRead | undefined;
  focusedActionId?: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2" data-testid="meeting-prior-actions">
      <h2 className="text-lg font-semibold">{t(`${FT}.priorTitle`)}</h2>
      {read === undefined || read.state === "unavailable" ? (
        <p
          className="text-sm text-status-warning"
          role="status"
          data-testid="meeting-prior-actions-unavailable"
        >
          {t(`${FT}.priorUnavailable`)}
        </p>
      ) : read.state === "forbidden" ? (
        <p
          className="text-sm text-muted-foreground"
          role="status"
          data-testid="meeting-prior-actions-forbidden"
        >
          {t(`${FT}.priorForbidden`)}
        </p>
      ) : read.items.length === 0 && !read.degraded_reason && !read.has_more ? (
        <p className="text-sm text-muted-foreground" data-testid="meeting-prior-actions-empty">
          {t(`${FT}.priorEmpty`)}
        </p>
      ) : (
        <>
          {read.degraded_reason ? (
            <p
              className="text-xs text-status-warning"
              role="status"
              data-testid="meeting-prior-actions-degraded"
            >
              {t(`${FT}.priorDegraded`, { reason: read.degraded_reason })}
            </p>
          ) : null}
          <ul className="space-y-2">
            {read.items.map((a) => (
              <MeetingActionRow
                key={a.action_id}
                action={a}
                focused={Boolean(focusedActionId && a.action_id === focusedActionId)}
              />
            ))}
          </ul>
          {read.has_more ? (
            <p className="text-xs text-muted-foreground" data-testid="meeting-prior-actions-has-more">
              {t(`${FT}.priorHasMore`)}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

export function AdoptedActionsSection({
  actions,
  noActionReason,
  decisionKind,
  focusedActionId,
}: {
  actions: MeetingActionItem[];
  noActionReason?: string | null;
  decisionKind?: string | null;
  focusedActionId?: string;
}) {
  const { t } = useTranslation();
  const isRetainPool = decisionKind === "retain_pool";
  return (
    <section className="space-y-2" data-testid="meeting-adopted-actions">
      <h2 className="text-lg font-semibold">{t(`${FT}.adoptedTitle`)}</h2>
      <p className="text-xs text-muted-foreground">{t(`${FT}.adoptedHint`)}</p>
      {isRetainPool ? (
        <p
          className="text-sm font-medium text-foreground"
          data-testid="meeting-retain-pool-decision"
        >
          {noActionReason
            ? t(`${FT}.retainPoolWithReason`, { reason: noActionReason })
            : t(`${FT}.retainPoolDecision`)}
        </p>
      ) : null}
      {actions.length === 0 ? (
        !isRetainPool ? (
          <p className="text-sm text-muted-foreground" data-testid="meeting-adopted-actions-empty">
            {noActionReason
              ? t(`${FT}.noActionWithReason`, { reason: noActionReason })
              : t(`${FT}.noActionRecorded`)}
          </p>
        ) : null
      ) : (
        <ul className="space-y-2">
          {actions.map((a) => (
            <MeetingActionRow
              key={a.action_id}
              action={a}
              focused={Boolean(focusedActionId && a.action_id === focusedActionId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const KNOWN_CAPABILITY_STATUSES = new Set([
  "allowed",
  "advisory_only",
  "restricted_data",
  "suspended",
  "no_workflow",
  "expired_access",
  "downgraded_access",
  "owner_unavailable",
  "denied",
]);

export function ParticipantCapabilities({
  items,
  revealed,
}: {
  items: MeetingParticipantCapability[];
  revealed: boolean;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  const describeCapability = (c: MeetingParticipantCapability): string => {
    const parts: string[] = [];
    const status = (c.status ?? "").trim().toLowerCase();
    if (status && KNOWN_CAPABILITY_STATUSES.has(status)) {
      if (status === "allowed") {
        const deliverables = (c.allowed_deliverables ?? []).join(", ");
        parts.push(
          deliverables
            ? t(`${FT}.capabilityStatus.allowed`, { deliverables })
            : t(`${FT}.capabilityStatus.allowedDefault`),
        );
      } else {
        const base = t(`${FT}.capabilityStatus.${status}`);
        const reason = c.reason?.trim();
        parts.push(reason && reason !== status ? `${base} (${reason})` : base);
      }
    } else if (c.can_receive_persona_action === false) {
      const base = t(`${FT}.capabilityStatus.cannotAssign`);
      const reason = c.reason?.trim();
      parts.push(reason ? `${base} (${reason})` : base);
    }
    if (c.limits.length > 0) {
      parts.push(...c.limits);
    }
    return parts.length > 0 ? parts.join("；") : t(`${FT}.capabilitiesNone`);
  };

  return (
    <section className="space-y-2" data-testid="meeting-capabilities">
      <h2 className="text-sm font-semibold">{t(`${FT}.capabilitiesTitle`)}</h2>
      <ul className="space-y-1 text-xs">
        {items.map((c, i) => {
          const identityLabel =
            revealed && c.persona_id
              ? c.persona_display_name && c.persona_display_name !== c.persona_id
                ? `${c.label} (${c.persona_display_name} · ${c.persona_id})`
                : `${c.label} (${c.persona_id})`
              : c.label;
          return (
            <li key={`${c.label}-${i}`} data-testid={`meeting-capability-${i}`}>
              {/* Anonymised rounds: only the round label is shown until the operator reveal. */}
              <span className="font-medium">{identityLabel}</span>
              {": "}
              <span>{describeCapability(c)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ERROR_KEYS: Record<string, string> = {
  note_required: "errorNoteRequired",
  title_too_long: "errorTitleTooLong",
  body_too_long: "errorBodyTooLong",
  transition: "errorTransition",
};

export function MeetingActionResponseCard({
  work,
  meetingHref,
  initialContinuation = null,
  onSaved,
}: {
  work: HumanInboxMeetingAction;
  meetingHref?: string;
  initialContinuation?: MeetingActionItem | null;
  /** Called after the owner confirmed the write so the caller can re-read the original ticket. */
  onSaved?: (result: MeetingActionResponseResult, canonicalTicket: MeetingActionItem | null) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [continuedTicket, setContinuedTicket] = useState<MeetingActionItem | null>(
    initialContinuation,
  );
  const idemRef = useRef<{ key: string; signature: string } | null>(null);

  useEffect(() => {
    if (initialContinuation) {
      setContinuedTicket(initialContinuation);
    }
  }, [initialContinuation]);

  const transition = work.responseAction ?? work.nextTransition ?? "";
  const resumesLabel = work.resumesWith ?? work.resumesLabel;
  const deliverable = work.requestedMaterial ?? work.deliverable;
  const primaryMissing = work.reason ?? work.missingInput ?? work.humanRequirement;
  const distinctHumanRequirement =
    work.humanRequirement && work.humanRequirement !== primaryMissing
      ? work.humanRequirement
      : undefined;
  const effectiveMeetingHref =
    meetingHref ??
    work.meetingHref ??
    (work.meetingId
      ? `/management/meetings/${encodeURIComponent(work.meetingId)}?action=${encodeURIComponent(work.ticketId)}`
      : undefined);
  const canWrite =
    Boolean(work.canRespond) &&
    ["submit", "provide_input"].includes(transition) &&
    !saved;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite || busy) return;
    const input = {
      ticketId: work.ticketId,
      ticketPath: work.ticketHref,
      transition,
      evidenceNote: { title, body },
      revision: work.revision,
    };
    const invalid = validateMeetingActionResponse(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    // Retry of the same text reuses one idempotency key so a lost reply cannot duplicate the note.
    const signature = JSON.stringify([
      transition,
      title.trim(),
      body.trim(),
      work.revision ?? null,
    ]);
    if (!idemRef.current || idemRef.current.signature !== signature) {
      idemRef.current = { key: mintIdempotencyKey(), signature };
    }
    setBusy(true);
    setError(null);
    const res = await submitMeetingActionResponse(input, idemRef.current.key);
    if (res.state === "ok") {
      // Read back the canonical ticket directly from GET /api/v1/research/tickets/{ticket_id}
      // after it leaves the human_actionable list so resolved evidence_notes body is displayed.
      let canonicalAction = res.action;
      try {
        const readback = await getMeetingActionTicket(work.ticketHref || work.ticketId);
        if (readback.state === "ok") {
          canonicalAction = readback.data;
        }
      } catch {
        // Retain the PATCH receipt if a test double only mocks PATCH.
      }
      setBusy(false);
      setSaved(true);
      setContinuedTicket(canonicalAction);
      setTitle("");
      setBody("");
      idemRef.current = null;
      onSaved?.(res, canonicalAction);
    } else {
      setBusy(false);
      // Keep what the person typed so they can retry.
      setError(res.state === "invalid" ? res.reason : `${res.state}:${res.reason}`);
    }
  };

  const errorText = error
    ? ERROR_KEYS[error]
      ? t(`${FT}.${ERROR_KEYS[error]}`)
      : error.startsWith("conflict:")
        ? t(`${FT}.errorConflict`)
        : error.startsWith("forbidden:")
          ? t(`${FT}.errorForbidden`)
          : t(`${FT}.errorFailed`, { reason: error.split(":").slice(1).join(":") || error })
    : null;

  return (
    <Card className="space-y-3 p-4" data-testid="inbox-meeting-action-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t(`${FT}.inboxTitle`)}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {work.overdue ? (
            <Badge variant="destructive" data-testid="inbox-meeting-action-overdue">
              {t(`${FT}.overdueBadge`)}
            </Badge>
          ) : null}
          {continuedTicket?.state ?? work.state ? (
            <Badge variant="outline" data-testid="inbox-meeting-action-state">
              {t(`${FT}.state.${continuedTicket?.state ?? work.state}`, {
                defaultValue: String(continuedTicket?.state ?? work.state),
              })}
            </Badge>
          ) : null}
        </div>
      </div>
      <dl className="space-y-1 text-sm">
        {primaryMissing ? (
          <div data-testid="inbox-meeting-action-missing">
            <dt className="text-xs text-muted-foreground">
              {work.state === "returned" && work.reviewReason
                ? t(`${FT}.returnReason`)
                : t(`${FT}.missingInput`)}
            </dt>
            <dd className="break-words">{primaryMissing}</dd>
          </div>
        ) : null}
        {distinctHumanRequirement ? (
          <div data-testid="inbox-meeting-action-human-requirement">
            <dt className="text-xs text-muted-foreground">{t(`${FT}.humanRequirement`)}</dt>
            <dd className="break-words">{distinctHumanRequirement}</dd>
          </div>
        ) : null}
        {deliverable ? (
          <div data-testid="inbox-meeting-action-deliverable">
            <dt className="text-xs text-muted-foreground">{t(`${FT}.deliverable`)}</dt>
            <dd className="break-words">{deliverable}</dd>
          </div>
        ) : null}
        {work.acceptanceCriterion ? (
          <div data-testid="inbox-meeting-action-criterion">
            <dt className="text-xs text-muted-foreground">{t(`${FT}.criterion`)}</dt>
            <dd className="break-words">{work.acceptanceCriterion}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">{t(`${FT}.due`)}</dt>
          <dd>{formatWhen(work.dueAt) ?? formatWhen(work.nextReview) ?? t(`${FT}.notRecorded`)}</dd>
        </div>
        {resumesLabel ? (
          <div data-testid="inbox-meeting-action-resumes">
            <dt className="text-xs text-muted-foreground">{t(`${FT}.resumes`)}</dt>
            <dd>{resumesLabel}</dd>
          </div>
        ) : null}
      </dl>
      {work.evidenceRefs && work.evidenceRefs.length > 0 ? (
        <div className="space-y-1 text-xs" data-testid="inbox-meeting-action-evidence">
          <span className="text-muted-foreground">{t(`${FT}.evidence`)}</span>
          <ul className="space-y-0.5">
            {work.evidenceRefs.map((ref) => (
              <li key={ref.artifactId}>
                <EvidenceLink
                  href={ref.href ?? ref.artifactId}
                  label={ref.artifactId}
                  kind={ref.kind}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {effectiveMeetingHref ? (
          <Link
            to={effectiveMeetingHref}
            className="text-primary underline-offset-4 hover:underline"
            data-testid="inbox-meeting-action-meeting-link"
          >
            {t(`${FT}.openMeeting`)}
          </Link>
        ) : null}
        <span className="ml-2 font-mono" data-testid="inbox-meeting-action-ticket-id">
          {work.ticketId}
        </span>
      </p>
      {saved ? (
        <p
          className="text-sm text-status-success"
          role="status"
          data-testid="inbox-meeting-action-saved"
        >
          {t(`${FT}.saved`)}
        </p>
      ) : null}
      {continuedTicket ? (
        <div
          className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs"
          data-testid="inbox-meeting-action-continuation"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-foreground">{t(`${FT}.continuationTitle`)}</span>
            <code className="font-mono text-[11px]">{continuedTicket.action_id}</code>
          </div>
          {continuedTicket.required_actor ? (
            <p className="text-muted-foreground" data-testid="inbox-meeting-action-next-actor">
              {t(`${FT}.nextStep`, { actor: continuedTicket.required_actor })}
            </p>
          ) : null}
          {continuedTicket.evidence_notes && continuedTicket.evidence_notes.length > 0 ? (
            <div className="space-y-1" data-testid="inbox-meeting-action-notes">
              {continuedTicket.evidence_notes.map((note) => (
                <div key={note.note_id} className="rounded border border-border bg-background p-2">
                  {note.title ? <div className="font-medium text-foreground">{note.title}</div> : null}
                  {note.body ? (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
                      {note.body}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {continuedTicket.evidence_items && continuedTicket.evidence_items.length > 0 ? (
            <ul className="space-y-0.5">
              {continuedTicket.evidence_items.map((ev) => (
                <li key={ev.id}>
                  <EvidenceLink href={ev.href ?? ev.id} label={ev.id} kind={ev.kind} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {!canWrite ? (
        !saved && !continuedTicket ? (
          <p
            className="text-sm text-muted-foreground"
            role="status"
            data-testid="inbox-meeting-action-view-only"
          >
            {t(`${FT}.viewOnly`)}
          </p>
        ) : null
      ) : (
        <form
          className="space-y-2"
          onSubmit={submit}
          data-testid="inbox-meeting-action-form"
          noValidate
        >
          <Label htmlFor={`meeting-action-title-${work.ticketId}`}>
            {transition === "submit" ? t(`${FT}.noteTitleSubmit`) : t(`${FT}.noteTitleInput`)}
          </Label>
          <Input
            id={`meeting-action-title-${work.ticketId}`}
            value={title}
            maxLength={MEETING_ACTION_NOTE_TITLE_MAX + 40}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Label htmlFor={`meeting-action-body-${work.ticketId}`}>{t(`${FT}.noteBody`)}</Label>
          <Textarea
            id={`meeting-action-body-${work.ticketId}`}
            value={body}
            rows={4}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            {t(`${FT}.noteCounter`, { count: body.trim().length, max: MEETING_ACTION_NOTE_BODY_MAX })}
          </p>
          {errorText ? (
            <p
              className="text-sm text-status-warning"
              role="alert"
              data-testid="inbox-meeting-action-error"
            >
              {errorText}
            </p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={busy}
            data-testid="inbox-meeting-action-submit"
          >
            {transition === "submit" ? t(`${FT}.submitEvidence`) : t(`${FT}.provideInput`)}
          </Button>
        </form>
      )}
    </Card>
  );
}
