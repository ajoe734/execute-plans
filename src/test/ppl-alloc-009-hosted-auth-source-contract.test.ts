import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const harness = readFileSync(
  resolve(
    process.cwd(),
    "e2e/ppl-alloc-009-cross-repo-hosted.spec.ts",
  ),
  "utf8",
);

describe("PPL-ALLOC-009 hosted browser identity contract", () => {
  it("uses the real hosted GCP Identity sign-in UI without synthetic storage", () => {
    expect(harness).toContain("PPL_ALLOC_009_GCP_IDENTITY_EMAIL");
    expect(harness).toContain("PPL_ALLOC_009_GCP_IDENTITY_PASSWORD");
    expect(harness).toContain('page.getByPlaceholder("Email").fill(GCP_IDENTITY_EMAIL)');
    expect(harness).toContain('page.getByPlaceholder("Password").fill(GCP_IDENTITY_PASSWORD)');
    expect(harness).toContain(
      'page.getByRole("button", { exact: true, name: "Sign in" }).click()',
    );
    expect(harness).toContain('provider: "gcp_identity_platform"');
    expect(harness).toContain("syntheticSession: false");
    expect(harness).not.toContain("gcpIdentityStoredUser");
    expect(harness).not.toContain("gcpIdentityStorageKey");
    expect(harness).not.toContain("window.sessionStorage.setItem");
    expect(harness).not.toContain("page.route(");
  });

  it("persists completed B1 evidence before browser B3 begins", () => {
    const checkpoint = harness.indexOf(
      'B1: "passed_governed_paper_only_chain"',
    );
    const browserProof = harness.indexOf(
      "const desktop = await runBrowserProof",
    );

    expect(checkpoint).toBeGreaterThan(-1);
    expect(browserProof).toBeGreaterThan(checkpoint);
    expect(harness.slice(checkpoint, browserProof)).toContain(
      'B3: "in_progress_real_gcp_identity_browser"',
    );
    expect(harness.slice(checkpoint, browserProof)).toContain(
      "requestResponseEvidence: calls",
    );
  });
});
