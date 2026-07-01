type RecordLike = Record<string, unknown>;

export interface CommandReceiptDescriptionOptions {
  fallback?: string;
  label?: string;
  extra?: string | null;
}

const asRecord = (value: unknown): RecordLike | undefined =>
  value && typeof value === "object" ? value as RecordLike : undefined;

const asString = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
};

const readPath = (value: unknown, path: readonly string[]): unknown => {
  let cursor: unknown = value;
  for (const part of path) {
    const record = asRecord(cursor);
    if (!record || !(part in record)) return undefined;
    cursor = record[part];
  }
  return cursor;
};

const firstStringAt = (value: unknown, paths: readonly (readonly string[])[]): string | undefined => {
  for (const path of paths) {
    const found = asString(readPath(value, path));
    if (found) return found;
  }
  return undefined;
};

const shortId = (value: string): string =>
  value.length > 32 ? `${value.slice(0, 12)}...${value.slice(-6)}` : value;

export function commandReceiptDescription(
  value: unknown,
  options: CommandReceiptDescriptionOptions = {},
): string {
  const label = options.label ?? "command/audit";
  const receiptId = firstStringAt(value, [
    ["audit", "id"],
    ["auditEventId"],
    ["data", "actionId"],
    ["data", "commandId"],
    ["data", "command_id"],
    ["data", "receipt_id"],
    ["data", "receipt", "commandId"],
    ["data", "receipt", "command_id"],
    ["data", "receipt", "receipt_id"],
    ["legacy", "audit", "id"],
  ]);
  const status = firstStringAt(value, [
    ["data", "status"],
    ["status"],
    ["audit", "outcome"],
    ["legacy", "audit", "outcome"],
  ]);
  const correlationId = firstStringAt(value, [
    ["correlationId"],
    ["correlation_id"],
    ["audit", "correlationId"],
    ["legacy", "audit", "correlationId"],
  ]);
  const idempotencyKey = firstStringAt(value, [
    ["idempotencyKey"],
    ["idempotency_key"],
    ["audit", "idempotencyKey"],
    ["legacy", "audit", "idempotencyKey"],
    ["meta", "idempotency", "idempotencyKey"],
    ["meta", "idempotency", "key"],
  ]);
  const jobId = firstStringAt(value, [
    ["job", "id"],
    ["jobId"],
    ["data", "jobId"],
  ]);

  const parts = [
    receiptId ? `${label} ${shortId(receiptId)}` : options.fallback ?? `${label} receipt recorded`,
    status ? `status ${status}` : undefined,
    jobId ? `job ${shortId(jobId)}` : undefined,
    correlationId ? `corr ${shortId(correlationId)}` : undefined,
    idempotencyKey ? `idem ${shortId(idempotencyKey)}` : undefined,
    options.extra ?? undefined,
  ].filter(Boolean);

  return parts.join(" · ");
}

export function commandBatchReceiptDescription(
  values: readonly unknown[],
  options: CommandReceiptDescriptionOptions = {},
): string {
  const count = values.length;
  const last = values[values.length - 1];
  const suffix = last ? commandReceiptDescription(last, options) : options.fallback ?? "no receipt";
  return `${count} command receipt${count === 1 ? "" : "s"} · ${suffix}`;
}
