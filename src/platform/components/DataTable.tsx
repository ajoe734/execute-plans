import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DATATABLE_ROW_HEIGHT_PX } from "@/lib/v4/uiBudgets";
import { PinnedHorizontalScroll } from "@/platform/components/PinnedHorizontalScroll";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** Planner Response §E14 — three canonical densities. */
export type DataTableDensity = "comfortable" | "compact" | "dense";

export function DataTable<T extends { id: string }>({
  rows, columns, onRowClick, empty, density = "comfortable",
}: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  empty?: string;
  density?: DataTableDensity;
}) {
  const rowH = DATATABLE_ROW_HEIGHT_PX[density];
  const cellPad = density === "dense" ? "py-1" : density === "compact" ? "py-1.5" : "py-2";
  const minScrollWidth = Math.max(720, columns.length * 160);
  return (
    <Card className="flex min-h-0 overflow-hidden">
      <PinnedHorizontalScroll
        minScrollWidth={minScrollWidth}
        showPinnedScrollbar={false}
        className="min-h-0 flex-1"
        contentClassName="pb-4"
        viewportClassName="max-h-[calc(100dvh-10rem)] overflow-auto pb-4"
      >
        <Table className="w-full" style={{ minWidth: minScrollWidth }}>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map((c) => (
                <TableHead key={c.key} className={"text-xs uppercase tracking-wider " + (c.className ?? "")}>{c.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">{empty ?? "—"}</TableCell></TableRow>
            ) : rows.map((row) => (
              <TableRow
                key={row.id}
                className={onRowClick ? "cursor-pointer" : ""}
                onClick={() => onRowClick?.(row)}
                style={{ height: rowH }}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={cellPad + " " + (c.className ?? "")}>{c.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PinnedHorizontalScroll>
    </Card>
  );
}
