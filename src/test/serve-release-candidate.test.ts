import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type ServerInfo = {
  origin: string;
  pid: number;
  root: string;
};

type RawResponse = {
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
  status: number;
};

const repositoryRoot = process.cwd();
const serverScript = path.resolve(repositoryRoot, "scripts/serve-release-candidate.mjs");
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "pantheon-candidate-server-"));
const releaseRoot = path.join(temporaryRoot, "release with spaces");
const outsideSecret = path.join(temporaryRoot, "outside-secret.txt");
const infoFile = path.join(temporaryRoot, "runtime", "candidate.json");

let child: ChildProcessWithoutNullStreams;
let serverInfo: ServerInfo;
let stdout = "";
let stderr = "";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForInfo(file: string, processUnderTest: ChildProcessWithoutNullStreams): Promise<ServerInfo> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf8")) as ServerInfo;
    }
    if (processUnderTest.exitCode !== null) {
      throw new Error(`candidate server exited early (${processUnderTest.exitCode})\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    await delay(20);
  }
  throw new Error(`candidate server info was not written\nstdout:\n${stdout}\nstderr:\n${stderr}`);
}

function waitForExit(processUnderTest: ChildProcessWithoutNullStreams): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (processUnderTest.exitCode !== null) {
    return Promise.resolve({ code: processUnderTest.exitCode, signal: processUnderTest.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`candidate server did not exit\nstdout:\n${stdout}\nstderr:\n${stderr}`)), 5_000);
    processUnderTest.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

function rawRequest(origin: string, requestPath: string, method = "GET"): Promise<RawResponse> {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = request({
      host: target.hostname,
      method,
      path: requestPath,
      port: Number(target.port),
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({
        body: Buffer.concat(chunks),
        headers: response.headers,
        status: response.statusCode ?? 0,
      }));
    });
    req.once("error", reject);
    req.end();
  });
}

function startServer(signalInfoFile: string, rootSource: "argv" | "env" = "argv"): ChildProcessWithoutNullStreams {
  const argumentsForServer = rootSource === "argv"
    ? [serverScript, "--root", releaseRoot, "--port", "0"]
    : [serverScript, "--port", "0"];
  const processUnderTest = spawn(process.execPath, argumentsForServer, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PANTHEON_CANDIDATE_ROOT: rootSource === "env" ? releaseRoot : "",
      PANTHEON_CANDIDATE_PORT: "",
      PANTHEON_CANDIDATE_SERVER_INFO: signalInfoFile,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  processUnderTest.stdout.setEncoding("utf8");
  processUnderTest.stderr.setEncoding("utf8");
  processUnderTest.stdout.on("data", (chunk) => { stdout += chunk; });
  processUnderTest.stderr.on("data", (chunk) => { stderr += chunk; });
  return processUnderTest;
}

beforeAll(async () => {
  mkdirSync(path.join(releaseRoot, "assets"), { recursive: true });
  writeFileSync(path.join(releaseRoot, "index.html"), "<!doctype html><html><body>candidate shell</body></html>\n");
  writeFileSync(path.join(releaseRoot, "deployment.json"), "{\"commit\":\"candidate-sha\"}\n");
  writeFileSync(path.join(releaseRoot, "assets", "app-abcdef12.js"), "globalThis.__candidate = true;\n");
  writeFileSync(path.join(releaseRoot, "assets", "app-abcdef12.css"), "body { color: rgb(1 2 3); }\n");
  writeFileSync(path.join(releaseRoot, "assets", "data-abcdef12.json"), "{\"ok\":true}\n");
  writeFileSync(path.join(releaseRoot, "assets", "logo-abcdef12.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
  writeFileSync(path.join(releaseRoot, "plain.js"), "export {};\n");
  writeFileSync(outsideSecret, "must not be served\n");
  symlinkSync(outsideSecret, path.join(releaseRoot, "escaped-secret.txt"));

  child = startServer(infoFile);
  serverInfo = await waitForInfo(infoFile, child);
}, 10_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await waitForExit(child).catch(() => child.kill("SIGKILL"));
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
});

describe("serve-release-candidate", () => {
  it("publishes canonical startup information for an ephemeral loopback port", () => {
    expect(serverInfo).toEqual({
      origin: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/u),
      pid: child.pid,
      root: realpathSync(releaseRoot),
    });
    expect(new URL(serverInfo.origin).port).not.toBe("0");
  });

  it("serves GET and HEAD with MIME and cache policy derived from the release file", async () => {
    const index = await fetch(`${serverInfo.origin}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(index.headers.get("cache-control")).toBe("no-store");
    expect(await index.text()).toContain("candidate shell");

    const head = await fetch(`${serverInfo.origin}/index.html`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("cache-control")).toBe("no-store");
    expect(Number(head.headers.get("content-length"))).toBeGreaterThan(0);
    expect(await head.text()).toBe("");

    const deployment = await fetch(`${serverInfo.origin}/deployment.json`);
    expect(deployment.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(deployment.headers.get("cache-control")).toBe("no-store");

    for (const [file, mime] of [
      ["app-abcdef12.js", "text/javascript; charset=utf-8"],
      ["app-abcdef12.css", "text/css; charset=utf-8"],
      ["data-abcdef12.json", "application/json; charset=utf-8"],
      ["logo-abcdef12.svg", "image/svg+xml; charset=utf-8"],
    ] as const) {
      const response = await fetch(`${serverInfo.origin}/assets/${file}`);
      expect(response.status, file).toBe(200);
      expect(response.headers.get("content-type"), file).toBe(mime);
      expect(response.headers.get("cache-control"), file).toBe("public, max-age=31536000, immutable");
    }

    const plain = await fetch(`${serverInfo.origin}/plain.js`);
    expect(plain.headers.get("cache-control")).toBe("no-cache");
  });

  it("uses index.html for SPA routes but not for missing asset files", async () => {
    const route = await fetch(`${serverInfo.origin}/management/persona-fleet`, {
      headers: { Accept: "text/html" },
    });
    expect(route.status).toBe(200);
    expect(route.headers.get("cache-control")).toBe("no-store");
    expect(await route.text()).toContain("candidate shell");

    const missingAsset = await fetch(`${serverInfo.origin}/assets/missing-deadbeef.js`);
    expect(missingAsset.status).toBe(404);
    expect(await missingAsset.text()).toBe("Not Found\n");
  });

  it("rejects mutations, plain and encoded traversal, and symlink escapes", async () => {
    const mutation = await rawRequest(serverInfo.origin, "/deployment.json", "POST");
    expect(mutation.status).toBe(405);
    expect(mutation.headers.allow).toBe("GET, HEAD");

    for (const attack of [
      "/../outside-secret.txt",
      "/..%2foutside-secret.txt",
      "/%2e%2e/outside-secret.txt",
      "/%252e%252e%252foutside-secret.txt",
      "/..%5coutside-secret.txt",
    ]) {
      const response = await rawRequest(serverInfo.origin, attack);
      expect(response.status, attack).toBe(403);
      expect(response.body.toString("utf8"), attack).not.toContain("must not be served");
    }

    const escaped = await fetch(`${serverInfo.origin}/escaped-secret.txt`);
    expect(escaped.status).toBe(403);
    expect(await escaped.text()).not.toContain("must not be served");
  });

  it("shuts down cleanly for SIGTERM and SIGINT", async () => {
    child.kill("SIGTERM");
    const terminated = await waitForExit(child);
    expect(terminated).toEqual({ code: 0, signal: null });
    expect(existsSync(infoFile)).toBe(false);

    stdout = "";
    stderr = "";
    const interruptInfo = path.join(temporaryRoot, "runtime", "candidate-sigint.json");
    const interruptedChild = startServer(interruptInfo, "env");
    const interruptedInfo = await waitForInfo(interruptInfo, interruptedChild);
    expect(interruptedInfo.root).toBe(realpathSync(releaseRoot));
    interruptedChild.kill("SIGINT");
    const interrupted = await waitForExit(interruptedChild);
    expect(interrupted).toEqual({ code: 0, signal: null });
    expect(existsSync(interruptInfo)).toBe(false);
  });
});
