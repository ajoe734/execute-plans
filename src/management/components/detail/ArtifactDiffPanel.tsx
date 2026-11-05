// Artifact diff vs previous version — renders real lineage versions when provided by the owner.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Artifact } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { ArrowRight } from "lucide-react";

interface DiffRow {
  field: string;
  before: string;
  after: string;
  changed: boolean;
}

const buildDiff = (a: Artifact, noData: string): DiffRow[] | null => {
  if (a.allowedActions?.canCompare === false) return null;
  const versions = Array.isArray(a.lineage?.versions) ? a.lineage.versions : [];
  if (versions.length < 2) return null;

  const current = versions[0];
  const previous = versions[1];
  const currentVersion =
    (typeof current?.version === "string" && current.version.trim()) ||
    (typeof a.version === "string" && a.version.trim()) ||
    noData;
  const prevVersion =
    (typeof previous?.version === "string" && previous.version.trim()) || noData;
  const currentHash =
    (typeof current?.hash === "string" && current.hash.trim()) ||
    (typeof current?.checksum === "string" && current.checksum.trim()) ||
    (typeof a.hash === "string" && a.hash.trim()) ||
    noData;
  const prevHash =
    (typeof previous?.hash === "string" && previous.hash.trim()) ||
    (typeof previous?.checksum === "string" && previous.checksum.trim()) ||
    noData;

  const rows: DiffRow[] = [
    {
      field: "version",
      before: prevVersion,
      after: currentVersion,
      changed: prevVersion !== currentVersion,
    },
    {
      field: "hash",
      before: prevHash,
      after: currentHash,
      changed: prevHash !== currentHash,
    },
    {
      field: "kind",
      before: a.kind || noData,
      after: a.kind || noData,
      changed: false,
    },
    {
      field: "owner",
      before: a.owner || noData,
      after: a.owner || noData,
      changed: false,
    },
  ];

  if (typeof a.sizeMb === "number" && Number.isFinite(a.sizeMb)) {
    rows.splice(1, 0, {
      field: "size",
      before: `${a.sizeMb} MB`,
      after: `${a.sizeMb} MB`,
      changed: false,
    });
  }

  return rows;
};

export const ArtifactDiffPanel = ({ artifact }: { artifact: Artifact }) => {
  const t = useT();
  const noData = t("common.noData");
  const rows = buildDiff(artifact, noData);

  if (!rows) {
    const unavailableReason =
      typeof artifact.compare_unavailable_reason === "string" &&
      artifact.compare_unavailable_reason.trim().length > 0
        ? artifact.compare_unavailable_reason.trim()
        : t("artifact.diff.unavailable", {
            defaultValue: "No version diff is available for this artifact.",
          });
    return (
      <Card className="p-4 space-y-2" data-testid="artifact-diff-unavailable">
        <div className="text-sm font-semibold">{t("artifact.diff.title")}</div>
        <div className="text-xs text-muted-foreground">{unavailableReason}</div>
      </Card>
    );
  }

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
