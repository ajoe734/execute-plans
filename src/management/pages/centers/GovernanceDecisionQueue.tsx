// MGMT-PERF-IA-005 — read-only governance decision queue.
//
// Read-only by design, same posture as PPL-ALLOC-006's EmergencyActionsPanel
// (src/management/pages/oversight/EmergencyActionsPanel.tsx): this surfaces
// the Human Inbox items relevant to a governance tab and links out to the
// real decision (Human Gate detail), it never approves, rejects, or applies
// anything itself. The linked Human Gate detail page owns the actual
// decision history / receipt (HumanInboxDecisionRecord).
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { HumanInboxItem, HumanInboxKind } from "@/lib/v5/management/humanInbox";
import { deriveGovernanceDecisionState, governanceDecisionStateLabel, type GovernanceDecisionState } from "./governanceDecisionState";

const STATE_TONE: Record<GovernanceDecisionState, string> = {
  recommendation: "border-muted text-muted-foreground",
  review: "border-status-warning/40 text-status-warning",
  approval: "border-status-success/40 text-status-success",
  rejection: "border-status-failed/40 text-status-failed",
  expiry: "border-status-failed/40 text-status-failed",
  blocked: "border-status-failed/40 text-status-failed",
  applied: "border-status-success/40 text-status-success",
  superseded: "border-muted text-muted-foreground",
};

interface GovernanceDecisionQueueProps {
  kinds: readonly HumanInboxKind[];
  titleKey: string;
  subtitleKey: string;
}

export const GovernanceDecisionQueue = ({ kinds, titleKey, subtitleKey }: GovernanceDecisionQueueProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: items, loading } = useV5Live(() => mgmt.humanInbox.list(), []);

  const queueItems = useMemo(
    () => (items ?? []).filter((item: HumanInboxItem) => kinds.includes(item.kind)),
    [items, kinds],
  );

  const returnUrl = encodeURIComponent(location.pathname + location.search);

  return (
    <Card className="p-3 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t(titleKey)}</h2>
        <p className="text-xs text-muted-foreground">{t(subtitleKey)}</p>
      </div>
      <ul className="space-y-2">
        {queueItems.map((item) => {
          const state = deriveGovernanceDecisionState(item);
          return (
            <li key={item.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={STATE_TONE[state]}>
                    {governanceDecisionStateLabel(state, t)}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">{item.title}</span>
                </div>
                <Link to={`${item.detailHref}?returnUrl=${returnUrl}`} className="text-xs text-primary hover:underline">
                  {t("governanceDecisions.queue.viewReceipt")}
                </Link>
              </div>
              {item.summary && <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>}
              {!item.canProceed && (item.blockingReasons?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-status-failed">
                  {t("promotionAllocation.emergencyActions.blocked", { reasons: item.blockingReasons?.join("; ") })}
                </p>
              )}
            </li>
          );
        })}
        {queueItems.length === 0 && (
          <li className="p-3 text-center text-sm text-muted-foreground">
            {loading ? t("governanceDecisions.queue.loading") : t("governanceDecisions.queue.none")}
          </li>
        )}
      </ul>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t("governanceDecisions.queue.noDirectMutation")}
      </p>
    </Card>
  );
};
