// Release-gate credential boundary: a short-lived BFF bearer is released only to
// the maintained dev BFF origin, and only while the browser target is the
// maintained dev FE origin or the local exact-candidate preview. The token is
// attached per-request to that BFF origin; it is never written to browser
// storage (the retired pantheon.bff.bearerToken / pantheon_operator_token keys
// are not read by the strict FE and are not recreated here).
export const MAINTAINED_DEV_FE_ORIGIN = "https://app.dev.mvl-cap.tw";
export const MAINTAINED_DEV_BFF_ORIGIN = "https://api.dev.mvl-cap.tw";

function originOf(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function isLoopbackOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "localhost" || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/u.test(host);
  } catch {
    return false;
  }
}

export function pinnedTargetProblem({ feBase, bffBase, env = process.env }) {
  const bff = originOf(bffBase);
  const fe = originOf(feBase);
  const pinnedBff = originOf(env.PANTHEON_AUTH_PIN_BFF_ORIGIN) || MAINTAINED_DEV_BFF_ORIGIN;
  const pinnedFe = originOf(env.PANTHEON_AUTH_PIN_FE_ORIGIN) || MAINTAINED_DEV_FE_ORIGIN;
  if (!bff || bff !== pinnedBff || !bff.startsWith("https://")) {
    return `BFF origin is not the maintained dev origin (${pinnedBff})`;
  }
  if (!fe || (fe !== pinnedFe && !isLoopbackOrigin(fe))) {
    return `FE origin is neither the maintained dev origin (${pinnedFe}) nor the local candidate preview`;
  }
  return "";
}

/** Attach Authorization only to pinned-BFF requests; throws before auth on an unpinned target. */
export async function installPinnedBffBearer(context, { token, feBase, bffBase, env = process.env }) {
  const problem = pinnedTargetProblem({ feBase, bffBase, env });
  if (problem) throw new Error(`Refusing to release BFF credential: ${problem}`);
  const bffOrigin = originOf(bffBase);
  await context.route(`${bffOrigin}/**`, (route) => {
    const request = route.request();
    if (originOf(request.url()) !== bffOrigin) return route.continue();
    return route.continue({ headers: { ...request.headers(), authorization: `Bearer ${token}` } });
  });
}
