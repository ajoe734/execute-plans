import { useEffect, useState } from "react";
import { bff } from "@/lib/bff/client";
import type { PerformanceSeries } from "@/lib/bff/types";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useT } from "@/platform/hooks";

type Granularity = "day" | "week" | "month";

const Chart = ({ series, label }: { series: PerformanceSeries | undefined; label: string }) => {
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
            <Line type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="benchmark" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export const StrategyPerformanceTab = ({ strategyId }: { strategyId: string }) => {
  const t = useT();
  const [series, setSeries] = useState<Record<Granularity, PerformanceSeries | undefined>>({ day: undefined, week: undefined, month: undefined });
  useEffect(() => {
    Promise.all([
      bff.performanceSeries.forStrategy(strategyId, "day"),
      bff.performanceSeries.forStrategy(strategyId, "week"),
      bff.performanceSeries.forStrategy(strategyId, "month"),
    ]).then(([d, w, m]) => setSeries({ day: d, week: w, month: m }));
  }, [strategyId]);

  return (
    <Tabs defaultValue="day">
      <TabsList>
        <TabsTrigger value="day">{t("phase13.strategy.perf.day")}</TabsTrigger>
        <TabsTrigger value="week">{t("phase13.strategy.perf.week")}</TabsTrigger>
        <TabsTrigger value="month">{t("phase13.strategy.perf.month")}</TabsTrigger>
      </TabsList>
      <TabsContent value="day" className="mt-3"><Chart series={series.day} label={`${t("phase13.strategy.perf.day")} · ${t("phase13.strategy.perf.vsBenchmark")}`} /></TabsContent>
      <TabsContent value="week" className="mt-3"><Chart series={series.week} label={`${t("phase13.strategy.perf.week")} · ${t("phase13.strategy.perf.vsBenchmark")}`} /></TabsContent>
      <TabsContent value="month" className="mt-3"><Chart series={series.month} label={`${t("phase13.strategy.perf.month")} · ${t("phase13.strategy.perf.vsBenchmark")}`} /></TabsContent>
    </Tabs>
  );
};
