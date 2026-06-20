// Global store for the floating Management AI panel.
// Tiny external store (no zustand dependency).

import { useSyncExternalStore } from "react";

export type AgentPanelMode = "closed" | "minimized" | "normal" | "maximized";
export type Corner = "tl" | "tr" | "bl" | "br";

export interface PanelState {
  mode: AgentPanelMode;
  // position (top-left) + size for "normal" mode
  x: number; y: number; w: number; h: number;
}

const STORAGE_KEY = "pantheon.agentPanel.v1";
export const PANEL_EDGE = 16;
export const PANEL_MIN_W = 320;
export const PANEL_MIN_H = 360;
const DEFAULT_W = 440;
const DEFAULT_H = 560;
const NORMAL_MAX_W = 960;
const NORMAL_MAX_H = 720;
const NORMAL_MAX_W_RATIO = 0.72;
const NORMAL_MAX_H_RATIO = 0.78;

export interface PanelViewport {
  width: number;
  height: number;
}

function viewport(): PanelViewport {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cleanMode(mode: unknown): AgentPanelMode {
  if (mode === "closed" || mode === "minimized" || mode === "normal") return mode;
  return "normal";
}

export function normalPanelMaxSize(vp: PanelViewport = viewport()): Pick<PanelState, "w" | "h"> {
  const width = Math.max(1, finiteNumber(vp.width, 1280));
  const height = Math.max(1, finiteNumber(vp.height, 800));
  const availableW = Math.max(1, width - PANEL_EDGE * 2);
  const availableH = Math.max(1, height - PANEL_EDGE * 2);
  return {
    w: Math.min(
      availableW,
      Math.max(PANEL_MIN_W, Math.min(NORMAL_MAX_W, Math.round(width * NORMAL_MAX_W_RATIO))),
    ),
    h: Math.min(
      availableH,
      Math.max(PANEL_MIN_H, Math.min(NORMAL_MAX_H, Math.round(height * NORMAL_MAX_H_RATIO))),
    ),
  };
}

export function normalizePanelState(input: Partial<PanelState>, vp: PanelViewport = viewport()): PanelState {
  const width = Math.max(1, finiteNumber(vp.width, 1280));
  const height = Math.max(1, finiteNumber(vp.height, 800));
  const { w: maxW, h: maxH } = normalPanelMaxSize({ width, height });
  const minW = Math.min(PANEL_MIN_W, maxW);
  const minH = Math.min(PANEL_MIN_H, maxH);
  const w = clamp(finiteNumber(input.w, Math.min(DEFAULT_W, maxW)), minW, maxW);
  const h = clamp(finiteNumber(input.h, Math.min(DEFAULT_H, maxH)), minH, maxH);
  const maxX = Math.max(PANEL_EDGE, width - w - PANEL_EDGE);
  const maxY = Math.max(PANEL_EDGE, height - h - PANEL_EDGE);
  const fallbackX = Math.max(PANEL_EDGE, width - w - PANEL_EDGE);
  const fallbackY = Math.max(PANEL_EDGE, height - h - PANEL_EDGE);

  return {
    mode: cleanMode(input.mode),
    x: clamp(finiteNumber(input.x, fallbackX), PANEL_EDGE, maxX),
    y: clamp(finiteNumber(input.y, fallbackY), PANEL_EDGE, maxY),
    w,
    h,
  };
}

function defaultState(): PanelState {
  return normalizePanelState({
    mode: "closed",
    x: typeof window !== "undefined" ? window.innerWidth - DEFAULT_W - PANEL_EDGE : 800,
    y: typeof window !== "undefined" ? window.innerHeight - DEFAULT_H - PANEL_EDGE : 80,
    w: DEFAULT_W,
    h: DEFAULT_H,
  });
}

function load(): PanelState {
  const fallback = defaultState();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<PanelState>;
    return normalizePanelState({ ...fallback, ...p, mode: p.mode === "maximized" ? "normal" : (p.mode ?? "closed") });
  } catch { return fallback; }
}

let state: PanelState = load();
const listeners = new Set<() => void>();

function sameState(a: PanelState, b: PanelState): boolean {
  return a.mode === b.mode && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function commit(next: PanelState) {
  if (sameState(state, next)) return;
  state = next;
  emit();
}

function emit() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => state;

export const agentPanel = {
  open() {
    commit(normalizePanelState({ ...state, mode: state.mode === "closed" || state.mode === "minimized" ? "normal" : state.mode }));
  },
  toggle() {
    commit(normalizePanelState({ ...state, mode: state.mode === "closed" || state.mode === "minimized" ? "normal" : "minimized" }));
  },
  close() { commit({ ...state, mode: "closed" }); },
  minimize() { commit({ ...state, mode: "minimized" }); },
  maximize() { commit({ ...normalizePanelState(state), mode: state.mode === "maximized" ? "normal" : "maximized" }); },
  reset() { commit({ ...defaultState(), mode: "normal" }); },
  ensureVisible() { commit({ ...normalizePanelState(state), mode: state.mode }); },
  getState() { return state; },
  setRect(p: Partial<Pick<PanelState, "x" | "y" | "w" | "h">>) {
    commit({ ...normalizePanelState({ ...state, ...p }), mode: state.mode === "maximized" ? "normal" : state.mode });
  },
  snapToCorner(corner: Corner) {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const { w, h } = normalizePanelState(state);
    const x = corner === "tl" || corner === "bl" ? PANEL_EDGE : Math.max(PANEL_EDGE, vw - w - PANEL_EDGE);
    const y = corner === "tl" || corner === "tr" ? PANEL_EDGE : Math.max(PANEL_EDGE, vh - h - PANEL_EDGE);
    commit(normalizePanelState({ ...state, x, y, w, h, mode: "normal" }));
  },
};

export function useAgentPanel(): PanelState & typeof agentPanel {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...s, ...agentPanel };
}
