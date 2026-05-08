// HighRiskConfirm — Part 7 §8.3 HighRiskConfirmationModal.
// 12 structured fields + audit memo (required) + confirm phrase token.
//
// v3 §6.2 confirm-token flow (Pack A G03/G66/G86): when `actionId` is a v3
// dotted high-risk action id, the modal fetches a short-lived `confirmToken`
// from `bff.commands.requestConfirmToken` on open, displays a TTL countdown
// and the server-issued `requiredPhrase`, and passes the token to `onConfirm`.
// Legacy callers that pass a plain `confirmToken` string continue to work.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/platform/hooks";
import { usePlatform } from "@/platform/store";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { RiskBadge } from "./RiskBadge";
import { StatusBadge } from "./StatusBadge";
import type { RiskLevel } from "@/lib/bff/types";
import { requestConfirmToken as requestConfirmTokenV1 } from "@/lib/bff-v1";
import { getHighRiskAction } from "@/lib/v3/highRiskActions";
import { validateMemo, MEMO_POLICY_BY_RISK, type ActionRiskClass } from "@/lib/v4/memoPolicy";
import { DEFAULT_TWO_MAN_POLICY, HIGH_RISK_TWO_MAN_POLICY } from "@/lib/v4/twoManPolicy";
import { canIssueConfirmToken, canRedeemConfirmToken, type CooldownState } from "@/lib/v4/cooldownPriority";

export interface AffectedRefs {
  strategies?: string[];
  personas?: string[];
  capitalPools?: string[];
  runtimes?: string[];
}

export interface HighRiskConfirmProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;

  // ---- Structured (preferred) ----
  /** 1. Operation name (e.g. "promote_live") */
  operation?: string;
  /** 2. Target object summary {type, id, name} */
  target?: { type: string; id: string; name: string };
  /** 3. Current lifecycle state */
  currentState?: string;
  /** 4. New / expected state after action */
  newState?: string;
  /** 5–8. Affected: strategies / personas / capital pools / runtimes */
  affected?: AffectedRefs;
  /** 9. Risk impact */
  risk?: RiskLevel;
  riskImpact?: string;
  /** 10. Rollback target */
  rollbackTarget?: string;
  /** 11. Required approval */
  requiredApproval?: string[];

  // ---- Legacy (Phase 1–11 call sites) ----
  /** Plain title fallback when no `operation` is provided. */
  title?: string;
  /** Plain description fallback when no structured fields are provided. */
  description?: string;

  /** Token user must type to confirm (auto-required on live env / critical risk). */
  confirmToken?: string;
  destructive?: boolean;
  /** Extra slot rendered before footer. */
  extra?: ReactNode;

  // ---- v3 §6.2 confirm-token integration ----
  /** v3 dotted action id (e.g. "strategy.deploy_live"). When set and registered
   *  in HIGH_RISK_ACTIONS, the modal fetches a confirmToken from BFF on open. */
  actionId?: string;
  /** Entity type & id used to build the confirm phrase (e.g. {type:"strategy", id:"st_01"}). */
  confirmEntity?: { type: string; id: string };

  /** Planner Response §C1/D36 — when present and active, blocks token issue/redeem. */
  cooldown?: CooldownState;

  /** Receives the audit memo. With v3 actionId, also receives the issued token. */
  onConfirm: (memo: string, token?: string) => void | Promise<void>;
}

