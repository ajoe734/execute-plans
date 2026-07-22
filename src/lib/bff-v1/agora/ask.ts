// Typed client for the governed Agora ask seam.
// Route: POST /bff/agora/ask
//
// This module deliberately returns a narrow receipt. Provider payloads may
// contain additional metadata, but the browser must not interpret arbitrary
// response fields as executable actions.

import { bffFetch } from "@/lib/bff-v1/client";

export interface AgoraAskContextRef {
  type: string;
  id: string;
  versionId?: string;
}

export interface SubmitAgoraAskRequest {
  prompt: string;
  route: string;
  contextRefs?: readonly AgoraAskContextRef[];
  sessionId?: string;
  messageId?: string;
}

export type AgoraAskProviderStatus =
  | "disabled"
  | "completed"
  | "degraded"
  | "queued"
  | "running"
  | "failed"
  | "unavailable"
  | "unknown";

export interface AgoraAskReceipt {
  sessionId: string;
  messageId: string;
  providerStatus: AgoraAskProviderStatus;
  answer?: string;
  commandId?: string;
  snapshotAt?: string;
}

type RecordLike = Record<string, unknown>;

function recordFrom(value: unknown): RecordLike | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let cursor: unknown = value;
  for (const segment of path) {
    const record = recordFrom(cursor);
    if (!record || !(segment in record)) return undefined;
    cursor = record[segment];
  }
  return cursor;
}

function firstStringAt(value: unknown, paths: readonly (readonly string[])[]): string | undefined {
  for (const path of paths) {
    const found = nonEmptyString(readPath(value, path));
    if (found) return found;
  }
  return undefined;
}

const PROVIDER_STATUSES = new Set<AgoraAskProviderStatus>([
  "disabled",
  "completed",
  "degraded",
  "queued",
  "running",
  "failed",
  "unavailable",
  "unknown",
]);

function providerStatusFrom(value: unknown): AgoraAskProviderStatus {
  const status = nonEmptyString(value)?.toLowerCase() as AgoraAskProviderStatus | undefined;
  return status && PROVIDER_STATUSES.has(status) ? status : "unknown";
}

function requestBody(request: SubmitAgoraAskRequest): RecordLike {
  const prompt = request.prompt.trim();
  const route = request.route.trim();
  if (!prompt) throw new TypeError("Agora ask prompt must not be empty");
  if (!route) throw new TypeError("Agora ask route must not be empty");

  const body: RecordLike = { prompt, route };
  const contextRefs: AgoraAskContextRef[] = [];
  for (const ref of request.contextRefs ?? []) {
    const type = nonEmptyString(ref.type);
    const id = nonEmptyString(ref.id);
    if (!type || !id) continue;
    const versionId = nonEmptyString(ref.versionId);
    contextRefs.push(versionId ? { type, id, versionId } : { type, id });
  }

  if (contextRefs.length) body.contextRefs = contextRefs;
  const sessionId = nonEmptyString(request.sessionId);
  const messageId = nonEmptyString(request.messageId);
  if (sessionId) body.sessionId = sessionId;
  if (messageId) body.messageId = messageId;
  return body;
}

function receiptFrom(value: unknown): AgoraAskReceipt {
  const sessionId = firstStringAt(value, [
    ["data", "session", "sessionId"],
    ["data", "session", "session_id"],
    ["data", "session", "id"],
    ["data", "sessionId"],
    ["data", "session_id"],
    ["sessionId"],
    ["session_id"],
  ]);
  const messageId = firstStringAt(value, [
    ["data", "message", "id"],
    ["data", "message", "messageId"],
    ["data", "message", "message_id"],
    ["data", "messageId"],
    ["data", "message_id"],
    ["messageId"],
    ["message_id"],
  ]);

  if (!sessionId || !messageId) {
    throw new TypeError("Pantheon BFF returned an invalid Agora ask receipt");
  }

  const providerStatus = providerStatusFrom(firstStringAt(value, [
    ["data", "provider", "status"],
    ["data", "providerStatus"],
    ["data", "provider_status"],
    ["meta", "assistant", "provider_status"],
    ["meta", "assistant", "providerStatus"],
  ]));
  const answer = firstStringAt(value, [
    ["data", "provider", "answer"],
    ["data", "answer"],
    ["answer"],
  ]);
  const commandId = firstStringAt(value, [
    ["meta", "command", "commandId"],
    ["meta", "command", "command_id"],
    ["data", "commandId"],
    ["data", "command_id"],
    ["commandId"],
    ["command_id"],
  ]);
  const snapshotAt = firstStringAt(value, [
    ["meta", "snapshot_at"],
    ["meta", "snapshotAt"],
    ["data", "snapshot_at"],
    ["data", "snapshotAt"],
    ["snapshot_at"],
    ["snapshotAt"],
  ]);

  return {
    sessionId,
    messageId,
    providerStatus,
    ...(answer ? { answer } : {}),
    ...(commandId ? { commandId } : {}),
    ...(snapshotAt ? { snapshotAt } : {}),
  };
}

export async function submitAgoraAsk(
  request: SubmitAgoraAskRequest,
  options?: { idempotencyKey?: string },
): Promise<AgoraAskReceipt> {
  const response = await bffFetch<unknown>({
    method: "POST",
    path: "/bff/agora/ask",
    body: requestBody(request),
    ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
  });
  return receiptFrom(response);
}
