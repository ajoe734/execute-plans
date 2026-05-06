// v4 / Pack C §C050–C051 — Dark mode + density tokens.
// CSS variables themselves live in src/index.css; this file declares the contract & user prefs.

export type ThemePreference = "system" | "light" | "dark";
export type DensityPreference = "comfortable" | "compact";

export interface UserUiPreferences {
  theme: ThemePreference;
  density: DensityPreference;
}

export const UI_DEFAULT_PREFS: UserUiPreferences = {
  theme: "system",
  density: "comfortable",
};

export const ROW_HEIGHT_PX = {
  comfortable: 44,
  compact: 32,
} as const;

/** Tokens that MUST exist in both :root and [data-theme='dark'] (Pack C C050). */
export const REQUIRED_THEME_TOKENS = [
  "--bg", "--fg", "--surface",
  "--status-live", "--status-paper", "--risk-high",
] as const;
