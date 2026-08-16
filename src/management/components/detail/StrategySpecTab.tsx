import { useEffect, useState } from "react";
import { bff } from "@/lib/bff-v1";
import { mutations } from "@/lib/bff/mutations";
import type { Strategy, ObjectVersion } from "@/lib/bff/types";
import { Section } from "@/management/pages/ObjectDetailLayout";
import { VersionDiffViewer } from "./VersionDiffViewer";
import { StrategyParamsEditor } from "./StrategyParamsEditor";
import { MetricFreezeBadge } from "./MetricFreezeBadge";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { Lock, Unlock } from "lucide-react";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";
import { commandReceiptDescription } from "@/lib/bff-v1/commandReceipt";

interface ParamRow { key: string; value: string; note: string }

export const StrategySpecTab = ({ strategy, params }: { strategy: Strategy; params: ParamRow[] }) => {
  const t = useT();
  const [versions, setVersions] = useState<ObjectVersion[]>([]);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    bff.objectVersions.forSubject("Strategy", strategy.id).then(setVersions);
  }, [strategy.id]);

  const toggleLock = async () => {
    const receipt = await mutations.lockParams(strategy.id, !locked, locked ? "unlock parameters" : "lock parameters");
    setLocked((v) => !v);
    toast.success(locked ? t("phase13.strategy.spec.unlocked") : t("phase13.strategy.spec.locked"), {
      description: commandReceiptDescription(receipt, { fallback: `Strategy ${strategy.id} · ${locked ? "unlock_params" : "lock_params"}` }),
    });
  };

  return (
    <div className="space-y-4">
      <Section title={t("phase13.strategy.spec.versionPanel")}>
        <div className="flex items-center justify-between">
          <MetricFreezeBadge frozen={locked} />
          <PermissionAwareButton requiredAction="strategy.update_params" size="sm" variant="outline" onClick={toggleLock}>
            {locked ? <><Unlock className="h-3.5 w-3.5 mr-1" />{t("phase13.strategy.spec.unlock")}</> : <><Lock className="h-3.5 w-3.5 mr-1" />{t("phase13.strategy.spec.lock")}</>}
          </PermissionAwareButton>
        </div>
        {versions.length >= 2 ? (
          <VersionDiffViewer versions={versions.map((v) => ({ id: v.id, version: v.version, author: v.author, createdAt: v.createdAt, note: v.note, spec: v.spec }))} />
        ) : (
          <div className="text-xs text-muted-foreground">{t("governance.policy.diff.needTwo")}</div>
        )}
      </Section>
      <Section title={t("strategy.params.title")}>
        <StrategyParamsEditor strategy={strategy} initial={params} />
      </Section>
    </div>
  );
};
