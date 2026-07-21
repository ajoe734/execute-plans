#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const BIND_HOST = "127.0.0.1";
const MAX_DECODE_PASSES = 16;

const MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".htm", "text/html; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

class RequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseArguments(argv, env) {
  let rootArgument = "";
  let portArgument;
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root" || argument === "--port") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === "--root") rootArgument = value;
      if (argument === "--port") portArgument = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--root=")) {
      rootArgument = argument.slice("--root=".length);
      continue;
    }
    if (argument.startsWith("--port=")) {
      portArgument = argument.slice("--port=".length);
      continue;
    }
    if (argument.startsWith("--")) {
      throw new Error(`unknown option: ${argument}`);
    }
    positional.push(argument);
  }

  if (rootArgument && positional.length > 0) {
    throw new Error("candidate root must be supplied once, via --root, a positional argument, or PANTHEON_CANDIDATE_ROOT");
  }
  if (positional.length > 1) {
    throw new Error("only one positional candidate root is allowed");
  }

  const root = rootArgument || positional[0] || env.PANTHEON_CANDIDATE_ROOT || "";
  if (!root.trim()) {
    throw new Error("candidate root is required (--root, positional argument, or PANTHEON_CANDIDATE_ROOT)");
  }

  const portText = portArgument ?? env.PANTHEON_CANDIDATE_PORT ?? "0";
  if (!/^\d+$/u.test(String(portText))) {
    throw new Error("candidate port must be an integer from 0 through 65535");
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("candidate port must be an integer from 0 through 65535");
  }

  const infoFile = String(env.PANTHEON_CANDIDATE_SERVER_INFO || "").trim();
  if (!infoFile) {
    throw new Error("PANTHEON_CANDIDATE_SERVER_INFO is required");
  }

  return { infoFile: path.resolve(infoFile), port, root: path.resolve(root) };
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function decodeAndValidatePath(rawPath) {
  if (!rawPath.startsWith("/")) {
    throw new RequestError(400, "invalid request target");
  }

  let current = rawPath;
  let firstDecoded = "";
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      throw new RequestError(400, "invalid URL encoding");
    }
    if (pass === 0) firstDecoded = decoded;
    if (decoded.includes("\0") || decoded.includes("\\")) {
      throw new RequestError(403, "forbidden path");
    }
    if (decoded.split("/").some((segment) => segment === "..")) {
      throw new RequestError(403, "forbidden path");
    }
    if (decoded === current) return firstDecoded;
    current = decoded;
  }

  throw new RequestError(403, "excessively encoded path");
}

function requestPath(requestUrl) {
  const rawTarget = String(requestUrl || "/");
  const queryIndex = rawTarget.indexOf("?");
  const fragmentIndex = rawTarget.indexOf("#");
  const cutAt = [queryIndex, fragmentIndex]
    .filter((index) => index >= 0)
    .reduce((smallest, index) => Math.min(smallest, index), rawTarget.length);
  return decodeAndValidatePath(rawTarget.slice(0, cutAt));
}

async function resolveExistingFile(root, candidate) {
  if (!isWithinRoot(root, candidate)) {
    throw new RequestError(403, "forbidden path");
  }

  let canonical;
  try {
    canonical = await realpath(candidate);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    if (error?.code === "EACCES") throw new RequestError(403, "forbidden path");
    throw error;
  }
  if (!isWithinRoot(root, canonical)) {
    throw new RequestError(403, "symlink escapes candidate root");
  }

  const metadata = await stat(canonical);
  if (metadata.isDirectory()) {
    return resolveExistingFile(root, path.join(canonical, "index.html"));
  }
  return metadata.isFile() ? { metadata, path: canonical } : null;
}

function shouldUseSpaFallback(decodedPath, acceptHeader) {
  if (path.posix.extname(decodedPath)) return false;
  const accept = String(acceptHeader || "").toLowerCase();
  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

function cacheControl(filePath) {
  const basename = path.basename(filePath);
  if (basename === "index.html" || basename === "deployment.json") {
    return "no-store";
  }
  if (/[-.][a-z0-9_-]{8,}\.[a-z0-9]+$/iu.test(basename)) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

function contentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function writeText(response, statusCode, text, headOnly = false, extraHeaders = {}) {
  const body = Buffer.from(text, "utf8");
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": body.byteLength,
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(headOnly ? undefined : body);
}

async function handleRequest(request, response, root) {
  const method = String(request.method || "GET").toUpperCase();
  const headOnly = method === "HEAD";
  if (method !== "GET" && !headOnly) {
    writeText(response, 405, "Method Not Allowed\n", false, { Allow: "GET, HEAD" });
    return;
  }

  let decodedPath;
  try {
    decodedPath = requestPath(request.url);
    const relative = decodedPath.replace(/^\/+/, "");
    const lexicalCandidate = path.resolve(root, relative || ".");
    let resolved = await resolveExistingFile(root, lexicalCandidate);
    if (!resolved && shouldUseSpaFallback(decodedPath, request.headers.accept)) {
      resolved = await resolveExistingFile(root, path.join(root, "index.html"));
    }
    if (!resolved) {
      writeText(response, 404, "Not Found\n", headOnly);
      return;
    }

    const body = headOnly ? null : await readFile(resolved.path);
    response.writeHead(200, {
      "Cache-Control": cacheControl(resolved.path),
      "Content-Length": resolved.metadata.size,
      "Content-Type": contentType(resolved.path),
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body ?? undefined);
  } catch (error) {
    if (error instanceof RequestError) {
      writeText(response, error.statusCode, `${error.message}\n`, headOnly);
      return;
    }
    console.error(`candidate request failed: ${error instanceof Error ? error.message : String(error)}`);
    if (!response.headersSent) writeText(response, 500, "Internal Server Error\n", headOnly);
    else response.destroy();
  }
}

async function writeInfoAtomically(infoFile, info) {
  const directory = path.dirname(infoFile);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(infoFile)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(info)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, infoFile);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2), process.env);
  const root = await realpath(options.root);
  const rootMetadata = await stat(root);
  if (!rootMetadata.isDirectory()) throw new Error(`candidate root is not a directory: ${options.root}`);
  const indexFile = await resolveExistingFile(root, path.join(root, "index.html"));
  if (!indexFile) throw new Error("candidate root must contain index.html");

  const server = createServer((request, response) => {
    void handleRequest(request, response, root);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const forceClose = setTimeout(() => {
      server.closeAllConnections?.();
    }, 2_000);
    forceClose.unref();
    server.close((error) => {
      clearTimeout(forceClose);
      void rm(options.infoFile, { force: true }).then(
        () => { process.exitCode = error ? 1 : 0; },
        (cleanupError) => {
          console.error(`candidate server cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
          process.exitCode = 1;
        },
      );
    });
    server.closeIdleConnections?.();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port, BIND_HOST);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("candidate server did not expose a TCP address");
  }
  const info = {
    origin: `http://${BIND_HOST}:${address.port}`,
    pid: process.pid,
    root,
  };

  try {
    await writeInfoAtomically(options.infoFile, info);
  } catch (error) {
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }
  process.stdout.write(`${JSON.stringify(info)}\n`);
}

main().catch((error) => {
  console.error(`candidate server error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
