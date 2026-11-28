import { useT } from "@/platform/hooks";
import { demandReasonText } from "./researchPresentation";

export function ReasonText({ code, testId }: { code: string | null | undefined; testId?: string }) {
  const t = useT();
  const reason = demandReasonText(code, t);
  if (!reason) return null;
  return (
    <span data-testid={testId}>
      {reason.text}
      {reason.raw && <span className="ml-1 text-xs text-muted-foreground font-mono" data-testid="research-reason-raw">{t("research.demand.rawCode", { code: reason.raw })}</span>}
    </span>
  );
}
