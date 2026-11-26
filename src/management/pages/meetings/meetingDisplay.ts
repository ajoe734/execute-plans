import type { TFunction } from "i18next";
import { statusLabel } from "@/lib/enumLabels";
import type {
  MeetingDetail,
  MeetingGatePanelReviewer,
  MeetingParticipant,
  MeetingRoundPosition,
  MeetingSummaryItem,
} from "@/lib/bff-v1/meetings";
import { readCaseFileView, type CaseFileClaim } from "@/lib/bff-v1/caseFile";

const FAILED_EXECUTION_STATES = new Set(["dead_letter", "execution_failed"]);

export const GATE_PANEL_TERMINAL_STATUSES = new Set([
  "published",
  "completed",
  "closed",
  "cancelled",
  "canceled",
  "rejected",
  "dead_lettered",
  "failed",
  "expired",
]);

const RAW_ID_PATTERN = /^(?:persona|consult|envelope-publication|mtg)-[a-z0-9-]+$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function meetingExecutionStatus(meeting: Pick<MeetingSummaryItem, "execution_state">): string {
  const state = meeting.execution_state;
  const raw = state && typeof state === "object" ? state.status : state;
  return String(raw ?? "").trim().toLowerCase();
}

export function meetingLastError(
  meeting: Pick<MeetingSummaryItem, "execution_state" | "last_error">,
): string {
  const state = meeting.execution_state;
  const nested = state && typeof state === "object" ? state.last_error : null;
  return String(nested ?? meeting.last_error ?? "").trim();
}

export function isFailedMeeting(
  meeting: Pick<
    MeetingSummaryItem,
    "execution_state" | "effective_status" | "session_class" | "meeting_type" | "consultation_type"
  >,
): boolean {
  if (isGatePanelMeeting(meeting)) {
    return false;
  }
  return (
    FAILED_EXECUTION_STATES.has(meetingExecutionStatus(meeting)) ||
    FAILED_EXECUTION_STATES.has(String(meeting.effective_status ?? "").trim().toLowerCase())
  );
}

export function isGatePanelMeeting(
  meeting: Pick<
    MeetingSummaryItem,
    "session_class" | "meeting_type" | "consultation_type"
  >,
): boolean {
  const sessionClass = String(meeting.session_class ?? "").trim().toLowerCase();
  const meetingType = String(meeting.meeting_type ?? "").trim().toLowerCase();
  const consultationType = String(meeting.consultation_type ?? "").trim().toLowerCase();
  return (
    sessionClass === "gate_panel" ||
    meetingType === "gate_panel" ||
    meetingType === "persona_panel" ||
    consultationType === "persona_panel"
  );
}

export function isGatePanelTypeFilter(typeFilter: string): boolean {
  const norm = typeFilter.trim().toLowerCase();
  return norm === "gate_panel" || norm === "persona_panel";
}

export function matchesMeetingTypeFilter(
  meeting: MeetingSummaryItem,
  typeFilter: string,
): boolean {
  const clean = typeFilter.trim();
  if (!clean) return true;
  if (isGatePanelTypeFilter(clean)) {
    return isGatePanelMeeting(meeting);
  }
  if (isGatePanelMeeting(meeting)) {
    return false;
  }
  return String(meeting.meeting_type ?? "").trim().toLowerCase() === clean.toLowerCase();
}

export function isGatePanelHistoryItem(meeting: MeetingSummaryItem): boolean {
  const status = String(meeting.status ?? "").trim().toLowerCase();
  return (
    GATE_PANEL_TERMINAL_STATUSES.has(status) ||
    Boolean(meeting.completed_at) ||
    Boolean(meeting.closed_at)
  );
}

