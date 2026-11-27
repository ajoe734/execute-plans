import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { bffV1, writes } from "@/lib/bff-v1";
import type { Strategy, ObjectVersion } from "@/lib/bff-v1";
import { Field, Section } from "@/management/pages/ObjectDetailLayout";
import { Badge } from "@/components/ui/badge";
import { VersionDiffViewer } from "./VersionDiffViewer";
import { StrategyParamsEditor } from "./StrategyParamsEditor";
import { MetricFreezeBadge } from "./MetricFreezeBadge";
import {
  deduplicateStrategyRules,
  formatPoolCombinationRule,
  formatPoolRiskLimits,
  resolveStrategyRuleRole,
} from "./strategyRuleText";
import { RuleDescription } from "./RuleDescription";
import { PermissionAwareButton } from "@/platform/components/PermissionAwareButton";
import { Lock, Unlock } from "lucide-react";
import { useT } from "@/platform/hooks";
import { toast } from "sonner";
import { commandReceiptDescription } from "@/lib/bff-v1/commandReceipt";

export interface StrategyRulesListProps {
  rules: Strategy["rules"];
  variant?: "spec" | "summary";
}

export const StrategyRulesList = ({
  rules,
  variant = "spec",
}: StrategyRulesListProps) => {
  const t = useT();
  const { i18n } = useTranslation();
  const dedupedRules = useMemo(() => deduplicateStrategyRules(rules), [rules]);

  if (rules === null) {
    return (
      <div
        data-testid="strategy-rules-unavailable"
        className="text-sm text-muted-foreground"
      >
        {t("strategyDetail.rulesUnavailable")}
      </div>
    );
  }

  if (!Array.isArray(rules) || dedupedRules.length === 0) {
    if (variant === "summary") {
      return (
        <p
          className="text-sm text-muted-foreground"
          data-testid="strategy-rules-summary-empty"
        >
          {t("strategyDetail.rulesSummary.empty")}
        </p>
      );
    }
    return (
      <div data-testid="strategy-rules-empty" className="text-sm text-muted-foreground">
        {t("strategyDetail.rulesEmpty")}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="strategy-rules-list">
      {dedupedRules.map((rule, idx) => {
        const role = resolveStrategyRuleRole(rule, i18n.language);
        const isEnvelope = role === "pool_envelope";
        const isBaseline = role === "rollback_baseline";
        const roleLabel = t(`strategyDetail.ruleRole.${role}`);
        const combinationDisplay = isEnvelope
          ? formatPoolCombinationRule(rule.combinationRule, i18n.language)
          : null;
        const riskLimitDisplays = isEnvelope
          ? formatPoolRiskLimits(rule.riskLimits, i18n.language)
          : [];

        if (isBaseline) {
          return (
            <details
              key={`${rule.registryId ?? "rule"}-${idx}`}
              data-testid={`strategy-rule-${rule.registryId}`}
              data-rule-role={rule.role ?? role}
              data-collapsed="true"
              className="rounded-md border border-border/50 bg-muted/10 px-3 py-1.5 text-xs text-muted-foreground"
            >
              <summary
                data-testid={variant === "summary" ? `strategy-rules-summary-rule-${idx}` : undefined}
                className="cursor-pointer select-none flex flex-wrap items-center gap-2"
              >
                <Badge variant="outline" className="border-muted text-muted-foreground text-[11px]">
                  {roleLabel}
                </Badge>
                <span>{t("strategyDetail.rulesSummary.rollbackCollapsedHint")}</span>
              </summary>
              <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <code className="text-mono text-xs text-muted-foreground">
                    {rule.registryId}
                  </code>
                  {rule.version && (
                    <span className="text-mono text-xs text-muted-foreground">
                      v{rule.version}
                    </span>
                  )}
                </div>
                <RuleDescription rule={rule} />
              </div>
            </details>
          );
        }

        return (
          <div
            key={`${rule.registryId ?? "rule"}-${idx}`}
            data-testid={`strategy-rule-${rule.registryId}`}
            data-rule-role={rule.role ?? role}
            className="rounded-md border border-border/70 bg-muted/15 p-3 space-y-1.5"
          >
            <div
              data-testid={variant === "summary" ? `strategy-rules-summary-rule-${idx}` : undefined}
              className="space-y-1.5"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  className="border-status-success/40 text-status-success"
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
              {isEnvelope ? (
                <div className="space-y-2 text-sm" data-testid="strategy-rule-envelope">
                  <div data-testid="strategy-rule-combination">
                    <span className="text-muted-foreground">{t("strategyDetail.poolRules.combinationRule")}：</span>
                    {combinationDisplay ? (
                      <span
                        title={combinationDisplay.code}
                        data-code={combinationDisplay.code}
                        data-known={combinationDisplay.isKnown ? "true" : "false"}
                      >
                        <span>{combinationDisplay.text}</span>
                        {!combinationDisplay.isKnown && (
                          <code
                            data-testid="strategy-rule-combination-unknown-code"
                            className="ml-1.5 text-mono text-xs text-muted-foreground"
                          >
                            {combinationDisplay.code}
                          </code>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div data-testid="strategy-rule-risk-limits" className="space-y-1">
                    <span className="text-muted-foreground">{t("strategyDetail.poolRules.riskLimits")}：</span>
                    {riskLimitDisplays.length > 0 ? (
                      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                        {riskLimitDisplays.map((item) => (
                          <span
                            key={item.key ?? item.code}
                            title={item.code}
                            data-code={item.key ?? item.code}
                            data-known={item.isKnown ? "true" : "false"}
                            data-testid={`strategy-rule-risk-limit-${item.key ?? item.code}`}
                          >
                            <span>{item.text}</span>
                            {!item.isKnown && (
                              <code
                                data-testid={`strategy-rule-risk-limit-unknown-${item.key ?? item.code}`}
                                className="ml-1.5 text-mono text-xs text-muted-foreground"
                              >
                                {item.code}
                              </code>
                            )}
                          </span>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {t("strategyDetail.poolRules.members", { count: rule.members?.length ?? 0 })}
                  </div>
                  {rule.members && rule.members.length > 0 ? (
                    <ul className="space-y-2" data-testid="strategy-rule-members">
                      {rule.members.map((m) => (
                        <li
                          key={m.registryId}
                          data-testid={`strategy-rule-member-${m.registryId}`}
                          data-rule-role="pool_member"
                          className="rounded border border-border/60 p-2 space-y-1"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge
                              variant="outline"
                              className="border-status-success/40 text-status-success"
                            >
                              {t("strategyDetail.ruleRole.pool_member")}
                            </Badge>
                            <span className="text-muted-foreground">
                              {t("strategyDetail.poolRules.weight")} {m.riskWeight ?? "—"}
                            </span>
                            <code className="text-mono text-xs text-muted-foreground">{m.registryId}</code>
                          </div>
                          <RuleDescription
                            rule={{ role: "pool_member", strategyLogic: m.strategyLogic, parameters: m.parameters }}
                            testId={`strategy-rule-member-text-${m.registryId}`}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-muted-foreground">{t("strategyDetail.poolRules.noMembers")}</div>
                  )}
                </div>
              ) : (
                <RuleDescription rule={rule} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const StrategySpecTab = ({ strategy }: { strategy: Strategy }) => {
  const t = useT();
  const [versions, setVersions] = useState<ObjectVersion[]>([]);
  const [versionsStatus, setVersionsStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVersionsStatus("loading");
    bffV1.objectVersions
      .forSubject("Strategy", strategy.id)
      .then(
        (res) => {
          if (cancelled) return;
          setVersions(Array.isArray(res) ? res : []);
          setVersionsStatus("ready");
        },
        () => {
          if (cancelled) return;
          setVersions([]);
          setVersionsStatus("unavailable");
        },
      );
    return () => {
      cancelled = true;
    };
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
        <StrategyRulesList rules={strategy.rules} variant="spec" />
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
        {versionsStatus === "unavailable" ? (
          <div className="text-xs text-muted-foreground" data-testid="strategy-versions-unavailable">
            {t("strategyDetail.versionsUnavailable")}
          </div>
        ) : versions.length >= 2 ? (
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
