import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  ClipboardCheck,
  PieChart,
  Trophy,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

// PPL-ALLOC-006 — persona-league/quarterly-ranking are Promotion & Allocation
// tabs now (not separate pages); link straight to the tab, skipping the
// legacy-path redirect hop.
const OPERATIONS_LINKS = [
  { to: "/management/persona-fleet", labelKey: "nav.personaFleet", icon: Users },
  { to: "/management/performance?tab=overview", labelKey: "nav.portfolioBook", icon: PieChart },
  { to: "/management/performance?tab=attribution", labelKey: "nav.performanceAttribution", icon: BarChart3 },
  { to: "/management/promotion-allocation?tab=real-ranking", labelKey: "nav.personaLeague", icon: Trophy },
  { to: "/management/promotion-allocation?tab=paper-candidates", labelKey: "nav.quarterlyRanking", icon: ClipboardCheck },
  { to: "/management/human-inbox", labelKey: "nav.humanInbox", icon: ClipboardCheck },
] as const;

export function ManagementOperationsNav({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("mgmt.operationsNav.label", { defaultValue: "Persona operations workflow" })}
      className={cn("shrink-0 overflow-x-auto border-b border-border", className)}
      data-testid="management-operations-nav"
    >
      <div className="flex min-w-max items-center gap-1">
        {OPERATIONS_LINKS.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => cn(
              "inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
