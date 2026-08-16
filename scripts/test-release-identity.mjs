#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  createReleaseIdentity,
  sourceShaFromVersion,
  validateReleaseIdentity,
  verifyVersionAgainstIdentity,
} from "./release-identity.mjs";

const FRONTEND_SHA = "1".repeat(40);
const BFF_SHA = "a".repeat(40);
const OTHER_BFF_SHA = "b".repeat(40);
const BFF_BASE_URL = "https://bff.test";
const VERSION_PAYLOAD = {
  service: "operator-bff",
  source_commit_sha: BFF_SHA,
  commit: BFF_SHA,
  source_commit_known: true,
};

const identity = createReleaseIdentity({
  frontendSha: FRONTEND_SHA,
  bffBaseUrl: `${BFF_BASE_URL}/`,
  versionPayload: VERSION_PAYLOAD,
  expectedBffSha: BFF_SHA.toUpperCase(),
  gateRunId: "12345",
  gateRunUrl: "https://github.test/actions/runs/12345",
  observedAt: "2026-07-13T00:00:00Z",
});

assert.equal(identity.frontend.commitSha, FRONTEND_SHA);
assert.equal(identity.bff.baseUrl, BFF_BASE_URL);
assert.equal(identity.bff.sourceCommitSha, BFF_SHA);
assert.equal(
  validateReleaseIdentity(identity, {
    frontendSha: FRONTEND_SHA,
    bffBaseUrl: BFF_BASE_URL,
    gateRunId: "12345",
  }),
  BFF_SHA,
);
assert.equal(sourceShaFromVersion(VERSION_PAYLOAD), BFF_SHA);
assert.equal(
  verifyVersionAgainstIdentity(identity, VERSION_PAYLOAD, {
    frontendSha: FRONTEND_SHA,
    bffBaseUrl: BFF_BASE_URL,
    gateRunId: "12345",
  }),
  BFF_SHA,
);

assert.throws(
  () => sourceShaFromVersion({ ...VERSION_PAYLOAD, source_commit_known: false }),
  /unknown source commit/,
);
assert.throws(
  () => sourceShaFromVersion({ ...VERSION_PAYLOAD, source_commit_sha: "unknown" }),
  /exact 40-character/,
);
assert.throws(
  () => sourceShaFromVersion({ ...VERSION_PAYLOAD, commit: OTHER_BFF_SHA }),
  /internally inconsistent/,
);
assert.throws(
  () =>
    createReleaseIdentity({
      frontendSha: FRONTEND_SHA,
      bffBaseUrl: BFF_BASE_URL,
      versionPayload: VERSION_PAYLOAD,
      expectedBffSha: OTHER_BFF_SHA,
      gateRunId: "12345",
      gateRunUrl: "https://github.test/actions/runs/12345",
      observedAt: "2026-07-13T00:00:00Z",
    }),
  /live BFF SHA mismatch/,
);
assert.throws(
  () => validateReleaseIdentity(identity, { frontendSha: "2".repeat(40) }),
  /frontend SHA mismatch/,
);
assert.throws(
  () => validateReleaseIdentity(identity, { gateRunId: "different-run" }),
  /gate run mismatch/,
);
assert.throws(
  () =>
    validateReleaseIdentity({
      ...identity,
      gate: { ...identity.gate, runUrl: "https://github.test/actions/runs/different-run" },
    }),
  /gate run URL does not match/,
);
assert.throws(
  () =>
    verifyVersionAgainstIdentity(identity, {
      ...VERSION_PAYLOAD,
      source_commit_sha: OTHER_BFF_SHA,
      commit: OTHER_BFF_SHA,
    }),
  /live BFF SHA mismatch/,
);

console.log("OK: exact FE/BFF release identity regression tests passed");
