import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PAPER_RISK_TIERS, type PaperRiskTier, type Persona, type PersonaRiskPolicyChange } from "@/lib/bff-v1";
import { normalizePaperRiskTier } from "@/lib/bff-v1/personas";
import type { MeResponse } from "@/lib/v4/session/me";
import { cn } from "@/lib/utils";
import { RiskBadge } from "@/platform/components/RiskBadge";
import { useT } from "@/platform/hooks";

const NON_PAPER_LIFECYCLE_STATES = new Set([
  "retired",
  "deprecated",
  "research_only",
  "consultable",
  "live_owner",
]);

const NON_PAPER_MODES = new Set([
  "live",
  "real",
  "canary",
  "live_running",
  "canary_running",
]);

const PAPER_QUALIFYING_STATES = new Set([
  "paper_running",
  "paper_active",
  "paper_owner",
]);

const OPERATOR_WRITE_ROLES = new Set([
  "operator",
  "ops",
  "admin",
  "platform_admin",
  "system_operator",
  "approver",
  "reviewer",
  "portfolio_manager",
  "research_lead",
  "strategy_manager",
  "risk_officer",
  "capital_manager",
  "capability_admin",
  "ai_trainer",
]);

export type ClassifiedRiskPolicyStatus =
  | "effective"
  | "pending_approval"
  | "failed"
  | "unavailable"
  | "legacy_unreported";

export function isPaperPersonaScope(persona: Persona | null | undefined): boolean {
  if (!persona || typeof persona !== "object") return false;
  const state = String(persona.state ?? "").trim().toLowerCase();
  const lifecycleStatus = String(persona.lifecycleStatus ?? "").trim().toLowerCase();
  if (NON_PAPER_LIFECYCLE_STATES.has(state) || NON_PAPER_LIFECYCLE_STATES.has(lifecycleStatus)) {
    return false;
  }
  const capitalMode = String(persona.capitalMode ?? "").trim().toLowerCase();
  const deploymentStage = String(persona.deploymentStage ?? "").trim().toLowerCase();
  if (NON_PAPER_MODES.has(capitalMode) || NON_PAPER_MODES.has(deploymentStage)) {
    return false;
  }
  if (persona.riskPolicyChange !== undefined && persona.riskPolicyChange !== null) {
    return true;
  }
  return (
    capitalMode === "paper" ||
    deploymentStage === "paper" ||
    PAPER_QUALIFYING_STATES.has(state) ||
    PAPER_QUALIFYING_STATES.has(lifecycleStatus) ||
    Boolean(typeof persona.paperLedgerId === "string" && persona.paperLedgerId.trim())
  );
}

export function meHasOperatorWriteAuthority(me: MeResponse | null): boolean {
  if (!me || !Array.isArray(me.roles) || me.roles.length === 0) {
    return false;
  }
  return me.roles.some((role) => OPERATOR_WRITE_ROLES.has(String(role ?? "").trim().toLowerCase()));
}

export interface PaperPersonaRiskEditAccess {
  allowed: boolean;
  reasonKey: string;
}

export function evaluatePaperPersonaRiskEditAccess(input: {
  persona: Persona | null | undefined;
  canEditPermission: boolean;
  me: MeResponse | null;
  meLoading: boolean;
  meError: Error | null;
  writeAllowed: boolean;
  writeLoading: boolean;
}): PaperPersonaRiskEditAccess {
  const { persona, canEditPermission, me, meLoading, meError } = input;
  if (!isPaperPersonaScope(persona)) {
    return { allowed: false, reasonKey: "persona.riskPolicy.unsupportedPersonaReason" };
  }
  const change = persona?.riskPolicyChange;
  if (!change || typeof change !== "object") {
    return { allowed: false, reasonKey: "persona.riskPolicy.legacyPayloadHint" };
  }
  const normalizedStatus = String(change.status ?? "").trim().toLowerCase();
  if (normalizedStatus === "unavailable") {
    return { allowed: false, reasonKey: "persona.riskPolicy.unavailableHint" };
  }
  if (normalizedStatus === "unsupported") {
    return { allowed: false, reasonKey: "persona.riskPolicy.unsupportedPersonaReason" };
  }
  if (
    input.writeLoading ||
    !input.writeAllowed ||
    !canEditPermission ||
    Boolean(meError) ||
    (Array.isArray(persona?.availableActions) && persona.availableActions.length === 0) ||
    meLoading ||
    !meHasOperatorWriteAuthority(me)
  ) {
    return { allowed: false, reasonKey: "persona.riskPolicy.readOnlyHint" };
  }
  return { allowed: true, reasonKey: "" };
}

