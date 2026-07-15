import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  HOSTED_UX_PERFORMANCE_BUDGETS,
  HOSTED_UX_PROFILES,
  assessHostedUxProfile,
  assessPersonaFleetSafety,
  canonicalizeSha256,
  cssBoxShadowHasVisibleLayer,
  cssColorHasVisibleAlpha,
  createCandidateResolver,
  httpPathWithinBase,
  inspectBrowserBffMethods,
  inspectDeploymentMetadata,
  isAllowlistedConsoleError,
  isBffRequestUrl,
  listCandidateLoadedScriptAndStyleFiles,
  listCandidateScriptAndStyleFiles,
  redactDiagnosticText,
  scanTextForSensitiveValues,
  summarizeAxeViolations,
} from "../../scripts/probe-hosted-browser-bff.mjs";

const cleanupRoots: string[] = [];

function temporaryCandidate() {
  const root = mkdtempSync(join(tmpdir(), "pantheon-fe-candidate-"));
  cleanupRoots.push(root);
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><script src="/assets/app.js"></script>',
    "utf8",
  );
  writeFileSync(join(root, "assets", "app.js"), "console.log('safe');", "utf8");
  writeFileSync(
    join(root, "assets", "app.css"),
    "body { color: white; }",
    "utf8",
  );
  writeFileSync(
    join(root, "deployment.json"),
    JSON.stringify({ app: "execute-plans" }),
    "utf8",
  );
  return root;
}

function passingHostedUxProfile(profile = HOSTED_UX_PROFILES[0]) {
  return {
    profile: profile.id,
    viewport: { width: profile.width, height: profile.height },
    executionCompleted: true,
    shellStatus: 200,
    requiredCoreResponsesObserved: true,
    routeContentReady: true,
    axe: { completed: true, blockingViolations: [] },
    keyboardFocus: {
      attemptedCount: 12,
      reachedCount: 4,
      visibleCueCount: 4,
      missingVisibleCueCount: 0,
    },
    reducedMotion: {
      preferenceActive: true,
      scanComplete: true,
      activeAnimationCount: 0,
      longTransitionCount: 0,
    },
    performance: Object.fromEntries(
      Object.entries(HOSTED_UX_PERFORMANCE_BUDGETS).map(([key, maximum]) => [
        key,
        maximum,
      ]),
    ),
    diagnostics: {
      pageErrorCount: 0,
      unexpectedConsoleErrorCount: 0,
      frontendResourceFailureCount: 0,
      frontendResourceHttpErrorCount: 0,
      authorizationRequestCount: 0,
      browserWriteMethodCount: 0,
    },
  };
}

