// Phase 13.F — Freeze Generation Panel
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Snowflake } from "lucide-react";
import { toast } from "sonner";
import { legacyBff as bff } from "@/lib/bff-v1";
import type { EvolutionProgram } from "@/lib/bff/types";
import { useT } from "@/platform/hooks";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { HighRiskConfirm } from "@/platform/components/HighRiskConfirm";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";

export const EvolutionFreezePanel = ({ program }: { program: EvolutionProgram }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [frozen, setFrozen] = useState(false);

  return (
    <>
      <Section title={t("phase13.evolution.tabs.freeze")}>
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Snowflake className="h-4 w-4 text-accent" />
                G{program.generation} · {program.name}
                {frozen && <Badge variant="outline" className="text-[10px] uppercase border-status-warning/40 text-status-warning">frozen</Badge>}
              </div>
              <p className="text-xs text-muted-foreground max-w-prose">{t("phase13.evolution.freeze.hint")}</p>
            </div>
            <PermissionAwareButton
              requiredAction="freeze_generation"
              variant="destructive"
              size="sm"
              disabled={frozen}
              onClick={() => setOpen(true)}
            >
              <Snowflake className="h-3.5 w-3.5 mr-1" />{t("phase13.evolution.freeze.action")}
            </PermissionAwareButton>
          </div>
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
          await bff.mutations.freezeGeneration(program.id, memo);
          setFrozen(true);
          toast.success(t("phase13.evolution.freeze.queued"));
        }}
      />
    </>
  );
};
