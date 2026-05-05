import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  label: string;
  meta?: string;
  to?: string;
}

interface Props {
  title: string;
  hint?: string;
  items: Item[];
  emptyHint?: string;
  icon?: ReactNode;
  className?: string;
}

export const LinkedBlock = ({ title, hint, items, emptyHint, icon, className }: Props) => {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground mb-3">{hint}</p>}
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">{emptyHint ?? "—"}</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => {
            const inner = (
              <div className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{it.label}</div>
                  {it.meta && <div className="text-[11px] text-muted-foreground truncate">{it.meta}</div>}
                </div>
                {it.to && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
              </div>
            );
            return (
              <li key={it.id}>
                {it.to ? <Link to={it.to}>{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
