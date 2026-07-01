import { lazy, Suspense, type ComponentType } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type RouteComponent = ComponentType<Record<string, never>>;
type LazyModule = { default: RouteComponent };

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
  const Component = lazy(load);
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
