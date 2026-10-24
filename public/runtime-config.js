// Pantheon immutable frontend release — default same-origin public runtime config stub.
// Staging and production hosts mount an external /runtime-config.js via Caddy
// outside the sealed FE release directory so the bundle checksum never changes.
window.__PANTHEON_DEPLOYMENT_CONFIG__ =
  window.__PANTHEON_DEPLOYMENT_CONFIG__ ?? null;