export function classifyRiskPolicyStatus(
  change: PersonaRiskPolicyChange | null | undefined,
): ClassifiedRiskPolicyStatus {
  if (!change || typeof change !== "object") {
    return "legacy_unreported";
  }
  const raw = String(change.status ?? "").trim().toLowerCase();
  if (raw === "unavailable") {
    return "unavailable";
  }
  if (raw === "pending_approval" || raw === "pending") {
    return "pending_approval";
  }
  if (
    raw === "effective" &&
    change.effectiveRisk !== null &&
    (change.requestedRisk === null || change.effectiveRisk === change.requestedRisk)
  ) {
    return "effective";
  }
  return "failed";
}

export function resolveInitialEditorRiskTier(persona: Persona): PaperRiskTier {
  return (
    normalizePaperRiskTier(persona.riskPolicyChange?.requestedRisk) ??
    normalizePaperRiskTier(persona.riskPolicyChange?.effectiveRisk) ??
    normalizePaperRiskTier(persona.risk) ??
    "low"
  );
}

const STATUS_BADGE_TONE: Record<ClassifiedRiskPolicyStatus, string> = {
  effective: "bg-status-success/15 text-status-success border-status-success/40",
  pending_approval: "bg-status-warning/15 text-status-warning border-status-warning/40",
  failed: "bg-status-danger/15 text-status-danger border-status-danger/40",
  unavailable: "bg-muted text-muted-foreground border-dashed border-border",
  legacy_unreported: "bg-muted text-muted-foreground border-dashed border-border",
};

interface PersonaRiskPolicyPanelProps {
  persona: Persona;
  editAccess: PaperPersonaRiskEditAccess;
  editorOpen: boolean;
  selectedTier: PaperRiskTier;
  saving: boolean;
  saveError: string | null;
  onSelectTier: (tier: PaperRiskTier) => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
}

