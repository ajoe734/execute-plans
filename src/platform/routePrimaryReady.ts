import { scheduleIdleTask, cancelIdleTask, type IdleTaskHandle } from "@/lib/idleTask";

export const ROUTE_PRIMARY_READY_EVENT = "pantheon:route-primary-ready";

interface RoutePrimaryReadyDetail {
  pathname: string;
  markedAt: number;
}

const readyPathnames = new Set<string>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function currentPathname(): string {
  return isBrowser() ? window.location.pathname : "/";
}

export function markRoutePrimaryReady(pathname = currentPathname()): void {
  if (!isBrowser()) return;
  readyPathnames.add(pathname);
  window.dispatchEvent(new CustomEvent<RoutePrimaryReadyDetail>(ROUTE_PRIMARY_READY_EVENT, {
    detail: { pathname, markedAt: Date.now() },
  }));
}

export function resetRoutePrimaryReadyForTests(): void {
  readyPathnames.clear();
}

export function scheduleAfterRoutePrimaryReady(
  callback: () => void,
  options: {
    pathname?: string;
    idleFallbackMs?: number;
    isStillCurrent?: () => boolean;
  } = {},
): () => void {
  if (!isBrowser()) return () => undefined;

  const pathname = options.pathname ?? currentPathname();
  let cancelled = false;
  let idleHandle: IdleTaskHandle | undefined;

  const stillCurrent = () => options.isStillCurrent?.() ?? true;
  const run = () => {
    if (cancelled || !stillCurrent()) return;
    idleHandle = scheduleIdleTask(() => {
      if (!cancelled && stillCurrent()) callback();
    }, options.idleFallbackMs);
  };
  const onReady = (event: Event) => {
    const detail = (event as CustomEvent<RoutePrimaryReadyDetail>).detail;
    if (detail?.pathname !== pathname) return;
    window.removeEventListener(ROUTE_PRIMARY_READY_EVENT, onReady);
    run();
  };

  if (readyPathnames.has(pathname)) {
    run();
  } else {
    window.addEventListener(ROUTE_PRIMARY_READY_EVENT, onReady);
  }

  return () => {
    cancelled = true;
    window.removeEventListener(ROUTE_PRIMARY_READY_EVENT, onReady);
    cancelIdleTask(idleHandle);
  };
}
