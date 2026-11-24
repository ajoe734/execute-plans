import type { TFunction } from "i18next";
import type { MeetingSummaryItem } from "@/lib/bff-v1/meetings";

const FAILED_EXECUTION_STATES = new Set(["dead_letter", "execution_failed"]);

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
  meeting: Pick<MeetingSummaryItem, "execution_state" | "effective_status">,
): boolean {
  return (
    FAILED_EXECUTION_STATES.has(meetingExecutionStatus(meeting)) ||
    FAILED_EXECUTION_STATES.has(String(meeting.effective_status ?? "").trim().toLowerCase())
  );
}

export function meetingTopicText(meeting: MeetingSummaryItem, t: TFunction): string {
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
