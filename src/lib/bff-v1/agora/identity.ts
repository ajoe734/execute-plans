// Live capability read used by Agora write access policy.
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

async function getCapabilities(): Promise<AgoraCapability[]> {
  return strictLiveRead<AgoraCapability[]>(
    "agora.identity.capabilities",
    { method: "GET", path: "/bff/agora/capabilities" },
    adaptCapabilities,
  );
}

export const agoraIdentityClient = { getCapabilities } as const;
