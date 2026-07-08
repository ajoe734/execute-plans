import { lazy, Suspense, type ComponentType } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type RouteComponent = ComponentType<Record<string, never>>;
type LazyModule = { default: RouteComponent };

const ROUTE_CHUNK_RETRY_ATTEMPTS = 3;
const ROUTE_CHUNK_RETRY_BASE_DELAY_MS = 120;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function isRouteChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Load failed/i.test(
    message,
  );
}

async function loadRouteChunk(load: () => Promise<LazyModule>): Promise<LazyModule> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ROUTE_CHUNK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (!isRouteChunkLoadError(error) || attempt === ROUTE_CHUNK_RETRY_ATTEMPTS) {
        throw error;
      }
      await delay(ROUTE_CHUNK_RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

function RouteChunkFallback({ label }: { label: string }) {
  return (
    <div
      className="p-6 text-sm text-muted-foreground"
      data-testid="route-chunk-loading"
      role="status"
      aria-label={`${label} route loading`}
    >
      Loading {label}...
    </div>
  );
}

export function lazyRoute(load: () => Promise<LazyModule>, label: string): RouteComponent {
  const Component = lazy(() => loadRouteChunk(load));
  return function LazyRouteElement() {
    return (
      <ErrorBoundary scope={`${label} route chunk`}>
        <Suspense fallback={<RouteChunkFallback label={label} />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    );
  };
}

export function lazyNamedRoute<TModule extends Record<string, RouteComponent>>(
  load: () => Promise<TModule>,
  exportName: keyof TModule,
  label: string,
): RouteComponent {
  return lazyRoute(
    () => load().then((module) => ({ default: module[exportName] })),
    label,
  );
}
