import { create } from "zustand";

export type Environment = "research" | "paper" | "live";
export type Locale = "en-US" | "zh-TW";
export type UserRole =
  | "admin"
  | "research_lead"
  | "risk_officer"
  | "capital_manager"
  | "strategy_manager"
  | "system_operator"
  | "reviewer"
  | "capability_admin"
  | "analyst"
  | "trader"
  | "ai_trainer";

interface PlatformState {
  env: Environment;
  setEnv: (e: Environment) => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
  role: UserRole;
  setRole: (r: UserRole) => void;
  bffOnline: boolean;
  setBffOnline: (v: boolean) => void;
}

export const usePlatform = create<PlatformState>((set) => ({
  env: (localStorage.getItem("pantheon.env") as Environment) || "research",
  setEnv: (e) => {
    localStorage.setItem("pantheon.env", e);
    set({ env: e });
  },
  locale: (localStorage.getItem("pantheon.locale") as Locale) || "zh-TW",
  setLocale: (l) => {
    localStorage.setItem("pantheon.locale", l);
    set({ locale: l });
  },
  role: (localStorage.getItem("pantheon.role") as UserRole) || "admin",
  setRole: (r) => {
    localStorage.setItem("pantheon.role", r);
    set({ role: r });
  },
  bffOnline: true,
  setBffOnline: (v) => set({ bffOnline: v }),
}));
