// Postmortem Library — Spec Part 3 §19.6.
// List + Detail (entered from Incident `postmortem_id`).
import { useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field } from "../ObjectDetailLayout";
import { Input } from "@/components/ui/input";
import { useT } from "@/platform/hooks";

interface Postmortem {
  id: string;
  title: string;
  incidentId: string;
  severity: "low" | "medium" | "high" | "critical";
  rootCause: string;
  impact: string;
  resolved: string;
  followUps: string[];
  authoredBy: string;
}

const SEED: Postmortem[] = [
  { id: "pm_001", title: "Binance perp API cascading rejects", incidentId: "inc_201", severity: "high", rootCause: "Upstream rate-limit + naive retry burst.", impact: "12 strategies degraded ~38min, est. PnL impact -0.4%.", resolved: "2026-04-22T03:11:00Z", followUps: ["Add adaptive backoff", "Surface rate-limit metric in Risk Center"], authoredBy: "ops-commander" },
  { id: "pm_002", title: "Capital pool drift breach", incidentId: "inc_198", severity: "medium", rootCause: "Stale rebalance applied after intraday flow.", impact: "Pool ‘USD-Core’ utilization spiked to 96% for 22min.", resolved: "2026-04-15T10:48:00Z", followUps: ["Block apply when stale > 30min"], authoredBy: "risk-lead" },
  { id: "pm_003", title: "Persona regression after skill update", incidentId: "inc_188", severity: "low", rootCause: "Skill v3 prompt ablation removed risk caveat.", impact: "1 misleading committee response, no trade impact.", resolved: "2026-04-02T14:00:00Z", followUps: ["Mandatory skill eval gate"], authoredBy: "trainer-lead" },
];

export const PostmortemLibraryPage = () => {
  const t = useT();
  const [active, setActive] = useState<Postmortem | null>(null);
  const [q, setQ] = useState("");
  const rows = useMemo(() => SEED.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.incidentId.includes(q)), [q]);

  return (
    <>
      <PageHeader title={t("nav.postmortems")} subtitle={t("postmortem.subtitle")} actions={
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("postmortem.search")} className="w-64" />
      }/>
      <PageBody>
        <Card>
          <DataTable<Postmortem> rows={rows} onRowClick={setActive} columns={[
            { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
            { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
            { key: "title", header: t("table.title"), cell: (r) => <div className="font-medium">{r.title}</div> },
            { key: "inc", header: t("postmortem.incident"), cell: (r) => <span className="text-mono text-xs">{r.incidentId}</span> },
            { key: "by", header: t("postmortem.author"), cell: (r) => <span className="text-mono text-xs">{r.authoredBy}</span> },
            { key: "ts", header: t("postmortem.resolved"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{new Date(r.resolved).toLocaleString()}</span> },
          ]} />
        </Card>
      </PageBody>

      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-[560px] sm:max-w-[560px]">
          {active && (
            <>
              <SheetHeader>
                <div className="flex gap-2 items-center mb-2"><RiskBadge level={active.severity} /><span className="text-mono text-xs text-muted-foreground">{active.id}</span></div>
                <SheetTitle>{active.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <Card className="p-4 grid grid-cols-2 gap-4">
                  <Field label={t("postmortem.incident")} value={active.incidentId} mono />
                  <Field label={t("postmortem.author")} value={active.authoredBy} mono />
                  <Field label={t("postmortem.resolved")} value={new Date(active.resolved).toLocaleString()} mono />
                </Card>
                <Card className="p-4 space-y-3">
                  <div><div className="text-xs uppercase tracking-wider text-muted-foreground">{t("postmortem.rootCause")}</div><div className="text-sm mt-1">{active.rootCause}</div></div>
                  <div><div className="text-xs uppercase tracking-wider text-muted-foreground">{t("postmortem.impact")}</div><div className="text-sm mt-1">{active.impact}</div></div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("postmortem.followUps")}</div>
                  <ul className="space-y-1.5">
                    {active.followUps.map((f, i) => <li key={i} className="text-sm">• {f}</li>)}
                  </ul>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
