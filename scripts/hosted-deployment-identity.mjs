#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeBaseUrl, normalizeGitSha } from "./release-identity.mjs";

function requiredString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

export function validateHostedDeployment(
  payload,
  { frontendSha, bffSha, feBaseUrl, bffBaseUrl, deploymentProfile },
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("hosted deployment manifest must be a JSON object");
  }

  const expectedFrontendSha = normalizeGitSha(
    frontendSha,
    "expected frontend SHA",
  );
  const expectedBffSha = normalizeGitSha(bffSha, "expected BFF SHA");
  const expectedFeBaseUrl = normalizeBaseUrl(
    feBaseUrl,
    "expected frontend base URL",
  );
  const expectedBffBaseUrl = normalizeBaseUrl(
    bffBaseUrl,
    "expected BFF base URL",
  );
  const expectedProfile = requiredString(
    deploymentProfile,
    "expected deployment profile",
  );
  const expectedWrites =
    expectedProfile === "persona-interaction-write-proof" ? "true" : "false";

  const actualFrontendSha = normalizeGitSha(
    payload.commit,
    "deployment manifest frontend SHA",
  );
  const actualBffSha = normalizeGitSha(
    payload.bffCommit,
    "deployment manifest BFF SHA",
  );
  if (actualFrontendSha !== expectedFrontendSha) {
    throw new Error(
      `hosted frontend SHA mismatch: expected ${expectedFrontendSha}, got ${actualFrontendSha}`,
    );
  }
  if (actualBffSha !== expectedBffSha) {
    throw new Error(
      `hosted BFF SHA mismatch: expected ${expectedBffSha}, got ${actualBffSha}`,
    );
  }
  if (
    normalizeBaseUrl(payload.feHost, "deployment manifest frontend host") !==
    expectedFeBaseUrl
  ) {
    throw new Error(
      "hosted frontend origin does not match the exact proof target",
    );
  }
  if (
    normalizeBaseUrl(payload.bffHost, "deployment manifest BFF host") !==
    expectedBffBaseUrl
  ) {
    throw new Error("hosted BFF origin does not match the exact proof target");
  }
  if (
    payload.bffCommitEvidence !== true ||
    payload.bffCommitSource !== "bff_version"
  ) {
    throw new Error(
      "hosted BFF identity is not backed by exact /bff/version evidence",
    );
  }
  if (payload.deploymentProfile !== expectedProfile) {
    throw new Error(
      `hosted deployment profile mismatch: expected ${expectedProfile}, got ${payload.deploymentProfile}`,
    );
  }
  if (
    payload.buildMode?.VITE_BFF_MODE !== "live" ||
    payload.buildMode?.VITE_BFF_FALLBACK !== "strict" ||
    payload.buildMode?.VITE_BFF_REAL_WRITES !== expectedWrites ||
    payload.buildMode?.VITE_BFF_ALLOW_DEV_STUB_WRITES !== expectedWrites ||
    payload.buildMode?.VITE_BFF_EMBEDDED_BEARER_TOKEN !== "false"
  ) {
    throw new Error(
      `hosted build mode does not match the ${expectedProfile} safety boundary`,
    );
  }

  return {
    frontendSha: actualFrontendSha,
    bffSha: actualBffSha,
    feBaseUrl: expectedFeBaseUrl,
    bffBaseUrl: expectedBffBaseUrl,
    deploymentProfile: expectedProfile,
    realWrites: expectedWrites,
    devStubWrites: expectedWrites,
  };
}

function parseOptions(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !flag?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error(`invalid option sequence near ${flag ?? "<end>"}`);
    }
    if (values.has(flag)) {
      throw new Error(`duplicate option: ${flag}`);
    }
    values.set(flag, value);
  }
  return (flag) => requiredString(values.get(flag), flag);
}

export function main(argv = process.argv.slice(2)) {
  const option = parseOptions(argv);
  const manifestPath = path.resolve(option("--manifest-file"));
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `hosted deployment manifest is not readable JSON: ${error.message}`,
    );
  }
  const result = validateHostedDeployment(payload, {
    frontendSha: option("--frontend-sha"),
    bffSha: option("--bff-sha"),
    feBaseUrl: option("--fe-base-url"),
    bffBaseUrl: option("--bff-base-url"),
    deploymentProfile: option("--deployment-profile"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedAsScript =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`hosted deployment identity error: ${error.message}`);
    process.exit(2);
  }
}
