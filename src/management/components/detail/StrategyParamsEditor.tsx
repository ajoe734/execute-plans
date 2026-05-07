// Inline editor for strategy parameters. Edits create a draft revision (mock).
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Strategy } from "@/lib/bff/types";
import { legacyBff as bff } from "@/lib/bff-v1";
import { legacyRunActionSafe as runActionSafe } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";

interface ParamRow { key: string; value: string; note: string; }

export const StrategyParamsEditor = ({ strategy, initial }: { strategy: Strategy; initial: ParamRow[] }) => {
  const t = useT();
  const [rows, setRows] = useState<ParamRow[]>(initial);
  const [original] = useState<ParamRow[]>(initial);
  const dirty = rows.some((r, i) => r.value !== original[i]?.value);

  const update = (i: number, value: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, value } : r)));
  };

  const submit = async () => {
    const changes = rows
      .map((r, i) => ({ ...r, prev: original[i]?.value }))
      .filter((r) => r.value !== r.prev);
    await runActionSafe({
      kind: "Strategy",
      id: strategy.id,
      action: "update_params",
      memo: changes.map((c) => `${c.key}: ${c.prev} → ${c.value}`).join("; "),
    });
    toast.success(t("strategy.params.draftCreated"));
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{t("strategy.params.title")}</div>
          <div className="text-xs text-muted-foreground">{t("strategy.params.hint")}</div>
        </div>
        {dirty && <Badge variant="outline" className="text-[10px] uppercase text-status-warning border-status-warning/40">● {t("skill.prompt.unsaved")}</Badge>}
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const changed = r.value !== original[i]?.value;
          return (
            <div key={r.key} className="grid grid-cols-12 gap-3 items-center">
              <code className="col-span-3 text-mono text-xs bg-muted px-2 py-1 rounded truncate">{r.key}</code>
              <div className="col-span-3">
                <Input value={r.value} onChange={(e) => update(i, e.target.value)} className={`h-8 text-mono text-xs ${changed ? "border-status-warning" : ""}`} />
              </div>
              <div className="col-span-2 text-mono text-[11px] text-muted-foreground">
                {changed ? `← ${original[i]?.value}` : ""}
              </div>
              <div className="col-span-4 text-xs text-muted-foreground">{r.note}</div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={() => setRows(original)} disabled={!dirty}>{t("actions.reset")}</Button>
        <Button size="sm" onClick={submit} disabled={!dirty}>{t("strategy.params.submit")}</Button>
      </div>
    </Card>
  );
};
