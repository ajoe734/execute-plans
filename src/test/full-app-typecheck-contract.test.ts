import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Q01 — CI's typecheck coverage must actually represent the full application,
// not just the Agora slice. This locks the gate in place so it cannot regress
// back to a narrower/no-op typecheck without this test failing loudly.

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

const branchWorkflow = readFileSync(
  resolve(root, ".github/workflows/branch-ci.yml"),
  "utf8",
);

describe("full application typecheck contract", () => {
  it("tsconfig.app.json's root/import graph covers the whole application source tree", () => {
    // "src" (not a narrower subdirectory such as "src/agora") is the actual
    // full-application root; anything narrower is not a full-app gate.
    expect(tsconfigApp.include).toContain("src");
  });

  it("npm run typecheck resolves to the full application tsconfig, not a narrower one", () => {
    expect(packageJson.scripts.typecheck).toMatch(/tsc .*-p tsconfig\.app\.json.*--noEmit/);
  });

  it("npm run typecheck:app is the same full-application gate", () => {
    expect(packageJson.scripts["typecheck:app"]).toMatch(/tsc .*-p tsconfig\.app\.json.*--noEmit/);
  });

  it("a focused Agora typecheck gate remains available as an additional check", () => {
    expect(packageJson.scripts["typecheck:agora"]).toMatch(/tsc .*-p tsconfig\.agora\.json.*--noEmit/);
  });

  it("required branch CI runs the full application typecheck gate", () => {
    expect(branchWorkflow).toMatch(/run:\s*npm run typecheck:app/);
  });

  it("required branch CI still runs the focused Agora gate as an additional check", () => {
    expect(branchWorkflow).toMatch(/run:\s*npm run typecheck:agora/);
  });
});
