// Floating, draggable, 8-handle-resizable Management AI panel.
// Mounted once in ManagementLayout; controlled via useAgentPanel().

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Brain, Minus, Maximize2, Minimize2, X, AlertTriangle } from "lucide-react";
import { useAgentPanel, type Corner } from "./useAgentPanel";
import { AgentPanelBody } from "./AgentPanelBody";

const MIN_W = 320, MIN_H = 360, EDGE = 16, SNAP_RADIUS = 80;

type DragKind = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface DragState {
  kind: DragKind;
  startX: number; startY: number;
  origX: number; origY: number; origW: number; origH: number;
}

export function FloatingAgentPanel() {
  const panel = useAgentPanel();
  const dragRef = useRef<DragState | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Keyboard shortcut: Ctrl/Cmd+Shift+A toggles panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        panel.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  if (!mounted || typeof document === "undefined") return null;

  if (panel.mode === "minimized" || panel.mode === "closed") {
    if (panel.mode === "closed") return null;
    return createPortal(
      <button
        type="button"
        onClick={() => panel.open()}
        className="fixed bottom-4 right-4 z-[60] h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition flex items-center justify-center"
        aria-label="開啟 Management AI"
        title="Management AI (Ctrl+Shift+A)"
      >
        <Brain className="h-5 w-5" />
      </button>,
      document.body,
    );
  }

  const isMax = panel.mode === "maximized";
  const style: React.CSSProperties = isMax
    ? { top: EDGE, left: EDGE, right: EDGE, bottom: EDGE, width: "auto", height: "auto" }
    : { top: panel.y, left: panel.x, width: panel.w, height: panel.h };

  const beginDrag = (kind: DragKind) => (e: React.PointerEvent) => {
    if (isMax) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      startX: e.clientX, startY: e.clientY,
      origX: panel.x, origY: panel.y, origW: panel.w, origH: panel.h,
    };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d || isMax) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const vw = window.innerWidth, vh = window.innerHeight;
    let { origX: x, origY: y, origW: w, origH: h } = d;

    if (d.kind === "move") {
      x = d.origX + dx; y = d.origY + dy;
    } else {
      if (d.kind.includes("e")) w = Math.max(MIN_W, Math.min(vw - x - EDGE, d.origW + dx));
      if (d.kind.includes("s")) h = Math.max(MIN_H, Math.min(vh - y - EDGE, d.origH + dy));
      if (d.kind.includes("w")) {
        const newW = Math.max(MIN_W, d.origW - dx);
        x = d.origX + (d.origW - newW); w = newW;
      }
      if (d.kind.includes("n")) {
        const newH = Math.max(MIN_H, d.origH - dy);
        y = d.origY + (d.origH - newH); h = newH;
      }
    }
    panel.setRect({ x, y, w, h });
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    dragRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    if (d.kind !== "move") return;

    // Snap to nearest corner if center is within radius.
    const vw = window.innerWidth, vh = window.innerHeight;
    const cx = panel.x + panel.w / 2;
    const cy = panel.y + panel.h / 2;
    const corners: Array<[Corner, number, number]> = [
      ["tl", EDGE, EDGE],
      ["tr", vw - EDGE, EDGE],
      ["bl", EDGE, vh - EDGE],
      ["br", vw - EDGE, vh - EDGE],
    ];
    for (const [corner, px, py] of corners) {
      const dist = Math.hypot(
        cx - (corner.includes("l") ? px + panel.w / 2 : px - panel.w / 2),
        cy - (corner.includes("t") ? py + panel.h / 2 : py - panel.h / 2),
      );
      if (dist < SNAP_RADIUS) { panel.snapToCorner(corner); return; }
    }
    // Otherwise clamp to keep visible.
    const minVisible = 80;
    const nx = Math.max(minVisible - panel.w, Math.min(vw - minVisible, panel.x));
    const ny = Math.max(0, Math.min(vh - 40, panel.y));
    if (nx !== panel.x || ny !== panel.y) panel.setRect({ x: nx, y: ny });
  };

  const handle = (kind: DragKind, className: string, cursor: string) => (
    <div
      onPointerDown={beginDrag(kind)}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`absolute z-10 ${className}`}
      style={{ cursor }}
    />
  );

  return createPortal(
    <div
      className="fixed z-[60] flex flex-col rounded-lg border bg-background shadow-2xl overflow-hidden"
      style={style}
      role="dialog"
      aria-label="Management AI"
    >
      {/* Resize handles — only when not maximized */}
      {!isMax && (
        <>
          {handle("n",  "top-0 left-2 right-2 h-1", "ns-resize")}
          {handle("s",  "bottom-0 left-2 right-2 h-1", "ns-resize")}
          {handle("e",  "right-0 top-2 bottom-2 w-1", "ew-resize")}
          {handle("w",  "left-0 top-2 bottom-2 w-1", "ew-resize")}
          {handle("nw", "top-0 left-0 w-3 h-3", "nwse-resize")}
          {handle("ne", "top-0 right-0 w-3 h-3", "nesw-resize")}
          {handle("sw", "bottom-0 left-0 w-3 h-3", "nesw-resize")}
          {handle("se", "bottom-0 right-0 w-3 h-3", "nwse-resize")}
        </>
      )}

      <div
        onPointerDown={beginDrag("move")}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => panel.maximize()}
        className={`flex items-center gap-2 px-3 py-1.5 border-b bg-muted/40 ${isMax ? "" : "cursor-move"} select-none`}
      >
        <Brain className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Management AI</span>
        <span className="flex items-center gap-1 text-[10px] text-destructive ml-2">
          <AlertTriangle className="h-3 w-3" /> 測試模式
        </span>
        <div className="ml-auto flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => panel.minimize()} title="最小化">
            <Minus className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => panel.maximize()} title={isMax ? "還原" : "最大化"}>
            {isMax ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => panel.close()} title="關閉">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <AgentPanelBody />
    </div>,
    document.body,
  );
}
