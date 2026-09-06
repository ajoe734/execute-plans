#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/i;
const SUPPORTED_SCHEMA_VERSION = 1;
const FRONTEND_REPOSITORY = "ajoe734/execute-plans";
const GATE_WORKFLOW = "pantheon-integration-gate.yml";

export const BFF_IMAGE_DIGEST_TYPES = Object.freeze([
  "oci_manifest_digest",
  "image_config_digest",
  "archive_checksum",
]);

export function normalizeImageDigest(value, label = "image digest") {
  const raw = requiredString(value, label).toLowerCase().replace(/^sha256:/u, "");
  if (!DIGEST_PATTERN.test(raw)) {
    throw new Error(`${label} must be an exact 64-character hexadecimal SHA-256 digest`);
  }
  return raw;
}

export function normalizeImageDigestType(value, label = "image digest type") {
  const normalized = requiredString(value, label).toLowerCase();
  if (!BFF_IMAGE_DIGEST_TYPES.includes(normalized)) {
    throw new Error(
      `${label} must be one of: ${BFF_IMAGE_DIGEST_TYPES.join(", ")}`,
    );
  }
  return normalized;
}

export function normalizeBffImage(image, label = "BFF image identity") {
  if (!image || typeof image !== "object" || Array.isArray(image)) {
    throw new Error(`${label} must be a JSON object`);
  }
  const repository = requiredString(image.repository ?? image.imageRef, `${label} repository`);
  const tag = requiredString(image.tag ?? "dev", `${label} tag`);
  const digestType = normalizeImageDigestType(image.digestType, `${label} digest type`);
  const digest = normalizeImageDigest(image.digest, `${label} digest`);

  const ociManifestDigest = image.ociManifestDigest
    ? normalizeImageDigest(image.ociManifestDigest, `${label} OCI manifest digest`)
    : digestType === "oci_manifest_digest"
      ? digest
      : undefined;
  if (ociManifestDigest && digestType === "oci_manifest_digest" && ociManifestDigest !== digest) {
    throw new Error(
      `${label} digestType is oci_manifest_digest but digest does not match ociManifestDigest`,
    );
  }
  const imageConfigDigest = image.imageConfigDigest
    ? normalizeImageDigest(image.imageConfigDigest, `${label} image config digest`)
    : digestType === "image_config_digest"
      ? digest
      : undefined;
  if (imageConfigDigest && digestType === "image_config_digest" && imageConfigDigest !== digest) {
    throw new Error(
      `${label} digestType is image_config_digest but digest does not match imageConfigDigest`,
    );
  }
  const archiveChecksum = image.archiveChecksum
    ? normalizeImageDigest(image.archiveChecksum, `${label} archive checksum`)
    : digestType === "archive_checksum"
      ? digest
      : undefined;
  if (archiveChecksum && digestType === "archive_checksum" && archiveChecksum !== digest) {
    throw new Error(
      `${label} digestType is archive_checksum but digest does not match archiveChecksum`,
    );
  }

  if (ociManifestDigest && imageConfigDigest && ociManifestDigest === imageConfigDigest) {
    throw new Error(
      `${label} cannot relabel OCI manifest digest and image config digest as identical values`,
    );
  }
  if (ociManifestDigest && archiveChecksum && ociManifestDigest === archiveChecksum) {
    throw new Error(
      `${label} cannot relabel OCI manifest digest and archive checksum as identical values`,
    );
  }
  if (imageConfigDigest && archiveChecksum && imageConfigDigest === archiveChecksum) {
    throw new Error(
      `${label} cannot relabel image config digest and archive checksum as identical values`,
    );
  }

  return {
    repository,
    tag,
    digestType,
    digest,
    ...(ociManifestDigest ? { ociManifestDigest } : {}),
    ...(imageConfigDigest ? { imageConfigDigest } : {}),
    ...(archiveChecksum ? { archiveChecksum } : {}),
  };
}

export function normalizeLease(lease, label = "environment lease") {
  if (!lease || typeof lease !== "object" || Array.isArray(lease)) {
    throw new Error(`${label} must be a JSON object`);
  }
  const owner = requiredString(lease.owner, `${label} owner`);
  const epoch = requiredString(lease.epoch, `${label} epoch`);
  const runId = lease.runId ? requiredString(lease.runId, `${label} runId`) : "";
  const delegated = Boolean(lease.delegated ?? true);
  return { owner, epoch, delegated, ...(runId ? { runId } : {}) };
}

