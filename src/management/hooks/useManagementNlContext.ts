// 2026-05-20 PM-8 — useManagementNlContext hook.
// Derives `ManagementNlContext` from current route + (optional) selected
// entity registered via the context store. Pure read; never mutates state.

import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import type { ManagementNlContext } from "@/lib/v5/management/nl";

type Listener = (v: Partial<ManagementNlContext>) => void;

interface Store {
  state: Partial<ManagementNlContext>;
  listeners: Set<Listener>;
}

const store: Store = { state: {}, listeners: new Set() };

export function setManagementNlContext(patch: Partial<ManagementNlContext>) {
  store.state = { ...store.state, ...patch };
  store.listeners.forEach((l) => l(store.state));
}

export function clearManagementNlContext() {
  store.state = {};
  store.listeners.forEach((l) => l(store.state));
}

const ROUTE_LABELS: Record<string, string> = {
  "/management/cockpit": "Pathreon Management Cockpit",
  "/management/persona-fleet": "Persona Fleet",
  "/management/human-inbox": "Human Inbox",
  "/management/trading-pulse": "Trading Pulse",
  "/management/evolution-journal": "Evolution Journal",
  "/management/evidence": "Evidence Explorer",
  "/management/persona-intent": "Persona Intent Audit",
  "/management/promotion-allocation": "Promotion & Allocation",
  "/management/ask": "Ask Management",
};

export function useManagementNlContext(): ManagementNlContext {
  const location = useLocation();
  const [extra, setExtra] = useState<Partial<ManagementNlContext>>(store.state);
  useEffect(() => {
    const listener: Listener = (v) => setExtra({ ...v });
    store.listeners.add(listener);
    return () => { store.listeners.delete(listener); };
  }, []);
  return {
    routePath: location.pathname,
    pageLabel: ROUTE_LABELS[location.pathname],
    ...extra,
  };
}

/** Imperative setter usable outside React. */
export const managementNlContextActions = {
  set: setManagementNlContext,
  clear: clearManagementNlContext,
  read: useCallback ? () => store.state : () => store.state,
};
