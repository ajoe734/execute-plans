// 2026-05-20 PM-6 — Human Inbox detail page (/management/human-inbox/:id).
// Mock mode seed: neutral placeholder only. Live detail data must provide any decision UI.

import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HUMAN_INBOX_KINDS, type HumanInboxDetail, type HumanInboxKind } from "@/lib/v5/management/humanInbox";
import { buildLinkSet } from "@/lib/v5/management/links";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";

function seedDetail(id: string): HumanInboxDetail {
  const kind: HumanInboxKind = (HUMAN_INBOX_KINDS.find((k) => id.startsWith(k.slice(0, 3))) ?? "approval");
  return {
    id, kind,
    title: `${kind} detail unavailable`,
    requiredRole: kind === "capital_breach" ? "capital-owner" : kind === "policy_violation" ? "compliance" : "research-owner",
    consequenceIfApproved: "",
    consequenceIfRejected: "",
    consequenceIfIgnored: "",
    ttlSec: 12 * 3600,
    canDecide: false,
    canProceed: false,
    blockingReasons: ["Live detail payload unavailable."],
    detailHref: `/management/human-inbox/${encodeURIComponent(id)}`,
    links: buildLinkSet({ primary: { kind: "human_gate", id } }),
    decisionType: "single",
    signatures: [],
    evidenceRefs: [],
    decisionHistory: [],
    auditRefs: ["audit:human-inbox:" + id],
  };
}

export const HumanGateDetailPage = () => {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const seed = useMemo(() => seedDetail(id), [id]);
  const { data, loading } = useV5Live(() => mgmt.humanInbox.get(id, () => seed), [id]);
  const item = data;

  if (loading && !item) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.inbox.title")}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.inbox.loadingDetail")}</h1>
            <p className="text-sm text-muted-foreground">{id}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/management/human-inbox">{t("mgmt.inbox.backToInbox")}</Link>
          </Button>
        </header>
      </section>
    );
  }

  if (!item) {
    return (
      <section className="p-6 space-y-4" aria-label={t("mgmt.inbox.title")}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{t("mgmt.inbox.detailUnavailableTitle")}</h1>
            <p className="text-sm text-muted-foreground">{id}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/management/human-inbox">{t("mgmt.inbox.backToInbox")}</Link>
          </Button>
        </header>
        <Card className="p-4 text-sm text-muted-foreground">
          {t("mgmt.inbox.detailUnavailableBody")}
        </Card>
      </section>
    );
  }

  const hasConsequences = Boolean(
    item.consequenceIfApproved || item.consequenceIfRejected || item.consequenceIfIgnored,
  );
  const hasSignatures = item.signatures.length > 0;
  const hasEvidence = item.evidenceRefs.length > 0;
  return (
    <section className="p-6 space-y-4" aria-label={t("mgmt.inbox.title")}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{item.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t("mgmt.inbox.headerSubtitleFmt", { role: item.requiredRole, decision: item.decisionType })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/management/human-inbox">{t("mgmt.inbox.backToInbox")}</Link>
        </Button>
      </header>

      {!item.canProceed && (
        <Card className="border-status-failed/40 bg-status-failed/5 p-3">
          <h2 className="text-sm font-semibold text-status-failed">{t("mgmt.inbox.cannotProceedTitle")}</h2>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {item.blockingReasons?.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </Card>
      )}

      {hasConsequences && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.consequences")}</h2>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifApproved")}</dt><dd className="text-foreground">{item.consequenceIfApproved}</dd></div>
            <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifRejected")}</dt><dd className="text-foreground">{item.consequenceIfRejected}</dd></div>
            <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifIgnored")}</dt><dd className="text-foreground">{item.consequenceIfIgnored}</dd></div>
          </dl>
        </Card>
      )}

      {hasSignatures && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.signatures")}</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {item.signatures.map((s) => (
              <li key={s.role} className="flex items-center gap-2">
                <Badge variant="outline">{s.role}</Badge>
                <span className="text-muted-foreground">{s.signedBy ?? t("mgmt.inbox.pending")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card id="evidence" className="p-4 scroll-mt-24">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.evidence")}</h2>
        {hasEvidence ? (
          <ul className="mt-2 space-y-1 text-xs">
            {item.evidenceRefs.map((e) => (
              <li key={e}>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{e}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("mgmt.actions.evidenceMissing")}</p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {item.links?.manageHref && (
          <Button asChild size="sm" variant="outline">
            <Link to={item.links.manageHref}>{t("mgmt.actions.openActionPage")}</Link>
          </Button>
        )}
      </div>
    </section>
  );
};
