// Floating, draggable, 8-handle-resizable Management AI panel.
// Mounted once in ManagementLayout; controlled via useAgentPanel().

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Brain, Minus, Maximize2, Minimize2, X, AlertTriangle } from "lucide-react";
import { agentPanel, normalPanelMaxSize, PANEL_EDGE, PANEL_MIN_H, PANEL_MIN_W, useAgentPanel, type Corner } from "./useAgentPanel";
import { AgentPanelBody } from "./AgentPanelBody";

const SNAP_RADIUS = 80;

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

  useEffect(() => {
    const onResize = () => agentPanel.ensureVisible();
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  if (panel.mode === "minimized" || panel.mode === "closed") {
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
  const maxNormalSize = !isMax ? normalPanelMaxSize() : null;
  const style: React.CSSProperties = isMax
    ? { top: PANEL_EDGE, left: PANEL_EDGE, right: PANEL_EDGE, bottom: PANEL_EDGE, width: "auto", height: "auto" }
    : {
        top: panel.y,
        left: panel.x,
        width: panel.w,
        height: panel.h,
        minWidth: Math.min(PANEL_MIN_W, maxNormalSize?.w ?? PANEL_MIN_W),
        minHeight: Math.min(PANEL_MIN_H, maxNormalSize?.h ?? PANEL_MIN_H),
        maxWidth: maxNormalSize?.w,
        maxHeight: maxNormalSize?.h,
      };

  const beginDrag = (kind: DragKind) => (e: React.PointerEvent) => {
    if (isMax) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
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
      if (d.kind.includes("e")) w = Math.max(PANEL_MIN_W, Math.min(vw - x - PANEL_EDGE, d.origW + dx));
      if (d.kind.includes("s")) h = Math.max(PANEL_MIN_H, Math.min(vh - y - PANEL_EDGE, d.origH + dy));
      if (d.kind.includes("w")) {
        const newW = Math.max(PANEL_MIN_W, d.origW - dx);
        x = d.origX + (d.origW - newW); w = newW;
      }
      if (d.kind.includes("n")) {
        const newH = Math.max(PANEL_MIN_H, d.origH - dy);
        y = d.origY + (d.origH - newH); h = newH;
      }
    }
    panel.setRect({ x, y, w, h });
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    if (d.kind !== "move") return;

    // Snap to nearest corner if center is within radius.
    const vw = window.innerWidth, vh = window.innerHeight;
    const current = agentPanel.getState();
    const cx = current.x + current.w / 2;
    const cy = current.y + current.h / 2;
    const corners: Array<[Corner, number, number]> = [
      ["tl", PANEL_EDGE, PANEL_EDGE],
      ["tr", vw - PANEL_EDGE, PANEL_EDGE],
      ["bl", PANEL_EDGE, vh - PANEL_EDGE],
      ["br", vw - PANEL_EDGE, vh - PANEL_EDGE],
    ];
    for (const [corner, px, py] of corners) {
      const dist = Math.hypot(
        cx - (corner.includes("l") ? px + current.w / 2 : px - current.w / 2),
        cy - (corner.includes("t") ? py + current.h / 2 : py - current.h / 2),
      );
      if (dist < SNAP_RADIUS) { panel.snapToCorner(corner); return; }
    }
    agentPanel.ensureVisible();
  };

  const handle = (kind: DragKind, className: string, cursor: string, visible = false) => (
    <div
      onPointerDown={beginDrag(kind)}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`absolute z-20 touch-none select-none ${className}`}
      style={{ cursor, touchAction: "none" }}
      aria-hidden="true"
    >
      {visible && (
        <span className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-sm border-b-2 border-r-2 border-muted-foreground/40 bg-background/60" />
      )}
    </div>
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
          {handle("n",  "top-0 left-8 right-8 h-3 -translate-y-1", "ns-resize")}
          {handle("s",  "bottom-0 left-8 right-8 h-4 translate-y-1", "ns-resize")}
          {handle("e",  "right-0 top-8 bottom-8 w-4 translate-x-1", "ew-resize")}
          {handle("w",  "left-0 top-8 bottom-8 w-4 -translate-x-1", "ew-resize")}
          {handle("nw", "top-0 left-0 w-8 h-8 -translate-x-1 -translate-y-1", "nwse-resize")}
          {handle("ne", "top-0 right-0 w-8 h-8 translate-x-1 -translate-y-1", "nesw-resize")}
          {handle("sw", "bottom-0 left-0 w-8 h-8 -translate-x-1 translate-y-1", "nesw-resize")}
          {handle("se", "bottom-0 right-0 w-9 h-9 translate-x-1 translate-y-1", "nwse-resize", true)}
        </>
      )}

      <div
        onPointerDown={beginDrag("move")}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => panel.maximize()}
        className={`flex items-center gap-2 px-3 py-1.5 border-b bg-muted/40 ${isMax ? "" : "cursor-move"} select-none touch-none`}
        style={{ touchAction: "none" }}
      >
        <Brain className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Management AI</span>
        <span className="flex items-center gap-1 text-[10px] text-destructive ml-2">
          <AlertTriangle className="h-3 w-3" /> 測試模式
        </span>
        <div className="ml-auto flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => panel.reset()} title="還原小窗">
            <Minimize2 className="h-3 w-3" />
          </Button>
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
