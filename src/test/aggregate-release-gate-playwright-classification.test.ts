import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const aggregateScript = resolve(process.cwd(), "scripts/aggregate-release-gate.mjs");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type SyntheticSpec = {
  file: string;
  status: "expected" | "skipped" | "unexpected";
  title: string;
};

function aggregatePlaywright(specs: SyntheticSpec[]) {
  const auditDir = mkdtempSync(join(tmpdir(), "pantheon-gate-playwright-"));
  tempDirs.push(auditDir);
  const jsonOut = join(auditDir, "summary.json");
  writeFileSync(
    join(auditDir, "playwright-results.json"),
    `${JSON.stringify({
      suites: specs.map((spec) => ({
        file: spec.file,
        specs: [{
          file: spec.file,
          tests: [{ results: [], status: spec.status }],
          title: spec.title,
        }],
        title: spec.file,
      })),
    })}\n`,
  );

  spawnSync("node", [aggregateScript, "--audit-dir", auditDir, "--json-out", jsonOut], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PANTHEON_RELEASE_GATE_CONTEXT: "pull_request" },
  });
  return (JSON.parse(readFileSync(jsonOut, "utf8")) as {
    gates: Record<string, Array<{ label: string; status: string }>>;
  }).gates;
}

describe("release gate Playwright classification", () => {
  it("keeps unrelated Agora failures out of F13 while globally blocking them", () => {
    const gates = aggregatePlaywright([
      {
        file: "13-agora.spec.ts",
        status: "expected",
        title: "F13 Agora signal feedback",
      },
      {
        file: "agora-strategy-workshop-hosted.spec.ts",
        status: "unexpected",
        title: "hosted Strategy Workshop mobile",
      },
    ]);

    expect(gates["5"].find((check) => check.label === "F13 Agora.")?.status).toBe("pass");
    expect(
      gates["5"].find((check) => check.label === "No unexpected Playwright failures.")
        ?.status,
    ).toBe("fail");
  });

  it("classifies focus and performance only from their owned specs", () => {
    const gates = aggregatePlaywright([
      {
        file: "17-a11y-v5.spec.ts",
        status: "expected",
        title: "drawer focus returns to the trigger",
      },
      {
        file: "18-perf.spec.ts",
        status: "expected",
        title: "keeps Cockpit load and SSE rerender proxy within soft budgets",
      },
      {
        file: "25-persona-fleet-live-linked-pages.spec.ts",
        status: "unexpected",
        title: "keeps every focused target semantically scoped",
      },
      {
        file: "agora-shell-hosted.spec.ts",
        status: "skipped",
        title: "strategy-performance has one page scroll owner",
      },
    ]);

    expect(
      gates["6"].find((check) => check.label === "overlay focus handling works.")
        ?.status,
    ).toBe("pass");
    expect(
      gates["6"].find((check) =>
        check.label.includes("within performance budget"),
      )?.status,
    ).toBe("pass");
  });
});
