import { useCallback, useEffect, useState } from "react";
import { ensureServant, getServant, type ServantProfile } from "@/lib/bff-v1/agora/servant";

export type ServantStatusState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; servant: ServantProfile }
  | { kind: "error"; message: string };

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "交易僕人狀態讀取失敗");

export function useServantStatus() {
  const [state, setState] = useState<ServantStatusState>({ kind: "loading" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getServant().then(
      (servant) => !cancelled && setState(servant ? { kind: "ready", servant } : { kind: "missing" }),
      (err: unknown) => !cancelled && setState({ kind: "error", message: errorMessage(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      setState({ kind: "ready", servant: await ensureServant() });
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }, []);

  return { state, creating, createError, create };
}