function requiredString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}
export function normalizeGitSha(value, label = "git SHA") {
  const normalized = requiredString(value, label).toLowerCase();
  if (!SHA_PATTERN.test(normalized)) {
    throw new Error(`${label} must be an exact 40-character hexadecimal git SHA`);
  }
  return normalized;
}

export function normalizeBaseUrl(value, label = "BFF base URL") {
  const raw = requiredString(value, label);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${label} must use HTTP or HTTPS`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must not contain credentials, a query, or a fragment`);
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

export function sourceShaFromVersion(versionPayload) {
  if (!versionPayload || typeof versionPayload !== "object" || Array.isArray(versionPayload)) {
    throw new Error("BFF /bff/version payload must be a JSON object");
  }
  if (versionPayload.source_commit_known !== true) {
    throw new Error("BFF /bff/version reports an unknown source commit");
  }

  const sourceSha = normalizeGitSha(
    versionPayload.source_commit_sha,
    "BFF source_commit_sha",
  );
  const commitSha = normalizeGitSha(versionPayload.commit, "BFF commit");
  if (sourceSha !== commitSha) {
    throw new Error(
      `BFF /bff/version is internally inconsistent: source_commit_sha ${sourceSha} != commit ${commitSha}`,
    );
  }
  return sourceSha;
}

export function createReleaseIdentity({
  frontendSha,
  bffBaseUrl,
  versionPayload,
  expectedBffSha = "",
  gateRunId,
  gateRunUrl,
  gateRunAttempt = "",
  observedAt = new Date().toISOString(),
  bffImage = null,
  releaseId = "",
  compatibilityDigest = "",
  lease = null,
}) {
  const normalizedFrontendSha = normalizeGitSha(frontendSha, "frontend SHA");
  const normalizedBffBaseUrl = normalizeBaseUrl(bffBaseUrl);
  const liveBffSha = sourceShaFromVersion(versionPayload);
  const explicitExpectedSha = String(expectedBffSha ?? "").trim();
  if (explicitExpectedSha) {
    const normalizedExpectedSha = normalizeGitSha(
      explicitExpectedSha,
      "explicit expected BFF SHA",
    );
    if (normalizedExpectedSha !== liveBffSha) {
      throw new Error(
        `live BFF SHA mismatch: expected ${normalizedExpectedSha}, got ${liveBffSha}`,
      );
    }
  }

  const normalizedObservedAt = requiredString(observedAt, "observedAt");
  if (!Number.isFinite(Date.parse(normalizedObservedAt))) {
    throw new Error("observedAt must be an ISO-8601 timestamp");
  }

  let normalizedImage = null;
  const observedImage = versionPayload?.image
    ? normalizeBffImage(versionPayload.image, "observed live BFF image")
    : null;
  const callerImage = bffImage
    ? normalizeBffImage(bffImage, "explicit expected BFF image")
    : null;

  if (observedImage && callerImage) {
    if (
      observedImage.digest !== callerImage.digest ||
      observedImage.digestType !== callerImage.digestType ||
      observedImage.repository !== callerImage.repository ||
      observedImage.tag !== callerImage.tag
    ) {
      throw new Error(
        `live BFF image mismatch: expected ${callerImage.digest} (${callerImage.digestType}), observed ${observedImage.digest} (${observedImage.digestType})`,
      );
    }
    normalizedImage = observedImage;
  } else if (observedImage) {
    normalizedImage = observedImage;
  } else if (callerImage) {
    normalizedImage = callerImage;
  }
  const normalizedLease = lease ? normalizeLease(lease) : null;

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    frontend: {
      repository: FRONTEND_REPOSITORY,
      commitSha: normalizedFrontendSha,
    },
    bff: {
      baseUrl: normalizedBffBaseUrl,
      versionUrl: `${normalizedBffBaseUrl}/bff/version`,
      sourceCommitSha: liveBffSha,
      sourceCommitKnown: true,
      ...(normalizedImage ? { image: normalizedImage } : {}),
    },
    gate: {
      workflow: GATE_WORKFLOW,
      runId: requiredString(gateRunId, "gate run ID"),
      runUrl: requiredString(gateRunUrl, "gate run URL"),
      ...(gateRunAttempt ? { runAttempt: String(gateRunAttempt).trim() } : {}),
      observedAt: normalizedObservedAt,
    },
    ...(releaseId ? { releaseId: normalizeImageDigest(releaseId, "releaseId") } : {}),
    ...(compatibilityDigest
      ? { compatibilityDigest: normalizeImageDigest(compatibilityDigest, "compatibilityDigest") }
      : {}),
    ...(normalizedLease ? { lease: normalizedLease } : {}),
  };
}

