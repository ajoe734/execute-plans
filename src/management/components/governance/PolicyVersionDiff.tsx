// Phase 11.1 — Side-by-side diff between two PolicyVersions.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PolicyVersion, RoutePolicyRule } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { Plus, Minus, ArrowRight } from "lucide-react";

interface Props {
  left: PolicyVersion;
  right: PolicyVersion;
}

const ruleKey = (r: RoutePolicyRule) => `${r.intent}|${r.targetKind}|${r.targetId}`;
const ruleSummary = (r: RoutePolicyRule) =>
  `#${r.priority} ${r.targetKind}:${r.targetId} · ${r.envScope.join("/")}${r.guard ? ` · ${r.guard}` : ""}`;

export const PolicyVersionDiff = ({ left, right }: Props) => {
  const t = useT();
  const lMap = new Map(left.rules.map((r) => [ruleKey(r), r]));
  const rMap = new Map(right.rules.map((r) => [ruleKey(r), r]));
  const allKeys = Array.from(new Set([...lMap.keys(), ...rMap.keys()]));

  const rows = allKeys.map((k) => {
    const l = lMap.get(k);
    const r = rMap.get(k);
    let kind: "added" | "removed" | "changed" | "same" = "same";
    if (!l) kind = "added";
    else if (!r) kind = "removed";
    else if (ruleSummary(l) !== ruleSummary(r)) kind = "changed";
    return { key: k, l, r, kind };
  });

  const added = rows.filter((x) => x.kind === "added").length;
  const removed = rows.filter((x) => x.kind === "removed").length;
  const changed = rows.filter((x) => x.kind === "changed").length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{t("governance.policy.diff.title")}</div>
          <div className="text-xs text-muted-foreground mt-1">
            <span className="text-mono">{left.version}</span> <ArrowRight className="inline h-3 w-3" /> <span className="text-mono">{right.version}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-[10px] uppercase border-status-success/40 text-status-success">+{added}</Badge>
          <Badge variant="outline" className="text-[10px] uppercase border-destructive/40 text-destructive">-{removed}</Badge>
          <Badge variant="outline" className="text-[10px] uppercase border-status-warning/40 text-status-warning">~{changed}</Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
        <div>{left.version} · {left.author}</div>
        <div>{right.version} · {right.author}</div>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-2 gap-2 py-2 text-xs">
            <div className={`p-2 rounded text-mono ${
              row.kind === "removed" ? "bg-destructive/10 text-destructive" :
              row.kind === "changed" ? "bg-status-warning/10" : ""
            }`}>
              {row.l ? (
                <div className="flex items-start gap-1.5">
                  {row.kind === "removed" && <Minus className="h-3 w-3 mt-0.5 shrink-0" />}
                  <div>
                    <div className="font-medium">{row.l.intent}</div>
                    <div className="text-[10px] text-muted-foreground">{ruleSummary(row.l)}</div>
                  </div>
                </div>
              ) : <div className="text-muted-foreground italic">—</div>}
            </div>
            <div className={`p-2 rounded text-mono ${
              row.kind === "added" ? "bg-status-success/10 text-status-success" :
              row.kind === "changed" ? "bg-status-warning/10" : ""
            }`}>
              {row.r ? (
                <div className="flex items-start gap-1.5">
                  {row.kind === "added" && <Plus className="h-3 w-3 mt-0.5 shrink-0" />}
                  <div>
                    <div className="font-medium">{row.r.intent}</div>
                    <div className="text-[10px] text-muted-foreground">{ruleSummary(row.r)}</div>
                  </div>
                </div>
              ) : <div className="text-muted-foreground italic">—</div>}
            </div>
          </div>
        ))}
      </div>
      {right.note && (
        <div className="text-xs text-muted-foreground border-t border-border pt-2">
          <span className="uppercase tracking-wider text-[10px]">{t("governance.policy.diff.note")}:</span> {right.note}
        </div>
      )}
    </Card>
  );
};
