import { type CSSProperties, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type GridLength = number | string;

function cssLength(value: GridLength): string {
  return typeof value === "number" ? `${value}px` : value;
}

export function DataGridScrollArea({
  children,
  className,
  minWidth = 960,
  maxHeight = "min(680px, calc(100vh - 16rem))",
  stickyHeader = true,
  stickyFirstColumn = true,
  stickyLastColumn = false,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: GridLength;
  maxHeight?: GridLength;
  stickyHeader?: boolean;
  stickyFirstColumn?: boolean;
  stickyLastColumn?: boolean;
  ariaLabel?: string;
}) {
  const style = {
    "--data-grid-min-width": cssLength(minWidth),
    "--data-grid-max-height": cssLength(maxHeight),
  } as CSSProperties;

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "relative max-h-[var(--data-grid-max-height)] overflow-auto overscroll-contain",
        "[&_table]:w-full [&_table]:min-w-[var(--data-grid-min-width)]",
        stickyHeader && [
          "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20",
          "[&_thead]:bg-card [&_th]:bg-card",
          "[&_thead_tr]:border-b [&_thead_tr]:border-border",
        ],
        stickyFirstColumn && [
          "[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-30",
          "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10",
          "[&_th:first-child]:bg-card [&_td:first-child]:bg-card",
          "[&_th:first-child]:border-r [&_td:first-child]:border-r",
          "[&_th:first-child]:border-border [&_td:first-child]:border-border",
        ],
        stickyLastColumn && [
          "[&_th:last-child]:sticky [&_th:last-child]:right-0 [&_th:last-child]:z-30",
          "[&_td:last-child]:sticky [&_td:last-child]:right-0 [&_td:last-child]:z-10",
          "[&_th:last-child]:bg-card [&_td:last-child]:bg-card",
          "[&_th:last-child]:border-l [&_td:last-child]:border-l",
          "[&_th:last-child]:border-border [&_td:last-child]:border-border",
        ],
        className,
      )}
      data-testid="data-grid-scroll-area"
      style={style}
    >
      {children}
    </div>
  );
}

export function DataGridCard({
  children,
  className,
  ...scrollProps
}: {
  children: ReactNode;
  className?: string;
} & Omit<Parameters<typeof DataGridScrollArea>[0], "children" | "className">) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <DataGridScrollArea {...scrollProps}>{children}</DataGridScrollArea>
    </Card>
  );
}
