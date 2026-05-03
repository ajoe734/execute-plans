import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({ rows, columns, onRowClick, empty }: { rows: T[]; columns: Column<T>[]; onRowClick?: (row: T) => void; empty?: string }) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {columns.map((c) => (
              <TableHead key={c.key} className={`text-xs uppercase tracking-wider ${c.className ?? ""}`}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">{empty ?? "—"}</TableCell></TableRow>
          ) : rows.map((row) => (
            <TableRow key={row.id} className={onRowClick ? "cursor-pointer" : ""} onClick={() => onRowClick?.(row)}>
              {columns.map((c) => (
                <TableCell key={c.key} className={c.className}>{c.cell(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
