// Shared browser transport for the hosted probes: releases a short-lived BFF
// bearer only to the pinned maintained HTTPS BFF origin, per request, never to
// browser storage. Dependency-free (takes a Playwright context; imports nothing).
//
// Finite reads use route.fetch({maxRedirects:0}) + fulfill so a redirect target is
// re-routed and stays unauthenticated. route.fetch buffers the whole body, so a
// never-ending SSE response (Accept: text/event-stream) is streamed natively with
// route.continue({headers}) instead. Chromium replays continue() headers on a
// redirect and does not re-route it, so the streamed request is first
// header-probed (redirect: manual, body never read): a 3xx is fulfilled as-is
// (the browser then follows it unauthenticated) and only a non-redirect is
// continued with the bearer. Covered by e2e/hosted-bff-streaming-transport.spec.ts.
import http from "node:http";
import https from "node:https";

export const MAINTAINED_DEV_FE_ORIGIN = "https://app.dev.mvl-cap.tw";
export const MAINTAINED_DEV_BFF_ORIGIN = "https://api.dev.mvl-cap.tw";

export function originOf(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function isLoopbackOrigin(origin) {
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

const isEventStream = (headers) =>
  Object.entries(headers).some(([k, v]) => k.toLowerCase() === "accept" && /text\/event-stream/i.test(String(v)));
// Page/context closed while a read was in flight: nothing left to fulfill.
const isClosedTarget = (error) =>
  /Target (page, context or browser )?has been closed|context or browser has been closed|has been disposed|Browser has been closed/i.test(
    String(error?.message || error),
  );

const HOP_BY_HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive", "upgrade"]);
/** Authenticated header-only probe: resolves a 3xx {status, headers}, or null for any other status. */
function probeRedirect(url, headers, ignoreHTTPSErrors) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.request(url, {
      method: "GET",
      headers: Object.fromEntries(Object.entries(headers).filter(([n]) => !HOP_BY_HOP.has(n.toLowerCase()))),
      rejectUnauthorized: !ignoreHTTPSErrors,
      timeout: 15_000,
    }, (res) => {
      const status = res.statusCode || 0;
      const out = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v)]));
      req.destroy(); // headers only; never read the stream
      resolve(status >= 300 && status < 400 ? { status, headers: out } : null);
    });
    req.on("timeout", () => req.destroy(new Error("SSE header probe timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** Attach Authorization only to pinned-BFF requests; throws before auth on an unpinned target. */
export async function installPinnedBffBearer(context, { token, feBase, bffBase, tenantId = "", env = process.env, ignoreHTTPSErrors = false }) {
  const problem = pinnedTargetProblem({ feBase, bffBase, env });
  if (problem) throw new Error(`Refusing to release BFF credential: ${problem}`);
  if (!token) throw new Error("Refusing to release BFF credential: no token supplied");
  const bffOrigin = originOf(bffBase);
  const bearer = `Bearer ${token}`;
  await context.route(`${bffOrigin}/**`, async (route) => {
    const request = route.request();
    if (originOf(request.url()) !== bffOrigin) return route.continue();
    // Discard any frontend tenant header so every BFF read follows the
    // authenticated default, or the same explicit override.
    const headers = Object.fromEntries(
      Object.entries(request.headers()).filter(([name]) => name.toLowerCase() !== "x-tenant-id"),
    );
    if (tenantId) headers["x-tenant-id"] = tenantId;
    const authorized = { ...headers, authorization: bearer };
    try {
      if (isEventStream(headers) && request.method() === "GET") {
        const redirect = await probeRedirect(request.url(), authorized, ignoreHTTPSErrors);
        if (redirect) return await route.fulfill({ status: redirect.status, headers: redirect.headers, body: "" });
        return await route.continue({ headers: authorized });
      }
      const response = await route.fetch({ headers: authorized, maxRedirects: 0 });
      return await route.fulfill({ response });
    } catch (error) {
      if (isClosedTarget(error)) return undefined;
      // Fail this request visibly to the page instead of an unhandled rejection.
      await route.abort().catch(() => {});
      return undefined;
    }
  });
}
