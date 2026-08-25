#!/usr/bin/env node

const baseUrl = String(
  process.env.PANTHEON_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io",
).replace(/\/$/, "");
const token = String(process.env.PANTHEON_BFF_AUTH_TOKEN || "").trim();
const rationale = "Pantheon dev hosted write-path probe; reject keeps the recommendation non-operational.";

if (!token) {
  throw new Error("PANTHEON_BFF_AUTH_TOKEN is required");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mutationIsDisabled(value) {
  const root = record(value);
  const data = record(root.data);
  const meta = record(root.meta);
  return [
    root.live_capital_mutation,
    root.liveCapitalMutation,
    data.live_capital_mutation,
    data.liveCapitalMutation,
    meta.live_capital_mutation,
    meta.liveCapitalMutation,
  ].every((flag) => flag !== true);
}

async function request(path, { method = "GET", body, idempotencyKey } = {}) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${method} ${path} returned non-JSON HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return { status: response.status, payload };
}

function recommendationItems(payload) {
  const data = record(record(payload).data);
  return Array.isArray(data.items) ? data.items.map(record) : [];
}

async function findRecommendation() {
  const queries = [
    "?page_size=100",
    "?quarter=2026-Q1&page_size=100",
    "?quarter=2026-Q2&page_size=100",
    "?quarter=2026-Q3&page_size=100",
  ];
  for (const query of queries) {
    const result = await request(`/bff/management/promotion-reviews${query}`);
    const items = recommendationItems(result.payload);
    const candidate = items.find((item) => item.review_id || item.recommendation_id);
    if (candidate) return candidate;
  }
  throw new Error("No promotion review recommendation is available for the dev write probe");
}

async function readDetail(reviewId) {
  return request(`/bff/management/promotion-reviews/${encodeURIComponent(reviewId)}`);
}

const me = await request("/bff/me");
const meData = record(me.payload.data);
const session = record(meData.session);
const environment = record(meData.environment);
const environmentName = String(environment.name || environment.deployment_stage || meData.env || "").toLowerCase();
assert(session.authenticated !== false, "/bff/me did not return an authenticated session");
assert(["dev", "development", "test", "testing"].includes(environmentName), `write probe refuses non-dev BFF environment: ${environmentName || "missing"}`);

const recommendation = await findRecommendation();
const reviewId = String(recommendation.review_id || recommendation.recommendation_id);
const recommendationId = String(recommendation.recommendation_id || reviewId);
const quarter = String(recommendation.quarter || "");
const stableId = reviewId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120);

const submitted = await request(
  `/bff/management/quarterly-ranking/recommendations/${encodeURIComponent(recommendationId)}/submit`,
  {
    method: "POST",
    body: quarter ? { quarter } : {},
    idempotencyKey: `dev-write-probe-submit-${stableId}`,
  },
);
assert([200, 202].includes(submitted.status), `unexpected submit status ${submitted.status}`);
assert(mutationIsDisabled(submitted.payload), "recommendation submit reported a live capital mutation");

let detail = await readDetail(reviewId);
const submittedDetail = record(detail.payload.data);
assert(submittedDetail.submitted === true, "promotion review was not persisted as submitted");
const humanInboxId = String(
  submittedDetail.human_inbox_id ||
  record(submitted.payload.data).human_inbox_id ||
  `promotion_review:${reviewId}`,
);

const decision = await request(
  `/bff/management/promotion-reviews/${encodeURIComponent(reviewId)}/decisions`,
  {
    method: "POST",
    body: { decision: "reject", rationale, ...(quarter ? { quarter } : {}) },
    idempotencyKey: `dev-write-probe-reject-${stableId}`,
  },
);
assert(decision.status === 202, `unexpected decision status ${decision.status}`);
assert(mutationIsDisabled(decision.payload), "Human Review decision reported a live capital mutation");

detail = await readDetail(reviewId);
const decidedDetail = record(detail.payload.data);
assert(decidedDetail.submitted === true, "submitted state disappeared after decision");
assert(
  ["accepted", "rejected"].includes(String(decidedDetail.decision_status || decidedDetail.status || "")),
  `Human Review decision was not visible on read-back: ${JSON.stringify({ status: decidedDetail.status, decision_status: decidedDetail.decision_status })}`,
);

const inbox = await request(`/bff/management/human-inbox/${encodeURIComponent(humanInboxId)}`);
const inboxData = record(inbox.payload.data);
assert(
  String(inboxData.promotion_review_id || inboxData.review_id || "") === reviewId,
  "Human Inbox read-back did not resolve the persisted promotion review",
);

console.log(JSON.stringify({
  status: "pass",
  environment: environmentName,
  sessionKind: session.session_kind || session.sessionKind,
  reviewId,
  recommendationId,
  submitStatus: submitted.status,
  decisionStatus: decision.status,
  readBackStatus: decidedDetail.decision_status || decidedDetail.status,
  humanInboxId,
  liveCapitalMutation: false,
}, null, 2));
