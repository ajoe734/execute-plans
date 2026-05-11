// AlphaFactoryBoard — Spec Part 3 §6.8.
// Discovered / Scaffolded / Replicated three-column kanban under Strategies.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { lists, useLiveListV1, useLiveStatus, type ListEnvelope } from "@/lib/bff-v1";
import type { Strategy } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ArrowRight } from "lucide-react";
import { ALPHA_FACTORY_COLUMNS, buildAlphaFactoryBuckets } from "./alphaFactoryData";

export const AlphaFactoryBoardPage = () => {
  const t = useT();
  const nav = useNavigate();
  const live = useLiveStatus();
  const { items: strategies, loading } = useLiveListV1<Strategy>(
    lists.strategies as () => Promise<ListEnvelope<Strategy>>,
    ["Strategy"],
  );
  const isConfiguredMock = live.mode === "mock";
  const isFallbackData = live.mode === "live" && live.effective === "mock";
  const sourceKey = live.mode === "mock" ? "mock" : live.effective === "mock" ? "fallback" : "live";

  const buckets = useMemo(() => {
    return buildAlphaFactoryBuckets(strategies, {
      includeMockFixtures: isConfiguredMock,
      includeReplicated: !isFallbackData,
      t,
    });
  }, [isConfiguredMock, isFallbackData, strategies, t]);

  return (
    <>
      <PageHeader title={t("nav.alphaFactory")} subtitle={t("alphaFactory.subtitle")} actions={
        <Button size="sm" variant="outline" onClick={() => nav("/management/strategies")}>{t("alphaFactory.openList")}</Button>
      }/>
      <PageBody>
        <div className="mb-4 rounded-md border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
          <span className="font-semibold text-mono uppercase tracking-wider">{t(`alphaFactory.source.${sourceKey}`)}</span>
          <span className="ml-2 text-foreground/70">{t("alphaFactory.source.explain")}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {ALPHA_FACTORY_COLUMNS.map((col) => (
            <div key={col} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold uppercase tracking-wider">{t(`alphaFactory.col.${col}`)}</div>
                <Badge variant="outline">{buckets[col].length}</Badge>
              </div>
              <div className="space-y-2">
                {loading ? (
                  <Card className="p-3 text-xs text-muted-foreground">{t("ui.loading")}</Card>
                ) : buckets[col].length === 0 ? (
                  <Card className="p-3 text-xs text-muted-foreground">{t(`alphaFactory.empty.${col}`)}</Card>
                ) : buckets[col].map((c) => (
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
