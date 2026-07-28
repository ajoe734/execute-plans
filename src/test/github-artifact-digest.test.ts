import { describe, expect, it } from "vitest";

import { normalizeGitHubArtifactDigest } from "../../scripts/normalize-github-artifact-digest.mjs";

describe("GitHub artifact digest normalization", () => {
  const hex = "a".repeat(64);

  it("canonicalizes the raw upload-artifact digest output", () => {
    expect(normalizeGitHubArtifactDigest(hex)).toBe(`sha256:${hex}`);
  });

  it("preserves an already-prefixed digest and normalizes case", () => {
    expect(normalizeGitHubArtifactDigest(` SHA256:${hex.toUpperCase()} `)).toBe(
      `sha256:${hex}`,
    );
  });

  it.each(["", "a".repeat(63), `sha512:${hex}`, `sha256:${hex}00`])(
    "rejects malformed digest %j",
    (value) => {
      expect(() => normalizeGitHubArtifactDigest(value)).toThrow(
        "must be a SHA-256 digest",
      );
    },
  );
});
