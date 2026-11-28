import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePaperBook, PAPER_BOOK_ENSURE_TIMEOUT_MS } from "./paperBook";
import { getTradingRoomPaperBook } from "./tradingRoom";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => { fetchMock.mockReset(); vi.useRealTimers(); });

describe("explicit paper-book ensure client", () => {
  it("posts only paper with the caller's key and session credentials", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    await ensurePaperBook("stable-attempt-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/bff\/agora\/servant\/paper-book\/ensure$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers["Idempotency-Key"]).toBe("stable-attempt-key");
    expect(JSON.parse(init.body)).toEqual({ target_stage: "paper" });
  });

  it("preserves a 409 owner reason", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { reason: "paper_stage_only" } }), { status: 409 }));
    await expect(ensurePaperBook("conflict-key")).rejects.toMatchObject({ status: 409, code: "STATE_CONFLICT", message: "paper_stage_only" });
  });

  it("preserves typed error details", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: "BACKEND_UNAVAILABLE", message: "provisioning", details: { reason: "runtime_unavailable" } } }), { status: 503 }));
    await expect(ensurePaperBook("error-key")).rejects.toMatchObject({ status: 503, code: "BACKEND_UNAVAILABLE", details: { reason: "runtime_unavailable" } });
  });

  it("waits beyond two minutes and aborts at its bounded deadline", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    }));
    const result = ensurePaperBook("timeout-key");
    const rejected = expect(result).rejects.toMatchObject({ name: "TimeoutError", message: "paper_book_ensure_timeout" });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(PAPER_BOOK_ENSURE_TIMEOUT_MS - 120_000);
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("paper-book read distinguishes first use from route errors", () => {
  it("returns missing only for the owner-scoped paper_book_not_found reason", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { reason: "paper_book_not_found" } }), { status: 404 }));
    await expect(getTradingRoomPaperBook()).resolves.toBeNull();
  });
  it("recognizes the normalized BFF missing-book envelope", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: {
      code: "RESOURCE_NOT_FOUND", message: "Trader paper book not found", details: { reason: "paper_book_not_found" },
    } }), { status: 404 }));
    await expect(getTradingRoomPaperBook()).resolves.toBeNull();
  });
  it("does not enable provisioning on an unrelated 404", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 }));
    await expect(getTradingRoomPaperBook()).rejects.toMatchObject({ status: 404 });
  });
});

import en from "@/i18n/locales/en-US";
import zh from "@/i18n/locales/zh-TW";

it("keeps paper-book setup and readback locale keys in parity", () => {
  expect(Object.keys(zh.agora.tradingRoom.page.paperBook)).toEqual(Object.keys(en.agora.tradingRoom.page.paperBook));
  expect(en.agora.tradingRoom.page.paperBook.startingCapitalNotice).toContain("notional paper money");
  expect(zh.agora.tradingRoom.page.paperBook.startingCapitalNotice).toContain("名目模擬資金");
});
