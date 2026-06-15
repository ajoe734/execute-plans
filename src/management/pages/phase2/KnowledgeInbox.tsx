// Knowledge Inbox — Spec Part 3 §19.6.
// Insight triage queue, can be promoted to Artifact / Postmortem.
import { useEffect, useState } from "react";
import { paths, withLiveOrMock } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";

interface Insight {
  id: string;
  title: string;
  source: string;
  kind: "research_note" | "signal_review" | "committee_memo" | "alert_observation";
  risk: "low" | "medium" | "high";
  ts: string;
  body: string;
}

const SEED: Insight[] = [
  { id: "ins_01", title: "Cross-asset momentum divergence", source: "Signal Review · sig_44", kind: "signal_review", risk: "medium", ts: "2026-05-03T08:30:00Z", body: "Equity-FX momentum spread widened past 2σ; consider defensive rebalance for FX Carry." },
  { id: "ins_02", title: "FOMC week liquidity drop", source: "Macro Persona", kind: "committee_memo", risk: "high", ts: "2026-05-02T18:10:00Z", body: "Persona macro flagged thin liquidity into FOMC. Pause new leg additions for 48h." },
  { id: "ins_03", title: "Repeated exchange API timeout", source: "Alert · alt_321", kind: "alert_observation", risk: "high", ts: "2026-05-02T11:02:00Z", body: "Three timeouts in 10 min on Binance perp endpoint. Worth a postmortem entry." },
  { id: "ins_04", title: "New factor candidate: short-vol carry", source: "Notebook · nb_77", kind: "research_note", risk: "low", ts: "2026-05-01T22:05:00Z", body: "Worth scaffolding into a research_task; promising IR in 5y backtest." },
];

export const KnowledgeInboxPage = () => {
  const t = useT();
  // Live-wire GET /bff/knowledge. Real items render when present; until the
  // backend carries data the curated SEED is kept so the page is never blank.
  const { data: live } = useV5Live(
    () => withLiveOrMock<Insight[]>(
      { method: "GET", path: paths.knowledgeInbox() },
      async () => SEED,
      (resp: { items?: Insight[] }) => (resp?.items?.length ? resp.items : SEED),
    ),
    [],
  );
  const [items, setItems] = useState<Insight[]>(SEED);
  const [active, setActive] = useState<Insight | null>(SEED[0] ?? null);
  useEffect(() => {
    if (!live) return;
    setItems(live);
    setActive((prev) => prev ?? live[0] ?? null);
  }, [live]);

  const dismiss = (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    setActive(null);
    toast.success(t("knowledge.dismissed"));
  };
  const promote = (target: string) => {
    if (!active) return;
    toast.success(t("knowledge.promotedTo", { target }));
    dismiss(active.id);
  };

  return (
    <>
      <PageHeader title={t("nav.knowledge")} subtitle={t("knowledge.subtitle")} />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          <Card className="p-2">
            {items.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">{t("knowledge.empty")}</div>}
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={i.id}>
                  <button onClick={() => setActive(i)} className={`w-full text-left p-3 hover:bg-muted/40 ${active?.id === i.id ? "bg-muted/60" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <RiskBadge level={i.risk} />
                      <Badge variant="outline" className="text-[10px] uppercase">{i.kind}</Badge>
                    </div>
                    <div className="text-sm font-medium truncate">{i.title}</div>
                    <div className="text-xs text-muted-foreground text-mono mt-0.5">{i.source}</div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 space-y-4">
            {active ? (
              <>
                <div className="flex items-center gap-2"><RiskBadge level={active.risk} /><Badge variant="outline">{active.kind}</Badge><span className="text-mono text-xs text-muted-foreground">{active.id}</span></div>
                <h2 className="text-lg font-semibold">{active.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{active.body}</p>
                <div className="text-xs text-muted-foreground text-mono">{active.source} · {new Date(active.ts).toLocaleString()}</div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  <Button size="sm" onClick={() => promote("Artifact")}>{t("knowledge.promoteArtifact")}</Button>
                  <Button size="sm" variant="outline" onClick={() => promote("Postmortem")}>{t("knowledge.promotePostmortem")}</Button>
                  <Button size="sm" variant="outline" onClick={() => promote("Research Task")}>{t("knowledge.promoteResearch")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(active.id)}>{t("knowledge.dismiss")}</Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-12">{t("knowledge.selectHint")}</div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
};
