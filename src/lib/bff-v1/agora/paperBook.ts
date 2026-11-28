import { bffSessionFetch } from "@/lib/auth/sessionExpiry";
import { detectBaseUrl } from "../client";
import { BffError, normalizeBffErrorEnvelope } from "../errors";
import { buildHeaders } from "../headers";

// Provisioning may take two minutes; keep this separate from decision confirmation.
export const PAPER_BOOK_ENSURE_TIMEOUT_MS = 150_000;

/** Explicit first paper use only. The caller owns one key per attempt. */
export async function ensurePaperBook(idempotencyKey: string, signal?: AbortSignal): Promise<void> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("paper_book_ensure_timeout", "TimeoutError")), PAPER_BOOK_ENSURE_TIMEOUT_MS);
  try {
    const response = await bffSessionFetch(`${detectBaseUrl()}/bff/agora/servant/paper-book/ensure`, {
      method: "POST",
      credentials: "include",
      headers: buildHeaders({ method: "POST", idempotency: idempotencyKey }),
      body: JSON.stringify({ target_stage: "paper" }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const normalized = normalizeBffErrorEnvelope(body, response.status);
      if (normalized) throw new BffError(response.status, normalized);
      const detail = body?.detail;
      const reason = typeof detail === "string" ? detail : detail?.reason;
      throw new BffError(response.status, { error: {
        code: response.status === 409 ? "STATE_CONFLICT" : "UNKNOWN_ERROR",
        message: typeof reason === "string" ? reason : `HTTP ${response.status}`,
        i18nKey: "errors.UNKNOWN_ERROR", retryable: true, userActionable: true,
        correlationId: response.headers.get("X-Correlation-Id") ?? "",
      } });
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
