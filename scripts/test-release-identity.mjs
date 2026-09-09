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

// BFF Image Identity and explicit digest type tests
import { normalizeBffImage, normalizeLease } from "./release-identity.mjs";

const MANIFEST_DIGEST = "a".repeat(64);
const CONFIG_DIGEST = "b".repeat(64);
const ARCHIVE_CHECKSUM = "c".repeat(64);

const normalizedImage = normalizeBffImage({
  repository: "asia-east1-docker.pkg.dev/pantheon-dev/pantheon/bff",
  tag: "dev",
  digestType: "oci_manifest_digest",
  digest: MANIFEST_DIGEST,
  ociManifestDigest: MANIFEST_DIGEST,
  imageConfigDigest: CONFIG_DIGEST,
  archiveChecksum: ARCHIVE_CHECKSUM,
});
assert.equal(normalizedImage.digestType, "oci_manifest_digest");
assert.equal(normalizedImage.digest, MANIFEST_DIGEST);
assert.equal(normalizedImage.ociManifestDigest, MANIFEST_DIGEST);
assert.equal(normalizedImage.imageConfigDigest, CONFIG_DIGEST);
assert.equal(normalizedImage.archiveChecksum, ARCHIVE_CHECKSUM);

// Fail closed when relabeling image config digest, OCI manifest digest and archive checksum as identical
assert.throws(
  () =>
    normalizeBffImage({
      repository: "asia-east1-docker.pkg.dev/pantheon-dev/pantheon/bff",
      tag: "dev",
      digestType: "oci_manifest_digest",
      digest: MANIFEST_DIGEST,
      ociManifestDigest: MANIFEST_DIGEST,
      imageConfigDigest: MANIFEST_DIGEST, // Same!
    }),
  /cannot relabel OCI manifest digest and image config digest as identical values/,
);

assert.throws(
  () =>
    normalizeBffImage({
      repository: "asia-east1-docker.pkg.dev/pantheon-dev/pantheon/bff",
      tag: "dev",
      digestType: "unknown_type",
      digest: MANIFEST_DIGEST,
    }),
  /digest type must be one of/,
);

// Identity with image and lease
const VERSION_WITH_IMAGE = {
  ...VERSION_PAYLOAD,
  image: normalizedImage,
};

assert.throws(
  () =>
    createReleaseIdentity({
      frontendSha: FRONTEND_SHA,
      bffBaseUrl: BFF_BASE_URL,
      versionPayload: VERSION_PAYLOAD,
      gateRunId: "12345",
      gateRunUrl: "https://github.test/actions/runs/12345",
      bffImage: normalizedImage,
    }),
  /live BFF version did not expose an observed image matching caller expectations/,
);

const imageIdentity = createReleaseIdentity({
  frontendSha: FRONTEND_SHA,
  bffBaseUrl: BFF_BASE_URL,
  versionPayload: VERSION_WITH_IMAGE,
  gateRunId: "12345",
  gateRunUrl: "https://github.test/actions/runs/12345",
  bffImage: normalizedImage,
  lease: {
    owner: "pantheon-dev-deploy",
    epoch: "42",
    runId: "12345",
  },
  releaseId: "d".repeat(64),
  compatibilityDigest: "e".repeat(64),
});

assert.equal(imageIdentity.bff.image.digest, MANIFEST_DIGEST);
assert.equal(imageIdentity.lease.epoch, "42");
assert.equal(
  validateReleaseIdentity(imageIdentity, {
    expectedBffImageDigest: MANIFEST_DIGEST,
    expectedBffImageDigestType: "oci_manifest_digest",
    expectedLeaseEpoch: "42",
    expectedLeaseOwner: "pantheon-dev-deploy",
  }),
  BFF_SHA,
);

assert.throws(
  () =>
    validateReleaseIdentity(imageIdentity, {
      expectedBffImageDigest: CONFIG_DIGEST,
    }),
  /release identity BFF image digest mismatch/,
);

assert.throws(
  () =>
    validateReleaseIdentity(imageIdentity, {
      expectedLeaseEpoch: "99",
    }),
  /release identity lease epoch mismatch/,
);

console.log("OK: exact FE/BFF release identity regression tests passed");
