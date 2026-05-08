// Pack D D51 + D59 — MeResponse DTO + mock provider (Batch II).
// Source: .lovable/spec/v4/pack-d/Pantheon_Pack_D_Session_Auth_Tenant_Contract.md
// Batch III will replace mockMe() with a real /bff/me fetch.

import { useEffect, useState } from "react";

export type Role =
  | "platform_admin"
  | "portfolio_manager"
  | "research_lead"
  | "ops"
  | "viewer";

export type Capability = string; // dot.case e.g. "strategy.promote_live"

export interface MeUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

export interface MeTenant {
  id: string;
  name: string;
  tz: string;
  locale: string;
  baseCurrency?: string;
}

export interface MeCounters {
  pendingInterventionsCount?: number;
  unreadAuditCount?: number;
  openFindingsCount?: number;
}

export interface MeResponse {
  user: MeUser;
  tenant: MeTenant;
  roles: Role[];
  capabilities: Capability[];
  env: "dev" | "staging" | "prod";
  featureFlags: Record<string, boolean>;
  serverTime: string;
  sessionExpiresAt: string;
  permissionsVersion: string;
  /** Planner Response §B5 (2026-05-07) — optional pre-aggregated counters. */
  counters?: MeCounters;
}

const ME_CACHE_TTL_MS = 30_000;

let cache: { value: MeResponse; fetchedAt: number } | null = null;
let inflight: Promise<MeResponse> | null = null;

export function mockMe(): MeResponse {
  const now = new Date();
  const exp = new Date(now.getTime() + 8 * 3600_000);
  return {
    user: {
      id: "u_mock",
      displayName: "Mock Operator",
      email: "ops@pantheon.local",
    },
    tenant: {
      id: "t_default",
      name: "Pantheon Default",
      tz: "Asia/Taipei",
      locale: "zh-TW",
      baseCurrency: "USD",
    },
    roles: ["portfolio_manager", "ops"],
    capabilities: [
      "strategy.create",
      "strategy.promote_paper",
      "persona.create",
      "capitalPool.create",
      "rebalance.propose",
      "deployment.request",
    ],
    env: "dev",
    featureFlags: { v5LoopOs: true, sentinel: true, hiq: true },
    serverTime: now.toISOString(),
    sessionExpiresAt: exp.toISOString(),
    permissionsVersion: "v1",
    counters: {
      pendingInterventionsCount: 0,
      unreadAuditCount: 0,
      openFindingsCount: 0,
    },
  };
}

export async function fetchMe(force = false): Promise<MeResponse> {
  const now = Date.now();
  if (!force && cache && now - cache.fetchedAt < ME_CACHE_TTL_MS) return cache.value;
  if (inflight) return inflight;
  inflight = (async () => {
    let value: MeResponse;
    try {
      const { withLiveOrMock } = await import("@/lib/bff-v1/liveTransport");
      const { paths } = await import("@/lib/bff-v1/paths");
      value = await withLiveOrMock<MeResponse>(
        { method: "GET", path: paths.me() },
        async () => mockMe(),
      );
    } catch {
      value = mockMe();
    }
    cache = { value, fetchedAt: Date.now() };
    inflight = null;
    return value;
  })();
  return inflight;
}

export function invalidateMe(): void {
  cache = null;
  inflight = null;
}

/** React hook — single source of `currentUser` per Pack D D51. */
export function useMe(): { me: MeResponse | null; loading: boolean; refresh: () => void } {
  const [me, setMe] = useState<MeResponse | null>(cache?.value ?? null);
  const [loading, setLoading] = useState<boolean>(!cache);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchMe().then((value) => {
      if (alive) {
        setMe(value);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  function refresh() {
    invalidateMe();
    setLoading(true);
    fetchMe(true).then((value) => {
      setMe(value);
      setLoading(false);
    });
  }

  return { me, loading, refresh };
}

export function hasCapability(me: MeResponse | null, cap: Capability): boolean {
  return !!me?.capabilities.includes(cap);
}