export const HighRiskConfirm = ({
  open, onOpenChange,
  operation, target,
  currentState, newState,
  affected, risk = "high", riskImpact,
  rollbackTarget, requiredApproval,
  title, description,
  confirmToken, destructive, extra,
  actionId, confirmEntity,
  onConfirm,
}: HighRiskConfirmProps) => {
  const t = useT();
  const env = usePlatform((s) => s.env);
  const [memo, setMemo] = useState("");
  const [typed, setTyped] = useState("");

  // ---- v3 §6.2 confirm-token state ----
  const v3Action = actionId ? getHighRiskAction(actionId) : undefined;
  const useV3Token = !!v3Action;
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [requiredPhrase, setRequiredPhrase] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [issuing, setIssuing] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!open || !useV3Token) return;
    const myReq = ++reqIdRef.current;
    setIssuing(true);
    const entityType = confirmEntity?.type ?? target?.type ?? "entity";
    const entityId = confirmEntity?.id ?? target?.id ?? "—";
    requestConfirmTokenV1(
      {
        actionId: actionId!,
        entityType,
        entityId,
        payloadHash: "mock",
        tradingEnvironment: env,
        platformEnvironment: "production",
      },
      { [`${entityType}Id`]: entityId },
    ).then((r) => {
      if (myReq !== reqIdRef.current) return;
      setIssuedToken(r.data.confirmToken);
      setRequiredPhrase(r.data.requiredPhrase);
      setExpiresAt(Date.parse(r.data.expiresAt));
      setIssuing(false);
    }).catch(() => setIssuing(false));
  }, [open, useV3Token, actionId, confirmEntity?.type, confirmEntity?.id, target?.type, target?.id, env]);

  useEffect(() => {
    if (!open || !expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [open, expiresAt]);

  const op = operation ?? title ?? "action";
  const tgt = target ?? { type: "Object", id: "—", name: title ?? "—" };

  // Planner Response §E4 — memo policy by risk class.
  const riskClass: ActionRiskClass = risk === "critical"
    ? (env === "live" ? "break_glass" : "critical")
    : risk === "high" ? "high"
    : risk === "medium" ? "medium" : "low";
  const memoPolicy = MEMO_POLICY_BY_RISK[riskClass];
  const memoCheck = validateMemo(memo, riskClass);
  // Planner Response §C2/D35 — two-man policy hint (UI only; enforcement on BFF).
  const twoManRequired = riskClass === "critical" || riskClass === "break_glass" || (requiredApproval?.length ?? 0) >= 2;
  const twoManPolicy = riskClass === "break_glass" || riskClass === "critical" ? HIGH_RISK_TWO_MAN_POLICY : DEFAULT_TWO_MAN_POLICY;

  const tokenRequired = useV3Token || !!confirmToken || env === "live" || risk === "critical";
  const token = useV3Token
    ? (requiredPhrase ?? "")
    : (confirmToken ?? op.toUpperCase());
  const memoOk = memoCheck.ok;
  const tokenOk = !tokenRequired || (typed === token && token.length > 0);
  const tokenExpired = useV3Token && expiresAt !== null && now >= expiresAt;
  const memoMaxOk = memo.length <= 2000;
  const ok = memoOk && memoMaxOk && tokenOk && !tokenExpired && (!useV3Token || !!issuedToken);
  const ttlSec = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;

  const reset = () => {
    setMemo(""); setTyped("");
    setIssuedToken(null); setRequiredPhrase(null); setExpiresAt(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={destructive || risk === "critical" ? "text-destructive h-5 w-5" : "text-status-warning h-5 w-5"} />
            {t("confirm.title")} — <span className="text-mono text-sm">{op}</span>
          </DialogTitle>
          <DialogDescription>
            {description ?? t("confirm.subtitle", { target: tgt.name })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] -mx-6 px-6">
          <div className="space-y-3">
            {/* Target */}
            <Row label={t("confirm.target")}>
              <Badge variant="outline" className="text-mono text-[10px]">{tgt.type}</Badge>
              <span className="text-sm">{tgt.name}</span>
              <span className="text-mono text-xs text-muted-foreground">{tgt.id}</span>
            </Row>

            {/* State transition */}
            {(currentState || newState) && (
              <Row label={t("confirm.transition")}>
                {currentState && <StatusBadge state={currentState} />}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                {newState && <StatusBadge state={newState} />}
              </Row>
            )}

            {/* Risk */}
            <Row label={t("confirm.risk")}>
              <RiskBadge level={risk} />
              {riskImpact && <span className="text-xs text-muted-foreground">{riskImpact}</span>}
            </Row>

            {/* Affected scope */}
            {affected && (affected.strategies?.length || affected.personas?.length || affected.capitalPools?.length || affected.runtimes?.length) ? (
              <>
                <Separator />
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("confirm.affected")}</div>
                <AffectedList label={t("confirm.affectedStrategy")} items={affected.strategies} />
                <AffectedList label={t("confirm.affectedPersona")} items={affected.personas} />
                <AffectedList label={t("confirm.affectedCapital")} items={affected.capitalPools} />
                <AffectedList label={t("confirm.affectedRuntime")} items={affected.runtimes} />
              </>
            ) : null}

            {/* Rollback + Approval */}
            {(rollbackTarget || requiredApproval?.length) && (
              <>
                <Separator />
                {rollbackTarget && (
                  <Row label={t("confirm.rollback")}>
                    <span className="text-mono text-xs">{rollbackTarget}</span>
                  </Row>
                )}
                {requiredApproval?.length ? (
                  <Row label={t("confirm.approval")}>
                    {requiredApproval.map((r) => (
                      <Badge key={r} variant="secondary" className="text-mono text-[10px]">{r}</Badge>
                    ))}
                  </Row>
                ) : null}
              </>
            )}

            {extra}

            <Separator />

            {env === "live" && (
              <div className="rounded-md border border-env-live-accent/40 bg-env-live-bg/30 px-3 py-2 text-sm text-env-live-accent font-medium">
                {t("confirm.liveWarning")}
              </div>
            )}

            {twoManRequired && (
              <div className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
                {t("confirm.twoMan.title", { defaultValue: "Two-person approval required" })} ·
                {twoManPolicy.distinctRoleFamily
                  ? ` ${t("confirm.twoMan.distinctFamily", { defaultValue: "distinct user + distinct role family" })}`
                  : ` ${t("confirm.twoMan.distinctUser", { defaultValue: "distinct user (requester may not sign)" })}`}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">
                {t("confirm.memo")}
                {memoPolicy.required && <span className="text-destructive"> *</span>}
              </Label>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={t("confirm.memoPlaceholder")}
                rows={3}
                maxLength={2000}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {!memoOk && memoCheck.ok === false && (
                    memoCheck.reason === "REQUIRED" ? t("confirm.memoHint") :
                    memoCheck.reason === "TOO_SHORT" ? t("confirm.memoTooShort", { defaultValue: "Memo must be at least {{n}} characters for {{risk}} actions", n: memoPolicy.minChars, risk: riskClass }) :
                    memoCheck.reason === "TOO_LONG" ? t("confirm.memoTooLong", { defaultValue: "Memo exceeds 2000 characters" }) : ""
                  )}
                  {memoPolicy.recommendsIncidentRef && memoOk && (
                    <span className="text-muted-foreground/80">{t("confirm.memoIncidentRef", { defaultValue: "Tip: reference an incident id (#INC-...)" })}</span>
                  )}
                </span>
                <span className={memo.length > 2000 ? "text-destructive" : ""}>{memo.length}/2000</span>
              </div>
            </div>

            {tokenRequired && (
              <div className="space-y-1.5">
                {useV3Token && issuing && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Requesting confirm token…
                  </div>
                )}
                {useV3Token && issuedToken && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-mono text-muted-foreground">token: {issuedToken.slice(0, 12)}…</span>
                    <span className={tokenExpired ? "text-destructive" : "text-status-warning"}>
                      {tokenExpired ? "expired" : `TTL ${ttlSec}s`}
                    </span>
                  </div>
                )}
                <Label className="text-xs">{t("confirm.typeToConfirm", { token })}</Label>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="text-mono"
                  disabled={useV3Token && (!issuedToken || tokenExpired)}
                />
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("actions.cancel")}</Button>
          <Button
            variant={destructive || risk === "critical" ? "destructive" : "default"}
            disabled={!ok}
            onClick={async () => {
              await onConfirm(memo, issuedToken ?? undefined);
              reset();
              onOpenChange(false);
            }}
          >
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
    <div className="flex items-center gap-2 flex-wrap">{children}</div>
  </div>
);

const AffectedList = ({ label, items }: { label: string; items?: string[] }) => {
  if (!items?.length) return null;
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {items.map((i) => <Badge key={i} variant="outline" className="text-mono text-[10px]">{i}</Badge>)}
      </div>
    </div>
  );
};
