// 2026-05-20 revamp §7.1 + design ruling §4.1 — EP5 Canary Readiness.
// Route: /management/readiness/ep5 (also reachable via /management/broker-live
// in M1 transitional IA — see App.tsx). Phase 1 ships full minimum fields;
// "Enable Canary"/"Enable Live" buttons are intentionally OMITTED.

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { mgmt } from "@/lib/bff-v1";
import { LiveReadinessPage } from "./LiveReadinessPage";

export const Ep5CanaryReadinessPage = () => {
  const { t } = useTranslation();
  return (
    <LiveReadinessPage
      title={t("mgmt.readiness.ep5Title")}
      ariaLabel={t("mgmt.readiness.ep5Title")}
      load={() => mgmt.readiness.ep5LiveOnly()}
      actions={(
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/management/evidence">{t("mgmt.actions.viewEvidence")}</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/management/human-inbox">{t("mgmt.actions.openHumanGate")}</Link>
          </Button>
          <Button variant="outline" size="sm">{t("mgmt.actions.refreshReadiness")}</Button>
          <Button variant="outline" size="sm">{t("mgmt.actions.exportPacket")}</Button>
          {/* Per design ruling §4.1: Enable Canary / Enable Live are NOT exposed. */}
        </div>
      )}
    />
  );
};
