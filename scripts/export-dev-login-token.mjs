#!/usr/bin/env node

import { appendFileSync, chmodSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ACCESS_TOKEN_MIN_LENGTH = 16;
const ACCESS_TOKEN_MAX_LENGTH = 4096;
const BASE64URL_TOKEN = /^[A-Za-z0-9_-]+$/u;
const JWT_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

function invalid(message) {
  throw new Error(`Invalid dev-login response: ${message}`);
}

export function validateDevLoginResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    invalid("payload must be a JSON object");
  }

  const token = payload.access_token;
  if (typeof token !== "string") {
    invalid("access_token must be a string");
  }
  if (token.length < ACCESS_TOKEN_MIN_LENGTH || token.length > ACCESS_TOKEN_MAX_LENGTH) {
    invalid(`access_token length must be ${ACCESS_TOKEN_MIN_LENGTH}-${ACCESS_TOKEN_MAX_LENGTH}`);
  }
  if (!BASE64URL_TOKEN.test(token) && !JWT_TOKEN.test(token)) {
    invalid("access_token must be a base64url token or three-segment JWT");
  }

  if (payload.token_type !== undefined) {
    if (
      typeof payload.token_type !== "string" ||
      payload.token_type !== payload.token_type.trim() ||
      !/^bearer$/iu.test(payload.token_type)
    ) {
      invalid("token_type must be Bearer when present");
    }
  }

  if (
    typeof payload.expires_in !== "number" ||
    !Number.isInteger(payload.expires_in) ||
    payload.expires_in < 1 ||
    payload.expires_in > 3600
  ) {
    invalid("expires_in must be an integer from 1 through 3600 seconds");
  }

  return { token };
}

export function exportDevLoginToken(responsePath, githubEnvPath) {
  if (!responsePath || !githubEnvPath) {
    throw new Error("Usage: export-dev-login-token.mjs RESPONSE_JSON GITHUB_ENV");
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(responsePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Invalid dev-login response: unable to read valid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  // Nothing is emitted to the Actions command channel or environment file
  // until the complete response has passed the bounded token contract above.
  const { token } = validateDevLoginResponse(payload);
  process.stdout.write(`::add-mask::${token}\n`);
  chmodSync(githubEnvPath, 0o600);
  appendFileSync(
    githubEnvPath,
    `PANTHEON_DEPLOY_WRITE_PROBE_AUTH_TOKEN=${token}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    exportDevLoginToken(process.argv[2], process.argv[3]);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
