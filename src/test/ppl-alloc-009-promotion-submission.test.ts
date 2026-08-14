import { describe, expect, it } from "vitest";

import { bindPplAlloc009PromotionSubmission } from "../../e2e/helpers/pplAlloc009PromotionSubmission";

const STABLE_RECOMMENDATION_ID = "recommendation-quarterly-2026-q3";
const RANKING_SNAPSHOT_ID = "ranking-quarterly-2026-q3-revision-2";
const SUBMITTED_REVIEW_ID = "promotion-review-quarterly-2026-q3-revision-2";

function submitPayload(replayed: boolean) {
  return {
    data: {
      promotion_review_id: SUBMITTED_REVIEW_ID,
      ranking_snapshot_id: RANKING_SNAPSHOT_ID,
      recommendation_id: STABLE_RECOMMENDATION_ID,
      review: {
        promotion_review_id: SUBMITTED_REVIEW_ID,
        ranking_snapshot_id: RANKING_SNAPSHOT_ID,
      },
    },
    meta: {
      idempotency: {
        replayed,
      },
    },
  };
}

describe("PPL-ALLOC-009 promotion submission revision binding", () => {
  it("binds an HTTP 202 create to the immutable review revision", () => {
    expect(bindPplAlloc009PromotionSubmission({
      expectedRankingSnapshotId: RANKING_SNAPSHOT_ID,
      stableRecommendationId: STABLE_RECOMMENDATION_ID,
      status: 202,
      submitPayload: submitPayload(false),
    })).toEqual({
      submittedReviewId: SUBMITTED_REVIEW_ID,
    });
  });

  it("binds an HTTP 200 idempotent replay to the same immutable review revision", () => {
    expect(bindPplAlloc009PromotionSubmission({
      expectedRankingSnapshotId: RANKING_SNAPSHOT_ID,
      stableRecommendationId: STABLE_RECOMMENDATION_ID,
      status: 200,
      submitPayload: submitPayload(true),
    })).toEqual({
      submittedReviewId: SUBMITTED_REVIEW_ID,
    });
  });

  it("rejects an HTTP 200 response that is not marked as an idempotent replay", () => {
    expect(() => bindPplAlloc009PromotionSubmission({
      expectedRankingSnapshotId: RANKING_SNAPSHOT_ID,
      stableRecommendationId: STABLE_RECOMMENDATION_ID,
      status: 200,
      submitPayload: submitPayload(false),
    })).toThrow("must be an idempotent replay");
  });
});
