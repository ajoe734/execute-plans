import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { ReadinessHeader } from "@/management/components/readiness/ReadinessHeader";
import { ReadinessChecklist } from "@/management/components/readiness/ReadinessChecklist";
import { EvidencePacketList } from "@/management/components/readiness/EvidencePacketList";
import { BlockersList } from "@/management/components/readiness/BlockersList";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import type { ReadinessPageModel } from "@/lib/v5/management/readiness";

export function LiveReadinessPage({
  title,
  ariaLabel,
  load,
  actions,
}: {
  title: string;
  ariaLabel: string;
  load: () => Promise<ReadinessPageModel | undefined>;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const { data: page, loading } = useV5Live(load, []);

  if (!page) {
    return (
      <section className="p-6 space-y-4" aria-label={ariaLabel}>
        <header>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        </header>
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {loading
              ? t("common.loading", { defaultValue: "Loading..." })
              : t("mgmt.readiness.liveUnavailableTitle", { defaultValue: "Live readiness data unavailable" })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? t("mgmt.liveOnly.loadingBody", { defaultValue: "Waiting for live BFF data." })
              : t("mgmt.liveOnly.unavailableBody", { defaultValue: "This page does not render seed, demo, or non-production fallback data." })}
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="p-6 space-y-4" aria-label={ariaLabel}>
      <ReadinessHeader model={page.header} />
      {actions}
      <ReadinessChecklist items={page.checklist} />
      <EvidencePacketList packets={page.packets} />
      <BlockersList blockers={page.blockers} />
    </section>
  );
}
