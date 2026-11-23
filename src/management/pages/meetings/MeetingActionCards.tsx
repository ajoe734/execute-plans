// Meeting action follow-through views shared by the meeting detail page and the
// original Human Inbox detail (FE-MEETING-ACTION-FOLLOWTHROUGH-20261123).
// Mutable progress belongs to the research-ticket owner; these views only render
// what the BFF returns and never invent a zero/complete state when the source is unavailable.
import { useRef, useState, type FormEvent } from "react";
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
  submitMeetingActionResponse,
  validateMeetingActionResponse,
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

function EvidenceLink({ href }: { href: string }) {
  if (href.startsWith("/management/")) {
    return (
      <Link to={href} className="break-all text-primary underline-offset-4 hover:underline">
        {href}
      </Link>
    );
  }
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-4 hover:underline">
        {href}
      </a>
    );
  }
  return <span className="break-all font-mono text-xs">{href}</span>;
}

export function MeetingActionRow({ action }: { action: MeetingActionItem }) {
  const { t } = useTranslation();
  const due = formatWhen(action.due_at);
  const review = formatWhen(action.next_review);
  // submitted ≠ accepted: evidence exists, but only an authorized review accepts it.
  const stateBadge = t(`${FT}.state.${action.state}`);
  const resultLabel =
    action.state === "accepted"
      ? t(`${FT}.result.accepted`)
      : action.state === "returned"
        ? t(`${FT}.result.returned`)
        : action.state === "submitted"
          ? t(`${FT}.result.submittedAwaitingReview`)
          : action.executed
            ? t(`${FT}.result.executed`)
            : t(`${FT}.result.notExecuted`);
  return (
    <li className="space-y-2 rounded-md border border-border p-3 text-sm" data-testid={`meeting-action-${action.action_id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium break-words">{action.title || action.deliverable || action.action_id}</span>
        <Badge variant={action.state === "accepted" ? "secondary" : "outline"} data-testid="meeting-action-state">
          {stateBadge}
        </Badge>
      </div>
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
          <dd>{due ?? (review ? t(`${FT}.nextReviewAt`, { when: review }) : t(`${FT}.notRecorded`))}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t(`${FT}.executedLabel`)}</dt>
          <dd data-testid="meeting-action-result">{resultLabel}</dd>
        </div>
        {action.review_reason ? (
          <div>
            <dt className="text-muted-foreground">{t(`${FT}.reviewReason`)}</dt>
            <dd className="break-words">{action.review_reason}</dd>
          </div>
        ) : null}
      </dl>
      {action.evidence_refs.length > 0 ? (
        <div className="space-y-1 text-xs" data-testid="meeting-action-evidence">
          <span className="text-muted-foreground">{t(`${FT}.evidence`)}</span>
          <ul className="space-y-0.5">
            {action.evidence_refs.map((ref) => (
              <li key={ref}>
                <EvidenceLink href={ref} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {action.required_actor && action.state !== "accepted" ? (
        <p className="text-xs text-muted-foreground" data-testid="meeting-action-next">
          {t(`${FT}.nextStep`, { actor: action.required_actor })}
          {action.missing_input ? ` — ${action.missing_input}` : ""}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {action.ticket_href ? (
          <Link to={action.ticket_href} className="text-primary underline-offset-4 hover:underline">
            {t(`${FT}.openTicket`)}
          </Link>
        ) : null}
        <span className="ml-2 font-mono">{action.action_id}</span>
      </p>
    </li>
  );
}

export function PriorActionsSection({ read }: { read: MeetingActionsRead | undefined }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2" data-testid="meeting-prior-actions">
      <h2 className="text-lg font-semibold">{t(`${FT}.priorTitle`)}</h2>
      {read === undefined || read.state === "unavailable" ? (
        <p className="text-sm text-status-warning" role="status" data-testid="meeting-prior-actions-unavailable">
          {t(`${FT}.priorUnavailable`)}
        </p>
      ) : read.state === "forbidden" ? (
        <p className="text-sm text-muted-foreground" role="status" data-testid="meeting-prior-actions-forbidden">
          {t(`${FT}.priorForbidden`)}
        </p>
      ) : read.items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="meeting-prior-actions-empty">
          {t(`${FT}.priorEmpty`)}
        </p>
      ) : (
        <ul className="space-y-2">
          {read.items.map((a) => (
            <MeetingActionRow key={a.action_id} action={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdoptedActionsSection({
  actions,
  noActionReason,
}: {
  actions: MeetingActionItem[];
  noActionReason?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2" data-testid="meeting-adopted-actions">
      <h2 className="text-lg font-semibold">{t(`${FT}.adoptedTitle`)}</h2>
      <p className="text-xs text-muted-foreground">{t(`${FT}.adoptedHint`)}</p>
      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="meeting-adopted-actions-empty">
          {noActionReason
            ? t(`${FT}.noActionWithReason`, { reason: noActionReason })
            : t(`${FT}.noActionRecorded`)}
        </p>
      ) : (
        <ul className="space-y-2">
          {actions.map((a) => (
            <MeetingActionRow key={a.action_id} action={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ParticipantCapabilities({
  items,
  revealed,
}: {
  items: MeetingParticipantCapability[];
  revealed: boolean;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2" data-testid="meeting-capabilities">
      <h2 className="text-sm font-semibold">{t(`${FT}.capabilitiesTitle`)}</h2>
      <ul className="space-y-1 text-xs">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            {/* Anonymised rounds: only the round label is shown until the operator reveal. */}
            <span className="font-medium">{revealed && c.persona_id ? `${c.label} (${c.persona_id})` : c.label}</span>
            {": "}
            {c.limits.length > 0 ? c.limits.join("；") : t(`${FT}.capabilitiesNone`)}
          </li>
        ))}
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
  onSaved,
}: {
  work: HumanInboxMeetingAction;
  meetingHref?: string;
  /** Called after the owner confirmed the write so the caller can re-read the original ticket. */
  onSaved?: (result: MeetingActionResponseResult) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const idemRef = useRef<{ key: string; signature: string } | null>(null);
  const transition = work.nextTransition ?? "";
  const canWrite = work.canRespond && ["submit", "provide_input"].includes(transition);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite || busy) return;
    const input = {
      ticketId: work.ticketId,
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
    const signature = JSON.stringify([transition, title.trim(), body.trim(), work.revision ?? null]);
    if (!idemRef.current || idemRef.current.signature !== signature) {
      idemRef.current = { key: mintIdempotencyKey(), signature };
    }
    setBusy(true);
    setError(null);
    const res = await submitMeetingActionResponse(input, idemRef.current.key);
    setBusy(false);
    if (res.state === "ok") {
      setSaved(true);
      setTitle("");
      setBody("");
      idemRef.current = null;
      onSaved?.(res);
    } else {
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
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t(`${FT}.inboxTitle`)}</h2>
      <dl className="space-y-1 text-sm">
        {work.missingInput ? (
          <div data-testid="inbox-meeting-action-missing">
            <dt className="text-xs text-muted-foreground">{t(`${FT}.missingInput`)}</dt>
            <dd className="break-words">{work.missingInput}</dd>
          </div>
        ) : null}
        {work.deliverable ? (
          <div>
            <dt className="text-xs text-muted-foreground">{t(`${FT}.deliverable`)}</dt>
            <dd className="break-words">{work.deliverable}</dd>
          </div>
        ) : null}
        {work.acceptanceCriterion ? (
          <div>
            <dt className="text-xs text-muted-foreground">{t(`${FT}.criterion`)}</dt>
            <dd className="break-words">{work.acceptanceCriterion}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">{t(`${FT}.due`)}</dt>
          <dd>{formatWhen(work.dueAt) ?? formatWhen(work.nextReview) ?? t(`${FT}.notRecorded`)}</dd>
        </div>
        {transition === "provide_input" && work.resumesLabel ? (
          <div>
            <dt className="text-xs text-muted-foreground">{t(`${FT}.resumes`)}</dt>
            <dd>{work.resumesLabel}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-[11px] text-muted-foreground">
        {meetingHref ? (
          <Link to={meetingHref} className="text-primary underline-offset-4 hover:underline" data-testid="inbox-meeting-action-meeting-link">
            {t(`${FT}.openMeeting`)}
          </Link>
        ) : null}
        <span className="ml-2 font-mono">{work.ticketId}</span>
      </p>
      {saved ? (
        <p className="text-sm text-status-success" role="status" data-testid="inbox-meeting-action-saved">
          {t(`${FT}.saved`)}
        </p>
      ) : null}
      {!canWrite ? (
        <p className="text-sm text-muted-foreground" role="status" data-testid="inbox-meeting-action-view-only">
          {t(`${FT}.viewOnly`)}
        </p>
      ) : (
        <form className="space-y-2" onSubmit={submit} data-testid="inbox-meeting-action-form" noValidate>
          <Label htmlFor="meeting-action-title">
            {transition === "submit" ? t(`${FT}.noteTitleSubmit`) : t(`${FT}.noteTitleInput`)}
          </Label>
          <Input
            id="meeting-action-title"
            value={title}
            maxLength={MEETING_ACTION_NOTE_TITLE_MAX + 40}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Label htmlFor="meeting-action-body">{t(`${FT}.noteBody`)}</Label>
          <Textarea
            id="meeting-action-body"
            value={body}
            rows={4}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            {t(`${FT}.noteCounter`, { count: body.trim().length, max: MEETING_ACTION_NOTE_BODY_MAX })}
          </p>
          {errorText ? (
            <p className="text-sm text-status-warning" role="alert" data-testid="inbox-meeting-action-error">
              {errorText}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={busy} data-testid="inbox-meeting-action-submit">
            {transition === "submit" ? t(`${FT}.submitEvidence`) : t(`${FT}.provideInput`)}
          </Button>
        </form>
      )}
    </Card>
  );
}
