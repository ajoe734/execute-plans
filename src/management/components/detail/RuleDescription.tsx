import { useTranslation } from "react-i18next";
import type { StrategyRule } from "@/lib/bff-v1";
import { formatStrategyRuleResult, ruleSymbols } from "./strategyRuleText";

/**
 * Plain-language rule text shared by the persona pool and the strategy page
 * (FE-PERSONA-STRATEGY-VISIBILITY-20261119). A supported kind renders the
 * sentence with its symbols; any other kind renders the kind and every
 * parameter key and value. Nothing is guessed.
 */
export function RuleDescription({
  rule,
  testId = "strategy-rule-text",
}: {
  rule: Partial<StrategyRule>;
  testId?: string;
}) {
  const { t, i18n } = useTranslation();
  const formatted = formatStrategyRuleResult(rule, i18n.language);
  const symbols = ruleSymbols(rule);
  const prefix = formatted.kind === "sentence" && symbols.length ? `${symbols.join(", ")}：` : "";
  return (
    <div data-testid={testId} data-rule-kind={formatted.kind} className="text-sm leading-relaxed">
      <p>
        {prefix}
        {formatted.text}
      </p>
      {formatted.kind === "unsupported" ? (
        <div data-testid={`${testId}-params`} className="mt-1 text-xs text-muted-foreground">
          {formatted.params && formatted.params.length > 0 ? (
            <>
              <span>{t("strategyDetail.poolRules.unsupportedKind", { kind: formatted.rawKind })}</span>
              <dl className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-3 font-mono">
                {formatted.params.map((p) => (
                  <div key={p.key} className="contents">
                    <dt>{p.key}</dt>
                    <dd className="break-all">{p.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <span>{t("strategyDetail.poolRules.noParams")}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
