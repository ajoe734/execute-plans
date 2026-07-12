// CapitalPool ↔ Strategy binding matrix (read-only stub for Phase 10).
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate } from "react-router-dom";
import type { Strategy } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

export const BindingsMatrix = ({ strategies, poolId }: { strategies: Strategy[]; poolId: string }) => {
  const t = useT();
  const nav = useNavigate();
  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm font-semibold">{t("capitalPool.bindings.title")}</div>
      <div className="text-xs text-muted-foreground mb-2">
        {t("capitalPool.bindings.hint", { pool: poolId })}
      </div>
      {strategies.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">{t("empty.none")}</div>}
      <div className="space-y-1.5">
        {strategies.map((s) => (
          <div key={s.id} className="w-full flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/40">
            <button
              onClick={() => nav(`/management/strategies/${s.id}`)}
              className="flex-1 flex items-center gap-3 text-left"
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-mono text-[10px] text-muted-foreground">{s.id} · {s.alpha}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline" className="text-[10px] uppercase">{s.state}</Badge>
                <span className="text-mono text-[10px] text-muted-foreground">{s.personaIds.length} personas</span>
              </div>
            </button>
            <Link
              aria-label={`${s.id} trade journeys`}
              to={`/management/trade-journeys?strategy_id=${encodeURIComponent(s.id)}`}
              className="shrink-0 text-[11px] text-primary hover:underline"
            >
              {t("nav.tradeJourneys", { defaultValue: "Trade Journeys" })}
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
};
