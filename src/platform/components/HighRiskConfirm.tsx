// HighRiskConfirm — Part 7 §8.3 HighRiskConfirmationModal.
// 12 structured fields + audit memo (required) + confirm phrase token (for critical / live).
import { useState, type ReactNode } from "react";
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
import { AlertTriangle, ArrowRight } from "lucide-react";
import { RiskBadge } from "./RiskBadge";
import { StatusBadge } from "./StatusBadge";
import type { RiskLevel } from "@/lib/bff/types";

export interface AffectedRefs {
  strategies?: string[];
  personas?: string[];
  capitalPools?: string[];
  runtimes?: string[];
}

export interface HighRiskConfirmProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;

  /** 1. Operation name (e.g. "promote_live") */
  operation: string;
  /** 2. Target object summary {type, id, name} */
  target: { type: string; id: string; name: string };
  /** 3. Current lifecycle state */
  currentState?: string;
  /** 4. New / expected state after action */
  newState?: string;

  /** 5–8. Affected: strategies / personas / capital pools / runtimes */
  affected?: AffectedRefs;

  /** 9. Risk impact */
  risk: RiskLevel;
  riskImpact?: string;

  /** 10. Rollback target */
  rollbackTarget?: string;
  /** 11. Required approval (e.g. ["risk", "capital", "ops"]) */
  requiredApproval?: string[];

  /** Optional: token user must type to confirm (auto-required on live env / critical risk). */
  confirmToken?: string;
  /** Style variant. */
  destructive?: boolean;
  /** Extra slot rendered before footer (e.g. validator results). */
  extra?: ReactNode;

  onConfirm: (memo: string) => void | Promise<void>;
}

export const HighRiskConfirm = ({
  open, onOpenChange,
  operation, target,
  currentState, newState,
  affected, risk, riskImpact,
  rollbackTarget, requiredApproval,
  confirmToken, destructive, extra,
  onConfirm,
}: HighRiskConfirmProps) => {
  const t = useT();
  const env = usePlatform((s) => s.env);
  const [memo, setMemo] = useState("");
  const [typed, setTyped] = useState("");

  const tokenRequired = !!confirmToken || env === "live" || risk === "critical";
  const token = confirmToken ?? operation.toUpperCase();
  const memoOk = memo.trim().length >= 8;
  const tokenOk = !tokenRequired || typed === token;
  const ok = memoOk && tokenOk;

  const reset = () => { setMemo(""); setTyped(""); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={destructive || risk === "critical" ? "text-destructive h-5 w-5" : "text-status-warning h-5 w-5"} />
            {t("confirm.title")} — <span className="text-mono text-sm">{operation}</span>
          </DialogTitle>
          <DialogDescription>
            {t("confirm.subtitle", { target: target.name })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] -mx-6 px-6">
          <div className="space-y-3">
            {/* Target */}
            <Row label={t("confirm.target")}>
              <Badge variant="outline" className="text-mono text-[10px]">{target.type}</Badge>
              <span className="text-sm">{target.name}</span>
              <span className="text-mono text-xs text-muted-foreground">{target.id}</span>
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

            <div className="space-y-1.5">
              <Label className="text-xs">{t("confirm.memo")} <span className="text-destructive">*</span></Label>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={t("confirm.memoPlaceholder")}
                rows={3}
              />
              {!memoOk && <p className="text-xs text-muted-foreground">{t("confirm.memoHint")}</p>}
            </div>

            {tokenRequired && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("confirm.typeToConfirm", { token })}</Label>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="text-mono" />
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("actions.cancel")}</Button>
          <Button
            variant={destructive || risk === "critical" ? "destructive" : "default"}
            disabled={!ok}
            onClick={async () => { await onConfirm(memo); reset(); onOpenChange(false); }}
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
