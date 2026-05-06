// v4 / Pack C §C056–C058 — Accessibility (WCAG 2.1 AA), keyboard shortcuts, reduced motion.

export const A11Y_TARGET = "WCAG_2_1_AA" as const;

export interface A11yRule { id: string; rule: string }

export const A11Y_RULES: readonly A11yRule[] = [
  { id: "kbd_reachable", rule: "All interactive elements keyboard reachable." },
  { id: "disabled_reason_aria", rule: "PermissionAwareButton disabled reason via tooltip + aria-describedby." },
  { id: "modal_focus_trap", rule: "Modal focus trap mandatory." },
  { id: "table_kbd_nav", rule: "DataTable supports keyboard row navigation." },
  { id: "no_color_only_status", rule: "StatusBadge always includes text + icon, never color-only." },
  { id: "risk_color_contrast", rule: "Risk high/critical colors must pass 4.5:1 contrast." },
  { id: "chart_text_fallback", rule: "Charts provide table fallback or accessible summary." },
];

// C057 — Global keyboard shortcuts
export const SHORTCUTS = {
  help: "?",
  goto_strategies: "g s",
  goto_personas: "g p",
  goto_capital: "g c",
  goto_jobs: "g j",
  goto_agora_daily: "g a",
  search: "/",
  close_overlay: "Escape",
  command_palette: "Mod+K",
} as const;

// C058 — prefers-reduced-motion: only opacity transitions ≤150ms allowed.
export const REDUCED_MOTION_MAX_MS = 150;
