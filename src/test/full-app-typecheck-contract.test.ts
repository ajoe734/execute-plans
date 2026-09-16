import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Q01 — CI's typecheck coverage must eventually represent the full
// application, not just the Agora slice. tsconfig.app.json ("src" root) is
// that full-application gate and `typecheck:app` runs it; this test locks
// that tooling in place. Wiring `typecheck:app` in as the *required* CI
// gate is intentionally NOT asserted here yet: as of this commit a small
// residual set of files outside this task's declared artifact grant
// (src/lib/bff-v1/evolution.ts, src/management/pages/ResearchDetail.tsx,
// src/management/pages/ResearchDetail.test.tsx,
// src/test/hosted-browser-release-policy.test.ts) still fail
// `tsc --noEmit -p tsconfig.app.json`, and an artifact-contract amendment
// (Human/Ops-only) is required before those can be touched. See
// docs/deployment/evidence/FE-RUNTIME-TYPE-CLOSURE-CORRECTIVE-001/evidence.json
// for the blocker record. Flip the two assertions marked "TODO" back on
// once that residual set is cleared and CI is repointed at `typecheck:app`.

const root = process.cwd();

const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

function stripJsonComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
}

const tsconfigApp = JSON.parse(
  stripJsonComments(readFileSync(resolve(root, "tsconfig.app.json"), "utf8")),
) as { include?: string[]; compilerOptions?: Record<string, unknown> };

describe("full application typecheck contract", () => {
  it("tsconfig.app.json's root/import graph covers the whole application source tree", () => {
    // "src" (not a narrower subdirectory such as "src/agora") is the actual
    // full-application root; anything narrower is not a full-app gate.
    expect(tsconfigApp.include).toContain("src");
  });

  it("npm run typecheck:app runs the full-application tsconfig", () => {
    expect(packageJson.scripts["typecheck:app"]).toMatch(/tsc .*-p tsconfig\.app\.json.*--noEmit/);
  });

  it("npm run typecheck:agora remains the focused Agora gate", () => {
    expect(packageJson.scripts["typecheck:agora"]).toMatch(/tsc .*-p tsconfig\.agora\.json.*--noEmit/);
  });

  // TODO(Q01 closure): once the residual out-of-grant files above are
  // cleared, assert `packageJson.scripts.typecheck` matches tsconfig.app.json
  // and that .github/workflows/branch-ci.yml's required Typecheck step runs
  // `npm run typecheck:app` (and, if kept, `npm run typecheck:agora` as an
  // additional check).
});
