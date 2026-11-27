import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, type Column } from "./DataTable";

type Row = { id: string; a: string; b: string };
const rows: Row[] = [{ id: "1", a: "x", b: "y" }];

describe("DataTable column minWidth", () => {
  it("applies an explicit minWidth to the header so auto layout cannot squeeze it", () => {
    const columns: Column<Row>[] = [
      { key: "a", header: "A", minWidth: 120, cell: (r) => r.a },
      { key: "b", header: "B", cell: (r) => r.b },
    ];
    render(<DataTable rows={rows} columns={columns} />);
    expect(screen.getByText("A").style.minWidth).toBe("120px");
    expect(screen.getByText("B").style.minWidth).toBe("");
  });

  it("enforces at least 320px height in fillViewport mode and allows wheel scroll chaining past the table end", () => {
    const columns: Column<Row>[] = [
      { key: "a", header: "A", cell: (r) => r.a },
      { key: "b", header: "B", cell: (r) => r.b },
    ];
    const { container, rerender } = render(<DataTable rows={rows} columns={columns} fillViewport />);
    const fillCard = container.querySelector('[data-data-table-layout="fill"]') as HTMLElement;
    expect(fillCard).not.toBeNull();
    expect(fillCard.className).toContain("min-h-[384px]");
    expect(fillCard.className).toContain("flex-1");
    expect(fillCard.className).not.toContain("min-h-0");

    const scroller = container.querySelector('[data-management-table-scrollbar="native"]') as HTMLElement;
    expect(scroller).not.toBeNull();
    expect(scroller.className).toContain("min-h-[320px]");
    expect(scroller.className).not.toContain("overscroll-contain");

    rerender(<DataTable rows={rows} columns={columns} />);
    const docCard = container.querySelector('[data-data-table-layout="document"]') as HTMLElement;
    expect(docCard).not.toBeNull();
    expect(docCard.className).toContain("min-h-0");
    expect(docCard.className).not.toContain("min-h-[384px]");
  });
});