export function formatMeetingDateTimeText(iso?: string | null): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  return `${new Date(parsed).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function extractGatePanelPoolVersion(meeting: MeetingSummaryItem): string | null {
  const fromGated = meeting.gated_decision?.target_version;
  if (fromGated !== undefined && fromGated !== null && String(fromGated).trim()) {
    return String(fromGated).trim().replace(/^v/i, "");
  }
  for (const text of [meeting.topic, meeting.title]) {
    if (typeof text !== "string" || !text.trim()) continue;
    const match = /\bpool\s+v?(\d+(?:\.\d+)?)\b/i.exec(text);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function extractGatePanelRetryNumber(meeting: MeetingSummaryItem): string | null {
  const id = String(meeting.meeting_id ?? meeting.request_id ?? meeting.id ?? "").trim();
  const match = /-r(\d+)$/i.exec(id);
  return match?.[1] ?? null;
}

function isDistinctDisplayName(name: unknown, rawId?: string | null): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (rawId && trimmed.toLowerCase() === rawId.trim().toLowerCase()) return false;
  if (RAW_ID_PATTERN.test(trimmed)) return false;
  return true;
}

export function resolveGatePanelSubjectPersona(
  meeting: MeetingSummaryItem,
  t: TFunction,
): { name: string; rawId?: string; hasDisplayName: boolean; nameMissing: boolean } {
  const rawId =
    String(meeting.subject_persona_id ?? meeting.persona_id ?? "").trim() || undefined;
  const candidates: Array<unknown> = [
    meeting.subject_persona_display_name,
    meeting.persona_display_name,
    meeting.chair_persona_display_name,
  ];
  if (rawId) {
    const fromReviewers = meeting.conclusion?.reviewers?.find(
      (r) => r.persona_id === rawId,
    )?.persona_display_name;
    const fromParticipants = meeting.participants?.find(
      (p) => p.persona_id === rawId,
    )?.persona_display_name;
    candidates.push(fromReviewers, fromParticipants);
  }
  if (typeof meeting.title === "string" && meeting.title.trim()) {
    const titlePrefixMatch = /^(.+?)\s+pool\s+v\d+/i.exec(meeting.title.trim());
    if (titlePrefixMatch?.[1]) {
      candidates.push(titlePrefixMatch[1].trim());
    }
  }

  for (const cand of candidates) {
    if (isDistinctDisplayName(cand, rawId)) {
      return {
        name: cand.trim(),
        rawId,
        hasDisplayName: true,
        nameMissing: Boolean(meeting.subject_persona_name_missing),
      };
    }
  }

  if (rawId) {
    return {
      name: t("meetingsCenter.gatePanel.subjectPersonaFallback", { id: rawId }),
      rawId,
      hasDisplayName: false,
      nameMissing: true,
    };
  }

  return {
    name: t("meetingsCenter.gatePanel.subjectPersonaUnknown"),
    rawId: undefined,
    hasDisplayName: false,
    nameMissing: true,
  };
}

function resolveGatePanelDecisionType(meeting: MeetingSummaryItem): string {
  const explicit = String(meeting.gated_decision?.type ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  const id = String(meeting.meeting_id ?? meeting.request_id ?? "").trim().toLowerCase();
  if (id.startsWith("consult-envelope-publication")) return "envelope_publication";
  if (id.startsWith("consult-trial-admission")) return "trial_admission";
  if (id.startsWith("consult-harness-patch")) return "harness_patch";
  if (id.startsWith("consult-macro-regime-shift")) return "macro_regime_shift";
  const text = `${meeting.topic ?? ""} ${meeting.title ?? ""}`.toLowerCase();
  if (text.includes("envelope publication")) return "envelope_publication";
  if (text.includes("trial admission")) return "trial_admission";
  if (text.includes("harness patch")) return "harness_patch";
  if (text.includes("macro regime")) return "macro_regime_shift";
  return "gate_panel";
}

export function formatGatePanelTitle(meeting: MeetingSummaryItem, t: TFunction): string {
  const subject = resolveGatePanelSubjectPersona(meeting, t);
  const version = extractGatePanelPoolVersion(meeting);
  const retry = extractGatePanelRetryNumber(meeting);
  const retrySuffix = retry
    ? t("meetingsCenter.gatePanel.retrySuffixFmt", { retry })
    : "";
  const decisionType = resolveGatePanelDecisionType(meeting);

  if (decisionType === "envelope_publication") {
    return version
      ? t("meetingsCenter.gatePanel.titleEnvelopePublicationWithVersion", {
          persona: subject.name,
          version,
          retrySuffix,
        })
      : t("meetingsCenter.gatePanel.titleEnvelopePublication", {
          persona: subject.name,
          retrySuffix,
        });
  }
  if (decisionType === "trial_admission") {
    return version
      ? t("meetingsCenter.gatePanel.titleTrialAdmissionWithVersion", {
          persona: subject.name,
          version,
          retrySuffix,
        })
      : t("meetingsCenter.gatePanel.titleTrialAdmission", {
          persona: subject.name,
          retrySuffix,
        });
  }
  if (decisionType === "harness_patch") {
    return version
      ? t("meetingsCenter.gatePanel.titleHarnessPatchWithVersion", {
          persona: subject.name,
          version,
          retrySuffix,
        })
      : t("meetingsCenter.gatePanel.titleHarnessPatch", {
          persona: subject.name,
          retrySuffix,
        });
  }
  if (decisionType === "macro_regime_shift") {
    return version
      ? t("meetingsCenter.gatePanel.titleMacroRegimeWithVersion", {
          persona: subject.name,
          version,
          retrySuffix,
        })
      : t("meetingsCenter.gatePanel.titleMacroRegime", {
          persona: subject.name,
          retrySuffix,
        });
  }
  return version
    ? t("meetingsCenter.gatePanel.titleWithVersion", {
        persona: subject.name,
        version,
        retrySuffix,
      })
    : t("meetingsCenter.gatePanel.titleDefault", {
        persona: subject.name,
        retrySuffix,
      });
}

export function formatGatePanelRoleLabel(
  role: string | null | undefined,
  personaId: string | null | undefined,
  t: TFunction,
): string {
  const cleanRole = String(role ?? "").trim().toLowerCase();
  const cleanId = String(personaId ?? "").trim().toLowerCase();
  const effectiveRole =
    cleanRole ||
    (cleanId === "persona-risk-officer"
      ? "risk_reviewer"
      : cleanId === "persona-red-team"
        ? "red_team"
        : "panel_reviewer");
  return t(`meetingsCenter.detail.roles.${effectiveRole}`, {
    defaultValue: t("meetingsCenter.detail.roles.panel_reviewer"),
  });
}

export function formatGatePanelReviewerName(
  input: {
    personaId?: string | null;
    displayName?: string | null;
    role?: string | null;
  },
  t: TFunction,
): string {
  const cleanId = String(input.personaId ?? "").trim();
  const cleanDisplay = String(input.displayName ?? "").trim();
  if (
    cleanId.toLowerCase() === "persona-risk-officer" ||
    cleanDisplay.toLowerCase() === "risk officer"
  ) {
    return t("meetingsCenter.gatePanel.systemPersona.risk_officer");
  }
  if (
    cleanId.toLowerCase() === "persona-red-team" ||
    cleanDisplay.toLowerCase() === "red team"
  ) {
    return t("meetingsCenter.gatePanel.systemPersona.red_team");
  }
  if (isDistinctDisplayName(cleanDisplay, cleanId)) {
    return cleanDisplay;
  }
  return formatGatePanelRoleLabel(input.role, cleanId, t);
}

export function formatGatePanelRecommendationLabel(
  recommendation: string | null | undefined,
  t: TFunction,
): string {
  const key = String(recommendation ?? "").trim().toLowerCase();
  if (!key) {
    return t("meetingsCenter.detail.stances.pending");
  }
  return t(`meetingsCenter.detail.stances.${key}`, {
    defaultValue: statusLabel(key, t),
  });
}

export function isGatePanelOperatorDecisionRequired(
  meeting: MeetingSummaryItem,
): boolean | null {
  const conclusion = meeting.conclusion;
  if (typeof conclusion?.operator_decision_required === "boolean") {
    return conclusion.operator_decision_required;
  }
  const decision = String(
    conclusion?.gate_decision ?? meeting.outcome ?? "",
  ).trim().toLowerCase();
  if (
    decision === "operator_decision" ||
    decision === "escalate" ||
    decision === "escalated"
  ) {
    return true;
  }
  if (
    decision === "adopt_eligible" ||
    decision === "approved" ||
    decision === "approve"
  ) {
    return false;
  }
  const status = String(meeting.status ?? "").trim().toLowerCase();
  if (status === "failed" || status === "dead_lettered") {
    return true;
  }
  return null;
}

export function formatGatePanelDecisionLabel(
  meeting: MeetingSummaryItem,
  t: TFunction,
): string {
  const decision = String(
    meeting.conclusion?.gate_decision ?? meeting.outcome ?? "",
  ).trim().toLowerCase();
  if (decision) {
    return t(`meetingsCenter.gatePanel.gateDecision.${decision}`, {
      defaultValue: statusLabel(decision, t),
    });
  }
  const status = String(meeting.status ?? "").trim().toLowerCase();
  if (status === "failed" || status === "dead_lettered") {
    return t("meetingsCenter.gatePanel.gateDecision.failed");
  }
  return t("meetingsCenter.gatePanel.gateDecision.pending");
}

export interface ResolvedGatePanelReviewerRow {
  key: string;
  personaId?: string;
  displayName: string;
  role?: string;
  roleLabel: string;
  recommendation?: string | null;
  recommendationLabel: string;
  rationale?: string;
  citations: string[];
  claims: CaseFileClaim[];
  nameMissing: boolean;
}

export function collectGatePanelReviewers(
  meeting: MeetingSummaryItem | MeetingDetail,
  t: TFunction,
): ResolvedGatePanelReviewerRow[] {
  const byKey = new Map<
    string,
    {
      personaId?: string;
      displayName?: string | null;
      nameMissing?: boolean;
      role?: string | null;
      recommendation?: string | null;
      rationale?: string | null;
      citations: string[];
      claims: CaseFileClaim[];
    }
  >();

  const nameById = new Map<string, string>();
  const addKnownName = (id?: string | null, name?: string | null) => {
    const cleanId = String(id ?? "").trim();
    if (cleanId && isDistinctDisplayName(name, cleanId)) {
      nameById.set(cleanId, name.trim());
    }
  };
  addKnownName(meeting.subject_persona_id, meeting.subject_persona_display_name);
  addKnownName(meeting.persona_id, meeting.persona_display_name);
  addKnownName(meeting.chair_persona_id, meeting.chair_persona_display_name);
  for (const p of (meeting.participants ?? []) as MeetingParticipant[]) {
    addKnownName(p.persona_id, p.persona_display_name);
  }
  for (const r of (meeting.conclusion?.reviewers ?? []) as MeetingGatePanelReviewer[]) {
    addKnownName(r.persona_id, r.persona_display_name);
  }

  const upsert = (entry: {
    key: string;
    personaId?: string | null;
    displayName?: string | null;
    nameMissing?: boolean;
    role?: string | null;
    recommendation?: string | null;
    rationale?: string | null;
    citations?: string[];
    claims?: CaseFileClaim[];
  }) => {
    const existing = byKey.get(entry.key) ?? {
      citations: [],
      claims: [],
    };
    const pid = String(entry.personaId ?? existing.personaId ?? "").trim() || undefined;
    const dName =
      (isDistinctDisplayName(entry.displayName, pid) ? entry.displayName : undefined) ??
      (isDistinctDisplayName(existing.displayName, pid) ? existing.displayName : undefined) ??
      (pid ? nameById.get(pid) : undefined) ??
      null;
    const citations = [...existing.citations];
    for (const c of entry.citations ?? []) {
      if (typeof c === "string" && c.trim() && !citations.includes(c.trim())) {
        citations.push(c.trim());
      }
    }
    const claims = entry.claims && entry.claims.length > 0 ? entry.claims : existing.claims;
    byKey.set(entry.key, {
      personaId: pid,
      displayName: dName,
      nameMissing: entry.nameMissing ?? existing.nameMissing,
      role: entry.role || existing.role || null,
      recommendation: entry.recommendation ?? existing.recommendation ?? null,
      rationale: entry.rationale || existing.rationale || null,
      citations,
      claims,
    });
  };

  for (const rev of meeting.conclusion?.reviewers ?? []) {
    if (!isRecord(rev)) continue;
    const pid = String(rev.persona_id ?? "").trim();
    const role = typeof rev.role === "string" ? rev.role.trim() : "";
    const key = pid || role || `reviewer-${byKey.size + 1}`;
    upsert({
      key,
      personaId: pid || undefined,
      displayName: typeof rev.persona_display_name === "string" ? rev.persona_display_name : null,
      nameMissing: Boolean(rev.persona_name_missing),
      role: role || null,
      recommendation:
        typeof rev.recommendation === "string" && rev.recommendation.trim()
          ? rev.recommendation.trim()
          : null,
    });
  }

  const detail = meeting as MeetingDetail;
  const rawPositions: MeetingRoundPosition[] = [
    ...(Array.isArray(detail.positions) ? detail.positions : []),
    ...(Array.isArray(detail.rounds)
      ? detail.rounds.flatMap((r) => (Array.isArray(r.positions) ? r.positions : []))
      : []),
  ];
  for (const pos of rawPositions) {
    if (!isRecord(pos)) continue;
    const pid = String(pos.persona_id ?? pos.revealed_persona_id ?? "").trim();
    const role = typeof pos.role === "string" ? pos.role.trim() : "";
    const label = typeof pos.label === "string" ? pos.label.trim() : "";
    const key = pid || label || role || `position-${byKey.size + 1}`;
    upsert({
      key,
      personaId: pid || undefined,
      displayName: typeof pos.persona_display_name === "string" ? pos.persona_display_name : null,
      nameMissing: Boolean(pos.persona_name_missing),
      role: role || null,
      recommendation:
        typeof pos.stance === "string" && pos.stance.trim() ? pos.stance.trim() : null,
      rationale:
        (typeof pos.rationale === "string" && pos.rationale.trim()) ||
        (typeof pos.summary === "string" && pos.summary.trim()) ||
        null,
      citations: Array.isArray(pos.citations)
        ? pos.citations.filter((c): c is string => typeof c === "string")
        : [],
    });
  }

  if (detail.case_file_view) {
    const cfRead = readCaseFileView(detail.case_file_view);
    if (cfRead.state === "ok" && Array.isArray(cfRead.view.contributions)) {
      for (const contrib of cfRead.view.contributions) {
        const pid = String(contrib.persona_id ?? "").trim();
        const role = String(contrib.role ?? "").trim();
        const key = pid || role || `contrib-${byKey.size + 1}`;
        upsert({
          key,
          personaId: pid || undefined,
          role: role || null,
          recommendation:
            typeof contrib.recommendation === "string" && contrib.recommendation.trim()
              ? contrib.recommendation.trim()
              : null,
          claims: Array.isArray(contrib.claims) ? contrib.claims : [],
        });
      }
    }
  }

  if (byKey.size === 0) {
    for (const part of meeting.participants ?? []) {
      if (!isRecord(part)) continue;
      const pid = String(part.persona_id ?? "").trim();
      const role = typeof part.role === "string" ? part.role.trim() : "";
      const key = pid || role || `participant-${byKey.size + 1}`;
      upsert({
        key,
        personaId: pid || undefined,
        displayName:
          typeof part.persona_display_name === "string" ? part.persona_display_name : null,
        nameMissing: Boolean(part.persona_name_missing),
        role: role || null,
      });
    }
  }

  return Array.from(byKey.entries()).map(([key, row]) => {
    const roleLabel = formatGatePanelRoleLabel(row.role, row.personaId, t);
    const displayName = formatGatePanelReviewerName(
      {
        personaId: row.personaId,
        displayName: row.displayName,
        role: row.role,
      },
      t,
    );
    const recommendationLabel = formatGatePanelRecommendationLabel(row.recommendation, t);
    return {
      key,
      personaId: row.personaId,
      displayName,
      role: row.role ?? undefined,
      roleLabel,
      recommendation: row.recommendation,
      recommendationLabel,
      rationale: row.rationale ?? undefined,
      citations: row.citations,
      claims: row.claims,
      nameMissing: Boolean(row.nameMissing && !isDistinctDisplayName(row.displayName, row.personaId)),
    };
  });
}

export function formatGatePanelConclusionText(
  meeting: MeetingSummaryItem | MeetingDetail,
  t: TFunction,
): string {
  const reviewers = collectGatePanelReviewers(meeting, t);
  const recordedReviewers = reviewers.filter(
    (r) => typeof r.recommendation === "string" && r.recommendation.trim().length > 0,
  );
  const decision = String(
    meeting.conclusion?.gate_decision ?? meeting.outcome ?? "",
  ).trim().toLowerCase();
  const status = String(meeting.status ?? "").trim().toLowerCase();
  const operatorRequired = isGatePanelOperatorDecisionRequired(meeting);
  const decisionLabel = formatGatePanelDecisionLabel(meeting, t);

  if (recordedReviewers.length === 0 && !decision) {
    if (status === "failed" || status === "dead_lettered") {
      return t("meetingsCenter.gatePanel.conclusionSummaryFailedNoTranscript");
    }
    return t("meetingsCenter.gatePanel.conclusionSummaryPendingNoTranscript");
  }

  const recommendationsText = (recordedReviewers.length > 0 ? recordedReviewers : reviewers)
    .map((r) => {
      const reviewerLabel =
        r.displayName && r.roleLabel && r.displayName !== r.roleLabel
          ? t("meetingsCenter.gatePanel.reviewerWithRoleFmt", {
              name: r.displayName,
              role: r.roleLabel,
            })
          : r.displayName || r.roleLabel;
      return t("meetingsCenter.gatePanel.reviewerRecommendationFmt", {
        reviewer: reviewerLabel,
        recommendation: r.recommendationLabel,
      });
    })
    .join("、");

  const operatorDecisionText =
    operatorRequired === true
      ? t("meetingsCenter.gatePanel.operatorDecisionRequired")
      : operatorRequired === false
        ? t("meetingsCenter.gatePanel.operatorDecisionNotRequired")
        : t("meetingsCenter.gatePanel.operatorDecisionPending");

  if (!recommendationsText) {
    return t("meetingsCenter.gatePanel.conclusionSummaryNoReviewers", {
      decision: decisionLabel,
      operatorDecision: operatorDecisionText,
    });
  }

  if (decision === "operator_decision") {
    return t("meetingsCenter.gatePanel.conclusionSummaryOperatorRequiredWithReviewers", {
      recommendations: recommendationsText,
    });
  }

  return t("meetingsCenter.gatePanel.conclusionSummaryWithReviewers", {
    recommendations: recommendationsText,
    decision: decisionLabel,
    operatorDecision: operatorDecisionText,
  });
}

export function meetingTopicText(meeting: MeetingSummaryItem, t: TFunction): string {
  if (isGatePanelMeeting(meeting)) {
    return formatGatePanelTitle(meeting, t);
  }
  const summary = meeting.topic_summary;
  if (typeof summary === "string" && summary.trim()) {
    return t(`meetingsCenter.topicSummary.${summary.trim()}`, { defaultValue: summary.trim() });
  }

  if (summary && typeof summary === "object") {
    const name = [
      summary.subject_persona_display_name,
      meeting.subject_persona_display_name,
      meeting.persona_display_name,
    ].find((value) => value && value !== summary.subject_persona_id);
    if (summary.kind === "pool_evolution_review" || summary.kind === "optimisation_review") {
      const topic = t(`meetingsCenter.topicSummary.${summary.kind}`);
      const context = [
        name,
        summary.period,
        typeof summary.lesson_count === "number"
          ? t("meetingsCenter.topicSummary.lessonCount", { count: summary.lesson_count })
          : undefined,
      ].filter(Boolean);
      return context.length
        ? t("meetingsCenter.topicSummary.withContext", { topic, context: context.join(" · ") })
        : topic;
    }
  }

  return meeting.topic?.trim() || "";
}
