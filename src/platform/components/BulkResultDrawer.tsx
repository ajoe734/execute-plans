// Planner Response §C4 / E8 (2026-05-07) — Standard BulkResultDrawer.
// Renders a BulkActionResponse<T> with summary + per-row pass/fail.

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { BulkActionResponse } from "@/lib/bff-v1/dto";

export interface BulkResultDrawerProps<T = unknown> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  response?: BulkActionResponse<T> | null;
}

export function BulkResultDrawer<T>({ open, onOpenChange, title = "Bulk action result", response }: BulkResultDrawerProps<T>) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[460px] sm:max-w-[460px] p-0">
        <ScrollArea className="h-full">
          <div className="p-5 space-y-4">
            <SheetHeader className="space-y-1.5 text-left">
              <SheetTitle className="text-base">{title}</SheetTitle>
              {response && (
                <SheetDescription className="text-xs">
                  {response.summary.succeeded} succeeded · {response.summary.failed} failed · {response.summary.requested} total
                  {response.partial && <span className="text-mono ml-2">(partial)</span>}
                </SheetDescription>
              )}
            </SheetHeader>

            <Separator />

            {!response ? (
              <p className="text-sm text-muted-foreground">No result yet.</p>
            ) : (
              <ul className="space-y-2">
                {response.results.map((row) => (
                  <li key={row.id} className="text-xs flex items-start gap-2 border-b border-border pb-1.5">
                    <Badge variant={row.ok ? "secondary" : "destructive"} className="text-mono text-[10px] shrink-0">
                      {row.ok ? "OK" : "FAIL"}
                    </Badge>
                    <span className="text-mono shrink-0 text-muted-foreground">{row.id}</span>
                    {row.error && (
                      <span className="text-destructive">
                        {row.error.code}
                        {row.error.message ? `: ${row.error.message}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
