import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import { RiskBadge } from "@/platform/components/RiskBadge";
import type { Strategy, Alert } from "@/lib/bff/types";
import { TrendingUp, TrendingDown, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";

export const DailyBrief = () => {
  const t = useT();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(() => { bff.strategies.list().then(setStrategies); bff.alerts.list().then(setAlerts); }, []);

  return (
    <>
      <PageHeader title={t("nav.daily")} subtitle={new Date().toLocaleDateString()} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 lg:col-span-2">
            <h3 className="font-semibold mb-3">Strategy signals today</h3>
            <ul className="divide-y divide-border">
              {strategies.slice(0, 4).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  {s.pnl30d >= 0 ? <TrendingUp className="h-5 w-5 text-status-success" /> : <TrendingDown className="h-5 w-5 text-status-failed" />}
                  <div className="flex-1">
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground text-mono">{s.alpha} · sharpe {s.sharpe.toFixed(2)}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toast.success("signal_feedback captured")}><ThumbsUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => toast.success("signal_feedback captured")}><ThumbsDown className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">Alerts to triage</h3>
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <RiskBadge level={a.severity} />
                  <span className="flex-1">{a.title}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">Quick research note</h3>
          <Textarea placeholder="What did you observe today? Capture freely — Pantheon will turn it into research_note." className="min-h-[120px]" />
          <div className="flex justify-end mt-3">
            <Button onClick={() => toast.success("research_note saved")}>Save note</Button>
          </div>
        </Card>
      </PageBody>
    </>
  );
};
