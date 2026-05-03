import { useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, TrendingUp, TrendingDown, Activity, Eye } from "lucide-react";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";

interface Ticker {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  vol: string;
  signal?: "bullish" | "bearish" | "neutral";
  note?: string;
}

const seed: Ticker[] = [
  { symbol: "TSM", name: "Taiwan Semi", sector: "Tech", price: 218.42, changePct: 1.84, vol: "12.4M", signal: "bullish", note: "Earnings drift continuing day 3." },
  { symbol: "NVDA", name: "NVIDIA", sector: "Tech", price: 942.10, changePct: -0.62, vol: "48.1M", signal: "neutral" },
  { symbol: "AAPL", name: "Apple", sector: "Tech", price: 232.55, changePct: 0.24, vol: "33.2M", signal: "neutral" },
  { symbol: "JPM", name: "JPMorgan", sector: "Financials", price: 218.78, changePct: 2.13, vol: "8.6M", signal: "bullish", note: "Yield curve steepening." },
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energy", price: 116.20, changePct: -1.42, vol: "11.0M", signal: "bearish", note: "Oil softness post-OPEC." },
  { symbol: "TLT", name: "20Y Treasury ETF", sector: "Rates", price: 92.10, changePct: 0.85, vol: "5.2M", signal: "bullish" },
  { symbol: "BTCUSD", name: "Bitcoin", sector: "Crypto", price: 71_240, changePct: -2.31, vol: "—", signal: "bearish", note: "Funding rates flipped negative." },
];

export const MarketWatchlist = () => {
  const t = useT();
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Ticker | null>(seed[0]);

  const filtered = useMemo(
    () => seed.filter((s) => !q || s.symbol.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase())),
    [q]
  );

  const sigCls = (s?: string) =>
    s === "bullish" ? "bg-status-success/15 text-status-success border-status-success/30"
    : s === "bearish" ? "bg-status-failed/15 text-status-failed border-status-failed/30"
    : "bg-muted text-muted-foreground border-border";

  return (
    <>
      <PageHeader
        title={t("nav.market")}
        subtitle="Watchlist, regime tags, and qualitative observations. Notes flow into research_note."
        actions={<Button size="sm"><Plus className="h-4 w-4 mr-1" />Add ticker</Button>}
      />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-3 lg:col-span-1">
            <div className="relative mb-3">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search watchlist…" className="pl-8 h-9" />
            </div>
            <ul className="space-y-1 max-h-[520px] overflow-y-auto">
              {filtered.map((tk) => (
                <li key={tk.symbol}>
                  <button
                    onClick={() => setActive(tk)}
                    className={`w-full text-left px-2.5 py-2 rounded-md transition flex items-center gap-3 ${active?.symbol === tk.symbol ? "bg-accent/15 ring-1 ring-accent/30" : "hover:bg-muted"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm">{tk.symbol}</span>
                        <Badge variant="outline" className={`text-[10px] uppercase ${sigCls(tk.signal)}`}>{tk.signal ?? "—"}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{tk.name} · {tk.sector}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-mono text-xs">{tk.price.toLocaleString()}</div>
                      <div className={`text-mono text-xs ${tk.changePct >= 0 ? "text-status-success" : "text-status-failed"}`}>
                        {tk.changePct >= 0 ? "+" : ""}{tk.changePct.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 lg:col-span-2">
            {active ? (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-mono font-semibold">{active.symbol}</h2>
                      <Badge variant="outline" className={`uppercase text-xs ${sigCls(active.signal)}`}>{active.signal ?? "neutral"}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{active.name} · {active.sector}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl text-mono">{active.price.toLocaleString()}</div>
                    <div className={`flex items-center justify-end gap-1 text-sm text-mono ${active.changePct >= 0 ? "text-status-success" : "text-status-failed"}`}>
                      {active.changePct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {active.changePct >= 0 ? "+" : ""}{active.changePct.toFixed(2)}%
                    </div>
                  </div>
                </div>

                <div className="h-32 rounded-md bg-gradient-to-b from-accent/10 to-transparent border border-border flex items-end gap-px px-1 pb-1 mb-4 overflow-hidden">
                  {Array.from({ length: 80 }).map((_, i) => {
                    const h = 20 + Math.abs(Math.sin(i * 0.4 + active.symbol.length) * 60) + (i / 80) * (active.changePct >= 0 ? 20 : -20);
                    return <div key={i} className={`flex-1 ${active.changePct >= 0 ? "bg-status-success/60" : "bg-status-failed/60"}`} style={{ height: `${Math.max(8, Math.min(100, h))}%` }} />;
                  })}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Volume</div>
                    <div className="text-mono text-sm">{active.vol}</div>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sector</div>
                    <div className="text-sm">{active.sector}</div>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Regime</div>
                    <div className="text-sm">Risk-on</div>
                  </div>
                </div>

                {active.note && (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm flex gap-2 mb-4">
                    <Activity className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                    <span>{active.note}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button size="sm" onClick={() => toast.success("Saved to research_note")}>Capture observation</Button>
                  <Button size="sm" variant="outline" onClick={() => toast.success("Pushed to Ask Personas")}><Eye className="h-4 w-4 mr-1" />Ask Personas</Button>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-12 text-sm">Select a ticker.</div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
};
