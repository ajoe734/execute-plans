// Phase 13.F — Mutation Rule Manager
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { bff } from "@/lib/bff/client";
import type { MutationRule } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { DataTable } from "@/platform/components/DataTable";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { RiskBadge } from "@/platform/components/RiskBadge";

export const MutationRuleManager = () => {
  const t = useT();
  const [rules, setRules] = useState<MutationRule[]>([]);
  useEffect(() => { bff.mutationRules.list().then(setRules); }, []);

  const toggle = (id: string) => {
    setRules((rs) => rs.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
    toast.success(t("phase13.evolution.mutation.toggleQueued"));
  };

  return (
    <Section title={t("evolution.tabs.mutation")}>
      <div className="flex justify-end">
        <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1" />{t("phase13.evolution.mutation.add")}</Button>
      </div>
      <Card className="p-0">
        <DataTable
          rows={rules}
          empty={t("empty.none")}
          columns={[
            { key: "name", header: t("table.name"), cell: (r) => <div className="font-medium">{r.name}</div> },
            { key: "scope", header: t("phase13.evolution.mutation.scope"), cell: (r) => <Badge variant="outline" className="text-[10px] uppercase">{r.scope}</Badge> },
            { key: "expr", header: t("phase13.evolution.mutation.expression"), cell: (r) => <code className="text-mono text-[11px] bg-muted/50 px-1.5 py-0.5 rounded">{r.expression}</code> },
            { key: "rate", header: t("phase13.evolution.mutation.rate"), cell: (r) => <span className="text-mono text-xs">{r.rateBps}</span> },
            { key: "risk", header: t("table.risk"), cell: (r) => <RiskBadge level={r.risk} /> },
            { key: "en", header: t("table.state"), cell: (r) => (
              <div className="flex items-center gap-2">
                <Switch checked={r.enabled} onCheckedChange={() => toggle(r.id)} />
                <span className="text-xs text-muted-foreground">{r.enabled ? "on" : "off"}</span>
              </div>
            ) },
          ]}
        />
      </Card>
    </Section>
  );
};
