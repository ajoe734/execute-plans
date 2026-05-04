import { useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import { TrendingDown, TrendingUp, Activity } from "lucide-react";

interface SectorTile {
  sector: string;
  changePct: number;
  marketCapB: number;
  topGainer: string;
  topLoser: string;
}

interface RegimeMetric {
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
  hint?: string;
}

const sectors: SectorTile[] = [
  { sector: "Tech", changePct: 1.42, marketCapB: 18420, topGainer: "TSM +1.84%", topLoser: "NVDA -0.62%" },
  { sector: "Financials", changePct: 0.91, marketCapB: 8210, topGainer: "JPM +2.13%", topLoser: "GS -0.28%" },
  { sector: "Energy", changePct: -1.18, marketCapB: 4120, topGainer: "CVX +0.21%", topLoser: "XOM -1.42%" },
  { sector: "Healthcare", changePct: 0.32, marketCapB: 6840, topGainer: "LLY +1.10%", topLoser: "PFE -0.84%" },
  { sector: "Consumer", changePct: -0.41, marketCapB: 5210, topGainer: "AMZN +0.42%", topLoser: "WMT -1.01%" },
  { sector: "Industrials", changePct: 0.62, marketCapB: 3960, topGainer: "CAT +1.35%", topLoser: "BA -0.92%" },
  { sector: "Rates", changePct: 0.85, marketCapB: 0, topGainer: "TLT +0.85%", topLoser: "—" },
  { sector: "Crypto", changePct: -2.31, marketCapB: 1840, topGainer: "ETH -1.20%", topLoser: "BTC -2.31%" },
];

const regime: RegimeMetric[] = [
  { label: "VIX", value: "14.2", trend: "down", hint: "Risk-on environment" },
  { label: "DXY", value: "104.6", trend: "up", hint: "USD strength persists" },
  { label: "10Y Yield", value: "4.18%", trend: "down" },
  { label: "Credit OAS", value: "84bp", trend: "flat" },
  { label: "Brent", value: "$78.4", trend: "down" },
  { label: "Gold", value: "$2,412", trend: "up" },
];

const movers = [
  { symbol: "TSM", changePct: 1.84, note: "Earnings drift day 3" },
  { symbol: "JPM", changePct: 2.13, note: "Yield curve steepening" },
  { symbol: "TLT", changePct: 0.85, note: "Rates bid" },
  { symbol: "XOM", changePct: -1.42, note: "OPEC softness" },
  { symbol: "BTCUSD", changePct: -2.31, note: "Funding flipped" },
];

const heatmapColor = (pct: number) => {
  if (pct >= 1) return "bg-status-success/30 border-status-success/40";
  if (pct >= 0.2) return "bg-status-success/15 border-status-success/25";
  if (pct > -0.2) return "bg-muted border-border";
  if (pct > -1) return "bg-status-failed/15 border-status-failed/25";
  return "bg-status-failed/30 border-status-failed/40";
};

export const Markets = () => {
  const t = useT();
  const [activeSector, setActiveSector] = useState<string | null>(null);

  const filteredMovers = useMemo(
    () => (activeSector ? movers.filter((m) => true) : movers),
    [activeSector]
  );

  return (
    <>
      <PageHeader
        title={t("nav.markets")}
        subtitle={t("agora.markets.subtitle")}
      />
      <PageBody>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{t("agora.markets.regime")}</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {regime.map((r) => (
              <div key={r.label} className="rounded-md border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.label}</div>
                <div className="text-mono text-lg font-semibold mt-1 flex items-center gap-1">
                  {r.value}
                  {r.trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-status-success" />}
                  {r.trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-status-failed" />}
                </div>
                {r.hint && <div className="text-[10px] text-muted-foreground mt-0.5">{r.hint}</div>}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("agora.markets.heatmap")}</div>
            {activeSector && (
              <button onClick={() => setActiveSector(null)} className="text-xs text-accent hover:underline">
                {t("agora.markets.clearFilter")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {sectors.map((s) => (
              <button
                key={s.sector}
                onClick={() => setActiveSector(s.sector === activeSector ? null : s.sector)}
                className={`text-left rounded-md border p-3 transition ${heatmapColor(s.changePct)} ${activeSector === s.sector ? "ring-2 ring-accent" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{s.sector}</span>
                  <span className={`text-mono text-xs ${s.changePct >= 0 ? "text-status-success" : "text-status-failed"}`}>
                    {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">▲ {s.topGainer}</div>
                <div className="text-[10px] text-muted-foreground">▼ {s.topLoser}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{t("agora.markets.topMovers")}</div>
          <ul className="divide-y divide-border">
            {filteredMovers.map((m) => (
              <li key={m.symbol} className="flex items-center gap-3 py-2">
                <Activity className="h-4 w-4 text-accent" />
                <span className="font-mono font-semibold text-sm w-24">{m.symbol}</span>
                <Badge variant="outline" className={`text-mono ${m.changePct >= 0 ? "text-status-success border-status-success/30" : "text-status-failed border-status-failed/30"}`}>
                  {m.changePct >= 0 ? "+" : ""}{m.changePct.toFixed(2)}%
                </Badge>
                <span className="text-xs text-muted-foreground flex-1 truncate">{m.note}</span>
              </li>
            ))}
          </ul>
        </Card>
      </PageBody>
    </>
  );
};
