// Artifact diff vs previous version — mock side-by-side metadata diff.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Artifact } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { ArrowRight } from "lucide-react";

interface DiffRow {
  field: string;
  before: string;
  after: string;
  changed: boolean;
}

const buildDiff = (a: Artifact): DiffRow[] => {
  const prevVersion = a.version.replace(/(\d+)$/, (_, n) => String(Math.max(0, parseInt(n, 10) - 1)));
  return [
    { field: "version", before: prevVersion, after: a.version, changed: true },
    { field: "size", before: `${(a.sizeMb * 0.92).toFixed(0)} MB`, after: `${a.sizeMb} MB`, changed: true },
    { field: "hash", before: a.hash.slice(0, 12) + "…", after: a.hash.slice(0, 12) + "…", changed: true },
    { field: "kind", before: a.kind, after: a.kind, changed: false },
    { field: "owner", before: a.owner, after: a.owner, changed: false },
  ];
};

export const ArtifactDiffPanel = ({ artifact }: { artifact: Artifact }) => {
  const t = useT();
  const rows = buildDiff(artifact);
  const changed = rows.filter((r) => r.changed).length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold">{t("artifact.diff.title")}</div>
          <div className="text-xs text-muted-foreground mt-1">{t("artifact.diff.hint")}</div>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase">
          {changed} {t("artifact.diff.changes")}
        </Badge>
      </div>
      <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
        {rows.map((r) => (
          <div key={r.field} className={`grid grid-cols-12 gap-2 px-3 py-2 text-xs ${r.changed ? "bg-accent/5" : ""}`}>
            <div className="col-span-2 uppercase tracking-wider text-muted-foreground">{r.field}</div>
            <div className="col-span-4 text-mono line-through opacity-60">{r.before}</div>
            <div className="col-span-1 flex justify-center text-muted-foreground"><ArrowRight className="h-3 w-3" /></div>
            <div className={`col-span-5 text-mono ${r.changed ? "text-foreground font-medium" : "text-muted-foreground"}`}>{r.after}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};
