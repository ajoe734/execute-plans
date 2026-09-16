// Phase 13.F — Freeze Generation Panel
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Snowflake, Sun } from "lucide-react";
import { toast } from "sonner";
import { writes } from "@/lib/bff-v1";
import { commandReceiptDescription } from "@/lib/bff-v1/commandReceipt";
import type { EvolutionProgram } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { safeDateTime } from "@/lib/utils";

export const EvolutionFreezePanel = ({
  program,
  onRefresh,
}: {
  program: EvolutionProgram;
  onRefresh?: () => void;
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const isFrozen = Boolean(program.is_frozen || program.isFrozen);

  const handleUnfreeze = async () => {
    const receipt = await writes.unfreezeGeneration(program.id, "Operator unfreeze generation");
    toast.success(t("phase13.evolution.freeze.unfrozen", { defaultValue: "Generation unfrozen" }), {
      description: commandReceiptDescription(receipt, { fallback: `Evolution ${program.id} · unfreeze_generation` }),
    });
    onRefresh?.();
  };

  const records = Array.isArray(program.freeze_records) ? program.freeze_records : [];

  return (
    <>
      <Section title={t("phase13.evolution.tabs.freeze")}>
        <Card className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Snowflake className={`h-4 w-4 ${isFrozen ? "text-status-warning" : "text-accent"}`} />
                G{program.generation} · {program.name}
                {isFrozen && (
                  <Badge variant="outline" className="text-[10px] uppercase border-status-warning/40 text-status-warning">
                    frozen
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground max-w-prose">
                {isFrozen
                  ? t("phase13.evolution.freeze.frozenHint", {
                      defaultValue: "Generation is frozen (D2). Mutation approval and candidate promotions are blocked until unfrozen.",
                    })
                  : t("phase13.evolution.freeze.hint")}
              </p>
            </div>
            {isFrozen ? (
              <PermissionAwareButton
                requiredAction="unfreeze_generation"
                variant="outline"
                size="sm"
                onClick={handleUnfreeze}
              >
                <Sun className="h-3.5 w-3.5 mr-1 text-amber-500" />
                {t("phase13.evolution.freeze.unfreezeAction", { defaultValue: "Unfreeze Generation" })}
              </PermissionAwareButton>
            ) : (
              <PermissionAwareButton
                requiredAction="freeze_generation"
                variant="destructive"
                size="sm"
                onClick={() => setOpen(true)}
              >
                <Snowflake className="h-3.5 w-3.5 mr-1" />
                {t("phase13.evolution.freeze.action")}
              </PermissionAwareButton>
            )}
          </div>

          {records.length > 0 && (
            <div className="pt-2 border-t border-border space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Freeze History</div>
              <div className="divide-y divide-border text-xs">
                {records.map((r, idx) => (
                  <div key={idx} className="py-1.5 flex items-center justify-between text-muted-foreground">
                    <span className="text-mono">{r.generation_id || `gen-${program.generation}`}</span>
                    <span>{r.reason || "Generation freeze event"}</span>
                    <span>{safeDateTime(r.frozen_at || r.unfrozen_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </Section>

      <HighRiskConfirm
        open={open}
        onOpenChange={setOpen}
        title={`${t("phase13.evolution.freeze.action")} — ${program.name}`}
        description={t("detail.confirm.freezeEvolution")}
        confirmToken="FREEZE-GEN"
        destructive
        onConfirm={async (memo) => {
          const receipt = await writes.freezeGeneration(program.id, memo);
          toast.success(t("phase13.evolution.freeze.queued"), {
            description: commandReceiptDescription(receipt, { fallback: `Evolution ${program.id} · freeze_generation` }),
          });
          onRefresh?.();
        }}
      />
    </>
  );
};
