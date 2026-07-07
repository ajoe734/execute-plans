import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon?: LucideIcon;
  /** Pack E Q18/Q26 — when set, only the highest-priority item with this key
   *  highlights as active (priority = first occurrence in groups order). */
  dedupeKey?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

function findActiveDedupes(groups: NavGroup[], pathname: string): Set<string> {
  // Map dedupeKey → first matching `to`. All other matches with the same key
  // are suppressed from the active style.
  const winners = new Map<string, string>();
  for (const g of groups) {
    for (const it of g.items) {
      if (!it.dedupeKey) continue;
      if (winners.has(it.dedupeKey)) continue;
      // simple match: pathname starts with `to` (handles nested paths too)
      if (pathname === it.to || pathname.startsWith(it.to + "/")) {
        winners.set(it.dedupeKey, it.to);
      }
    }
  }
  // Return set of `to` values that should NOT highlight (losers).
  const losers = new Set<string>();
  for (const g of groups) {
    for (const it of g.items) {
      if (!it.dedupeKey) continue;
      const winner = winners.get(it.dedupeKey);
      if (winner && winner !== it.to) losers.add(it.to);
    }
  }
  return losers;
}

export const SideNav = ({ groups }: { groups: NavGroup[] }) => {
  const { pathname } = useLocation();
  const losers = findActiveDedupes(groups, pathname);
  return (
    <nav className="hidden w-60 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border py-4 px-2 lg:block lg:h-full lg:self-stretch lg:overflow-y-auto lg:overscroll-contain lg:scrollbar-thin">
      {groups.map((g) => (
        <div key={g.label} className="mb-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/80 px-3 mb-1">
            {g.label}
          </div>
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={`${g.label}__${it.to}`}>
                <NavLink
                  to={it.to}
                  end
                  className={({ isActive }) => {
                    const active = isActive && !losers.has(it.to);
                    return cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    );
                  }}
                >
                  {it.icon && <it.icon className="h-4 w-4" />}
                  {it.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
};
