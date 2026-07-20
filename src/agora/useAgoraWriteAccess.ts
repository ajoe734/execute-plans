import { useEffect, useMemo, useState } from "react";
import { liveWriteGated } from "@/lib/bff-v1/writeGate";
import { agoraIdentityClient } from "@/lib/bff-v1/agora/identity";
import { useMe } from "@/lib/v4/session/me";
import { capabilityMatches } from "@/lib/v4/roleCapabilities";

const INTERACTION_ROLES = new Set([
  "admin",
  "platform_admin",
  "operator",
  "ops",
  "reviewer",
  "approver",
  "research_lead",
  "analyst",
  "strategy_manager",
]);

const INTERACTION_CAPABILITIES = [
  "agora.workshop.v1",
  "agora.persona.interaction.v1",
];

export interface AgoraWriteAccess {
  actorId?: string;
  /** Capabilities returned by the audience-filtered Agora manifest. */
  agoraCapabilities: string[];
  /** General session capabilities, retained for non-Agora presentation only. */
  capabilities: string[];
  roles: string[];
  loading: boolean;
  interactionAllowed: boolean;
  interactionDisabledReason: string | null;
  writeAllowed: boolean;
  writeDisabledReason: string | null;
}

export function capabilitiesAllow(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((capability) => granted.some((item) => capabilityMatches(item as `${string}.${string}` | `${string}.*` | "*", capability)));
}

export function interactionAccessReason(input: {
  agoraCapabilities: readonly string[];
  roles: readonly string[];
  writeAllowed: boolean;
}): string | null {
  if (!input.writeAllowed) {
    return "Interaction writes are disabled by deployment policy or this session is not eligible for writes.";
  }
  if (!input.roles.some((role) => INTERACTION_ROLES.has(role.toLowerCase()))) {
    return "Interaction requires an operator, reviewer, approver, research, or admin role.";
  }
  if (!INTERACTION_CAPABILITIES.some((required) => capabilitiesAllow(input.agoraCapabilities, [required]))) {
    return "Interaction requires the Agora Workshop or Persona Interaction capability.";
  }
  return null;
}

export function useAgoraWriteAccess(): AgoraWriteAccess {
  const { me, loading: meLoading } = useMe();
  const [gateLoading, setGateLoading] = useState(true);
  const [writeAllowed, setWriteAllowed] = useState(false);
  const [agoraCapabilities, setAgoraCapabilities] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setGateLoading(true);
    Promise.all([
      liveWriteGated(),
      agoraIdentityClient.getCapabilities().catch(() => []),
    ])
      .then(([allowed, capabilities]) => {
        if (!cancelled) {
          setWriteAllowed(allowed);
          setAgoraCapabilities(capabilities.map(String));
        }
      })
      .catch(() => {
        if (!cancelled) setWriteAllowed(false);
      })
      .finally(() => {
        if (!cancelled) setGateLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const roles = (me?.roles ?? []).map(String);
    const capabilities = Array.from(new Set([...(me?.capabilities ?? []).map(String), ...agoraCapabilities]));
    const loading = meLoading || gateLoading;
    const writeDisabledReason = writeAllowed
      ? null
      : "Writes are disabled by deployment policy or this session is not eligible for writes.";
    const interactionDisabledReason = loading
      ? "Checking interaction permissions…"
      : interactionAccessReason({ agoraCapabilities, roles, writeAllowed });
    return {
      actorId: me?.user.id,
      agoraCapabilities,
      capabilities,
      roles,
      loading,
      interactionAllowed: !interactionDisabledReason,
      interactionDisabledReason,
      writeAllowed,
      writeDisabledReason,
    };
  }, [agoraCapabilities, gateLoading, me, meLoading, writeAllowed]);
}
