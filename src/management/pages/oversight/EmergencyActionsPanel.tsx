// 2026-07-11 PPL-ALLOC-006 — Emergency actions tab.
//
// Read-only by design: PPL-ALLOC-008 owns the emergency containment policy
// and its dedicated BFF/UI guards and has not shipped yet, so this tab must
// not invent a mutation control here. It surfaces the containment-relevant
// Human Inbox kinds (capital_breach, policy_violation, rollback_request,
// broker_disconnect, sentinel) and links out to the governed decision detail
// — it never promotes a persona or increases capital from this surface.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { HumanInboxKind } from "@/lib/v5/management/humanInbox";

const CONTAINMENT_KINDS: readonly HumanInboxKind[] = [
  "capital_breach", "policy_violation", "rollback_request", "broker_disconnect", "sentinel",
];

const kindTone = (kind: HumanInboxKind) =>
  kind === "capital_breach" || kind === "policy_violation" ? "border-status-failed/40 text-status-failed" :
  kind === "rollback_request" || kind === "broker_disconnect" ? "border-status-warning/40 text-status-warning" :
  "border-muted text-muted-foreground";

export const EmergencyActionsPanel = () => {
  const { t } = useTranslation();
  const { data: items, loading } = useV5Live(() => mgmt.humanInbox.list(), []);

  const containmentItems = useMemo(
    () => (items ?? []).filter((item) => CONTAINMENT_KINDS.includes(item.kind)),
    [items],
  );

  return (
    <Card className="p-3 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("promotionAllocation.emergencyActions.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("promotionAllocation.emergencyActions.subtitle")}</p>
      </div>
      <ul className="space-y-2">
        {containmentItems.map((item) => (
          <li key={item.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={kindTone(item.kind)}>{item.kind}</Badge>
                <span className="text-sm font-medium text-foreground">{item.title}</span>
              </div>
              <Link to={item.detailHref} className="text-xs text-primary hover:underline">
                {t("promotionAllocation.emergencyActions.review")}
              </Link>
            </div>
            {item.summary && <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>}
            {!item.canProceed && (item.blockingReasons?.length ?? 0) > 0 && (
              <p className="mt-1 text-xs text-status-warning">
                {t("promotionAllocation.emergencyActions.blocked", { reasons: item.blockingReasons?.join("; ") })}
              </p>
            )}
          </li>
        ))}
        {containmentItems.length === 0 && (
          <li className="p-3 text-center text-sm text-muted-foreground">
            {loading ? t("promotionAllocation.emergencyActions.loading") : t("promotionAllocation.emergencyActions.none")}
          </li>
        )}
      </ul>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t("promotionAllocation.emergencyActions.noDirectMutation")}
      </p>
    </Card>
  );
};
