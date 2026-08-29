/**
 * The resolver is the authoritative tenant source for a v1.9 submission.
 *
 * The browser auth bridge may not have a tenant claim (for example while a
 * Firebase session is being rehydrated), even though the BFF has already
 * resolved and verified the tenant for this Workshop. A missing client-side
 * hint must not strand an otherwise valid submission; a contradictory hint is
 * still rejected and the BFF remains authoritative at submit time.
 */
export function resolveSubmissionTenant(
  resolvedTenantId: string,
  authenticatedTenantId?: string | null,
): string {
  const resolved = resolvedTenantId.trim();
  if (!resolved) {
    throw new Error("The authoritative resolver tenant is required for an immutable v1.9 request.");
  }
  const authenticated = authenticatedTenantId?.trim();
  if (authenticated && authenticated !== resolved) {
    throw new Error("The resolver tenant binding does not match the authenticated tenant.");
  }
  return resolved;
}
