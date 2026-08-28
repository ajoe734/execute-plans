// Postmortem Library — Spec Part 3 §19.6.
// List + Detail (entered from Incident `postmortem_id`).
import { useEffect, useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/platform/components/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/platform/components/DataTable";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field } from "../ObjectDetailLayout";
import { Input } from "@/components/ui/input";
import { useT } from "@/platform/hooks";
import { safeDateTime } from "@/lib/utils";
import { bffV1 } from "@/lib/bff-v1";
import type { Incident } from "@/lib/bff-v1";

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

export const PostmortemLibraryPage = () => {
  const t = useT();
  const [items, setItems] = useState<Postmortem[]>([]);
  const [active, setActive] = useState<Postmortem | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">("loading");

  useEffect(() => {
    bffV1.incidents.list().then((incidents: Incident[]) => {
      const pms: Postmortem[] = [];
      (incidents || []).forEach((inc) => {
        // Extract timeline entries tagged with [postmortem] or resolved postmortem records
        const postmortemNotes = (inc.timeline || []).filter((t) => t.note?.includes("[postmortem]"));
        if (postmortemNotes.length > 0 || inc.status === "resolved") {
          const mainNote = postmortemNotes[0]?.note?.replace("[postmortem]", "").trim() || inc.description || "Resolved incident postmortem record.";
          pms.push({
            id: `pm_${inc.id}`,
            title: inc.title,
            incidentId: inc.id,
            severity: inc.severity === "info" ? "low" : (inc.severity ?? "medium"),
            rootCause: mainNote,
            impact: `Incident severity: ${inc.severity}. Commander: ${inc.commander ?? "unassigned"}.`,
            resolved: inc.openedAt || new Date().toISOString(),
            followUps: postmortemNotes.map((n) => `${n.actor}: ${n.note}`),
            authoredBy: postmortemNotes[0]?.actor || inc.commander || "ops",
          });
        }
      });
      setItems(pms);
      setStatus("ready");
    }).catch(() => {
      setStatus("degraded");
    });
  }, []);

  const rows = useMemo(() => items.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.incidentId.includes(q)), [items, q]);

  return (
    <>
      <PageHeader title={t("nav.postmortems")} subtitle={t("postmortem.subtitle")} actions={
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("postmortem.search")} className="w-64" />
      }/>
      <PageBody>
        {status === "degraded" && (
          <Card className="p-4 mb-4 border-status-warning/40 bg-status-warning/5 text-xs text-status-warning flex items-center gap-2">
            Incident postmortem transport degraded or unavailable.
          </Card>
        )}
        <Card>
          <DataTable<Postmortem> rows={rows} onRowClick={setActive} empty={status === "loading" ? "Loading postmortems..." : "No incident postmortems recorded."} columns={[
            { key: "id", header: t("table.id"), cell: (r) => <span className="text-mono text-xs">{r.id}</span> },
            { key: "sev", header: t("table.severity"), cell: (r) => <RiskBadge level={r.severity} /> },
            { key: "title", header: t("table.title"), cell: (r) => <div className="font-medium">{r.title}</div> },
            { key: "inc", header: t("postmortem.incident"), cell: (r) => <span className="text-mono text-xs">{r.incidentId}</span> },
            { key: "by", header: t("postmortem.author"), cell: (r) => <span className="text-mono text-xs">{r.authoredBy}</span> },
            { key: "ts", header: t("postmortem.resolved"), cell: (r) => <span className="text-mono text-xs text-muted-foreground">{safeDateTime(r.resolved)}</span> },
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
                  <Field label={t("postmortem.resolved")} value={safeDateTime(active.resolved)} mono />
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
