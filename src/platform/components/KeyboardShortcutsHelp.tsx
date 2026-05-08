// Planner Response §E17 (2026-05-07) — Global keyboard shortcuts.
// Source: §6.E17.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ShortcutDef {
  keys: string[];
  action: string;
  label: string;
  /** Optional route to navigate when the shortcut fires. */
  route?: string;
}

export const GLOBAL_SHORTCUTS: readonly ShortcutDef[] = [
  { keys: ["?"],      action: "shortcuts.help",      label: "Open shortcut help" },
  { keys: ["g", "c"], action: "nav.controlRoom",     label: "Control Room",    route: "/management" },
  { keys: ["g", "s"], action: "nav.strategies",      label: "Strategy Registry", route: "/management/strategies" },
  { keys: ["g", "p"], action: "nav.personas",        label: "Persona Registry",  route: "/management/personas" },
  { keys: ["g", "e"], action: "nav.executionLoop",   label: "Execution Loop",    route: "/management/loops/execution" },
  { keys: ["g", "o"], action: "nav.optimizationLoop",label: "Optimization Loop", route: "/management/loops/optimization" },
  { keys: ["g", "i"], action: "nav.interventions",   label: "Interventions",     route: "/management/interventions" },
  { keys: ["/"],      action: "search.open",         label: "Search / command palette" },
  { keys: ["Esc"],    action: "overlay.close",       label: "Close topmost overlay" },
];

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

/** React hook — listens for `?` to open shortcut help and `g <x>` chords for nav. */
export function useGlobalShortcuts(args?: { onOpenSearch?: () => void }): { helpOpen: boolean; setHelpOpen: (o: boolean) => void } {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTextInput(document.activeElement)) return;

      // chord reset on Escape
      if (e.key === "Escape") {
        setPendingG(false);
        return;
      }
      if (pendingG) {
        const route = GLOBAL_SHORTCUTS.find((s) => s.keys.length === 2 && s.keys[0] === "g" && s.keys[1] === e.key)?.route;
        setPendingG(false);
        if (route) {
          e.preventDefault();
          navigate(route);
        }
        return;
      }
      if (e.key === "g") {
        setPendingG(true);
        // auto-cancel chord after 1.2s
        setTimeout(() => setPendingG(false), 1200);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        args?.onOpenSearch?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingG, navigate, args]);

  return { helpOpen, setHelpOpen };
}

export function KeyboardShortcutsHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <table className="w-full text-sm">
          <tbody>
            {GLOBAL_SHORTCUTS.map((s) => (
              <tr key={s.action} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3">
                  {s.keys.map((k, i) => (
                    <span key={i}>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded text-mono text-[11px]">{k}</kbd>
                      {i < s.keys.length - 1 && <span className="mx-1 text-muted-foreground">then</span>}
                    </span>
                  ))}
                </td>
                <td className="py-1.5 text-muted-foreground">{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">Shortcuts are disabled while typing in inputs.</p>
      </DialogContent>
    </Dialog>
  );
}
