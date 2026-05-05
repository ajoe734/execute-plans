import { useEffect, useState } from "react";
import { bff } from "@/lib/bff/client";
import type { PerformanceSeries } from "@/lib/bff/types";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useT } from "@/platform/hooks";

type Granularity = "day" | "week" | "month";
type Benchmark = "BTC" | "ETH" | "SP500" | "none";

const Chart = ({ series, label, showBenchmark, benchmarkLabel }: { series: PerformanceSeries | undefined; label: string; showBenchmark: boolean; benchmarkLabel: string }) => {
  if (!series) return <Card className="p-8 text-center text-sm text-muted-foreground">—</Card>;
  const data = series.points.map((p) => ({
    ts: new Date(p.ts).toLocaleDateString(),
    pnl: +(p.pnl * 100).toFixed(2),
    benchmark: +(p.benchmark * 100).toFixed(2),
  }));
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="ts" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" unit="%" />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="pnl" name="Strategy PnL" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            {showBenchmark && (
              <Line type="monotone" dataKey="benchmark" name={benchmarkLabel} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export const StrategyPerformanceTab = ({ strategyId }: { strategyId: string }) => {
  const t = useT();
  const [series, setSeries] = useState<Record<Granularity, PerformanceSeries | undefined>>({ day: undefined, week: undefined, month: undefined });
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [benchmark, setBenchmark] = useState<Benchmark>("BTC");

  useEffect(() => {
    Promise.all([
      bff.performanceSeries.forStrategy(strategyId, "day"),
      bff.performanceSeries.forStrategy(strategyId, "week"),
      bff.performanceSeries.forStrategy(strategyId, "month"),
    ]).then(([d, w, m]) => setSeries({ day: d, week: w, month: m }));
  }, [strategyId]);

  const benchmarkLabel = benchmark === "none" ? "—" : `${benchmark} ${t("phase13.strategy.perf.vsBenchmark")}`;

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch id="bench-toggle" checked={showBenchmark} onCheckedChange={setShowBenchmark} />
          <Label htmlFor="bench-toggle" className="text-xs">{t("phase13.strategy.perf.showBenchmark")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{t("phase13.strategy.perf.benchmark")}</Label>
          <Select value={benchmark} onValueChange={(v) => setBenchmark(v as Benchmark)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BTC">BTC-PERP</SelectItem>
              <SelectItem value="ETH">ETH-PERP</SelectItem>
              <SelectItem value="SP500">S&amp;P 500</SelectItem>
              <SelectItem value="none">{t("common.none")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>
      <Tabs defaultValue="day">
        <TabsList>
          <TabsTrigger value="day">{t("phase13.strategy.perf.day")}</TabsTrigger>
          <TabsTrigger value="week">{t("phase13.strategy.perf.week")}</TabsTrigger>
          <TabsTrigger value="month">{t("phase13.strategy.perf.month")}</TabsTrigger>
        </TabsList>
        <TabsContent value="day" className="mt-3"><Chart series={series.day} label={`${t("phase13.strategy.perf.day")} · ${benchmarkLabel}`} showBenchmark={showBenchmark && benchmark !== "none"} benchmarkLabel={benchmarkLabel} /></TabsContent>
        <TabsContent value="week" className="mt-3"><Chart series={series.week} label={`${t("phase13.strategy.perf.week")} · ${benchmarkLabel}`} showBenchmark={showBenchmark && benchmark !== "none"} benchmarkLabel={benchmarkLabel} /></TabsContent>
        <TabsContent value="month" className="mt-3"><Chart series={series.month} label={`${t("phase13.strategy.perf.month")} · ${benchmarkLabel}`} showBenchmark={showBenchmark && benchmark !== "none"} benchmarkLabel={benchmarkLabel} /></TabsContent>
      </Tabs>
    </div>
  );
};
