// Phase 11.1 — Reusable Permission Matrix grid (row=persona, col=tool/mcp/skill/action).
// Cells are clickable to cycle grants; dirty cells are tracked and submitted via runAction.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import type { PermissionGrant, PermissionMatrix as Matrix } from "@/lib/bff/types";
import { bff } from "@/lib/bff/client";
import { useT } from "@/platform/hooks";
import { RiskBadge } from "@/platform/components/RiskBadge";

const GRANT_CYCLE: PermissionGrant[] = ["none", "read", "use", "manage"];

const grantTone: Record<PermissionGrant, string> = {
  none: "bg-muted text-muted-foreground",
  read: "bg-accent/15 text-accent",
  use: "bg-status-success/20 text-status-success",
  manage: "bg-status-warning/20 text-status-warning",
};

interface Props {
  matrix: Matrix;
  readOnly?: boolean;
}

export const PermissionMatrix = ({ matrix, readOnly }: Props) => {
  const t = useT();
  // key = `${rowId}|${colId}` → grant
  const initial = useMemo(() => {
    const m = new Map<string, PermissionGrant>();
    matrix.cells.forEach((c) => m.set(`${c.rowId}|${c.colId}`, c.grant));
    return m;
  }, [matrix]);
  const [grants, setGrants] = useState<Map<string, PermissionGrant>>(new Map(initial));
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const cycle = (rowId: string, colId: string) => {
    if (readOnly) return;
    const k = `${rowId}|${colId}`;
    const cur = grants.get(k) ?? "none";
    const next = GRANT_CYCLE[(GRANT_CYCLE.indexOf(cur) + 1) % GRANT_CYCLE.length];
    const g = new Map(grants);
    g.set(k, next);
    setGrants(g);
    const d = new Set(dirty);
    if (next === (initial.get(k) ?? "none")) d.delete(k);
    else d.add(k);
    setDirty(d);
  };

  const reset = () => { setGrants(new Map(initial)); setDirty(new Set()); };

  const submit = async () => {
    const updates = Array.from(dirty).map((k) => {
      const [rowId, colId] = k.split("|");
      return { rowId, colId, grant: grants.get(k) ?? "none" };
    });
    await bff.mutations.updatePermissionMatrix(matrix.instance, updates, `${dirty.size} cell(s) updated`);
    toast.success(t("governance.permission.submitted"));
    setDirty(new Set());
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <div className="text-sm font-semibold">{t(`governance.permission.instance.${matrix.instance}`)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {matrix.rows.length} × {matrix.cols.length} · {t("governance.permission.cycleHint")}
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {dirty.size > 0 && (
              <Badge variant="outline" className="text-[10px] uppercase text-status-warning border-status-warning/40">
                {dirty.size} {t("governance.permission.pending")}
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={reset} disabled={!dirty.size}>{t("actions.reset")}</Button>
            <Button size="sm" onClick={submit} disabled={!dirty.size}>{t("actions.submitForReview")}</Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left px-3 py-2 sticky left-0 bg-muted/60 z-10 min-w-[160px] uppercase tracking-wider text-[10px] text-muted-foreground">
                {t("governance.permission.persona")}
              </th>
              {matrix.cols.map((c) => (
                <th key={c.id} className="px-2 py-2 text-left min-w-[110px] border-l border-border">
                  <div className="flex items-center gap-1.5">
                    <span className="text-mono text-[10px] truncate" title={c.label}>{c.label}</span>
                    {c.risk && <RiskBadge level={c.risk} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 sticky left-0 bg-background z-10 font-medium">{r.label}</td>
                {matrix.cols.map((c) => {
                  const k = `${r.id}|${c.id}`;
                  const g = grants.get(k) ?? "none";
                  const isDirty = dirty.has(k);
                  return (
                    <td key={c.id} className="border-l border-border p-1.5">
                      <button
                        onClick={() => cycle(r.id, c.id)}
                        disabled={readOnly}
                        className={`w-full px-2 py-1 rounded text-[10px] uppercase tracking-wider font-medium transition ${grantTone[g]} ${
                          isDirty ? "ring-2 ring-accent" : ""
                        } ${readOnly ? "cursor-default" : "hover:opacity-80"}`}
                      >
                        {g}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {matrix.cols.some((c) => c.risk === "critical") && (
        <div className="p-3 border-t border-border bg-status-warning/5 text-xs text-status-warning flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5" />
          {t("governance.permission.criticalNote")}
        </div>
      )}
    </Card>
  );
};
