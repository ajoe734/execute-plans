import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { bff } from "@/lib/bff/client";
import type { AuditEvent, Channel } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ObjectDetailLayout, Section, Field } from "./ObjectDetailLayout";
import { StatCard } from "@/platform/components/StatCard";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/platform/components/DataTable";
import { AuditTimeline } from "@/platform/components/AuditTimeline";

export const ChannelDetail = () => {
  const { id } = useParams();
  const t = useT();
  const [c, setC] = useState<Channel | undefined>();
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  useEffect(() => {
    if (!id) return;
    bff.channels.get(id).then(setC);
    bff.audit.list().then((a) => setAudit(a.filter((x) => x.target === id || x.action.startsWith("channel."))));
  }, [id]);

  const recent = c ? Array.from({ length: 6 }).map((_, i) => ({
    id: `msg_${id}_${i}`,
    ts: new Date(Date.now() - (i + 1) * 1800_000).toISOString(),
    title: i % 3 === 0 ? "Daily macro briefing" : i % 3 === 1 ? "Alert: drawdown breach stg_004" : "Job completed: rebalance.simulate",
    severity: i % 3 === 1 ? "high" : "low",
  })) : [];
  if (!c) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  return (
    <ObjectDetailLayout
      object={c}
      subtitle={`${c.kind.toUpperCase()} · ${c.subscribers} subscribers`}
      actions={
        <Button size="sm" variant="outline" onClick={() => toast.success("Test message sent")}>
          <Send className="h-4 w-4 mr-1" />Send test
        </Button>
      }
      tabs={[
        {
          value: "overview", label: t("section.overview"),
          content: (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Kind" value={c.kind.toUpperCase()} />
                <StatCard label="Subscribers" value={c.subscribers} />
                <StatCard label={t("table.owner")} value={c.owner} />
                <StatCard label={t("table.state")} value={c.state} />
              </div>
              <Section title="Routing">
                <Field label="Destination" value={c.destination} mono />
                <Field label="Filters" value={c.filters ?? "—"} mono />
              </Section>
            </>
          ),
        },
        { value: "history", label: t("section.history"), content: (
          <DataTable rows={recent} columns={[
            { key: "ts", header: t("table.time"), cell: (r) => <span className="text-mono text-xs">{new Date(r.ts).toLocaleString()}</span> },
            { key: "t", header: t("table.title"), cell: (r) => <div className="font-medium">{r.title}</div> },
            { key: "sev", header: t("table.severity"), cell: (r) => <span className="text-mono text-xs uppercase">{r.severity}</span> },
          ]} empty={t("empty.none")} />
        )},
        { value: "audit", label: t("nav.audit"), content: <AuditTimeline entries={audit} /> },
      ]}
    />
  );
};
