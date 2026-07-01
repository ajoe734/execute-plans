import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/i18n";
import { EntityHeader } from "@/platform/components/EntityHeader";
import type { BaseObject } from "@/lib/bff/types";

const renderHeader = (object: Pick<BaseObject, "id" | "name" | "owner" | "updatedAt" | "state" | "risk" | "labelKey">) =>
  render(
    <MemoryRouter>
      <EntityHeader object={object} />
    </MemoryRouter>,
  );

describe("EntityHeader", () => {
  const originalLanguage = i18n.language;
  beforeAll(() => void i18n.changeLanguage("en-US"));
  afterAll(() => void i18n.changeLanguage(originalLanguage));
  afterEach(() => cleanup());

  it("falls back to the entity id when name is blank (2026-07-01 re-audit blank h1)", () => {
    renderHeader({
      id: "exp-mgmt-qlib-006",
      name: undefined as unknown as string,
      owner: "capital",
      updatedAt: "2026-06-01T00:00:00.000Z",
      state: "review",
      risk: "low",
    });
    expect(screen.getByRole("heading", { name: "exp-mgmt-qlib-006" })).toBeInTheDocument();
  });

  it("renders an explicit placeholder instead of a blank owner", () => {
    renderHeader({
      id: "plan-rescue-0260513-06627c91",
      name: "Rescue Plan",
      owner: undefined as unknown as string,
      updatedAt: "2026-06-01T00:00:00.000Z",
      state: "review",
      risk: "low",
    });
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });
});
