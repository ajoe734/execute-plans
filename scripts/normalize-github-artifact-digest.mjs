#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const CANONICAL_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export function normalizeGitHubArtifactDigest(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  const canonical = raw.startsWith("sha256:") ? raw : `sha256:${raw}`;
  if (!CANONICAL_DIGEST_PATTERN.test(canonical)) {
    throw new Error("GitHub artifact digest must be a SHA-256 digest");
  }
  return canonical;
}

const invokedUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedUrl === import.meta.url) {
  try {
    process.stdout.write(`${normalizeGitHubArtifactDigest(process.argv[2])}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
