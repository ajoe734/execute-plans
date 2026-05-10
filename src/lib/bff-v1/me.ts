// BFF Contract v1 — /bff/me façade (resolves spec-conflict-G C4).
// Single source of `currentUser` per Pack D D51/D59 + Final §6.
// Wraps the existing v4 mock provider; live mode will swap to real fetch.

export {
  useMe,
  fetchMe,
  refreshSession,
  logoutSession,
  invalidateMe,
  hasCapability,
  mockMe,
} from "@/lib/v4/session/me";

export type {
  MeResponse,
  MeUser,
  MeTenant,
  Role,
  Capability,
} from "@/lib/v4/session/me";
