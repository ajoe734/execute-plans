import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const aggregateScript = resolve(
  process.cwd(),
  "scripts/aggregate-release-gate.mjs",
);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

type SyntheticSpec = {
  file: string;
  status: "expected" | "skipped" | "unexpected";
  title: string;
};

function playwrightReport(specs: SyntheticSpec[]) {
  return {
    suites: specs.map((spec) => ({
      file: spec.file,
      specs: [
        {
          file: spec.file,
          tests: [{ results: [], status: spec.status }],
          title: spec.title,
        },
      ],
      title: spec.file,
    })),
  };
}

function aggregatePlaywright(
  specs: SyntheticSpec[],
  mobileSpecs: SyntheticSpec[] = [],
  envOverrides: Record<string, string> = {},
) {
  const auditDir = mkdtempSync(join(tmpdir(), "pantheon-gate-playwright-"));
  tempDirs.push(auditDir);
  const jsonOut = join(auditDir, "summary.json");
  writeFileSync(
    join(auditDir, "playwright-results.json"),
    `${JSON.stringify(playwrightReport(specs))}\n`,
  );
  if (mobileSpecs.length > 0) {
    writeFileSync(
      join(auditDir, "playwright-mobile-results.json"),
      `${JSON.stringify(playwrightReport(mobileSpecs))}\n`,
    );
  }

  spawnSync(
    "node",
    [aggregateScript, "--audit-dir", auditDir, "--json-out", jsonOut],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        BFF_AUTH_TOKEN: "",
        PANTHEON_BFF_SMOKE_BEARER_TOKEN: "",
        PANTHEON_RELEASE_GATE_CONTEXT: "pull_request",
        PANTHEON_TEST_OIDC_PATH: "",
        ...envOverrides,
      },
    },
  );
  return (
    JSON.parse(readFileSync(jsonOut, "utf8")) as {
      gates: Record<string, Array<{ label: string; status: string }>>;
    }
  ).gates;
}

describe("release gate Playwright classification", () => {
  it("keeps ordinary PR auth advisory and reads fixture evidence instead of the separate mobile report", () => {
    const gates = aggregatePlaywright(
      [
        {
          file: "13-agora.spec.ts",
          status: "expected",
          title: "F13 Agora signal feedback",
        },
      ],
      [
        {
          file: "agora-strategy-workshop-hosted.spec.ts",
          status: "unexpected",
          title: "hosted Strategy Workshop mobile",
        },
      ],
    );

    expect(
      gates["0"].find((check) =>
        check.label.includes("Auth token or test OIDC"),
      ),
    ).toMatchObject({ status: "warn" });
    expect(
      gates["5"].find(
        (check) => check.label === "No unexpected Playwright failures.",
      )?.status,
    ).toBe("pass");
    expect(
      gates["5"].find((check) => check.label === "F13 Agora.")?.status,
    ).toBe("pass");

    const hardGates = aggregatePlaywright([], [], {
      PANTHEON_HOSTED_FE_HARD_GATE: "true",
    });
    expect(
      hardGates["0"].find((check) =>
        check.label.includes("Auth token or test OIDC"),
      ),
    ).toMatchObject({ status: "missing" });
  });

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

    expect(
      gates["5"].find((check) => check.label === "F13 Agora.")?.status,
    ).toBe("pass");
    expect(
      gates["5"].find(
        (check) => check.label === "No unexpected Playwright failures.",
      )?.status,
    ).toBe("fail");
  });

  it("does not let an a11y suite ancestor turn focus evidence into axe evidence", () => {
    const gates = aggregatePlaywright([
      {
        file: "17-a11y-v5.spec.ts",
        status: "expected",
        title: "drawer focus returns to the trigger",
      },
    ]);

    expect(
      gates["6"].find(
        (check) => check.label === "v5 axe smoke critical/serious = 0.",
      )?.status,
    ).toBe("missing");
    expect(
      gates["6"].find(
        (check) => check.label === "overlay focus handling works.",
      )?.status,
    ).toBe("missing");
  });

  it("fails closed when a required performance spec is skipped", () => {
    const gates = aggregatePlaywright([
      {
        file: "18-perf.spec.ts",
        status: "expected",
        title: "keeps Cockpit load and SSE rerender proxy within soft budgets",
      },
      {
        file: "18-perf.spec.ts",
        status: "expected",
        title:
          "keeps entity registry first page budget and DataTable density stable",
      },
      {
        file: "18-perf.spec.ts",
        status: "expected",
        title: "keeps Sentinel list load within soft budget",
      },
      {
        file: "18-perf.spec.ts",
        status: "skipped",
        title: "warns when LineageGraph receives more than 500 nodes",
      },
    ]);

    expect(
      gates["6"].find((check) =>
        check.label.includes("within performance budget"),
      )?.status,
    ).toBe("fail");
  });

  it("passes only with complete owned accessibility and performance evidence", () => {
    const axeScenarios = [
      "control room",
      "research loop",
      "execution loop PersonaHealthMatrix",
      "optimization loop",
      "sentinel",
      "interventions",
    ].map((scenario) => ({
      file: "17-a11y-v5.spec.ts",
      status: "expected" as const,
      title: `critical/serious axe violations are zero on ${scenario}`,
    }));
    const gates = aggregatePlaywright([
      ...axeScenarios,
      {
        file: "17-a11y-v5.spec.ts",
        status: "expected",
        title: "drawer focus returns to the trigger after keyboard close",
      },
      {
        file: "17-a11y-v5.spec.ts",
        status: "expected",
        title: "ESC closes the Sentinel drawer and restores focus",
      },
      {
        file: "17-a11y-v5.spec.ts",
        status: "expected",
        title: "motion-safe indicators respect reduced motion",
      },
      {
        file: "18-perf.spec.ts",
        status: "expected",
        title: "keeps Cockpit load and SSE rerender proxy within soft budgets",
      },
      {
        file: "18-perf.spec.ts",
        status: "expected",
        title:
          "keeps entity registry first page budget and DataTable density stable",
      },
      {
        file: "18-perf.spec.ts",
        status: "expected",
        title: "keeps Sentinel list load within soft budget",
      },
      {
        file: "18-perf.spec.ts",
        status: "expected",
        title: "warns when LineageGraph receives more than 500 nodes",
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
      gates["6"].find(
        (check) => check.label === "v5 axe smoke critical/serious = 0.",
      )?.status,
    ).toBe("pass");
    expect(
      gates["6"].find(
        (check) => check.label === "overlay focus handling works.",
      )?.status,
    ).toBe("pass");
    expect(
      gates["6"].find((check) =>
        check.label.includes("within performance budget"),
      )?.status,
    ).toBe("pass");
  });
});
