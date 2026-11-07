import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Strategy, StrategyRule } from "@/lib/bff-v1";
import { useT } from "@/platform/hooks";

function selectTradingRule(rules: StrategyRule[]): StrategyRule | undefined {
  return rules.find((rule) => rule.role === "trading") ?? rules[0];
}

function formatRuleParamValue(value: unknown, fallback: string): string {
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item).trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : fallback;
  }
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export const StrategyParamsEditor = ({ strategy }: { strategy: Strategy }) => {
  const t = useT();
  const noData = t("common.noData");

  if (strategy.rules === null) {
    return (
      <Card data-testid="strategy-params-unavailable" className="p-4 text-sm text-muted-foreground">
        {t("strategyDetail.rulesUnavailable")}
      </Card>
    );
  }

  if (!Array.isArray(strategy.rules) || strategy.rules.length === 0) {
    return (
      <Card data-testid="strategy-params-empty" className="p-4 text-sm text-muted-foreground">
        {t("strategyDetail.rulesEmpty")}
      </Card>
    );
  }

  const tradingRule = selectTradingRule(strategy.rules);
  const parameters =
    tradingRule?.parameters && typeof tradingRule.parameters === "object"
      ? tradingRule.parameters
      : {};
  const adjustableControls = Array.isArray(tradingRule?.adjustableControls)
    ? tradingRule.adjustableControls
    : [];
  const immutableParameters = Array.isArray(tradingRule?.immutableParameters)
    ? tradingRule.immutableParameters
    : [];

  return (
    <Card data-testid="strategy-params-readonly" className="p-4 space-y-4">
      <div>
        <div className="text-sm font-semibold">{t("strategy.params.title")}</div>
        <div className="text-xs text-muted-foreground">{t("strategy.params.readOnlyHint")}</div>
      </div>

      {adjustableControls.length > 0 && (
        <div className="space-y-2" data-testid="strategy-params-adjustable-list">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("strategy.params.adjustableSection")}
          </div>
          {adjustableControls.map((control) => {
            const currentValue = formatRuleParamValue(
              control.current_value !== undefined
                ? control.current_value
                : parameters[control.parameter_key],
              noData,
            );
            const minText = formatRuleParamValue(control.allowed_range?.min, noData);
            const maxText = formatRuleParamValue(control.allowed_range?.max, noData);
            const stepText = formatRuleParamValue(control.step, noData);
            return (
              <div
                key={control.parameter_key}
                data-testid={`strategy-param-adjustable-${control.parameter_key}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded border border-border/60 p-2.5 text-xs"
              >
                <code className="md:col-span-4 text-mono bg-muted px-2 py-1 rounded truncate">
                  {control.parameter_key}
                </code>
                <span className="md:col-span-3 text-mono font-medium text-foreground">
                  {t("strategy.params.currentValue", { value: currentValue })}
                </span>
                <span className="md:col-span-3 text-mono text-muted-foreground">
                  {t("strategy.params.allowedRange", { min: minText, max: maxText })}
                </span>
                <span className="md:col-span-2 text-mono text-muted-foreground">
                  {t("strategy.params.step", { step: stepText })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {immutableParameters.length > 0 && (
        <div className="space-y-2" data-testid="strategy-params-immutable-list">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("strategy.params.immutableSection")}
          </div>
          {immutableParameters.map((paramKey) => {
            const valueText = formatRuleParamValue(parameters[paramKey], noData);
            return (
              <div
                key={paramKey}
                data-testid={`strategy-param-immutable-${paramKey}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded border border-border/60 p-2.5 text-xs"
              >
                <code className="md:col-span-4 text-mono bg-muted px-2 py-1 rounded truncate">
                  {paramKey}
                </code>
                <span className="md:col-span-6 text-mono text-foreground break-all">
                  {valueText}
                </span>
                <div className="md:col-span-2 flex md:justify-end">
                  <Badge
                    variant="outline"
                    data-testid={`strategy-param-fixed-${paramKey}`}
                    className="text-[11px] border-muted text-muted-foreground"
                  >
                    {t("strategy.params.fixed")}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
