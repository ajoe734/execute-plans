// Artifact rollback history + revert action.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { Artifact } from "@/lib/bff-v1";
import { writes } from "@/lib/bff-v1";
import { commandReceiptDescription } from "@/lib/bff-v1/commandReceipt";
import { useT } from "@/platform/hooks";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { NonProductionActionButton } from "@/management/components/NonProductionActionButton";
import { safeDateTime } from "@/lib/utils";

interface VersionEntry {
  version: string;
  promotedAt: string;
  active: boolean;
}

const buildVersions = (a: Artifact): VersionEntry[] => {
  const lineageVersions = Array.isArray(a.lineage?.versions) ? a.lineage.versions : [];
  if (lineageVersions.length > 0) {
    return lineageVersions
      .map((entry, idx) => {
        const ver = typeof entry?.version === "string" ? entry.version.trim() : "";
        if (!ver) return null;
        return {
          version: ver,
          promotedAt:
            (typeof entry?.updated_at === "string" && entry.updated_at) ||
            (typeof entry?.created_at === "string" && entry.created_at) ||
            a.updatedAt ||
            "",
          active: idx === 0 || (typeof a.version === "string" && ver === a.version.trim()),
        };
      })
      .filter((entry): entry is VersionEntry => entry !== null);
  }
  const currentVersion = typeof a.version === "string" ? a.version.trim() : "";
  if (!currentVersion) return [];
  return [
    {
      version: currentVersion,
      promotedAt: a.approved_at || a.updatedAt || a.created_at || "",
      active: true,
    },
  ];
};

export const ArtifactRollbackPanel = ({ artifact }: { artifact: Artifact }) => {
  const t = useT();
  const versions = buildVersions(artifact);
  const [target, setTarget] = useState<VersionEntry | null>(null);
  const canRollback = Boolean(
    artifact.allowedActions?.canRollback ||
      artifact.availableActions?.includes("rollback"),
  );

  if (versions.length === 0) {
    const unavailableReason =
      typeof artifact.compare_unavailable_reason === "string" &&
      artifact.compare_unavailable_reason.trim().length > 0
        ? artifact.compare_unavailable_reason.trim()
        : t("artifact.rollback.unavailable", {
            defaultValue: "No rollback version history is available for this artifact.",
          });
    return (
      <Card className="p-4 space-y-2" data-testid="artifact-rollback-unavailable">
        <div className="text-sm font-semibold">{t("artifact.rollback.title")}</div>
        <div className="text-xs text-muted-foreground">{unavailableReason}</div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold">{t("artifact.rollback.title")}</div>
          <div className="text-xs text-muted-foreground mt-1">{t("artifact.rollback.hint")}</div>
        </div>
        <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
          {versions.map((v) => (
            <div key={v.version} className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-mono text-sm">{v.version}</span>
                {v.active && <Badge variant="outline" className="text-[10px] uppercase">{t("artifact.rollback.active")}</Badge>}
                {v.promotedAt && (
                  <span className="text-xs text-muted-foreground">{safeDateTime(v.promotedAt, "date")}</span>
                )}
              </div>
              {!v.active && (
                canRollback ? (
                  <Button size="sm" variant="outline" onClick={() => setTarget(v)}>
                    <Undo2 className="h-3.5 w-3.5 mr-1" />{t("actions.rollback")}
                  </Button>
                ) : (
                  <NonProductionActionButton size="sm" variant="outline" status="no executing owner">
                    <Undo2 className="h-3.5 w-3.5 mr-1" />{t("actions.rollback")}
                  </NonProductionActionButton>
                )
              )}
            </div>
          ))}
        </div>
      </Card>
      {canRollback && (
        <HighRiskConfirm
          open={!!target}
          onOpenChange={(o) => !o && setTarget(null)}
          title={`${t("actions.rollback")} → ${target?.version ?? ""}`}
          description={t("artifact.rollback.confirm")}
          confirmToken="ROLLBACK"
          destructive
          onConfirm={async (memo) => {
            const receipt = await writes.rollback("Artifact", artifact.id, memo);
            toast.success(t("artifact.rollback.done"), {
              description: commandReceiptDescription(receipt, { fallback: `Artifact ${artifact.id} · rollback` }),
            });
            setTarget(null);
          }}
        />
      )}
    </>
  );
};
