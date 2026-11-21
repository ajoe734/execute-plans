import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import i18n from "@/i18n";
import type { RiskLevel } from "@/lib/bff-v1";
import { BFF_STATUS_VALUES, isTranslationKeyLike } from "@/lib/enumLabels";
import { RiskBadge } from "./RiskBadge";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge and RiskBadge one-line layout classes", () => {
  afterEach(() => {
    cleanup();
  });

  it("applies whitespace-nowrap across all StatusBadge branches including unavailable fallback", () => {
    const states: Array<string | undefined> = [
      undefined,
      "",
      "draft",
      "review",
      "approved",
      "deployed",
      "paused",
      "retired",
      "pending",
      "running",
      "success",
      "warning",
      "failed",
      "rejected",
      "revoked",
      "superseded",
      "unknown",
    ];

    for (const state of states) {
      const { container, unmount } = render(<StatusBadge state={state} />);
      const badge = container.firstElementChild as HTMLElement | null;
      expect(badge).not.toBeNull();
      expect(badge).toHaveClass("whitespace-nowrap", "font-medium");
      if (!state) {
        expect(badge).toHaveClass("border-dashed");
      }
      unmount();
    }
  });

  it("applies whitespace-nowrap across all RiskBadge branches including unavailable fallback", () => {
    const levels: Array<RiskLevel | undefined> = [
      undefined,
      "unknown" as unknown as RiskLevel,
      "info",
      "low",
      "medium",
      "high",
      "critical",
    ];

    for (const level of levels) {
      const { container, unmount } = render(<RiskBadge level={level} />);
      const badge = container.firstElementChild as HTMLElement | null;
      expect(badge).not.toBeNull();
      expect(badge).toHaveClass("whitespace-nowrap", "font-medium");
      if (!level || !["info", "low", "medium", "high", "critical"].includes(level)) {
        expect(badge).toHaveClass("border-dashed");
      }
      unmount();
    }
  });

  it("keeps the shared Badge component free of whitespace-nowrap by default", () => {
    render(<Badge>Long badge text that may wrap in other callers</Badge>);
    const badge = screen.getByText("Long badge text that may wrap in other callers");
    expect(badge).not.toHaveClass("whitespace-nowrap");
  });

  it("renders localized labels for resolved, completed, executed, canceled, refused, and all BFF status values without leaking translation keys or nan", async () => {
    await i18n.changeLanguage("zh-TW");
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <StatusBadge state="resolved" />
      </I18nextProvider>,
    );
    expect(screen.getByText("已解決")).toBeInTheDocument();
    expect(screen.queryByText("成功")).not.toBeInTheDocument();

    for (const status of BFF_STATUS_VALUES) {
      rerender(
        <I18nextProvider i18n={i18n}>
          <StatusBadge state={status} />
        </I18nextProvider>,
      );
      const badge = document.body.querySelector("[class*='whitespace-nowrap']");
      const text = badge?.textContent?.trim() ?? "";
      expect(text.length, `zh-TW StatusBadge for ${status}`).toBeGreaterThan(0);
      expect(isTranslationKeyLike(text), `zh-TW StatusBadge leaked key for ${status}: ${text}`).toBe(false);
      expect(text.toLowerCase()).not.toBe("nan");
    }

    rerender(
      <I18nextProvider i18n={i18n}>
        <StatusBadge state="nan" />
      </I18nextProvider>,
    );
    expect(screen.getByText("無資料")).toBeInTheDocument();
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument();
  });
});
