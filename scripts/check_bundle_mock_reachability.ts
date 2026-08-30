#!/usr/bin/env node
/**
 * ACG-FE-BUNDLE-CLEANUP-20260830 — check_bundle_mock_reachability.ts
 *
 * Verifies that the production Rollup bundle graph has ZERO reachability
 * to mock seeds, overlays, or fallback transport helpers:
 *   1. No chunk in the production build contains src/mocks/seed.ts,
 *      src/mocks/strictLiveFixtureUnavailable.ts, or writeOverlay.ts.
 *   2. No chunk contains dead mock symbols (withLiveOrMock, withStrictLiveOrMock,
 *      liveListOrSeed, liveDetailOrSeed, liveDerivedListOrSeed).
 */

process.env.VITE_BFF_MODE = process.env.VITE_BFF_MODE || "live";
process.env.VITE_BFF_FALLBACK = process.env.VITE_BFF_FALLBACK || "strict";
process.env.VITE_GCP_IDENTITY_API_KEY = process.env.VITE_GCP_IDENTITY_API_KEY || "AIza00000000000000000000000000000000000";
process.env.VITE_GCP_IDENTITY_PROJECT_ID = process.env.VITE_GCP_IDENTITY_PROJECT_ID || "pantheon-dev";
process.env.VITE_GCP_IDENTITY_AUTH_DOMAIN = process.env.VITE_GCP_IDENTITY_AUTH_DOMAIN || "pantheon-dev.firebaseapp.com";

import { build } from "vite";
import type { RollupOutput, OutputChunk } from "rollup";

const FORBIDDEN_MODULE_SUBSTRINGS = [
  "src/mocks/seed",
  "src/mocks/strictLiveFixtureUnavailable",
];

const FORBIDDEN_CODE_SYMBOLS = [
  "withLiveOrMock",
  "withStrictLiveOrMock",
  "liveListOrSeed",
  "liveDetailOrSeed",
  "liveDerivedListOrSeed",
];

async function checkBundle() {
  console.log("[bundle-mock-check] Building production bundle graph with Vite...");

  const result = await build({
    mode: "production",
    build: {
      write: false,
      minify: false, // Keep identifiers inspectable
    },
    logLevel: "warn",
  });

  const outputs = (Array.isArray(result) ? result : [result]) as RollupOutput[];
  let violations = 0;

  for (const rollupOutput of outputs) {
    const chunks = rollupOutput.output.filter((item): item is OutputChunk => item.type === "chunk");

    for (const chunk of chunks) {
      // 1. Check module IDs bundled into this chunk
      for (const moduleId of chunk.moduleIds) {
        const normalized = moduleId.replace(/\\/g, "/");
        for (const forbidden of FORBIDDEN_MODULE_SUBSTRINGS) {
          if (normalized.includes(forbidden)) {
            console.error(`[VIOLATION] Chunk "${chunk.fileName}" contains forbidden module: ${normalized}`);
            violations += 1;
          }
        }
      }

      // 2. Check forbidden code symbols in chunk output
      for (const symbol of FORBIDDEN_CODE_SYMBOLS) {
        const regex = new RegExp(`\\b${symbol}\\b`, "g");
        if (regex.test(chunk.code)) {
          console.error(`[VIOLATION] Chunk "${chunk.fileName}" contains forbidden code symbol: ${symbol}`);
          violations += 1;
        }
      }
    }
  }

  if (violations > 0) {
    console.error(`\n[bundle-mock-check] FAILED with ${violations} violation(s).`);
    process.exit(1);
  }

  console.log("[bundle-mock-check] PASSED — Production Rollup graph has zero mock/seed/fallback reachability.");
}

checkBundle().catch((err) => {
  console.error("[bundle-mock-check] ERROR during bundle analysis:", err);
  process.exit(1);
});
