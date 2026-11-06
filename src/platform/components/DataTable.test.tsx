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
});
