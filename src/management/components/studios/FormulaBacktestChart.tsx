// Phase 12 — mock backtest curve rendered with inline SVG (no chart lib dep).
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/platform/components/StatCard";
import { useT } from "@/platform/hooks";

function seedFromString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FormulaBacktestChart = ({ expression, label }: { expression: string; label?: string }) => {
  const t = useT();
  const { points, sharpe, dd, finalReturn } = useMemo(() => {
    const rnd = seedFromString(expression || "—");
    const n = 60;
    const pts: number[] = [];
    let v = 1;
    let peak = 1;
    let maxDd = 0;
    const rets: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = (rnd() - 0.45) * 0.04;
      rets.push(r);
      v *= 1 + r;
      peak = Math.max(peak, v);
      maxDd = Math.min(maxDd, v / peak - 1);
      pts.push(v);
    }
    const mean = rets.reduce((a, b) => a + b, 0) / n;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance) || 1;
    return { points: pts, sharpe: (mean / std) * Math.sqrt(252), dd: maxDd, finalReturn: v - 1 };
  }, [expression]);

  const min = Math.min(...points);
  const max = Math.max(...points);
  const w = 480;
  const h = 120;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / Math.max(0.0001, max - min)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{label ?? t("studios.backtest")}</div>
        <div className="text-mono text-[10px] text-muted-foreground truncate max-w-[60%]">{expression || "—"}</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Sharpe" value={sharpe.toFixed(2)} tone={sharpe > 1 ? "success" : "warning"} />
        <StatCard label="Drawdown" value={`${(dd * 100).toFixed(1)}%`} tone="danger" />
        <StatCard label="Return" value={`${(finalReturn * 100).toFixed(1)}%`} tone={finalReturn > 0 ? "success" : "danger"} />
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
        <path d={path} fill="none" className="stroke-accent" strokeWidth={1.5} />
      </svg>
    </Card>
  );
};