export function validateReleaseIdentity(
  identity,
  {
    frontendSha = "",
    bffBaseUrl = "",
    gateRunId = "",
    expectedBffImageDigest = "",
    expectedBffImageDigestType = "",
    expectedLeaseEpoch = "",
    expectedLeaseOwner = "",
  } = {},
) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    throw new Error("release identity must be a JSON object");
  }
  if (identity.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`unsupported release identity schemaVersion: ${identity.schemaVersion}`);
  }
  if (identity.frontend?.repository !== FRONTEND_REPOSITORY) {
    throw new Error(`release identity frontend repository must be ${FRONTEND_REPOSITORY}`);
  }

  const identityFrontendSha = normalizeGitSha(
    identity.frontend?.commitSha,
    "release identity frontend SHA",
  );
  const identityBffBaseUrl = normalizeBaseUrl(
    identity.bff?.baseUrl,
    "release identity BFF base URL",
  );
  const identityBffSha = normalizeGitSha(
    identity.bff?.sourceCommitSha,
    "release identity BFF SHA",
  );
  if (identity.bff?.sourceCommitKnown !== true) {
    throw new Error("release identity must record sourceCommitKnown=true");
  }
  if (identity.bff?.versionUrl !== `${identityBffBaseUrl}/bff/version`) {
    throw new Error("release identity BFF versionUrl does not match its baseUrl");
  }

  if (identity.bff?.image) {
    normalizeBffImage(identity.bff.image);
    if (expectedBffImageDigest) {
      const normalizedExpected = normalizeImageDigest(
        expectedBffImageDigest,
        "expected BFF image digest",
      );
      if (identity.bff.image.digest !== normalizedExpected) {
        throw new Error(
          `release identity BFF image digest mismatch: expected ${normalizedExpected}, got ${identity.bff.image.digest}`,
        );
      }
    }
    if (expectedBffImageDigestType) {
      const normalizedExpectedType = normalizeImageDigestType(
        expectedBffImageDigestType,
        "expected BFF image digest type",
      );
      if (identity.bff.image.digestType !== normalizedExpectedType) {
        throw new Error(
          `release identity BFF image digest type mismatch: expected ${normalizedExpectedType}, got ${identity.bff.image.digestType}`,
        );
      }
    }
  } else if (expectedBffImageDigest) {
    throw new Error("release identity is missing expected BFF image identity");
  }

  if (identity.lease) {
    normalizeLease(identity.lease);
    if (expectedLeaseEpoch && String(identity.lease.epoch) !== String(expectedLeaseEpoch)) {
      throw new Error(
        `release identity lease epoch mismatch: expected ${expectedLeaseEpoch}, got ${identity.lease.epoch}`,
      );
    }
    if (
      expectedLeaseOwner &&
      identity.lease.owner.toLowerCase() !== expectedLeaseOwner.toLowerCase()
    ) {
      throw new Error(
        `release identity lease owner mismatch: expected ${expectedLeaseOwner}, got ${identity.lease.owner}`,
      );
    }
  } else if (expectedLeaseEpoch) {
    throw new Error("release identity is missing expected lease");
  }

  if (identity.gate?.workflow !== GATE_WORKFLOW) {
    throw new Error(`release identity gate workflow must be ${GATE_WORKFLOW}`);
  }
  const identityGateRunId = requiredString(identity.gate?.runId, "release identity gate run ID");
  const identityGateRunUrl = requiredString(identity.gate?.runUrl, "release identity gate run URL");
  let parsedGateRunUrl;
  try {
    parsedGateRunUrl = new URL(identityGateRunUrl);
  } catch {
    throw new Error("release identity gate run URL must be an absolute URL");
  }
  if (
    parsedGateRunUrl.protocol !== "https:" ||
    !parsedGateRunUrl.pathname.endsWith(`/actions/runs/${identityGateRunId}`)
  ) {
    throw new Error("release identity gate run URL does not match its run ID");
  }
  const observedAt = requiredString(identity.gate?.observedAt, "release identity observedAt");
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error("release identity observedAt must be an ISO-8601 timestamp");
  }

  if (String(frontendSha ?? "").trim()) {
    const expectedFrontendSha = normalizeGitSha(frontendSha, "expected frontend SHA");
    if (identityFrontendSha !== expectedFrontendSha) {
      throw new Error(
        `release identity frontend SHA mismatch: expected ${expectedFrontendSha}, got ${identityFrontendSha}`,
      );
    }
  }
  if (String(bffBaseUrl ?? "").trim()) {
    const expectedBffBaseUrl = normalizeBaseUrl(bffBaseUrl, "expected BFF base URL");
    if (identityBffBaseUrl !== expectedBffBaseUrl) {
      throw new Error(
        `release identity BFF base URL mismatch: expected ${expectedBffBaseUrl}, got ${identityBffBaseUrl}`,
      );
    }
  }
  if (String(gateRunId ?? "").trim()) {
    const expectedGateRunId = requiredString(gateRunId, "expected gate run ID");
    if (identityGateRunId !== expectedGateRunId) {
      throw new Error(
        `release identity gate run mismatch: expected ${expectedGateRunId}, got ${identityGateRunId}`,
      );
    }
  }

  return identityBffSha;
}

