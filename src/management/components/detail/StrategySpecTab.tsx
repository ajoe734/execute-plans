import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { bffV1, writes } from "@/lib/bff-v1";
import type { Strategy, ObjectVersion } from "@/lib/bff-v1";
import { Field, Section } from "@/management/pages/ObjectDetailLayout";
import { Badge } from "@/components/ui/badge";
import { VersionDiffViewer } from "./VersionDiffViewer";
import { StrategyParamsEditor } from "./StrategyParamsEditor";
import { MetricFreezeBadge } from "./MetricFreezeBadge";
import { formatStrategyRuleResult } from "./strategyRuleText";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { Lock, Unlock } from "lucide-react";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";
import { commandReceiptDescription } from "@/lib/bff-v1/commandReceipt";

export const StrategySpecTab = ({ strategy }: { strategy: Strategy }) => {
  const t = useT();
  const { i18n } = useTranslation();
  const [versions, setVersions] = useState<ObjectVersion[]>([]);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    bffV1.objectVersions.forSubject("Strategy", strategy.id).then(setVersions);
  }, [strategy.id]);

  const toggleLock = async () => {
    const receipt = await writes.lockParams(
      strategy.id,
      !locked,
      locked ? "unlock parameters" : "lock parameters",
    );
    setLocked((v) => !v);
    toast.success(
      locked ? t("phase13.strategy.spec.unlocked") : t("phase13.strategy.spec.locked"),
      {
        description: commandReceiptDescription(receipt, {
          fallback: `Strategy ${strategy.id} · ${locked ? "unlock_params" : "lock_params"}`,
        }),
      },
    );
  };

  const specTitle =
    typeof strategy.spec?.title === "string" ? strategy.spec.title.trim() : "";
  const specHypothesis =
    typeof strategy.spec?.hypothesis === "string" ? strategy.spec.hypothesis.trim() : "";
  const specObjective =
    typeof strategy.spec?.objective === "string" ? strategy.spec.objective.trim() : "";
  const hasSpecSummaryFields = Boolean(specTitle || specHypothesis || specObjective);

  return (
    <div className="space-y-4">
      {hasSpecSummaryFields && (
        <Section title={t("strategyDetail.specTitle")}>
          <div className="space-y-3" data-testid="strategy-spec-metadata">
            {specTitle && (
              <div data-testid="strategy-spec-title">
                <Field label={t("strategyDetail.specTitleField")} value={specTitle} />
              </div>
            )}
            {specHypothesis && (
              <div data-testid="strategy-spec-hypothesis">
                <Field label={t("strategyDetail.hypothesis")} value={specHypothesis} />
              </div>
            )}
            {specObjective && (
              <div data-testid="strategy-spec-objective">
                <Field label={t("strategyDetail.objective")} value={specObjective} />
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title={t("strategyDetail.rulesSectionTitle")}>
        {strategy.rules === null ? (
          <div
            data-testid="strategy-rules-unavailable"
            className="text-sm text-muted-foreground"
          >
            {t("strategyDetail.rulesUnavailable")}
          </div>
        ) : !Array.isArray(strategy.rules) || strategy.rules.length === 0 ? (
          <div data-testid="strategy-rules-empty" className="text-sm text-muted-foreground">
            {t("strategyDetail.rulesEmpty")}
          </div>
        ) : (
          <div className="space-y-3" data-testid="strategy-rules-list">
            {strategy.rules.map((rule) => {
              const formatted = formatStrategyRuleResult(rule, i18n.language);
              const isBaseline =
                rule.role === "rollback_baseline" || formatted.kind === "rollback_baseline";
              const roleLabel = isBaseline
                ? t("strategyDetail.ruleRole.rollback_baseline")
                : t("strategyDetail.ruleRole.trading");
              return (
                <div
                  key={rule.registryId}
                  data-testid={`strategy-rule-${rule.registryId}`}
                  className="rounded-md border border-border/70 bg-muted/15 p-3 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={
                        isBaseline
                          ? "border-muted text-muted-foreground"
                          : "border-status-success/40 text-status-success"
                      }
                    >
                      {roleLabel}
                    </Badge>
                    <code className="text-mono text-xs text-muted-foreground">
                      {rule.registryId}
                    </code>
                    {rule.version && (
                      <span className="text-mono text-xs text-muted-foreground">
                        v{rule.version}
                      </span>
                    )}
                  </div>
                  <p
                    data-testid="strategy-rule-text"
                    data-rule-kind={formatted.kind}
                    className="text-sm text-foreground leading-relaxed"
                  >
                    {formatted.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={t("phase13.strategy.spec.versionPanel")}>
        <div className="flex items-center justify-between">
          <MetricFreezeBadge frozen={locked} />
          <PermissionAwareButton
            requiredAction="strategy.update_params"
            size="sm"
            variant="outline"
            onClick={toggleLock}
          >
            {locked ? (
              <>
                <Unlock className="h-3.5 w-3.5 mr-1" />
                {t("phase13.strategy.spec.unlock")}
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5 mr-1" />
                {t("phase13.strategy.spec.lock")}
              </>
            )}
          </PermissionAwareButton>
        </div>
        {versions.length >= 2 ? (
          <VersionDiffViewer
            versions={versions.map((v) => ({
              id: v.id,
              version: v.version,
              author: v.author,
              createdAt: v.createdAt,
              note: v.note,
              spec: v.spec,
            }))}
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            {t("governance.policy.diff.needTwo")}
          </div>
        )}
      </Section>

      <Section title={t("strategy.params.title")}>
        <StrategyParamsEditor strategy={strategy} />
      </Section>
    </div>
  );
};
