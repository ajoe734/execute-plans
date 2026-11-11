import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { parse } from "yaml";

const helper = resolve("scripts/prepare-ubuntu-ci-apt.sh");
const source = `Types: deb
URIs: mirror+file:/etc/apt/apt-mirrors.txt
Suites: noble noble-updates noble-backports noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
`;

function fixture(t, sources = source, os = 'ID=ubuntu\nVERSION_ID="24.04"\n') {
  const root = mkdtempSync(join(tmpdir(), "frontend-ci-apt-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "etc/apt/sources.list.d"), { recursive: true });
  mkdirSync(join(root, "etc/apt/apt.conf.d"));
  const path = join(root, "etc/apt/sources.list.d/ubuntu.sources");
  const config = join(root, "etc/apt/apt.conf.d/zzzz-pantheon-browser-ci");
  writeFileSync(path, sources);
  writeFileSync(join(root, "etc/os-release"), os);
  const thirdParty = join(root, "etc/apt/sources.list.d/microsoft.list");
  writeFileSync(thirdParty, "existing unrelated source\n");
  const run = (env = {}) => spawnSync("bash", [helper], {
    env: { ...process.env, GITHUB_ACTIONS: "true", RUNNER_OS: "Linux", RUNNER_ARCH: "X64", CI_APT_ROOT: root, ...env },
    encoding: "utf8",
    timeout: 5000,
  });
  return { root, path, config, thirdParty, run };
}

test("bypasses the failed mirror selector while preserving signed suites and unrelated sources", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(f.path, "utf8"), source.replace("mirror+file:/etc/apt/apt-mirrors.txt", "https://archive.ubuntu.com/ubuntu/"));
  assert.equal(readFileSync(f.thirdParty, "utf8"), "existing unrelated source\n");
  const config = readFileSync(f.config, "utf8");
  // Read the effective options with APT itself, rather than only matching text.
  const apt = spawnSync("apt-config", ["-c", f.config, "dump"], { encoding: "utf8", timeout: 5000 });
  assert.equal(apt.status, 0, apt.stderr);
  for (const setting of ['Acquire::Retries "1";', 'Acquire::http::Timeout "15";', 'Acquire::https::Timeout "15";', 'APT::Update::Error-Mode "any";']) {
    assert.ok(apt.stdout.includes(setting), setting);
  }
  assert.doesNotMatch(config, /AllowUnauthenticated|AllowInsecure|Verify-Peer|Proxy/i);
  assert.equal(f.run().status, 0, "preparation is idempotent");
});

test("also handles the original Azure URI without changing a direct security stanza", (t) => {
  const sources = source.replace("mirror+file:/etc/apt/apt-mirrors.txt", "http://azure.archive.ubuntu.com/ubuntu/") + "\nTypes: deb\nURIs: https://security.ubuntu.com/ubuntu/\nSuites: noble-security\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n";
  const f = fixture(t, sources);
  assert.equal(f.run().status, 0);
  assert.equal(readFileSync(f.path, "utf8"), sources.replace("http://azure.archive.ubuntu.com/ubuntu/", "https://archive.ubuntu.com/ubuntu/"));
});

test("refuses unsupported hosts before modifying their sources", (t) => {
  for (const os of ['ID=debian\nVERSION_ID=12\n', 'ID=ubuntu\nVERSION_ID=22.04\n']) {
    const f = fixture(t, source, os);
    assert.notEqual(f.run().status, 0);
    assert.equal(readFileSync(f.path, "utf8"), source);
  }
  for (const env of [{ GITHUB_ACTIONS: "false" }, { RUNNER_ARCH: "ARM64" }, { RUNNER_OS: "macOS" }]) {
    const f = fixture(t);
    assert.notEqual(f.run(env).status, 0);
    assert.equal(readFileSync(f.path, "utf8"), source);
  }
});

test("missing or unknown source layout and config write failures propagate nonzero", (t) => {
  const unknown = fixture(t, source.replace("mirror+file:/etc/apt/apt-mirrors.txt", "https://example.invalid/ubuntu/"));
  assert.notEqual(unknown.run().status, 0);
  assert.match(readFileSync(unknown.path, "utf8"), /example.invalid/);
  const missing = fixture(t);
  rmSync(missing.path);
  assert.notEqual(missing.run().status, 0);
  const unwritable = fixture(t);
  mkdirSync(unwritable.config);
  assert.notEqual(unwritable.run().status, 0);
});

test("every active browser install keeps with-deps and hard-failing APT preparation", () => {
  let installs = 0;
  for (const file of ["branch-ci.yml", "pantheon-integration-gate.yml"]) {
    const workflow = parse(readFileSync(resolve(".github/workflows", file), "utf8"));
    for (const job of Object.values(workflow.jobs)) {
      const steps = job.steps || [];
      for (const [index, step] of steps.entries()) {
        if (!/playwright install.*--with-deps/.test(step.run || "")) continue;
        installs++;
        assert.equal(job["runs-on"], "ubuntu-24.04");
        const prep = steps[index - 1];
        assert.equal(prep.run, "sudo --preserve-env=GITHUB_ACTIONS,RUNNER_OS,RUNNER_ARCH bash scripts/prepare-ubuntu-ci-apt.sh");
        assert.equal(prep["continue-on-error"], undefined);
        assert.equal(prep.if, undefined);
        // No install retries or success-forcing shell branches mask failures.
        assert.doesNotMatch(step.run, /\|\|\s*true|exit 0/);
        if (step.run.includes("tee")) assert.match(step.run, /set -o pipefail/);
      }
    }
  }
  assert.equal(installs, 3);
});
