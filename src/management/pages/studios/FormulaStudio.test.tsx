import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FormulaStudio } from "./FormulaStudio";
import { bff } from "@/lib/bff-v1";

vi.mock("@/lib/bff-v1", () => ({
  bff: {
    jobs: { list: vi.fn().mockResolvedValue([]) },
    rankingFormulas: { list: vi.fn().mockResolvedValue([]) },
  },
}));

describe("FormulaStudio Empty State", () => {
  it("renders zero-formula empty state when rankingFormulas.list returns empty array", async () => {
    vi.mocked(bff.rankingFormulas.list).mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <FormulaStudio />
      </MemoryRouter>
    );

    const emptyTitle = await screen.findByText("No ranking formulas found");
    expect(emptyTitle).toBeInTheDocument();
  });
});
