import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { DetailAliasRedirect } from "@/App";

// 2026-07-01 re-audit — old detail aliases (capital-pools/:id,
// ranking-formulas/:id, rebalances/:id, research/:id) used to mount the
// canonical detail component a second time instead of redirecting. Verify
// the shared redirect helper lands on the canonical path with the id intact.
describe("DetailAliasRedirect", () => {
  afterEach(() => cleanup());

  it("redirects a capital-pools/:id alias to the canonical capital/:id detail route", () => {
    render(
      <MemoryRouter initialEntries={["/capital-pools/pool-rescue-0260513-06627c91"]}>
        <Routes>
          <Route path="/capital-pools/:id" element={<DetailAliasRedirect canonicalBase="/management/capital" />} />
          <Route path="/management/capital/:id" element={<div>canonical capital detail</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("canonical capital detail")).toBeInTheDocument();
  });

  it("redirects a research/:id alias to the canonical experiments/:id detail route", () => {
    render(
      <MemoryRouter initialEntries={["/research/exp-mgmt-qlib-006"]}>
        <Routes>
          <Route path="/research/:id" element={<DetailAliasRedirect canonicalBase="/management/experiments" />} />
          <Route path="/management/experiments/:id" element={<div>canonical experiment detail</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("canonical experiment detail")).toBeInTheDocument();
  });
});
