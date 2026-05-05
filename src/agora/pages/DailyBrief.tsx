import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import { RiskBadge } from "@/platform/components/RiskBadge";
import type { Strategy, Alert, ApprovalRequest } from "@/lib/bff/types";
import { TrendingUp, TrendingDown, ThumbsUp, ThumbsDown, Sparkles, Target, Inbox } from "lucide-react";
import { toast } from "sonner";
import { AGORA_KPI_SPECS, AGORA_KPI_THRESHOLDS } from "@/lib/v3/agoraKpi";

export const DailyBrief = () => {
  const t = useT();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  useEffect(() => {
    bff.strategies.list().then(setStrategies);
    bff.alerts.list().then(setAlerts);
    bff.approvals.list().then((a) => setPending(a.filter((x) => x.state === "pending")));
  }, []);

  const voices = [
    { who: "per_quant", line: t("daily.voice.quant") },
    { who: "per_risk", line: t("daily.voice.risk") },
    { who: "per_macro", line: t("daily.voice.macro") },
  ];
  const missions = [t("daily.mission.a"), t("daily.mission.b"), t("daily.mission.c")];

  return (
    <>
      <PageHeader title={t("daily.title")} subtitle={t("daily.subtitle", { date: new Date().toLocaleDateString() })} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 lg:col-span-2">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" />{t("daily.signals")}</h3>
            <ul className="divide-y divide-border">
              {strategies.slice(0, 4).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  {s.pnl30d >= 0 ? <TrendingUp className="h-5 w-5 text-status-success" /> : <TrendingDown className="h-5 w-5 text-status-failed" />}
                  <div className="flex-1">
                    <div className="font-medium text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground text-mono">{s.alpha} · sharpe {s.sharpe.toFixed(2)}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toast.success(t("daily.feedbackOk"))}><ThumbsUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => toast.success(t("daily.feedbackOk"))}><ThumbsDown className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">{t("daily.alerts")}</h3>
            <ul className="space-y-2">
              {alerts.length === 0 && <li className="text-xs text-muted-foreground">{t("empty.none")}</li>}
              {alerts.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <RiskBadge level={a.severity} />
                  <span className="flex-1">{a.title}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" />{t("daily.personaVoices")}</h3>
            <ul className="space-y-3">
              {voices.map((v) => (
                <li key={v.who} className="text-sm">
                  <Badge variant="outline" className="text-mono text-[10px] mr-2">{v.who}</Badge>
                  <span className="leading-relaxed">{v.line}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-accent" />{t("daily.todayMission")}</h3>
            <ul className="space-y-2 text-sm">
              {missions.map((m, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-mono text-xs text-muted-foreground">{i + 1}.</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Inbox className="h-4 w-4 text-status-warning" />{t("daily.pendingActions")}</h3>
            <ul className="space-y-2">
              {pending.length === 0 && <li className="text-xs text-muted-foreground">{t("empty.none")}</li>}
              {pending.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <RiskBadge level={p.riskLevel} />
                  <span className="flex-1 truncate">{p.subject}</span>
                  <span className="text-mono text-[10px] text-muted-foreground">{p.kind}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="font-semibold mb-3">{t("daily.noteTitle")}</h3>
          <Textarea placeholder={t("daily.notePlaceholder")} className="min-h-[120px]" />
          <div className="flex justify-end mt-3">
            <Button onClick={() => toast.success(t("daily.noteSaved"))}>{t("daily.noteSave")}</Button>
          </div>
        </Card>
      </PageBody>
    </>
  );
};
