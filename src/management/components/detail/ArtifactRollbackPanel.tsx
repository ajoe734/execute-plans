// Artifact rollback history + revert action.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { Artifact } from "@/lib/bff/types";
import { mutations } from "@/lib/bff/mutations";
import { useT } from "@/platform/hooks";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";

interface VersionEntry {
  version: string;
  promotedAt: string;
  active: boolean;
}

const buildVersions = (a: Artifact): VersionEntry[] => {
  const base = parseInt(a.version.replace(/[^\d]/g, ""), 10) || 1;
  const today = Date.now();
  return Array.from({ length: Math.min(base, 4) }, (_, i) => {
    const v = base - i;
    return {
      version: a.version.replace(/\d+$/, String(v)),
      promotedAt: new Date(today - i * 86400_000 * 7).toISOString(),
      active: i === 0,
    };
  });
};

export const ArtifactRollbackPanel = ({ artifact }: { artifact: Artifact }) => {
  const t = useT();
  const versions = buildVersions(artifact);
  const [target, setTarget] = useState<VersionEntry | null>(null);

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
                <span className="text-xs text-muted-foreground">{safeDateTime(v.promotedAt, "date")}</span>
              </div>
              {!v.active && (
                <Button size="sm" variant="outline" onClick={() => setTarget(v)}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" />{t("actions.rollback")}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
      <HighRiskConfirm
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`${t("actions.rollback")} → ${target?.version ?? ""}`}
        description={t("artifact.rollback.confirm")}
        confirmToken="ROLLBACK"
        destructive
        onConfirm={async (memo) => {
          await mutations.rollback("Artifact", artifact.id, memo);
          toast.success(t("artifact.rollback.done"));
          setTarget(null);
        }}
      />
    </>
  );
};
