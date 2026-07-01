import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { RiskBadge } from "@/platform/components/RiskBadge";

describe("RiskBadge", () => {
  const originalLanguage = i18n.language;
  beforeAll(() => void i18n.changeLanguage("en-US"));
  afterAll(() => void i18n.changeLanguage(originalLanguage));
  afterEach(() => cleanup());

  it("renders the translated label for a known risk level", () => {
    render(<RiskBadge level="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("never renders the literal i18n key when risk is missing (2026-07-01 re-audit)", () => {
    render(<RiskBadge level={undefined} />);
    expect(screen.queryByText("risk.undefined")).not.toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});
