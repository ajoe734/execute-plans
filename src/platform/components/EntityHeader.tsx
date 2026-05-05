// EntityHeader — Spec §3.1.
// Single header strip for any BaseObject detail page: ID + label + StatusBadge +
// RiskBadge + owner + env + actions. Replaces ad-hoc PageHeader+meta combinations.
import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, GitBranch, BookMarked, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { RiskBadge } from "./RiskBadge";
import { useT } from "@/platform/hooks";
import type { BaseObject } from "@/lib/bff/types";
import { resolveEntity, lineageHref, decisionsHref, auditHref } from "@/lib/entityLinks";

interface Props {
  object: Pick<BaseObject, "id" | "name" | "owner" | "updatedAt" | "state" | "risk" | "labelKey">;
  /** Optional environment chip (research / paper / live). */
  env?: "research" | "paper" | "live";
  /** Subtitle line under the entity name (e.g. alpha id, kind, version). */
  subtitle?: ReactNode;
  /** Right-aligned action slot. */
  actions?: ReactNode;
  /** Hide the back button (default: shown). */
  hideBack?: boolean;
}

export const EntityHeader = ({ object, env, subtitle, actions, hideBack }: Props) => {
  const t = useT();
  const navigate = useNavigate();
  const label = object.labelKey ? t(object.labelKey, { defaultValue: object.name }) : object.name;

  return (
    <div className="border-b border-border bg-card px-6 py-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-mono text-[10px]">{object.id}</Badge>
            <h1 className="text-xl font-semibold tracking-tight truncate">{label}</h1>
            <StatusBadge state={object.state} />
            <RiskBadge level={object.risk} />
            {env && (
              <Badge variant="secondary" className="text-mono text-[10px] uppercase">
                {t(`env.${env}`, { defaultValue: env })}
              </Badge>
            )}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span>
              {t("common.owner")}: <span className="text-mono text-foreground/80">{object.owner}</span>
            </span>
            <span>
              {t("common.updated")}: <span className="text-mono text-foreground/80">{new Date(object.updatedAt).toLocaleString()}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!hideBack && (
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" />{t("common.back")}
            </Button>
          )}
          {resolveEntity(object.id) && (
            <div className="flex items-center gap-1">
              <Link to={lineageHref(object.id)} title={t("audit.openLineage")}>
                <Button variant="ghost" size="icon" className="h-8 w-8"><GitBranch className="h-4 w-4" /></Button>
              </Link>
              <Link to={decisionsHref(object.id)} title={t("audit.openDecisions")}>
                <Button variant="ghost" size="icon" className="h-8 w-8"><BookMarked className="h-4 w-4" /></Button>
              </Link>
              <Link to={auditHref(object.id)} title={t("audit.openAudit")}>
                <Button variant="ghost" size="icon" className="h-8 w-8"><History className="h-4 w-4" /></Button>
              </Link>
            </div>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
};
