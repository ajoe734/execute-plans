// AlphaFactoryBoard — Spec Part 3 §6.8.
// Discovered / Scaffolded / Replicated three-column kanban under Strategies.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { legacyBff as bff } from "@/lib/bff-v1";
import type { Strategy } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ArrowRight } from "lucide-react";

interface Card3 { id: string; name: string; risk: Strategy["risk"]; alpha?: string; sharpe?: number; note: string; }

const COLUMNS = ["discovered", "scaffolded", "replicated"] as const;

export const AlphaFactoryBoardPage = () => {
  const t = useT();
  const nav = useNavigate();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  useEffect(() => { bff.strategies.list().then(setStrategies); }, []);

  const buckets = useMemo(() => {
    // map a few strategies to "replicated"; mock the rest as discovered/scaffolded candidates
    const repl: Card3[] = strategies.slice(0, 4).map((s) => ({
      id: s.id, name: s.name, risk: s.risk, alpha: s.alpha, sharpe: s.sharpe, note: t("alphaFactory.replicated.note"),
    }));
    const scaffolded: Card3[] = [
      { id: "cand_011", name: "Short-vol carry (BTC)",  risk: "medium", alpha: "vol.carry", sharpe: 1.42, note: t("alphaFactory.scaffolded.note") },
      { id: "cand_012", name: "Cross-venue funding arb", risk: "low",    alpha: "fund.arb",  sharpe: 1.18, note: t("alphaFactory.scaffolded.note") },
      { id: "cand_013", name: "Sector rotation (US tech)", risk: "high",  alpha: "rot.us",    sharpe: 0.88, note: t("alphaFactory.scaffolded.note") },
    ];
    const discovered: Card3[] = [
      { id: "disc_021", name: "Liquidity-shock divergence", risk: "low",    note: t("alphaFactory.discovered.note") },
      { id: "disc_022", name: "Macro surprise momentum",    risk: "medium", note: t("alphaFactory.discovered.note") },
      { id: "disc_023", name: "Stablecoin flow imbalance",  risk: "medium", note: t("alphaFactory.discovered.note") },
      { id: "disc_024", name: "Options skew reversion",     risk: "low",    note: t("alphaFactory.discovered.note") },
      { id: "disc_025", name: "On-chain whale accumulation", risk: "high",  note: t("alphaFactory.discovered.note") },
    ];
    return { discovered, scaffolded, replicated: repl } as Record<typeof COLUMNS[number], Card3[]>;
  }, [strategies, t]);

  return (
    <>
      <PageHeader title={t("nav.alphaFactory")} subtitle={t("alphaFactory.subtitle")} actions={
        <Button size="sm" variant="outline" onClick={() => nav("/management/strategies")}>{t("alphaFactory.openList")}</Button>
      }/>
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {COLUMNS.map((col) => (
            <div key={col} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold uppercase tracking-wider">{t(`alphaFactory.col.${col}`)}</div>
                <Badge variant="outline">{buckets[col].length}</Badge>
              </div>
              <div className="space-y-2">
                {buckets[col].map((c) => (
                  <Card key={c.id} className="p-3 hover:border-accent transition cursor-pointer" onClick={() => col === "replicated" && nav(`/management/strategies/${c.id}`)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground text-mono mt-0.5">{c.id}{c.alpha ? ` · ${c.alpha}` : ""}</div>
                      </div>
                      <RiskBadge level={c.risk} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{c.note}</div>
                    {c.sharpe !== undefined && (
                      <div className="mt-2 flex items-center gap-3 text-xs text-mono">
                        <span>{t("table.sharpe")} <strong>{c.sharpe.toFixed(2)}</strong></span>
                      </div>
                    )}
                    {col !== "replicated" && (
                      <div className="mt-3 flex justify-end">
                        <Button size="sm" variant="ghost" className="h-7">
                          {col === "discovered" ? t("alphaFactory.scaffold") : t("alphaFactory.replicate")} <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageBody>
    </>
  );
};
