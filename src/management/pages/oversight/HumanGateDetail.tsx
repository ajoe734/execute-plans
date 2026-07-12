// 2026-05-20 PM-6 — Human Inbox detail page (/management/human-inbox/:id).

import { useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mgmt } from "@/lib/bff-v1";
import { useV5Live } from "@/management/pages/v5/useV5Live";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { PromotionReviewDecisionValue } from "@/lib/bff-v1/management";

export function personaIdFromDetail(itemId: string, manageHref?: string): string | undefined {
  const decodedId = decodeURIComponent(itemId);
  const fromId = decodedId.match(/persona:([^/?#]+)/)?.[1];
  if (fromId) return fromId;
  if (!manageHref) return undefined;
  try {
    const url = new URL(manageHref, "https://pantheon.local");
    return url.searchParams.get("persona") ?? undefined;
  } catch {
    return undefined;
  }
}

export const HumanGateDetailPage = () => {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const { data, loading, refresh } = useV5Live(() => mgmt.humanInbox.get(id), [id]);
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "/management/human-inbox";
  const [rationale, setRationale] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState<PromotionReviewDecisionValue | null>(null);
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
            <Link to={returnUrl}>{t("mgmt.inbox.backToInbox")}</Link>
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
            <Link to={returnUrl}>{t("mgmt.inbox.backToInbox")}</Link>
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
  const hasDecisionHistory = item.decisionHistory.length > 0;
  const hasEvidence = item.evidenceRefs.length > 0;
  const personaId = personaIdFromDetail(item.id, item.links?.manageHref);
  const reviewId = item.reviewId ?? (item.id.startsWith("promotion_review:") ? item.id.slice("promotion_review:".length) : "");
  const isPromotionReview = item.kind === "promotion_review" && Boolean(reviewId);
  const promotionTargetKey = item.reviewType === "canary_to_live"
    ? "mgmt.inbox.approveLive"
    : "mgmt.inbox.approveCanary";
  const canApprovePromotion = item.allowedActions?.canApprove ?? item.canDecide;
  const canRejectPromotion = item.allowedActions?.canReject ?? item.canDecide;
  const rationaleValue = rationale.trim();
  const submitPromotionDecision = async (decision: PromotionReviewDecisionValue) => {
    if (!reviewId) return;
    if (decision === "reject" && !rationaleValue) return;
    setSubmittingDecision(decision);
    try {
      const result = await mgmt.humanInbox.decidePromotionReview(reviewId, {
        decision,
        rationale: rationaleValue,
        evidenceRefs: item.evidenceRefs,
      });
      if (result.persisted) {
        toast.success(t("mgmt.inbox.decisionAcceptedFmt", { status: result.status }));
      } else {
        toast.warning(t("mgmt.inbox.decisionLocalOnly"));
      }
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(t("mgmt.inbox.decisionFailedFmt", { message }));
    } finally {
      setSubmittingDecision(null);
    }
  };

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
          <Link to={returnUrl}>{t("mgmt.inbox.backToInbox")}</Link>
        </Button>
      </header>

      <Card className="p-4">
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Gate ID</dt>
            <dd className="font-mono text-foreground">{item.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Persona</dt>
            <dd className="font-mono text-foreground">
              {personaId ? (
                <Link
                  to={`/management/personas/${encodeURIComponent(personaId)}`}
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {personaId}
                </Link>
              ) : "nan"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Summary</dt>
            <dd className="text-foreground">{item.summary || "nan"}</dd>
          </div>
        </dl>
      </Card>

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
                {s.signedAt && (
                  <span className="text-muted-foreground">{t("mgmt.inbox.signedAtFmt", { at: s.signedAt })}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Apply-receipt trail: every recorded decision on this gate, with who
          decided, when, and any rationale — the durable evidence that a
          governed capital/access/promotion action was actually reviewed and
          applied, not just requested. */}
      {hasDecisionHistory && (
        <Card id="decision-history" className="p-4 scroll-mt-24">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("mgmt.inbox.decisionHistory")}</h2>
          <ul className="mt-2 space-y-2 text-xs">
            {item.decisionHistory.map((record, index) => (
              <li key={`${record.decidedAt}-${index}`} className="rounded-md border border-border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{record.decision}</Badge>
                  <span className="text-foreground">
                    {t("mgmt.inbox.decidedAtFmt", { by: record.decidedBy, at: record.decidedAt })}
                  </span>
                </div>
                {record.note && <p className="mt-1 text-muted-foreground">{record.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isPromotionReview && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("mgmt.inbox.promotionDecision")}
            </h2>
            <Badge variant="outline">{item.status ?? "pending"}</Badge>
          </div>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="promotion-rationale" className="text-xs text-muted-foreground">
                {t("mgmt.inbox.rationaleLabel")}
              </Label>
              <Textarea
                id="promotion-rationale"
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={3}
                disabled={submittingDecision !== null || !item.canDecide}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void submitPromotionDecision("approve")}
                disabled={!item.canDecide || !canApprovePromotion || submittingDecision !== null}
              >
                {submittingDecision === "approve"
                  ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="mr-1 h-4 w-4" />}
                {t(promotionTargetKey)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void submitPromotionDecision("approve_with_conditions")}
                disabled={!item.canDecide || !canApprovePromotion || submittingDecision !== null}
              >
                {submittingDecision === "approve_with_conditions"
                  ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="mr-1 h-4 w-4" />}
                {t("mgmt.inbox.approveWithConditions")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void submitPromotionDecision("reject")}
                disabled={!item.canDecide || !canRejectPromotion || !rationaleValue || submittingDecision !== null}
                className="border-status-failed/40 text-status-failed hover:text-status-failed"
              >
                {submittingDecision === "reject"
                  ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  : <XCircle className="mr-1 h-4 w-4" />}
                {t("mgmt.inbox.rejectPromotion")}
              </Button>
            </div>
          </div>
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
