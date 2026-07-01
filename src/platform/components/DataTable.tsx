import { ReactNode } from "react";
import { DataGridCard } from "@/platform/components/DataGridFrame";
import { DATATABLE_ROW_HEIGHT_PX } from "@/lib/v4/uiBudgets";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** Planner Response §E14 — three canonical densities. */
export type DataTableDensity = "comfortable" | "compact" | "dense";

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onRowClick,
  empty,
  density = "comfortable",
  minWidth,
  maxHeight,
  stickyFirstColumn = true,
  stickyLastColumn = false,
  ariaLabel,
}: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  empty?: string;
  density?: DataTableDensity;
  minWidth?: number | string;
  maxHeight?: number | string;
  stickyFirstColumn?: boolean;
  stickyLastColumn?: boolean;
  ariaLabel?: string;
}) {
  const rowH = DATATABLE_ROW_HEIGHT_PX[density];
  const cellPad = density === "dense" ? "py-1" : density === "compact" ? "py-1.5" : "py-2";
  const resolvedMinWidth = minWidth ?? Math.max(760, columns.length * 156);
  return (
    <DataGridCard
      ariaLabel={ariaLabel}
      maxHeight={maxHeight}
      minWidth={resolvedMinWidth}
      stickyFirstColumn={stickyFirstColumn}
      stickyLastColumn={stickyLastColumn}
    >
      <table className="caption-bottom text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr className="hover:bg-muted/40">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`h-12 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="border-b transition-colors">
              <td colSpan={columns.length} className="px-4 py-8 text-center align-middle text-muted-foreground">
                {empty ?? "—"}
              </td>
            </tr>
          ) : rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b transition-colors hover:bg-muted/50 ${onRowClick ? "cursor-pointer" : ""}`}
              onClick={() => onRowClick?.(row)}
              style={{ height: rowH }}
            >
              {columns.map((c) => (
                <td key={c.key} className={`px-4 align-middle ${cellPad} ${c.className ?? ""}`}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </DataGridCard>
  );
}