export function verifyVersionAgainstIdentity(identity, versionPayload, expectations = {}) {
  const identityBffSha = validateReleaseIdentity(identity, expectations);
  const liveBffSha = sourceShaFromVersion(versionPayload);
  if (liveBffSha !== identityBffSha) {
    throw new Error(
      `live BFF SHA mismatch: gated ${identityBffSha}, got ${liveBffSha}`,
    );
  }

  const expectedImage = identity.bff?.image || null;
  const expectedDigest = expectations.expectedBffImageDigest || expectedImage?.digest;
  const expectedDigestType = expectations.expectedBffImageDigestType || expectedImage?.digestType;

  if (expectedImage || expectedDigest) {
    if (!versionPayload.image) {
      throw new Error("live BFF version payload is missing required image identity");
    }
    const observedImage = normalizeBffImage(versionPayload.image, "observed live BFF image");
    if (expectedImage) {
      if (observedImage.digest !== expectedImage.digest) {
        throw new Error(
          `live BFF image digest mismatch: expected ${expectedImage.digest}, got ${observedImage.digest}`,
        );
      }
      if (observedImage.digestType !== expectedImage.digestType) {
        throw new Error(
          `live BFF image digest type mismatch: expected ${expectedImage.digestType}, got ${observedImage.digestType}`,
        );
      }
    }
    if (
      expectedDigest &&
      observedImage.digest !== normalizeImageDigest(expectedDigest, "expected BFF image digest")
    ) {
      throw new Error(
        `live BFF image digest mismatch: expected ${expectedDigest}, got ${observedImage.digest}`,
      );
    }
    if (
      expectedDigestType &&
      observedImage.digestType !==
        normalizeImageDigestType(expectedDigestType, "expected BFF image digest type")
    ) {
      throw new Error(
        `live BFF image digest type mismatch: expected ${expectedDigestType}, got ${observedImage.digestType}`,
      );
    }
  }

  return liveBffSha;
}

