// Lightweight read-only Permission Matrix view scoped to a single persona row.
// Phase 11 will replace with a full editable PermissionMatrix component.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bff } from "@/lib/bff/client";
import type { PermissionInstance, PermissionMatrix } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";

const grantTone: Record<string, string> = {
  none: "text-muted-foreground border-border",
  read: "text-accent border-accent/40",
  use: "text-status-success border-status-success/40",
  manage: "text-status-warning border-status-warning/40",
};

const instances: { key: PermissionInstance; label: string }[] = [
  { key: "persona-tool", label: "Tools" },
  { key: "persona-mcp", label: "MCP" },
  { key: "persona-skill", label: "Skills" },
  { key: "persona-lifecycle", label: "Lifecycle" },
];

export const PermissionMatrixEmbed = ({ personaId }: { personaId: string }) => {
  const t = useT();
  const [matrices, setMatrices] = useState<Record<string, PermissionMatrix | undefined>>({});

  useEffect(() => {
    Promise.all(instances.map((i) => bff.permissionMatrix.get(i.key).then((m) => [i.key, m] as const)))
      .then((entries) => setMatrices(Object.fromEntries(entries)));
  }, []);

  return (
    <Card className="p-4">
      <Tabs defaultValue="persona-tool">
        <TabsList>
          {instances.map((i) => <TabsTrigger key={i.key} value={i.key}>{i.label}</TabsTrigger>)}
        </TabsList>
        {instances.map((i) => {
          const m = matrices[i.key];
          const cells = m?.cells.filter((c) => c.rowId === personaId) ?? [];
          return (
            <TabsContent key={i.key} value={i.key} className="mt-3">
              {!m && <div className="text-xs text-muted-foreground">{t("common.loading")}</div>}
              {m && cells.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">{t("persona.permissions.noGrants")}</div>}
              {m && cells.length > 0 && (
                <div className="space-y-1.5">
                  {cells.map((c) => {
                    const col = m.cols.find((x) => x.id === c.colId);
                    return (
                      <div key={`${c.rowId}-${c.colId}`} className="flex items-center gap-3 p-2 rounded-md border border-border">
                        <div className="flex-1">
                          <div className="text-sm">{col?.label ?? c.colId}</div>
                          <div className="text-mono text-[10px] text-muted-foreground">{c.colId}{c.envScope ? ` · ${c.envScope.join("/")}` : ""}</div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] uppercase ${grantTone[c.grant]}`}>{c.grant}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </Card>
  );
};
