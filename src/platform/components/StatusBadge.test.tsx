import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import type { RiskLevel } from "@/lib/bff-v1";
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
});
