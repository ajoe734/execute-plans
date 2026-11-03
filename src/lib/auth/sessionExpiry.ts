/**
 * A BFF 401 on any read or write means the browser session may have expired.
 * The transport layer reports it here; AuthProvider re-verifies the session
 * and sends the operator back to sign-in instead of leaving pages loading.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function isUnauthorizedError(error: unknown): boolean {
  return (error as { status?: unknown } | null | undefined)?.status === 401;
}

export function reportBffUnauthorized(): void {
  for (const listener of listeners) listener();
}

export function onBffUnauthorized(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
