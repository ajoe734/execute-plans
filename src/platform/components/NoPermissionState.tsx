// FE-VIEWER-APPROVALS-NO-PERMISSION-STATE-20261126: section-level read states.
// The data-permission-state / data-permission-surface attributes are the
// contract the hosted crawl reads to count a typed 403 as honest.
import { Lock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useT } from "@/platform/hooks";
import type { SectionReadState } from "@/lib/bff-v1/permissionState";

export const NoPermissionState = ({ surface }: { surface?: string }) => {
  const t = useT();
  return (
    <Card
      role="status"
      data-testid="no-permission-state"
      data-permission-state="no_permission"
      data-permission-surface={surface}
      className="p-6 text-sm text-muted-foreground flex items-start gap-3"
    >
      <Lock className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      <div>
        <div className="font-medium text-foreground">{t("permission.noPermission.title", { defaultValue: "No permission" })}</div>
        <div className="text-xs mt-1">
          {t("permission.noPermission.description", { defaultValue: "Your role cannot view this section." })}
        </div>
      </div>
    </Card>
  );
};

/** Compact marker for a tab trigger whose section the role cannot read. */
export const NoPermissionBadge = ({ surface }: { surface?: string }) => {
  const t = useT();
  return (
    <span
      data-testid="no-permission-badge"
      data-permission-state="no_permission"
      data-permission-surface={surface}
      className="ml-1.5 inline-flex items-center gap-0.5 rounded border border-border px-1 text-[10px] text-muted-foreground"
    >
      <Lock className="h-2.5 w-2.5" aria-hidden />
      {t("permission.noPermission.badge", { defaultValue: "No permission" })}
    </span>
  );
};

/** Existing-style error for a section read that failed for any other reason. */
export const SectionReadError = ({ message }: { message?: string }) => {
  const t = useT();
  return (
    <Card role="alert" data-testid="section-read-error" className="p-6 text-sm border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
      <div>
        <div>{t("permission.sectionReadError", { defaultValue: "Failed to load this section." })}</div>
        {message && <div className="text-mono text-xs mt-1">{message}</div>}
      </div>
    </Card>
  );
};

/**
 * Render a section's non-ok read state, or null when the section should render
 * its data. Use: `sectionReadFallback(state) ?? <DataTable ... />`.
 */
export function sectionReadFallback(state: SectionReadState) {
  if (state.status === "no_permission") return <NoPermissionState surface={state.surface} />;
  if (state.status === "error") return <SectionReadError message={state.message} />;
  return null;
}

/** Tab-trigger badge for a section the role cannot read, else undefined. */
export function sectionReadBadge(state: SectionReadState) {
  return state.status === "no_permission" ? <NoPermissionBadge surface={state.surface} /> : undefined;
}
