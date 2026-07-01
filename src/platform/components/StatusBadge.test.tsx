import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { StatusBadge } from "@/platform/components/StatusBadge";

describe("StatusBadge", () => {
  const originalLanguage = i18n.language;
  beforeAll(() => void i18n.changeLanguage("en-US"));
  afterAll(() => void i18n.changeLanguage(originalLanguage));
  afterEach(() => cleanup());

  it("renders the translated label for a known state", () => {
    render(<StatusBadge state="deployed" />);
    expect(screen.getByText("Deployed")).toBeInTheDocument();
  });

  it("never renders the literal i18n key when state is missing (2026-07-01 re-audit)", () => {
    render(<StatusBadge state={undefined} />);
    expect(screen.queryByText("status.undefined")).not.toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("falls back to an honest placeholder for an empty string state", () => {
    render(<StatusBadge state="" />);
    expect(screen.queryByText("status.")).not.toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});