afterEach(() => {
  for (const root of cleanupRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("hosted browser strict release policy", () => {
  const safePersonaFleetEvidence = {
    rowCount: 2,
    hasNaN: false,
    hasSeedFallbackArmed: false,
    hasFallbackStandby: false,
    hasLiveEmptyState: false,
    hasAuthRequiredState: false,
    hasNonProductionRows: false,
    rowsValid: true,
    liveBannerValid: true,
  };

  it("keeps the required cold-start response within the overall probe budget", () => {
    const probeSource = readFileSync(
      resolve("scripts/probe-hosted-browser-bff.mjs"),
      "utf8",
    );

    expect(probeSource).toContain("timeoutMs = remainingTimeoutMs()");
    expect(probeSource).toContain(
      "waitForCoreBffResponse(page, expectedPath, OPTIONAL_CORE_TIMEOUT_MS)",
    );
    expect(probeSource).not.toContain("REQUIRED_CORE_TIMEOUT_MS");
  });

  it("distinguishes an RGB zero channel from transparent CSS focus colors", () => {
    expect(cssColorHasVisibleAlpha("rgb(229, 151, 0)")).toBe(true);
    expect(cssColorHasVisibleAlpha("rgba(0, 0, 0, 0)")).toBe(false);
    expect(cssColorHasVisibleAlpha("rgb(60 131 246 / 0%)")).toBe(false);
    expect(cssColorHasVisibleAlpha("rgb(60 131 246 / 35%)")).toBe(true);
    expect(
      cssBoxShadowHasVisibleLayer(
        "rgba(0, 0, 0, 0) 0 0 0 0, rgb(60, 131, 246) 0 0 0 4px",
      ),
    ).toBe(true);
    expect(cssBoxShadowHasVisibleLayer("rgba(0, 0, 0, 0) 0 0 0 2px")).toBe(
      false,
    );
  });

  it("accepts an exact gated, tokenless, safe-write deployment manifest", () => {
    const frontendSha = "a".repeat(40);
    const backendSha = "b".repeat(40);
    const digest = "c".repeat(64);
    const policy = inspectDeploymentMetadata(
      {
        app: "execute-plans",
        environment: "pantheon-dev-fe",
        commit: frontendSha,
        artifactDigest: "sha256:" + digest,
        artifactDigestSha256: digest,
        integrationGateRunId: 29328923603,
        bffCommit: backendSha,
        bffCommitEvidence: true,
        buildMode: {
          VITE_BFF_MODE: "live",
          VITE_BFF_FALLBACK: "strict",
          VITE_BFF_REAL_WRITES: "false",
          VITE_BFF_ALLOW_DEV_STUB_WRITES: false,
          VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
        },
      },
      {
        expectedSha: frontendSha,
        expectedArtifactDigest: digest,
      },
    );

    expect(policy.pass).toBe(true);
    expect(policy.failures).toEqual([]);
    expect(policy.deployment?.artifactDigest).toBe(digest);
    expect(policy.deployment?.integrationGateRunId).toBe("29328923603");
  });

  it("fails closed on identity drift, unsafe writes, or missing gate evidence", () => {
    const frontendSha = "a".repeat(40);
    const digest = "c".repeat(64);
    const policy = inspectDeploymentMetadata(
      {
        commit: "d".repeat(40),
        artifactDigest: digest,
        integrationGateRunId: "",
        bffCommit: "b".repeat(40),
        bffCommitEvidence: true,
        buildMode: {
          VITE_BFF_MODE: "live",
          VITE_BFF_FALLBACK: "strict",
          VITE_BFF_REAL_WRITES: "true",
          VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
          VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
        },
      },
      {
        expectedSha: frontendSha,
        expectedArtifactDigest: digest,
      },
    );

    expect(policy.pass).toBe(false);
    expect(policy.failures).toEqual(
      expect.arrayContaining([
        "commitMatchesExpected",
        "integrationGateRunIdValid",
        "realWritesDisabled",
      ]),
    );
  });

  it("admits a legacy rollback manifest only under explicit strict compatibility", () => {
    const frontendSha = "a".repeat(40);
    const backendSha = "b".repeat(40);
    const digest = "c".repeat(64);
    const legacyManifest = {
      app: "execute-plans",
      environment: "pantheon-dev-fe",
      commit: frontendSha,
      bffCommit: backendSha,
      bffCommitEvidence: true,
      buildMode: {
        VITE_BFF_MODE: "live",
        VITE_BFF_FALLBACK: "strict",
        VITE_BFF_REAL_WRITES: "false",
        VITE_BFF_ALLOW_DEV_STUB_WRITES: "false",
        VITE_BFF_EMBEDDED_BEARER_TOKEN: "false",
      },
    };

    const ordinary = inspectDeploymentMetadata(legacyManifest, {
      expectedSha: frontendSha,
      expectedArtifactDigest: digest,
    });
    const rollbackCompatibility = inspectDeploymentMetadata(legacyManifest, {
      expectedSha: frontendSha,
      expectedArtifactDigest: digest,
      allowLegacyRelease: true,
    });

    expect(ordinary.pass).toBe(false);
    expect(ordinary.failures).toEqual(
      expect.arrayContaining([
        "artifactDigestPresent",
        "artifactDigestMatchesExpected",
        "integrationGateRunIdValid",
      ]),
    );
    expect(rollbackCompatibility.pass).toBe(true);
    expect(rollbackCompatibility.deployment?.legacyReleaseCompatibility).toBe(
      true,
    );
  });

  it("canonicalizes SHA-256 prefixes but rejects malformed digests", () => {
    const digest = "c".repeat(64);
    expect(canonicalizeSha256("sha256:" + digest.toUpperCase())).toBe(digest);
    expect(canonicalizeSha256("deadbeef")).toBe("");
  });

  it("reports secret categories without returning the matched values", () => {
    const bearer = "Bearer sensitive-value-123456";
    const clientSecret = 'client_secret="client-value-123456"';
    const privateKey =
      "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----";
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({ role: "service_role" }),
    ).toString("base64url");
    const serviceRoleJwt = header + "." + payload + ".signature123";
    const sourceText = [bearer, clientSecret, privateKey, serviceRoleJwt].join(
      "\n",
    );

    const findings = scanTextForSensitiveValues("assets/app.js", sourceText);
    const serialized = JSON.stringify(findings);

    expect(findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining([
        "bearer_credential",
        "client_secret_literal",
        "private_key",
        "service_role_jwt",
      ]),
    );
    expect(serialized).not.toContain("sensitive-value-123456");
    expect(serialized).not.toContain("client-value-123456");
    expect(serialized).not.toContain("private-material");
    expect(serialized).not.toContain(serviceRoleJwt);
    expect(redactDiagnosticText(sourceText)).not.toContain(
      "sensitive-value-123456",
    );
  });

  it("serves SPA routes from a candidate without allowing traversal or symlinks", () => {
    const root = temporaryCandidate();
    const resolver = createCandidateResolver(root);

    const spa = resolver.resolve(
      "https://pantheon.example/management/persona-fleet?nocache=abc",
    );
    const script = resolver.resolve("https://pantheon.example/assets/app.js");
    const missing = resolver.resolve(
      "https://pantheon.example/assets/missing.js",
    );

    expect(spa.status).toBe(200);
    expect(spa.relativePath).toBe("index.html");
    expect(script.status).toBe(200);
    expect(script.contentType).toContain("text/javascript");
    expect(missing.status).toBe(404);
    expect(() =>
      resolver.resolve("https://pantheon.example/%2e%2e/etc/passwd"),
    ).toThrow(/traversal/iu);

    const outside = resolve(root, "..", "outside-candidate.js");
    writeFileSync(outside, "outside", "utf8");
    cleanupRoots.push(outside);
    symlinkSync(outside, join(root, "assets", "linked.js"));
    expect(() =>
      resolver.resolve("https://pantheon.example/assets/linked.js"),
    ).toThrow(/symbolic link/iu);
  });

  it("enumerates every candidate JavaScript and CSS file", () => {
    const root = temporaryCandidate();
    const files = listCandidateScriptAndStyleFiles(root).map(
      (entry) => entry.relativePath,
    );

    expect(files).toEqual(["assets/app.css", "assets/app.js"]);
  });

  it("can restrict candidate source scanning to browser-loaded assets", () => {
    const root = temporaryCandidate();
    const resolver = createCandidateResolver(root);
    writeFileSync(join(root, "assets", "lazy.js"), "console.log('lazy');", "utf8");

    const result = listCandidateLoadedScriptAndStyleFiles(resolver, [
      "https://pantheon.example/assets/app.js",
      "https://pantheon.example/assets/app.js?cache=bust",
      "https://pantheon.example/assets/missing.css",
    ]);

    expect(result.files.map((entry) => entry.relativePath)).toEqual([
      "assets/app.js",
    ]);
    expect(result.missing).toEqual([
      expect.objectContaining({
        source: "https://pantheon.example/assets/missing.css",
        status: 404,
        ok: false,
      }),
    ]);
  });

  it("defines exact desktop and mobile viewports with hard performance budgets", () => {
    expect(HOSTED_UX_PROFILES).toEqual([
      { id: "desktop-1440", width: 1440, height: 900, mobile: false },
      { id: "mobile-390", width: 390, height: 844, mobile: true },
    ]);
    expect(HOSTED_UX_PERFORMANCE_BUDGETS).toEqual({
      responseEndMs: 3_000,
      domContentLoadedMs: 4_000,
      loadEventMs: 8_000,
      firstContentfulPaintMs: 4_000,
      totalTransferBytes: 8 * 1024 * 1024,
    });
    expect(assessHostedUxProfile(passingHostedUxProfile()).pass).toBe(true);
  });

  it.each([
    ["production rows", safePersonaFleetEvidence, "production_rows"],
    [
      "explicit authentication boundary",
      {
        ...safePersonaFleetEvidence,
        rowCount: 0,
        rowsValid: false,
        hasAuthRequiredState: true,
      },
      "auth_required_empty",
    ],
    [
      "explicit live-empty state",
      {
        ...safePersonaFleetEvidence,
        rowCount: 0,
        hasLiveEmptyState: true,
      },
      "live_empty",
    ],
  ])("accepts Persona Fleet %s", (_label, evidence, expectedState) => {
    const assessment = assessPersonaFleetSafety(evidence);

    expect(assessment.pass).toBe(true);
    expect(assessment.state).toBe(expectedState);
    expect(assessment.failures).toEqual([]);
  });

  it.each([
    [
      "seed fallback",
      { hasSeedFallbackArmed: true, liveBannerValid: false },
      "seedFallbackAbsent",
    ],
    [
      "non-production rows",
      { hasNonProductionRows: true },
      "nonProductionRowsAbsent",
    ],
    ["NaN content", { hasNaN: true }, "nanAbsent"],
    [
      "ambiguous empty state",
      { rowCount: 0, rowsValid: false },
      "explicitSafeState",
    ],
  ])("rejects Persona Fleet %s", (_label, mutation, expectedFailure) => {
    const assessment = assessPersonaFleetSafety({
      ...safePersonaFleetEvidence,
      ...mutation,
    });

    expect(assessment.pass).toBe(false);
    expect(assessment.failures).toContain(expectedFailure);
  });

  it.each([
    [
      "axe",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.axe.blockingViolations.push({
          id: "color-contrast",
          impact: "serious",
          nodeCount: 1,
        });
      },
      "axeBlockingViolationsAbsent",
    ],
    [
      "pageerror",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.diagnostics.pageErrorCount = 1;
      },
      "pageErrorsAbsent",
    ],
    [
      "console",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.diagnostics.unexpectedConsoleErrorCount = 1;
      },
      "unexpectedConsoleErrorsAbsent",
    ],
    [
      "resource failure",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.diagnostics.frontendResourceFailureCount = 1;
      },
      "frontendResourceFailuresAbsent",
    ],
    [
      "resource HTTP error",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.diagnostics.frontendResourceHttpErrorCount = 1;
      },
      "frontendResourceHttpErrorsAbsent",
    ],
    [
      "browser authorization",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.diagnostics.authorizationRequestCount = 1;
      },
      "authorizationHeadersAbsent",
    ],
    [
      "browser BFF write method",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.diagnostics.browserWriteMethodCount = 1;
      },
      "browserWriteMethodsAbsent",
    ],
    [
      "keyboard focus",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.keyboardFocus.missingVisibleCueCount = 1;
      },
      "keyboardFocusVisible",
    ],
    [
      "reduced motion",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.reducedMotion.activeAnimationCount = 1;
      },
      "reducedMotionAnimationsAbsent",
    ],
    [
      "performance",
      (profile: ReturnType<typeof passingHostedUxProfile>) => {
        profile.performance.firstContentfulPaintMs =
          HOSTED_UX_PERFORMANCE_BUDGETS.firstContentfulPaintMs + 1;
      },
      "performanceWithinBudget",
    ],
  ])(
    "fails closed when the hosted UX %s signal fails",
    (_label, mutate, expectedFailure) => {
      const profile = passingHostedUxProfile();
      mutate(profile);
      const assessment = assessHostedUxProfile(profile);

      expect(assessment.pass).toBe(false);
      expect(assessment.failures).toContain(expectedFailure);
    },
  );

  it("fails closed when a hosted UX measurement is missing or incomplete", () => {
    const profile = passingHostedUxProfile();
    profile.executionCompleted = false;
    profile.requiredCoreResponsesObserved = false;
    profile.routeContentReady = false;
    profile.reducedMotion.scanComplete = false;
    profile.performance.firstContentfulPaintMs = null as unknown as number;
    const assessment = assessHostedUxProfile(profile);

    expect(assessment.pass).toBe(false);
    expect(assessment.failures).toEqual(
      expect.arrayContaining([
        "executionCompleted",
        "requiredCoreResponsesObserved",
        "routeContentReady",
        "reducedMotionScanComplete",
        "performanceMetricsComplete",
        "performanceMilestonesOrdered",
        "performanceWithinBudget",
      ]),
    );
  });

  it("rejects zero or misordered Navigation Timing evidence", () => {
    const empty = passingHostedUxProfile();
    empty.performance.responseEndMs = 0;
    expect(assessHostedUxProfile(empty).failures).toEqual(
      expect.arrayContaining([
        "performanceMetricsComplete",
        "performanceMilestonesOrdered",
        "performanceWithinBudget",
      ]),
    );

    const misordered = passingHostedUxProfile();
    misordered.performance.responseEndMs = 3_500;
    misordered.performance.domContentLoadedMs = 3_000;
    expect(assessHostedUxProfile(misordered).failures).toEqual(
      expect.arrayContaining([
        "performanceMilestonesOrdered",
        "performanceWithinBudget",
      ]),
    );
  });

  it("summarizes axe failures without copying node HTML, selectors, or secrets", () => {
    const secret = "Bearer secret-material-123456";
    const summary = summarizeAxeViolations([
      {
        id: "color-contrast",
        impact: "serious",
        nodes: [
          {
            html: `<button data-token="${secret}">private</button>`,
            target: [secret],
          },
        ],
      },
      {
        id: "minor-label",
        impact: "minor",
        nodes: [{ html: secret, target: [secret] }],
      },
    ]);
    const serialized = JSON.stringify(summary);

    expect(summary).toEqual([
      { id: "color-contrast", impact: "serious", nodeCount: 1 },
    ]);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("data-token");
  });

  it("rejects POST and DELETE browser BFF requests without exposing query secrets", () => {
    const policy = inspectBrowserBffMethods([
      { method: "GET", url: "https://bff.example/bff/me" },
      { method: "HEAD", url: "https://bff.example/bff/version" },
      {
        method: "POST",
        url: "https://bff.example/bff/actions?access_token=post-secret-value",
      },
      {
        method: "DELETE",
        url: "https://bff.example/bff/items/1?client_secret=delete-secret-value",
      },
    ]);
    const serialized = JSON.stringify(policy);

    expect(policy.pass).toBe(false);
    expect(policy.writeRequestCount).toBe(2);
    expect(policy.writeRequests.map((request) => request.method)).toEqual([
      "DELETE",
      "POST",
    ]);
    expect(serialized).not.toContain("post-secret-value");
    expect(serialized).not.toContain("delete-secret-value");
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("client_secret");
  });

  it("requires an exact BFF origin and configured base-path boundary", () => {
    const base = "https://expected-bff.example/gateway";

    expect(
      httpPathWithinBase(
        "https://expected-bff.example/gateway/bff/me?nocache=1",
        base,
      ),
    ).toBe("/bff/me");
    expect(
      isBffRequestUrl("https://expected-bff.example/gateway/bff/me", base),
    ).toBe(true);
    expect(
      isBffRequestUrl("https://expected-bff.example.evil/gateway/bff/me", base),
    ).toBe(false);
    expect(
      isBffRequestUrl("https://expected-bff.example/gateway-evil/bff/me", base),
    ).toBe(false);
    expect(
      isBffRequestUrl("https://expected-bff.example/gateway/bffish/me", base),
    ).toBe(false);
  });

  it("allowlists only explicit unauthenticated console failures", () => {
    expect(
      isAllowlistedConsoleError({
        text: "BffError: Missing or invalid Authorization header",
      }),
    ).toBe(true);
    expect(
      isAllowlistedConsoleError({
        text: "TypeError: Cannot read properties of undefined",
      }),
    ).toBe(false);
    expect(
      isAllowlistedConsoleError({
        text: "AUTH_REQUIRED Bearer secret-material-123456",
      }),
    ).toBe(false);
  });

  it("keeps every requested hard-mode signal wired into the CLI source", () => {
    const source = readFileSync(
      resolve("scripts/probe-hosted-browser-bff.mjs"),
      "utf8",
    );

    expect(source).toContain("PANTHEON_PROBE_RELEASE_STRICT");
    expect(source).toContain("PANTHEON_PROBE_LEGACY_ROLLBACK_TARGET_COMPAT");
    expect(source).toContain("PANTHEON_EXPECTED_FE_SHA");
    expect(source).toContain("PANTHEON_EXPECTED_ARTIFACT_DIGEST");
    expect(source).toContain("PANTHEON_PROBE_JSON_OUT");
    expect(source).toContain("PANTHEON_CANDIDATE_DIR");
    expect(source).toContain('page.on("pageerror"');
    expect(source).toContain('page.on("requestfailed"');
    expect(source).toContain('page.on("console"');
    expect(source).toContain("window.localStorage");
    expect(source).toContain("window.sessionStorage");
    expect(source).toContain("installCandidateRoute");
    expect(source).toContain('id: "desktop-1440"');
    expect(source).toContain('id: "mobile-390"');
    expect(source).toContain("@axe-core/playwright");
    expect(source).toContain('reducedMotion: "reduce"');
    expect(source).toContain('element.matches(":focus-visible")');
    expect(source).toContain("HOSTED_UX_PERFORMANCE_BUDGETS");
    expect(source).toContain("personaFleetSafety.pass &&");
    expect(source).toContain("!noEmbeddedDevBearerRequired || noEmbeddedDevBearer");
    expect(source).toContain(
      "personaFleetSafetyPassed: personaFleetSafety.pass",
    );
    expect(source).not.toContain("response.url?.startsWith(BFF_BASE)");
  });
});
