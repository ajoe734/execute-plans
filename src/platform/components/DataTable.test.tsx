import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./DataTable";

describe("DataTable", () => {
  it("renders large row sets inside a bounded sticky data-grid frame", () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      id: `row-${index}`,
      name: `Persona ${index}`,
      status: index % 2 ? "watch" : "ok",
      pnl: index / 100,
      updated: `2026-07-${String((index % 20) + 1).padStart(2, "0")}`,
    }));

    const { container } = render(
      <DataTable
        ariaLabel="Persona rows"
        columns={[
          { key: "name", header: "Name", cell: (row) => row.name },
          { key: "status", header: "Status", cell: (row) => row.status },
          { key: "pnl", header: "PnL", cell: (row) => row.pnl.toFixed(2) },
          { key: "updated", header: "Updated", cell: (row) => row.updated },
          { key: "action", header: "Action", cell: () => "Open" },
        ]}
        rows={rows}
        stickyLastColumn
      />,
    );

    const frame = screen.getByTestId("data-grid-scroll-area");
    expect(frame).toHaveStyle({
      "--data-grid-min-width": "780px",
      "--data-grid-max-height": "min(680px, calc(100vh - 16rem))",
    });
    expect(frame.className).toContain("max-h-[var(--data-grid-max-height)]");
    expect(frame.className).toContain("[&_thead]:sticky");
    expect(frame.className).toContain("[&_td:first-child]:sticky");
    expect(frame.className).toContain("[&_td:last-child]:sticky");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(24);
  });
});
