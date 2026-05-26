// Floating, draggable, resizable Management AI panel.
// Mounted once in ManagementLayout; controlled via useAgentPanel().

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Brain, Minus, Maximize2, Minimize2, X, AlertTriangle } from "lucide-react";
import { useAgentPanel } from "./useAgentPanel";
import { AgentPanelBody } from "./AgentPanelBody";

export function FloatingAgentPanel() {
  const panel = useAgentPanel();
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === "undefined") return null;

  // Minimized -> floating action button bottom-right.
  if (panel.mode === "minimized" || panel.mode === "closed") {
    if (panel.mode === "closed") return null;
    return createPortal(
      <button
        type="button"
        onClick={() => panel.open()}
        className="fixed bottom-4 right-4 z-[60] h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition flex items-center justify-center"
        aria-label="開啟 Management AI"
        title="Management AI"
      >
        <Brain className="h-5 w-5" />
      </button>,
      document.body,
    );
  }

  const isMax = panel.mode === "maximized";
  const style: React.CSSProperties = isMax
    ? { top: 16, left: 16, right: 16, bottom: 16, width: "auto", height: "auto" }
    : { top: panel.y, left: panel.x, width: panel.w, height: panel.h };

  const onDragStart = (e: React.PointerEvent) => {
    if (isMax) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: panel.x, origY: panel.y };
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current || isMax) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nx = Math.max(0, Math.min(window.innerWidth - 80, dragRef.current.origX + dx));
    const ny = Math.max(0, Math.min(window.innerHeight - 40, dragRef.current.origY + dy));
    panel.setRect({ x: nx, y: ny });
  };
  const onDragEnd = () => { dragRef.current = null; };

  // Persist resize from CSS `resize: both`.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isMax) return;
    const el = bodyRef.current; if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const ent of entries) {
        const w = Math.round(ent.contentRect.width);
        const h = Math.round(ent.contentRect.height);
        if (w !== panel.w || h !== panel.h) panel.setRect({ w, h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMax, panel.w, panel.h]);

  return createPortal(
    <div
      ref={bodyRef}
      className="fixed z-[60] flex flex-col rounded-lg border bg-background shadow-2xl overflow-hidden"
      style={{
        ...style,
        minWidth: 320, minHeight: 360,
        resize: isMax ? "none" : "both",
      }}
      role="dialog"
      aria-label="Management AI"
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className={`flex items-center gap-2 px-3 py-1.5 border-b bg-muted/40 ${isMax ? "" : "cursor-move"} select-none`}
      >
        <Brain className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Management AI</span>
        <span className="flex items-center gap-1 text-[10px] text-destructive ml-2">
          <AlertTriangle className="h-3 w-3" /> 測試模式
        </span>
        <div className="ml-auto flex items-center gap-0.5">
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
