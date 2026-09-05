export const FE_BASE_URL = process.env.PANTHEON_FE_BASE_URL || "http://localhost:5173";
export const BFF_BASE_URL = process.env.PANTHEON_BFF_BASE_URL || "https://api.dev.mvl-cap.tw";
export const STRICT = process.env.VITE_BFF_FALLBACK === "strict" || process.env.PANTHEON_E2E_STRICT === "1";
export const HAS_AUTH = Boolean(process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN);
