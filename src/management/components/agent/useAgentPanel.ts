// Global store for the floating Management AI panel.
// Tiny external store (no zustand dependency).

import { useSyncExternalStore } from "react";

export type AgentPanelMode = "closed" | "minimized" | "normal" | "maximized";

interface PanelState {
  mode: AgentPanelMode;
  // position (top-left) + size for "normal" mode
  x: number; y: number; w: number; h: number;
}

const STORAGE_KEY = "pantheon.agentPanel.v1";

function load(): PanelState {
  const defaultState: PanelState = {
    mode: "closed",
    x: typeof window !== "undefined" ? Math.max(16, window.innerWidth - 460) : 800,
    y: typeof window !== "undefined" ? Math.max(16, window.innerHeight - 660) : 80,
    w: 440, h: 620,
  };
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const p = JSON.parse(raw) as Partial<PanelState>;
    return { ...defaultState, ...p, mode: p.mode === "maximized" ? "normal" : (p.mode ?? "closed") };
  } catch { return defaultState; }
}

let state: PanelState = load();
const listeners = new Set<() => void>();

function emit() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => state;

export const agentPanel = {
  open() {
    state = { ...state, mode: state.mode === "closed" ? "normal" : state.mode === "minimized" ? "normal" : state.mode };
    emit();
  },
  toggle() {
    state = { ...state, mode: state.mode === "closed" || state.mode === "minimized" ? "normal" : "minimized" };
    emit();
  },
  close() { state = { ...state, mode: "closed" }; emit(); },
  minimize() { state = { ...state, mode: "minimized" }; emit(); },
  maximize() { state = { ...state, mode: state.mode === "maximized" ? "normal" : "maximized" }; emit(); },
  setRect(p: Partial<Pick<PanelState, "x" | "y" | "w" | "h">>) {
    state = { ...state, ...p }; emit();
  },
};

export function useAgentPanel(): PanelState & typeof agentPanel {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...s, ...agentPanel };
}
