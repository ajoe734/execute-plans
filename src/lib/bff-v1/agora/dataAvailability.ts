import type { DataAvailabilityStatus } from "./tradingRoomTypes";

/**
 * Normalize the Pantheon wire vocabulary to the legacy UI vocabulary.
 *
 * The BFF contract uses full/partial/missing while existing Trading Room
 * components and persisted client fixtures use complete/partial/unavailable.
 * Keep the component-facing type stable and fail closed for unknown values.
 */
export function normalizeDataAvailabilityStatus(
  value: unknown,
  fallback: DataAvailabilityStatus = "unavailable",
): DataAvailabilityStatus {
  switch (value) {
    case "full":
    case "complete":
      return "complete";
    case "partial":
      return "partial";
    case "missing":
    case "unavailable":
      return "unavailable";
    default:
      return fallback;
  }
}
