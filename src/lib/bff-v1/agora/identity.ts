// Live capability and trader identity reads used by Agora shell and write access policy.
import { strictLiveRead } from "../domainReads";

export type AgoraCapability =
  | "agora.identity.v1"
  | "agora.session.v1"
  | "agora.workshop.v1"
  | "agora.research.v1"
  | "agora.trading.v1"
  | "agora.dashboard.v1"
  | "agora.personalization.v1";

export interface AgoraServantPolicy {
  persona_class: "agora_servant";
  owner_scope: "user_private";
  visibility_scope: "private" | "redacted_management";
  memory_scope: "private_user";
  persona_registry_backed: true;
  execution_authority: "none";
  prohibited_authority: ["runtime_binding", "broker_order", "capital_binding"];
}

export interface AgoraTraderIdentity {
  userId: string;
  tenantId: string;
  displayName: string;
  style: string | null;
  marketState: string | null;
  roles: string[];
  capabilities: AgoraCapability[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function unwrapEnvelope(value: unknown): Record<string, unknown> {
  const root = asRecord(value);
  const data = asRecord(root.data);
  return Object.keys(data).length > 0 ? data : root;
}

function firstNonBlank(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function adaptCapabilities(body: unknown): AgoraCapability[] {
  const namesFrom = (value: unknown): AgoraCapability[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((capability) => {
      if (typeof capability === "string") return [capability as AgoraCapability];
      if (!capability || typeof capability !== "object" || Array.isArray(capability)) return [];
      const name = (capability as Record<string, unknown>).name;
      return typeof name === "string" && name.trim()
        ? [name as AgoraCapability]
        : [];
    });
  };

  if (Array.isArray(body)) return namesFrom(body);
  if (!body || typeof body !== "object") return [];
  const envelope = body as Record<string, unknown>;
  const direct = envelope.capabilities ?? envelope.granted_capabilities;
  if (Array.isArray(direct)) return namesFrom(direct);
  const data = envelope.data;
  if (Array.isArray(data)) return namesFrom(data);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).capabilities ?? (data as Record<string, unknown>).granted_capabilities;
    if (Array.isArray(nested)) return namesFrom(nested);
  }
  return [];
}

export function adaptTraderIdentity(meRaw: unknown, scopeRaw?: unknown): AgoraTraderIdentity {
  const me = unwrapEnvelope(meRaw);
  const meUser = asRecord(me.user ?? me.current_user ?? me.currentUser);
  const meTenant = asRecord(me.tenant);
  const meMeta = asRecord(me.metadata);
  const scope = unwrapEnvelope(scopeRaw);
  const scopeMeta = asRecord(scope.metadata);

  const userId =
    firstNonBlank(
      meUser.id,
      meUser.operator_id,
      me.operator_id,
      me.operatorId,
      me.user_id,
      me.userId,
      me.sub,
      scope.user_id,
      scope.userId,
      scope.operator_id,
      scope.operatorId,
    ) ?? "";

  const tenantId =
    firstNonBlank(
      meTenant.id,
      me.tenant_id,
      me.tenantId,
      scope.tenant_id,
      scope.tenantId,
    ) ?? "";

  const displayName =
    firstNonBlank(
      meUser.display_name,
      meUser.displayName,
      meUser.name,
      me.display_name,
      me.displayName,
      scope.display_name,
      scope.displayName,
      scopeMeta.display_name,
      scopeMeta.displayName,
      scopeMeta.trader_name,
      scopeMeta.traderName,
      meUser.email,
      userId,
    ) ?? "";

  const rawStyle = firstNonBlank(
    meUser.trading_style,
    meUser.tradingStyle,
    meUser.style,
    me.trading_style,
    me.tradingStyle,
    me.style,
    meMeta.trading_style,
    meMeta.tradingStyle,
    meMeta.style,
    scope.trading_style,
    scope.tradingStyle,
    scope.style,
    scopeMeta.trading_style,
    scopeMeta.tradingStyle,
    scopeMeta.style,
    scopeMeta.decision_style,
  );
  const style = rawStyle === "operator-guided" ? null : rawStyle;

  const marketState = firstNonBlank(
    me.market_state,
    me.marketState,
    meMeta.market_state,
    meMeta.marketState,
    scope.market_state,
    scope.marketState,
    scopeMeta.market_state,
    scopeMeta.marketState,
  );

  const roles = Array.from(
    new Set([
      ...stringList(meUser.roles),
      ...stringList(me.roles),
      ...stringList(scope.roles),
    ]),
  );

  const capabilities = Array.from(
    new Set([
      ...adaptCapabilities(scopeRaw),
      ...adaptCapabilities(meRaw),
    ]),
  );

  return {
    userId,
    tenantId,
    displayName,
    style,
    marketState,
    roles,
    capabilities,
  };
}

async function getCapabilities(): Promise<AgoraCapability[]> {
  return strictLiveRead<AgoraCapability[]>(
    "agora.identity.capabilities",
    { method: "GET", path: "/bff/agora/capabilities" },
    adaptCapabilities,
  );
}

async function getUserScope(): Promise<Record<string, unknown>> {
  return strictLiveRead<Record<string, unknown>>(
    "agora.identity.me",
    { method: "GET", path: "/bff/agora/me" },
    unwrapEnvelope,
  );
}

async function getTraderIdentity(): Promise<AgoraTraderIdentity> {
  const [meResult, scopeResult] = await Promise.allSettled([
    strictLiveRead<Record<string, unknown>>(
      "agora.identity.bffMe",
      { method: "GET", path: "/bff/me" },
      unwrapEnvelope,
    ),
    getUserScope(),
  ]);

  if (meResult.status === "rejected" && scopeResult.status === "rejected") {
    throw meResult.reason;
  }

  return adaptTraderIdentity(
    meResult.status === "fulfilled" ? meResult.value : undefined,
    scopeResult.status === "fulfilled" ? scopeResult.value : undefined,
  );
}

export const agoraIdentityClient = {
  getCapabilities,
  getUserScope,
  getTraderIdentity,
} as const;
