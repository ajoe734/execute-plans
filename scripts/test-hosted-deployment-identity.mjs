#!/usr/bin/env node

import assert from "node:assert/strict";

import { validateHostedDeployment } from "./hosted-deployment-identity.mjs";

const frontendSha = "a".repeat(40);
const bffSha = "b".repeat(40);
const feBaseUrl = "https://pantheon-lupin-dev-fe.35.201.239.38.sslip.io";
const bffBaseUrl = "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io";

function manifest(overrides = {}) {
  return {
    app: "execute-plans",
    environment: "pantheon-dev-fe",
    commit: frontendSha,
    feHost: feBaseUrl,
    bffHost: bffBaseUrl,
    bffCommit: bffSha,
    bffCommitEvidence: true,
    bffCommitSource: "bff_version",
    deploymentProfile: "persona-interaction-write-proof",
    buildMode: {
      VITE_BFF_MODE: "live",
      VITE_BFF_FALLBACK: "strict",
      VITE_BFF_REAL_WRITES: "true",
      VITE_BFF_ALLOW_DEV_STUB_WRITES: "true",
      VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
    },
    ...overrides,
  };
}

const expected = {
  frontendSha,
  bffSha,
  feBaseUrl,
  bffBaseUrl,
  deploymentProfile: "persona-interaction-write-proof",
};

assert.equal(
  validateHostedDeployment(manifest(), expected).frontendSha,
  frontendSha,
);

assert.throws(
  () =>
    validateHostedDeployment(manifest({ commit: "c".repeat(40) }), expected),
  /hosted frontend SHA mismatch/,
);
assert.throws(
  () =>
    validateHostedDeployment(manifest({ bffCommit: "c".repeat(40) }), expected),
  /hosted BFF SHA mismatch/,
);
assert.throws(
  () =>
    validateHostedDeployment(
      manifest({ deploymentProfile: "read-only" }),
      expected,
    ),
  /hosted deployment profile mismatch/,
);
assert.throws(
  () =>
    validateHostedDeployment(
      manifest({
        buildMode: {
          ...manifest().buildMode,
          VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
        },
      }),
      expected,
    ),
  /hosted build mode does not match/,
);
assert.throws(
  () =>
    validateHostedDeployment(manifest({ bffCommitEvidence: false }), expected),
  /not backed by exact \/bff\/version evidence/,
);

const restored = manifest({
  deploymentProfile: "persona-interaction-read-only-restore",
  buildMode: {
    ...manifest().buildMode,
    VITE_BFF_REAL_WRITES: "false",
    VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
  },
});
assert.equal(
  validateHostedDeployment(restored, {
    ...expected,
    deploymentProfile: "persona-interaction-read-only-restore",
  }).realWrites,
  "false",
);

console.log("OK: hosted deployment identity semantic tests passed");