export function PersonaRiskPolicyPanel({
  persona,
  editAccess,
  editorOpen,
  selectedTier,
  saving,
  saveError,
  onSelectTier,
  onSave,
  onCancel,
  className,
}: PersonaRiskPolicyPanelProps) {
  const t = useT();
  const change = persona.riskPolicyChange;
  const statusKind = classifyRiskPolicyStatus(change);
  const requestedTier =
    normalizePaperRiskTier(change?.requestedRisk) ??
    (statusKind === "legacy_unreported" ? normalizePaperRiskTier(persona.risk) : null);
  const effectiveTier = normalizePaperRiskTier(change?.effectiveRisk);
  const policyVersion = change?.policyVersion?.trim() || null;
  const approvalId = change?.approvalId?.trim() || null;
  const reason = change?.reason?.trim() || null;

  const tierText = (tier: PaperRiskTier | null): string =>
    tier ? t(`persona.riskPolicy.tiers.${tier}`, { defaultValue: tier }) : t("persona.riskPolicy.notRecorded");

  const statusText = t(`persona.riskPolicy.status.${statusKind}`);

  let hintText = "";
  if (statusKind === "effective") {
    hintText = t("persona.riskPolicy.effectiveHint", {
      effective: tierText(effectiveTier),
    });
  } else if (statusKind === "pending_approval") {
    hintText = effectiveTier
      ? t("persona.riskPolicy.pendingHintWithEffective", {
          requested: tierText(requestedTier),
          effective: tierText(effectiveTier),
        })
      : t("persona.riskPolicy.pendingHintWithoutEffective", {
          requested: tierText(requestedTier),
        });
  } else if (statusKind === "failed") {
    hintText = reason
      ? `${t("persona.riskPolicy.failedHint")} (${reason})`
      : t("persona.riskPolicy.failedHint");
  } else if (statusKind === "unavailable") {
    hintText = reason
      ? `${t("persona.riskPolicy.unavailableHint")} (${reason})`
      : t("persona.riskPolicy.unavailableHint");
  } else {
    hintText = t("persona.riskPolicy.legacyPayloadHint");
  }

  return (
    <Card
      className={cn("p-4 space-y-3", className)}
      data-testid="persona-risk-policy-status"
      data-policy-status={statusKind}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t("persona.riskPolicy.title")}
        </h3>
        <Badge
          variant="outline"
          className={cn("text-xs font-medium", STATUS_BADGE_TONE[statusKind])}
          data-testid="persona-risk-policy-state"
        >
          {statusText}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div data-testid="persona-requested-risk">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("persona.riskPolicy.requestedRisk")}
          </div>
          <div className="mt-1 text-sm">
            {requestedTier ? (
              <span className="inline-flex items-center gap-1.5">
                <RiskBadge level={requestedTier} />
                <span className="text-xs text-muted-foreground">
                  {t(`persona.riskPolicy.tiers.${requestedTier}`)}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">{t("persona.riskPolicy.notRecorded")}</span>
            )}
          </div>
        </div>

        <div data-testid="persona-effective-risk">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("persona.riskPolicy.effectiveRisk")}
          </div>
          <div className="mt-1 text-sm">
            {effectiveTier ? (
              <span className="inline-flex items-center gap-1.5">
                <RiskBadge level={effectiveTier} />
                <span className="text-xs text-muted-foreground">
                  {t(`persona.riskPolicy.tiers.${effectiveTier}`)}
                </span>
              </span>
            ) : statusKind === "unavailable" ? (
              <span className="text-muted-foreground">{t("persona.riskPolicy.status.unavailable")}</span>
            ) : statusKind === "legacy_unreported" ? (
              <span className="text-muted-foreground">{t("persona.riskPolicy.notRecorded")}</span>
            ) : (
              <span className="text-muted-foreground">{t("persona.riskPolicy.notEffective")}</span>
            )}
          </div>
        </div>

        <div data-testid="persona-risk-policy-version">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("persona.riskPolicy.policyVersion")}
          </div>
          <div className="mt-1 text-sm font-mono">
            {policyVersion ?? <span className="text-muted-foreground font-sans">{t("persona.riskPolicy.notBound")}</span>}
          </div>
        </div>

        <div data-testid="persona-risk-approval-id">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("persona.riskPolicy.approvalId")}
          </div>
          <div className="mt-1 text-sm font-mono break-all">
            {approvalId ?? <span className="text-muted-foreground font-sans">{t("persona.riskPolicy.noApproval")}</span>}
          </div>
        </div>
      </div>

      <p
        className="text-xs text-muted-foreground"
        data-testid="persona-risk-policy-hint"
      >
        {hintText}
      </p>

      {!editAccess.allowed && editAccess.reasonKey === "persona.riskPolicy.readOnlyHint" && (
        <p
          className="text-xs text-amber-700 font-medium"
          data-testid="persona-risk-readonly-hint"
        >
          {t("persona.riskPolicy.readOnlyHint")}
        </p>
      )}

      {saveError ? (
        <div
          className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800"
          data-testid="persona-risk-edit-error"
          role="alert"
        >
          {saveError}
        </div>
      ) : null}

      {editorOpen && editAccess.allowed ? (
        <div
          className="rounded border border-border bg-muted/30 p-3 space-y-3"
          data-testid="persona-risk-editor"
        >
          <div>
            <div className="text-sm font-medium">{t("persona.riskPolicy.editorTitle")}</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("persona.riskPolicy.editorDesc")}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label
                htmlFor="persona-risk-tier-select"
                className="block text-xs font-medium text-foreground"
              >
                {t("persona.riskPolicy.selectLabel")}
              </label>
              <select
                id="persona-risk-tier-select"
                data-testid="persona-risk-tier-select"
                aria-label={t("persona.riskPolicy.selectLabel")}
                className="h-9 min-w-44 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedTier}
                disabled={saving}
                onChange={(event) => {
                  const next = normalizePaperRiskTier(event.target.value);
                  if (next) onSelectTier(next);
                }}
              >
                {PAPER_RISK_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {t(`persona.riskPolicy.tiers.${tier}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                data-testid="persona-risk-save-button"
                disabled={saving}
                onClick={onSave}
              >
                {saving ? t("persona.riskPolicy.saving") : t("persona.riskPolicy.save")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="persona-risk-cancel-button"
                disabled={saving}
                onClick={onCancel}
              >
                {t("persona.riskPolicy.cancel")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
