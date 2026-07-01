// Shared requestIdleCallback wrapper with a setTimeout fallback for jsdom /
// Safari, where requestIdleCallback is unavailable. Used to defer non-primary
// shell hydration (e.g. TopBar full-list fallback, JobProgressDrawer job
// list) until after primary route content has had a chance to render.
export const IDLE_TASK_FALLBACK_MS = 1_200;

export type IdleTaskHandle = number;

export function scheduleIdleTask(callback: () => void, fallbackMs = IDLE_TASK_FALLBACK_MS): IdleTaskHandle {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback) as unknown as IdleTaskHandle;
  }
  return window.setTimeout(callback, fallbackMs) as unknown as IdleTaskHandle;
}

export function cancelIdleTask(handle: IdleTaskHandle | undefined): void {
  if (handle === undefined) return;
  if (typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}
