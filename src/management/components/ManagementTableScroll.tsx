import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type ManagementTableScrollProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  pinnedClassName?: string;
  viewportClassName?: string;
  testId?: string;
  minScrollWidth?: number;
};

const DEFAULT_MIN_SCROLL_WIDTH = 1040;

export function ManagementTableScroll({
  children,
  className,
  contentClassName,
  pinnedClassName,
  viewportClassName,
  testId,
  minScrollWidth = DEFAULT_MIN_SCROLL_WIDTH,
}: ManagementTableScrollProps) {
  const pinnedRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(minScrollWidth);

  const syncScroll = useCallback((source: HTMLDivElement | null, target: HTMLDivElement | null) => {
    if (!source || !target) return;
    if (Math.abs(target.scrollLeft - source.scrollLeft) > 1) {
      target.scrollLeft = source.scrollLeft;
    }
  }, []);

  const measure = useCallback(() => {
    const contentWidth = contentRef.current?.scrollWidth ?? 0;
    const viewportWidth = viewportRef.current?.scrollWidth ?? 0;
    setScrollWidth(Math.max(minScrollWidth, contentWidth, viewportWidth));
  }, [minScrollWidth]);

  useLayoutEffect(() => {
    measure();
  }, [children, measure]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  return (
    <div
      className={cn("relative max-w-full", className)}
      data-management-table-scroll="pinned-horizontal"
      data-testid={testId}
    >
      <div
        ref={pinnedRef}
        aria-hidden="true"
        className={cn(
          "sticky top-14 z-30 h-4 overflow-x-auto overflow-y-hidden border-b border-border bg-card/95 [scrollbar-gutter:stable]",
          pinnedClassName,
        )}
        data-management-table-scrollbar="pinned"
        onScroll={() => syncScroll(pinnedRef.current, viewportRef.current)}
      >
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
      <div
        ref={viewportRef}
        className={cn("overflow-x-auto overscroll-x-contain", viewportClassName)}
        data-management-table-scrollbar="native"
        onScroll={() => syncScroll(viewportRef.current, pinnedRef.current)}
      >
        <div ref={contentRef} className={cn("min-w-fit", contentClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}
