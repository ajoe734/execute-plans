// Global store for the floating Management AI panel.
// Tiny external store (no zustand dependency).

import { useSyncExternalStore } from "react";

export type AgentPanelMode = "closed" | "minimized" | "normal" | "maximized";
export type Corner = "tl" | "tr" | "bl" | "br";

interface PanelState {
  mode: AgentPanelMode;
  // position (top-left) + size for "normal" mode
  x: number; y: number; w: number; h: number;
}

const STORAGE_KEY = "pantheon.agentPanel.v1";
const EDGE = 16;

function load(): PanelState {
  const defaultState: PanelState = {
    mode: "closed",
    x: typeof window !== "undefined" ? Math.max(EDGE, window.innerWidth - 460) : 800,
    y: typeof window !== "undefined" ? Math.max(EDGE, window.innerHeight - 660) : 80,
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
  snapToCorner(corner: Corner) {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = state.w, h = state.h;
    const x = corner === "tl" || corner === "bl" ? EDGE : Math.max(EDGE, vw - w - EDGE);
    const y = corner === "tl" || corner === "tr" ? EDGE : Math.max(EDGE, vh - h - EDGE);
    state = { ...state, x, y, mode: "normal" };
    emit();
  },
};

export function useAgentPanel(): PanelState & typeof agentPanel {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...s, ...agentPanel };
}
