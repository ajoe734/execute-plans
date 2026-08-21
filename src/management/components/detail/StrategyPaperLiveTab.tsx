import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/platform/hooks";
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, ReferenceArea, Legend,
} from "recharts";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface Point {
  day: string;
  paper: number;
  live: number;
  delta: number; // bps
}

const BAND_BPS = 150;

export const StrategyPaperLiveTab = ({ strategyId }: { strategyId: string }) => {
  const t = useT();
  const data: Point[] = useMemo(() => [], [strategyId]);

  const breaches = useMemo(() => {
    const events: { openedAt: string; closedAt?: string; peakBps: number }[] = [];
    let cur: { openedAt: string; peakBps: number } | null = null;
    data.forEach((p) => {
      const out = Math.abs(p.delta) > BAND_BPS;
      if (out) {
        if (!cur) cur = { openedAt: p.day, peakBps: p.delta };
        else if (Math.abs(p.delta) > Math.abs(cur.peakBps)) cur.peakBps = p.delta;
      } else if (cur) {
        events.push({ ...cur, closedAt: p.day });
        cur = null;
      }
    });
    if (cur) events.push(cur);
    return events;
  }, [data]);

  const lastDelta = data[data.length - 1]?.delta ?? 0;
  const live = data[data.length - 1]?.live ?? 0;
  const paper = data[data.length - 1]?.paper ?? 0;

  return (
    <>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-sm">{t("phase21.paperLive.title")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("phase21.paperLive.hint")}</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="text-mono"><span className="text-muted-foreground">{t("phase21.paperLive.paper")}:</span> {paper.toFixed(2)}%</div>
            <div className="text-mono"><span className="text-muted-foreground">{t("phase21.paperLive.live")}:</span> {live.toFixed(2)}%</div>
            <Badge variant="outline" className={`text-mono ${Math.abs(lastDelta) > BAND_BPS ? "border-status-failed/40 text-status-failed" : "border-border"}`}>
              Δ {lastDelta > 0 ? "+" : ""}{lastDelta} bps
            </Badge>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="h-72 mt-3 flex items-center justify-center border border-dashed border-border rounded-md text-xs text-muted-foreground">
            {t("common.awaitingData", { defaultValue: "No paper/live telemetry metrics available" })}
          </div>
        ) : (
          <div className="h-72 mt-3">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis yAxisId="pnl" stroke="hsl(var(--muted-foreground))" fontSize={10} unit="%" />
                <YAxis yAxisId="delta" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={10} unit="bps" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceArea yAxisId="delta" y1={-BAND_BPS} y2={BAND_BPS} fill="hsl(var(--accent))" fillOpacity={0.05} />
                <ReferenceLine yAxisId="delta" y={BAND_BPS} stroke="hsl(var(--status-warning))" strokeDasharray="3 3" label={{ value: t("phase21.paperLive.band"), fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <ReferenceLine yAxisId="delta" y={-BAND_BPS} stroke="hsl(var(--status-warning))" strokeDasharray="3 3" />
                <Line yAxisId="pnl" type="monotone" dataKey="paper" stroke="hsl(var(--accent))" strokeWidth={1.5} dot={false} name={t("phase21.paperLive.paper")} />
                <Line yAxisId="pnl" type="monotone" dataKey="live" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name={t("phase21.paperLive.live")} />
                <Area yAxisId="delta" type="monotone" dataKey="delta" stroke="hsl(var(--status-failed))" fill="hsl(var(--status-failed))" fillOpacity={0.15} name={t("phase21.paperLive.delta")} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">{t("phase21.paperLive.alerts")}</h4>
          <Badge variant="outline" className="text-[10px]">{breaches.length}</Badge>
        </div>
        {breaches.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-status-success" />
            {t("phase21.paperLive.noBreach")}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {breaches.map((b, i) => (
              <div key={i} className="py-2 flex items-center gap-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-status-warning shrink-0" />
                <span className="text-mono text-xs text-muted-foreground">{b.openedAt} → {b.closedAt ?? "ongoing"}</span>
                <span className="ml-auto text-mono">peak Δ {b.peakBps > 0 ? "+" : ""}{b.peakBps} bps</span>
                <Badge variant="outline" className={`text-[10px] ${b.closedAt ? "border-status-success/40 text-status-success" : "border-status-failed/40 text-status-failed"}`}>
                  {b.closedAt ? t("phase21.paperLive.breachResolved") : t("phase21.paperLive.breachOpened")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
};
