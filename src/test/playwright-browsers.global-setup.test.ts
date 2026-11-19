import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("playwright browsers globalSetup", () => {
  it("in CI fails once naming the missing executable path when the browser cache is empty", () => {
    const empty = mkdtempSync(join(tmpdir(), "pw-empty-"));
    try {
      let output = "";
      let failed = false;
      try {
        execFileSync(
          resolve("node_modules/.bin/tsx"),
          ["-e", 'import s from "./src/test/playwright-browsers.global-setup.ts"; s();'],
          { env: { ...process.env, CI: "true", PLAYWRIGHT_BROWSERS_PATH: empty }, encoding: "utf8", stdio: "pipe" },
        );
      } catch (error) {
        failed = true;
        const e = error as { stderr?: string; stdout?: string };
        output = `${e.stderr ?? ""}${e.stdout ?? ""}`;
      }
      expect(failed).toBe(true);
      expect(output).toContain("Playwright browser executable(s) missing");
      expect(output).toContain(empty);
      expect(output).not.toMatch(/browserType\.launch/u);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  }, 60_000);
});
