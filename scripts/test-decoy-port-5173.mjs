#!/usr/bin/env node

import http from "node:http";
import { spawn } from "node:child_process";

const DECOY_PORT = 5173;

const decoyServer = http.createServer((req, res) => {
  res.writeHead(503, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ decoy: true, error: "stale 5173 occupied by decoy server" }));
});

await new Promise((resolve, reject) => {
  decoyServer.listen(DECOY_PORT, "127.0.0.1", () => {
    console.log(`[decoy] Decoy server actively occupying 127.0.0.1:${DECOY_PORT}`);
    resolve();
  });
  decoyServer.on("error", reject);
});

console.log("[test] Running Playwright test while 5173 is occupied by decoy...");
const child = spawn("npx", ["playwright", "test", "e2e/agora-persona-workshop-navigation.spec.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PANTHEON_FE_BASE_URL: "",
  },
});

const exitCode = await new Promise((resolve) => {
  child.on("close", resolve);
});

await new Promise((resolve) => {
  decoyServer.close(resolve);
});
console.log(`[decoy] Decoy server closed. Playwright test exit code: ${exitCode}`);

process.exit(exitCode ?? 1);
