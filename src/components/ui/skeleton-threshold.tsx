// Pack D D43 — Skeleton with 200ms threshold + 300ms minimum display.
import * as React from "react";

export interface SkeletonThresholdProps {
  loading: boolean;
  thresholdMs?: number;
  minDisplayMs?: number;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

export function SkeletonThreshold({
  loading,
  thresholdMs = 200,
  minDisplayMs = 300,
  fallback,
  children,
}: SkeletonThresholdProps) {
  const [showSkeleton, setShowSkeleton] = React.useState(false);
  const shownAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    if (loading) {
      showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShowSkeleton(true);
      }, thresholdMs);
    } else if (showSkeleton && shownAtRef.current != null) {
      const elapsed = Date.now() - shownAtRef.current;
      const remaining = Math.max(0, minDisplayMs - elapsed);
      hideTimer = setTimeout(() => {
        setShowSkeleton(false);
        shownAtRef.current = null;
      }, remaining);
    }
    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [loading, showSkeleton, thresholdMs, minDisplayMs]);

  if (loading || showSkeleton) return <>{fallback}</>;
  return <>{children}</>;
}
