import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, AlertTriangle, MessageSquare } from "lucide-react";
import { bff } from "@/lib/bff/client";
import type { Alert } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { toast } from "sonner";

export const AlertTriage = () => {
  const t = useT();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [active, setActive] = useState<Alert | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    bff.alerts.list().then((a) => {
      setAlerts(a);
      setActive(a.find((x) => !x.acknowledged) ?? a[0] ?? null);
    });
  }, []);

  const ack = (id: string) => {
    setAlerts((rs) => rs.map((r) => r.id === id ? { ...r, acknowledged: true } : r));
    setActive((a) => a && a.id === id ? { ...a, acknowledged: true } : a);
    toast.success("Acknowledged");
  };

  const open = alerts.filter((a) => !a.acknowledged);
  const ackd = alerts.filter((a) => a.acknowledged);

  return (
    <>
      <PageHeader title={t("nav.triage")} subtitle="Operator triage view. Acknowledge, comment, or escalate to incident." />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Bell className="h-4 w-4 text-status-warning" />
                <span className="text-xs uppercase tracking-wider font-semibold">Open ({open.length})</span>
              </div>
              <div className="space-y-2">
                {open.map((a) => (
                  <Card key={a.id} onClick={() => setActive(a)} className={`p-3 cursor-pointer transition ${active?.id === a.id ? "ring-2 ring-accent" : "hover:bg-muted/40"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <RiskBadge level={a.severity} />
                      <span className="text-mono text-[10px] text-muted-foreground">{a.source}</span>
                    </div>
                    <div className="text-sm font-medium">{a.title}</div>
                    <div className="text-mono text-[10px] text-muted-foreground mt-1">{new Date(a.openedAt).toLocaleString()}</div>
                  </Card>
                ))}
                {open.length === 0 && <Card className="p-4 text-center text-xs text-muted-foreground">All clear.</Card>}
              </div>
            </div>

            {ackd.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 mt-4">
                  <CheckCircle2 className="h-4 w-4 text-status-success" />
                  <span className="text-xs uppercase tracking-wider font-semibold">{t("table_actions.acknowledged")}</span>
                </div>
                <div className="space-y-2 opacity-70">
                  {ackd.map((a) => (
                    <Card key={a.id} onClick={() => setActive(a)} className="p-3 cursor-pointer hover:bg-muted/40">
                      <div className="flex items-center gap-2"><RiskBadge level={a.severity} /><span className="text-sm">{a.title}</span></div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Card className="lg:col-span-3 p-5">
            {active ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <RiskBadge level={active.severity} />
                  <span className="text-mono text-xs text-muted-foreground">{active.id} · {active.source}</span>
                </div>
                <h2 className="text-lg font-semibold mb-2">{active.title}</h2>
                <p className="text-sm text-muted-foreground mb-4">{active.description ?? "No additional detail."}</p>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-md border p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Metric</div><div className="text-mono text-sm">{active.metric ?? "—"}</div></div>
                  <div className="rounded-md border p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Threshold</div><div className="text-mono text-sm">{active.threshold ?? "—"}</div></div>
                  <div className="rounded-md border p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Observed</div><div className="text-mono text-sm">{active.observed ?? "—"}</div></div>
                </div>

                {active.suggestedAction && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm mb-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Suggested Action</div>
                    {active.suggestedAction}
                  </div>
                )}

                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a triage note (saved as alert_response)…"
                  className="min-h-[80px] mb-3"
                />

                <div className="flex gap-2">
                  {!active.acknowledged && <Button onClick={() => ack(active.id)}><CheckCircle2 className="h-4 w-4 mr-1" />{t("table_actions.acknowledge")}</Button>}
                  <Button variant="outline" onClick={() => toast.success("Escalated to incident")}><AlertTriangle className="h-4 w-4 mr-1" />Escalate</Button>
                  <Button variant="ghost" onClick={() => toast.success("Pushed to Ask Personas")}><MessageSquare className="h-4 w-4 mr-1" />Discuss</Button>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-12 text-sm">No alert selected.</div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
};
