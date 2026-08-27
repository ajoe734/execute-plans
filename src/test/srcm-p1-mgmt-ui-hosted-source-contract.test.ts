import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const proofSpec = readFileSync(
  resolve(process.cwd(), "e2e/31-external-source-management-hosted.spec.ts"),
  "utf8",
);
const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/srcm-p1-mgmt-ui-hosted-acceptance.yml"),
  "utf8",
);
const runtime = readFileSync(
  resolve(process.cwd(), "scripts/srcm-hosted-proof-runtime.sh"),
  "utf8",
);

describe("SRCM-P1 hosted acceptance producer contract", () => {
  it("runs on the dev VM under one explicit qualification lease and exact hosted identities", () => {
    expect(workflow).toContain("pantheon-dev-vm");
    expect(workflow).toContain("execute-plans-deploy");
    expect(workflow).toContain("qualification_lease_id");
    expect(workflow).toContain("Verify active task-owned qualification lease from GitHub server time");
    expect(workflow).toContain("environment-coordination");
    expect(workflow).toContain("(expires-now)<900000");
    expect(workflow).toContain("pantheon_verifier_sha");
    expect(workflow).toContain("expected_source_definitions_sha");
    expect(workflow).toContain("srcm-source-catalog-${GITHUB_RUN_ID}.json");
    expect(workflow).toContain("steps.prepare.outcome != 'skipped'");
    expect(workflow).toContain("EXPECTED_FE_SHA");
    expect(workflow).toContain("EXPECTED_BFF_SHA");
    expect(workflow).toContain("deployment.json");
    expect(workflow).toContain("/bff/version");
  });

  it("admits only one bounded free official connector pull", () => {
    expect(runtime).toContain('PROOF_CONNECTOR="tw-twse-tpex-official-market"');
    expect(runtime).toContain('PROOF_HOSTS="openapi.twse.com.tw,www.tpex.org.tw"');
    expect(runtime).toContain("SOURCE_INGEST_CONTROLLER_MODE=reconcile_and_pull");
    expect(runtime).toContain("SOURCE_INGEST_CONTROLLER_MAX_TICKS=1");
    expect(runtime).toContain('--connector "${PROOF_CONNECTOR}"');
    expect(runtime).toContain('--force-connector "${PROOF_CONNECTOR}"');
    expect(runtime).not.toMatch(/AlphaVantage|Polygon|IBKR|Shioaji/u);
  });

  it("arms a recovery watchdog before switching the immutable write-proof sibling", () => {
    const watchdog = runtime.indexOf("systemd-run");
    const switchToWrite = runtime.indexOf('atomic_link "${write_target}"');
    expect(watchdog).toBeGreaterThan(0);
    expect(switchToWrite).toBeGreaterThan(watchdog);
    expect(runtime).toContain('atomic_link "${read_target}"');
    expect(workflow).toContain("Restore and verify safe runtime posture");
    expect(workflow).toContain("if: always()");
  });

  it("restores command flags, egress deny, read-only FE, and a stopped no-restart scheduler", () => {
    expect(runtime).toContain('[[ "${source_commands}" == "0" ]]');
    expect(runtime).toContain('[[ "${bff_commands}" == "0" ]]');
    expect(runtime).toContain('[[ "${egress}" == "deny" ]]');
    expect(runtime).toContain("--mode reconcile_only");
    expect(runtime).toContain("docker update --restart=no");
    expect(runtime).toContain("assert_live_pair read-only");
  });

  it("supports a non-mutating second pass of the exact Pantheon verifier", () => {
    expect(workflow).toContain("verify-only");
    expect(workflow).toContain("verify_external_source_management_acceptance.py");
    expect(workflow).toContain("--offline-only");
    expect(workflow).toContain("live-verifier-result.json");
    expect(workflow).toContain("inputs.operation == 'capture'");
  });

  it("captures all ten required journeys without route interception", () => {
    for (let index = 1; index <= 10; index += 1) {
      expect(proofSpec).toContain(`journey_${String(index).padStart(2, "0")}_`);
    }
    expect(proofSpec).toContain("route_interception_count: 0");
    expect(proofSpec).not.toContain("page.route(");
    expect(proofSpec).not.toContain("context.route(");
    expect(workflow).toContain('--grep "@hosted-srcm"');
  });

  it("binds a sanitized HAR and one real screenshot to every journey", () => {
    expect(proofSpec).toContain('recordHar: { path: HAR_PATH, mode: "full"');
    expect(proofSpec).toContain('mapped.value = "[REDACTED]"');
    expect(proofSpec).toContain("request.cookies = []");
    expect(proofSpec).toContain("response.cookies = []");
    expect(proofSpec).toContain('postData.text = "[REDACTED]"');
    expect(proofSpec).toContain("height: 880 + journeyOrdinal * 2");
    expect(proofSpec).toContain("screenshot_sha256");
    expect(proofSpec).toContain("har_entry_indices");
    expect(proofSpec).toContain("browser_journeys_count");
    expect(workflow).toContain("if-no-files-found: error");
  });

  it("proves RBAC, stale revision, secret-ref safety, and no capital/order mutation", () => {
    expect(proofSpec).toContain("DEV_LOGIN_VIEWER_CLIENT_SECRET");
    expect(proofSpec).toContain("expect(unauthorized.status).toBe(403)");
    expect(proofSpec).toContain("expect(stale.status).toBe(409)");
    expect(proofSpec).toContain("vault://pantheon/dev/");
    expect(proofSpec).toContain("expect(inlineSecret.status).toBe(400)");
    expect(proofSpec).toContain("mutatingOrderOrCapital");
  });
});
