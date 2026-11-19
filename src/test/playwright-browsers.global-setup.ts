import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// One-time, pre-worker verification that the Playwright browsers every
// browser-launching test needs are on disk. Tests must never download or
// install browsers themselves: parallel workers would race the download.
const INSTALL_TARGETS = ["chromium", "chromium-headless-shell"] as const;

function npx(args: string[], inherit = false): string {
  return execFileSync("npx", ["--no-install", "playwright", ...args], {
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "inherit"],
  }) as string;
}

function findFile(dir: string, names: Set<string>, depth = 4): string | null {
  if (depth < 0 || !existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isFile() && names.has(entry)) return full;
    if (stat.isDirectory()) {
      const hit = findFile(full, names, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Returns the missing executable descriptions (path or install dir). */
export function findMissingBrowserExecutables(): string[] {
  const dry = npx(["install", "--dry-run", ...INSTALL_TARGETS]);
  const missing: string[] = [];
  const blocks = dry.split(/\n\s*\n/u);
  for (const block of blocks) {
    const location = /Install location:\s*(.+)/u.exec(block)?.[1]?.trim();
    if (!location) continue;
    if (/chromium[-_]headless[-_]shell/iu.test(location)) {
      const exe = findFile(
        location,
        new Set(["chrome-headless-shell", "chrome-headless-shell.exe", "headless_shell"]),
      );
      if (!exe) missing.push(`${location} (chrome-headless-shell executable)`);
    } else if (/chromium-\d+/iu.test(location)) {
      const exe = findFile(
        location,
        new Set(["chrome", "chrome.exe", "Google Chrome for Testing", "Chromium"]),
      );
      if (!exe) missing.push(`${location} (chromium executable)`);
    }
  }
  return missing;
}

export default function setup(): void {
  let missing = findMissingBrowserExecutables();
  if (missing.length === 0) return;
  if (process.env.CI) {
    throw new Error(
      `Playwright browser executable(s) missing: ${missing.join(", ")}. ` +
        "Install them in a workflow step before `npm run test` " +
        "(npx --no-install playwright install chromium chromium-headless-shell).",
    );
  }
  // Local developer run: install once, here, before any worker starts.
  npx(["install", ...INSTALL_TARGETS], true);
  missing = findMissingBrowserExecutables();
  if (missing.length > 0) {
    throw new Error(
      `Playwright browser executable(s) still missing after install: ${missing.join(", ")}`,
    );
  }
}
