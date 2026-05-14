import { bffFetch } from "./client";
import { paths } from "./paths";
import { realWritesEnabled } from "./liveTransport";
import { readBffEnv } from "./runtimeEnv";

export type BffSessionKind = "cookie" | "bearer" | "stub";

export interface SessionKindWriteContext {
  production?: boolean;
  strict?: boolean;
}

export function sessionKindAllowsWrite(
  sessionKind: unknown,
  context: SessionKindWriteContext = {},
): boolean {
  const normalized = String(sessionKind ?? "").trim().toLowerCase();
  if (normalized === "cookie" || normalized === "bearer") return true;
  if (normalized === "stub") return !context.production && !context.strict;
  return false;
}

function truthy(value: unknown): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function strictWriteModeFromEnv(): boolean {
  const env = readBffEnv();
  return env.VITE_BFF_FALLBACK === "strict" || truthy(env.VITE_BFF_STRICT_WRITES);
}

function isProduction(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "prod" || normalized === "production";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readMeData(value: unknown): Record<string, unknown> {
  const root = asRecord(value) ?? {};
  return asRecord(root.data) ?? asRecord(root.me) ?? root;
}

function readSessionSummary(value: unknown): {
  authenticated: boolean;
  sessionKind: unknown;
  production: boolean;
  strict: boolean;
} {
  const data = readMeData(value);
  const session = asRecord(data.session) ?? {};
  const environment = asRecord(data.environment) ?? {};
  return {
    authenticated: session.authenticated !== false,
    sessionKind: session.session_kind ?? session.sessionKind,
    production: isProduction(data.env) || isProduction(environment.name) || isProduction(environment.deployment_stage),
    strict: environment.strict_auth === true || strictWriteModeFromEnv(),
  };
}

export async function liveWriteGated(): Promise<boolean> {
  if (!realWritesEnabled()) return false;
  try {
    const me = await bffFetch<unknown>({ method: "GET", path: paths.me(), mode: "live" });
    const summary = readSessionSummary(me);
    if (!summary.authenticated) return false;
    return sessionKindAllowsWrite(summary.sessionKind, {
      production: summary.production,
      strict: summary.strict,
    });
  } catch {
    return false;
  }
}
