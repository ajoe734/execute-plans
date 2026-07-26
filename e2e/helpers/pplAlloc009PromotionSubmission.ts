export type PplAlloc009PromotionSubmissionRecord = Record<string, unknown>;

function record(value: unknown): PplAlloc009PromotionSubmissionRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PplAlloc009PromotionSubmissionRecord
    : {};
}

function requiredString(value: unknown, label: string): string {
  const resolved = String(value ?? "").trim();
  if (!resolved) {
    throw new Error(`PPL-ALLOC-009 ${label} must be present`);
  }
  return resolved;
}

export function bindPplAlloc009PromotionSubmission(input: {
  expectedRankingSnapshotId: string;
  stableRecommendationId: string;
  status: number;
  submitPayload: PplAlloc009PromotionSubmissionRecord;
}): {
  submittedReviewId: string;
} {
  if (input.status !== 200 && input.status !== 202) {
    throw new Error(
      `PPL-ALLOC-009 promotion submit returned unsupported HTTP ${input.status}`,
    );
  }

  const meta = record(input.submitPayload.meta);
  const replayed = record(meta.idempotency).replayed;
  if (input.status === 200 && replayed !== true) {
    throw new Error(
      "PPL-ALLOC-009 HTTP 200 promotion submit must be an idempotent replay",
    );
  }

  const submitData = record(input.submitPayload.data);
  const recommendationId = requiredString(
    submitData.recommendation_id,
    "submitted recommendation id",
  );
  if (recommendationId !== input.stableRecommendationId) {
    throw new Error(
      "PPL-ALLOC-009 promotion submit rebound to a different stable recommendation",
    );
  }

  const rankingSnapshotId = requiredString(
    submitData.ranking_snapshot_id,
    "submitted ranking snapshot id",
  );
  if (rankingSnapshotId !== input.expectedRankingSnapshotId) {
    throw new Error(
      "PPL-ALLOC-009 promotion submit rebound to a different ranking snapshot",
    );
  }

  const submittedReviewId = requiredString(
    submitData.review_id ?? submitData.promotion_review_id,
    "submitted promotion review revision id",
  );
  const submittedReview = record(submitData.review);
  const submittedReviewBodyId = requiredString(
    submittedReview.review_id ?? submittedReview.promotion_review_id,
    "submitted review body revision id",
  );
  if (submittedReviewBodyId !== submittedReviewId) {
    throw new Error(
      "PPL-ALLOC-009 promotion submit returned conflicting review revisions",
    );
  }
  const submittedReviewSnapshotId = requiredString(
    submittedReview.ranking_snapshot_id,
    "submitted review body ranking snapshot id",
  );
  if (submittedReviewSnapshotId !== input.expectedRankingSnapshotId) {
    throw new Error(
      "PPL-ALLOC-009 submitted review is not bound to the expected ranking snapshot",
    );
  }

  return { submittedReviewId };
}
