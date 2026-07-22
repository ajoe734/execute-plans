import { act, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { liveStatus } from "@/lib/bff-v1/liveStatus";
import { __resetV5LiveCacheForTests } from "@/management/pages/v5/useV5Live";
import { HumanInboxPage } from "./_core";

void i18n.changeLanguage("en-US");

function renderInbox() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/management/human-inbox"]}>
        <Routes>
          <Route path="/management/human-inbox" element={<HumanInboxPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("HumanInboxPage bounded live request", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetV5LiveCacheForTests();
    liveStatus._reset({ mode: "live", effective: "live", baseUrl: "" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    liveStatus._reset();
    vi.restoreAllMocks();
  });

  it("aborts at 8 seconds and renders unavailable rather than authoritative empty", async () => {
    let requestSignal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        requestSignal = init?.signal;
        const rejectAsAborted = () => reject(new DOMException("The operation was aborted.", "AbortError"));
        if (requestSignal?.aborted) {
          rejectAsAborted();
          return;
        }
        requestSignal?.addEventListener("abort", rejectAsAborted, { once: true });
      }),
    );

    renderInbox();

    expect(screen.getByText("Loading live Human Inbox items…")).toBeInTheDocument();
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal?.aborted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_999);
    });
    expect(requestSignal?.aborted).toBe(false);
    expect(screen.getByText("Loading live Human Inbox items…")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });

    expect(requestSignal?.aborted).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("Human Inbox status unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("this is not an empty inbox");
    expect(screen.queryByText("No Human Inbox items currently require review.")).not.toBeInTheDocument();
  });
});
