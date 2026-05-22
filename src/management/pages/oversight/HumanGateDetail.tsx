// 2026-05-20 PM-6 — Human Inbox detail page (/management/human-inbox/:id).
// Phase 1: deterministic mock detail derived from id; live wired via mgmt.humanInbox.get.

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
    title: `${kind} item ${id}`,
    requiredRole: kind === "capital_breach" ? "capital-owner" : kind === "policy_violation" ? "compliance" : "research-owner",
    consequenceIfApproved: "Action proceeds and is recorded in audit log.",
    consequenceIfRejected: "Action discarded; persona notified.",
    consequenceIfIgnored: "Times out per TTL; default-deny applies.",
    ttlSec: 12 * 3600,
    canDecide: kind !== "policy_violation",
    canProceed: kind !== "capital_breach",
    blockingReasons: kind === "capital_breach" ? ["Capital pool VaR breach", "Awaiting risk-owner sign-off"] : undefined,
    detailHref: `/management/human-inbox/${encodeURIComponent(id)}`,
    links: buildLinkSet({ primary: { kind: "human_gate", id } }),
    decisionType: kind === "policy_violation" ? "two_man" : "single",
    signatures: [
      { role: "primary-reviewer" },
      ...(kind === "policy_violation" ? [{ role: "compliance-officer" }] : []),
    ],
    evidenceRefs: ["ev:proposal-v3"],
    decisionHistory: [],
    auditRefs: ["audit:human-inbox:" + id],
  };
}

export const HumanGateDetailPage = () => {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const seed = useMemo(() => seedDetail(id), [id]);
  const { data } = useV5Live(() => mgmt.humanInbox.get(id, () => seed), [id]);
  const item = data ?? seed;
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

      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.consequences")}</h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifApproved")}</dt><dd className="text-foreground">{item.consequenceIfApproved}</dd></div>
          <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifRejected")}</dt><dd className="text-foreground">{item.consequenceIfRejected}</dd></div>
          <div><dt className="text-muted-foreground">{t("mgmt.inbox.ifIgnored")}</dt><dd className="text-foreground">{item.consequenceIfIgnored}</dd></div>
        </dl>
      </Card>

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

      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.evidence")}</h2>
        <ul className="mt-2 text-xs">
          {item.evidenceRefs.map((e) => (
            <li key={e}>
              <Link to={`/management/evidence/${encodeURIComponent(e)}`} className="font-mono text-primary underline-offset-4 hover:underline">{e}</Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex gap-2">
        <Button size="sm" disabled={!item.canDecide || !item.canProceed}>{t("mgmt.actions.approve")}</Button>
        <Button size="sm" variant="outline" disabled={!item.canDecide}>{t("mgmt.actions.reject")}</Button>
        <Button size="sm" variant="outline">{t("mgmt.actions.requestMoreEvidence")}</Button>
      </div>
    </section>
  );
};