function readJson(filePath, label) {
  const resolvedPath = path.resolve(requiredString(filePath, label));
  try {
    return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`);
  }
}

function writeJson(filePath, payload) {
  const resolvedPath = path.resolve(requiredString(filePath, "output path"));
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseOptions(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`invalid option sequence near ${flag ?? "<end>"}`);
    }
    if (options.has(flag)) {
      throw new Error(`duplicate option: ${flag}`);
    }
    options.set(flag, value);
  }
  return (flag, { required = false, fallback = "" } = {}) => {
    if (options.has(flag)) {
      return options.get(flag);
    }
    if (required) {
      throw new Error(`missing required option: ${flag}`);
    }
    return fallback;
  };
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rawOptions] = argv;
  const option = parseOptions(rawOptions);
  const identityFile = option("--identity-file", { fallback: "" });

  if (command === "create") {
    const bffImageRepository = option("--bff-image-repository");
    const bffImageDigest = option("--bff-image-digest");
    const bffImageDigestType = option("--bff-image-digest-type");
    let bffImage = null;
    if (bffImageRepository && bffImageDigest) {
      bffImage = {
        repository: bffImageRepository,
        tag: option("--bff-image-tag", { fallback: "dev" }),
        digestType: bffImageDigestType || "oci_manifest_digest",
        digest: bffImageDigest,
        ociManifestDigest: option("--bff-oci-manifest-digest") || undefined,
        imageConfigDigest: option("--bff-image-config-digest") || undefined,
        archiveChecksum: option("--bff-archive-checksum") || undefined,
      };
    }
    const leaseOwner = option("--lease-owner");
    const leaseEpoch = option("--lease-epoch");
    let lease = null;
    if (leaseOwner && leaseEpoch) {
      lease = {
        owner: leaseOwner,
        epoch: leaseEpoch,
        runId: option("--lease-run-id"),
        delegated: true,
      };
    }

    const identity = createReleaseIdentity({
      frontendSha: option("--frontend-sha", { required: true }),
      bffBaseUrl: option("--bff-base-url", { required: true }),
      versionPayload: readJson(
        option("--version-file", { required: true }),
        "BFF version file",
      ),
      expectedBffSha: option("--expected-bff-sha"),
      gateRunId: option("--gate-run-id", { required: true }),
      gateRunUrl: option("--gate-run-url", { required: true }),
      gateRunAttempt: option("--gate-run-attempt"),
      observedAt: option("--observed-at", { fallback: new Date().toISOString() }),
      bffImage,
      releaseId: option("--release-id"),
      compatibilityDigest: option("--compatibility-digest"),
      lease,
    });
    writeJson(option("--output", { required: true }), identity);
    process.stdout.write(`${identity.bff.sourceCommitSha}\n`);
    return;
  }

  if (command === "source-version") {
    const bffSha = sourceShaFromVersion(
      readJson(option("--version-file", { required: true }), "BFF version file"),
    );
    process.stdout.write(`${bffSha}\n`);
    return;
  }

  if (command === "validate") {
    const identity = readJson(
      identityFile || option("--identity-file", { required: true }),
      "release identity file",
    );
    const bffSha = validateReleaseIdentity(identity, {
      frontendSha: option("--frontend-sha"),
      bffBaseUrl: option("--bff-base-url"),
      gateRunId: option("--gate-run-id"),
      expectedBffImageDigest: option("--expected-bff-image-digest"),
      expectedBffImageDigestType: option("--expected-bff-image-digest-type"),
      expectedLeaseEpoch: option("--expected-lease-epoch"),
      expectedLeaseOwner: option("--expected-lease-owner"),
    });
    process.stdout.write(`${bffSha}\n`);
    return;
  }

  if (command === "verify-version") {
    const identity = readJson(
      identityFile || option("--identity-file", { required: true }),
      "release identity file",
    );
    const bffSha = verifyVersionAgainstIdentity(
      identity,
      readJson(option("--version-file", { required: true }), "BFF version file"),
      {
        frontendSha: option("--frontend-sha"),
        bffBaseUrl: option("--bff-base-url"),
        gateRunId: option("--gate-run-id"),
        expectedBffImageDigest: option("--expected-bff-image-digest"),
        expectedBffImageDigestType: option("--expected-bff-image-digest-type"),
        expectedLeaseEpoch: option("--expected-lease-epoch"),
        expectedLeaseOwner: option("--expected-lease-owner"),
      },
    );
    process.stdout.write(`${bffSha}\n`);
    return;
  }

  throw new Error(
    "usage: release-identity.mjs <create|source-version|validate|verify-version> [options]",
  );
}

const invokedAsScript =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`release identity error: ${error.message}`);
    process.exitCode = 1;
  }
}
