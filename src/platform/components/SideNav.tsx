import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface NavGroup {
  label: string;
  items: { to: string; label: string; icon?: LucideIcon }[];
}

export const SideNav = ({ groups }: { groups: NavGroup[] }) => (
  <nav className="w-60 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-[calc(100vh-3.5rem)] overflow-y-auto py-4 px-2">
    {groups.map((g) => (
      <div key={g.label} className="mb-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/50 px-3 mb-1">
          {g.label}
        </div>
        <ul className="space-y-0.5">
          {g.items.map((it) => (
            <li key={it.to}>
              <NavLink
                to={it.to}
                end
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )
                }
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
