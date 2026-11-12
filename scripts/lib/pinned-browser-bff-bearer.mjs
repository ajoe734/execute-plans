// Shared browser transport for the hosted probes: releases a short-lived BFF
// bearer only to the pinned maintained HTTPS BFF origin, per request, never to
// browser storage. Dependency-free (takes a Playwright context; imports nothing).
//
// Finite reads use route.fetch({maxRedirects:0}) + fulfill so a redirect target is
// re-routed and stays unauthenticated. route.fetch buffers the whole body, so a
// never-ending SSE response (Accept: text/event-stream) must be streamed by the
// browser itself. Playwright's route.continue({headers}) replays those headers on
// every redirect and never re-routes the redirected request, so it can not be used
// for credentials. Instead each page gets a CDP Fetch guard that (a) adds the
// bearer to the single pinned-BFF SSE request and (b) strips it from ANY request
// to another origin, including a redirect that only appears on a later GET. The
// guard decides per actual request, so a changing response can not bypass it; a
// page without a guard never gets a bearer on SSE (the request is aborted).
// Covered by e2e/hosted-bff-streaming-transport.spec.ts.

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
const toHeaderArray = (headers) => Object.entries(headers).map(([name, value]) => ({ name, value: String(value) }));

/**
 * Attach Authorization only to pinned-BFF requests; throws before auth on an unpinned target.
 * Returns { errors, assertHealthy }: actionable transport failures (anything that is not a
 * verified page/context teardown) are recorded so the probe runner can fail on them.
 */
export async function installPinnedBffBearer(context, { token, feBase, bffBase, tenantId = "", env = process.env }) {
  const problem = pinnedTargetProblem({ feBase, bffBase, env });
  if (problem) throw new Error(`Refusing to release BFF credential: ${problem}`);
  if (!token) throw new Error("Refusing to release BFF credential: no token supplied");
  const bffOrigin = originOf(bffBase);
  const bearer = `Bearer ${token}`;
  const errors = [];
  let contextClosed = false;
  if (typeof context.on === "function") context.on("close", () => { contextClosed = true; });
  const pageOf = (request) => {
    try { return request.frame().page(); } catch { return null; }
  };
  // Teardown is only ignored when the page/context really is gone.
  const isTeardown = (error, page) => isClosedTarget(error) && (contextClosed || !page || page.isClosed());
  const record = (error, page, what) => {
    if (isTeardown(error, page)) return;
    errors.push(`${what}: ${String(error?.message || error)}`);
  };

  const authorize = (headers) => {
    const out = Object.fromEntries(Object.entries(headers).filter(([n]) => n.toLowerCase() !== "x-tenant-id"));
    if (tenantId) out["x-tenant-id"] = tenantId;
    return { ...out, authorization: bearer };
  };

  // Per-page CDP guard (SSE credential release + redirect stripping).
  const guards = new WeakMap();
  const guardPage = (page) => {
    if (guards.has(page)) return guards.get(page);
    const ready = (async () => {
      const session = await context.newCDPSession(page);
      session.on("Fetch.requestPaused", (event) => {
        const { url, method, headers = {} } = event.request;
        const requestId = event.requestId;
        let override;
        if (originOf(url) !== bffOrigin) {
          // Replayed on a redirect to another origin: never let the bearer leave the pinned origin.
          if (Object.entries(headers).some(([n, v]) => n.toLowerCase() === "authorization" && v === bearer)) {
            override = toHeaderArray(Object.fromEntries(Object.entries(headers).filter(([n]) => !["authorization", "x-tenant-id"].includes(n.toLowerCase()))));
          }
        } else if (method === "GET" && isEventStream(headers)) {
          override = toHeaderArray(authorize(headers));
        }
        session.send("Fetch.continueRequest", override ? { requestId, headers: override } : { requestId })
          .catch((error) => record(error, page, "SSE guard continue"));
      });
      await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    })();
    guards.set(page, ready);
    ready.catch((error) => record(error, page, "SSE guard attach"));
    return ready;
  };
  if (typeof context.newCDPSession === "function") {
    for (const page of context.pages()) guardPage(page);
    context.on("page", (page) => { guardPage(page); });
  }

  await context.route(`${bffOrigin}/**`, async (route) => {
    const request = route.request();
    if (originOf(request.url()) !== bffOrigin) return route.continue();
    // Discard any frontend tenant header so every BFF read follows the
    // authenticated default, or the same explicit override.
    const headers = Object.fromEntries(
      Object.entries(request.headers()).filter(([name]) => name.toLowerCase() !== "x-tenant-id"),
    );
    if (tenantId) headers["x-tenant-id"] = tenantId;
    const page = pageOf(request);
    try {
      if (isEventStream(headers) && request.method() === "GET") {
        // Streamed natively by the browser; the page's CDP guard adds the bearer
        // (and strips it from any redirect). No guard => no credential => fail closed.
        const guard = page && guards.get(page);
        if (!guard) throw new Error("no SSE credential guard attached to this page; refusing to stream unauthenticated-or-replayed credentials");
        await guard;
        return await route.fallback();
      }
      const response = await route.fetch({ headers: { ...headers, authorization: bearer }, maxRedirects: 0 });
      return await route.fulfill({ response });
    } catch (error) {
      record(error, page, `${request.method()} ${new URL(request.url()).pathname}`);
      if (!isTeardown(error, page)) await route.abort().catch(() => {});
      return undefined;
    }
  });
  return {
    errors,
    assertHealthy() {
      if (errors.length) throw new Error(`Pinned BFF transport failures: ${errors.slice(0, 5).join("; ")}`);
    },
  };
}
