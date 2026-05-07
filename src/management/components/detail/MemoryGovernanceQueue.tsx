// Persona-scoped memory governance queue (read + lightweight actions).
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { legacyBff as bff } from "@/lib/bff-v1";
import type { MemoryUpdate } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const stateTone: Record<string, string> = {
  queued: "border-accent/40 text-accent",
  approved: "border-status-success/40 text-status-success",
  rejected: "border-status-failed/40 text-status-failed",
  merged: "border-status-success/40 text-status-success",
  conflict: "border-risk-high/40 text-risk-high",
};

export const MemoryGovernanceQueue = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const nav = useNavigate();
  const [items, setItems] = useState<MemoryUpdate[]>([]);

  useEffect(() => {
    bff.memoryUpdates.forPersona(personaId).then(setItems);
  }, [personaId]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{t("persona.memory.queue")}</div>
          <div className="text-mono text-[10px] text-muted-foreground">{items.length} pending updates</div>
        </div>
        <Button size="sm" variant="outline" onClick={() => nav("/agora/memory")}>{t("persona.memory.openReview")}</Button>
      </div>
      {items.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">{t("empty.none")}</div>}
      <div className="space-y-2">
        {items.map((m) => (
          <div key={m.id} className="p-3 rounded-md border border-border space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-[10px] uppercase">{m.kind}</Badge>
              <Badge variant="outline" className="text-[10px] uppercase">{m.source}</Badge>
              <Badge variant="outline" className={`text-[10px] uppercase ${stateTone[m.state]}`}>{m.state}</Badge>
              <span className="text-mono text-[10px] text-muted-foreground ml-auto">{new Date(m.proposedAt).toLocaleString()}</span>
            </div>
            {m.before && <div className="text-xs text-muted-foreground line-through">{m.before}</div>}
            <div className="text-sm">{m.after}</div>
            {m.state === "queued" && (
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => toast.info(t("persona.memory.rejected"))}>{t("actions.reject")}</Button>
                <Button size="sm" onClick={() => toast.success(t("persona.memory.approved"))}>{t("actions.approve")}</Button>
              </div>
            )}
            {m.state === "conflict" && (
              <div className="text-[10px] text-risk-high">↳ conflict with {m.conflictWith}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
