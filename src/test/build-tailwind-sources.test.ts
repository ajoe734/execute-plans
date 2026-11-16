import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const css = readFileSync(path.join(root, "src/index.css"), "utf8");

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
  }).sort();
}

function digest(dir: string): string {
  const h = createHash("sha256");
  for (const f of listFiles(dir)) {
    h.update(f).update("\0").update(createHash("sha256").update(readFileSync(path.join(dir, f))).digest("hex")).update("\n");
  }
  return h.digest("hex");
}

// Probe class names are assembled at runtime so this test file (under src/, a Tailwind source) never contains them literally.
const probe = (...parts: string[]) => parts.join("");
const PROBE_A = probe("text-fuch", "sia-700");
const PROBE_B = probe("mb-[9", "1px]");
const PROBE_C = probe("bg-li", "me-300");

const execFileAsync = promisify(execFile);

async function build(outDir: string, contractContent: string | null) {
  const contractDir = path.join(root, "pantheon-contract");
  if (existsSync(contractDir)) throw new Error("pantheon-contract/ already exists; refusing to clobber");
  try {
    if (contractContent !== null) {
      mkdirSync(contractDir);
      writeFileSync(path.join(contractDir, "contract.ts"), contractContent);
    }
    await execFileAsync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--outDir", outDir, "--emptyOutDir"], {
      cwd: root,
      env: {
        ...process.env,
        VITE_BFF_BASE_URL: "https://api.dev.mvl-cap.tw",
        VITE_GCP_IDENTITY_API_KEY: "AIza01234567890123456789012345678901234",
        VITE_GCP_IDENTITY_PROJECT_ID: "pantheon-dev-20260902",
        VITE_GCP_IDENTITY_AUTH_DOMAIN: "pantheon-dev-20260902.firebaseapp.com",
      },
    });
  } finally {
    rmSync(contractDir, { recursive: true, force: true });
  }
}

describe("Tailwind source detection is limited to FE sources", () => {
  it("disables automatic detection and scopes sources to index.html and src/", () => {
    expect(css).toMatch(/@import "tailwindcss" source\(none\);/);
    expect(css).toContain('@source "../index.html";');
    expect(css).toContain('@source "../src";');
  });

  it("gitignores gate and build byproducts", () => {
    const ignore = readFileSync(path.join(root, ".gitignore"), "utf8");
    for (const entry of ["pantheon-contract/", "release-candidate/", "audit/", "reports/"]) {
      expect(ignore).toContain(entry);
    }
  });

  it("same FE source with different pantheon-contract/ contents builds byte-identical dist", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "tw-sources-"));
    try {
      const a = path.join(tmp, "a");
      const b = path.join(tmp, "b");
      await build(a, `export const x = "snap-x snap-mandatory ${PROBE_A} ${PROBE_B}";`);
      await build(b, `export const y = "snap-y ${PROBE_C} snap-center";`);
      expect(listFiles(a)).toEqual(listFiles(b));
      expect(digest(a)).toBe(digest(b));
      const cssFile = listFiles(a).find((f) => /^assets\/index-.*\.css$/.test(f))!;
      const out = readFileSync(path.join(a, cssFile), "utf8");
      expect(out).not.toContain(`.${PROBE_A}`);
      expect(out).not.toContain(`.${PROBE_C}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 280_000);
});
