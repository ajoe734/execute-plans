// One native Chromium transport for both hosted probes; credentials are scoped
// to each actual request by CDP (header overrides do not cross redirect hops).
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

/** Install before creating/navigating probe pages; await attachPage before any protected request. */
export async function installPinnedBffBearer(context, { token, feBase, bffBase, tenantId = "", env = process.env }) {
  const problem = pinnedTargetProblem({ feBase, bffBase, env });
  if (problem || !token) throw new Error(`Refusing to release BFF credential: ${problem || "no token supplied"}`);
  const bffOrigin = originOf(bffBase), bearer = `Bearer ${token}`;
  const errors = [], pages = new WeakMap(), pending = new Set();
  let closed = false;
  context.on("close", () => { closed = true; });
  const record = (error, page, label) => {
    if ((closed || page.isClosed()) && /Target page, context or browser has been closed|Target closed|Session closed/u.test(String(error))) return;
    errors.push(`${label}: ${String(error?.message || error).split(token).join("[REDACTED]")}`);
  };
  const track = (promise) => {
    pending.add(promise);
    promise.then(() => pending.delete(promise), () => pending.delete(promise));
  };
  const attachPage = (page) => {
    if (pages.has(page)) return pages.get(page);
    const ready = (async () => {
      const session = await context.newCDPSession(page);
      const documentNavigations = new Map(), network = new Map(), loaders = new Map(), navigating = new Map(), interceptions = new Set();
      session.on("Network.requestWillBeSent", (event) => {
        network.set(event.requestId, { frameId: event.frameId, loaderId: event.loaderId, documentNavigations: documentNavigations.get(event.frameId) || 0 });
        if (event.type === "Document") navigating.set(event.frameId, event.loaderId);
      });
      session.on("Network.loadingFinished", ({ requestId }) => network.delete(requestId));
      session.on("Page.navigatedWithinDocument", ({ frameId }) => documentNavigations.set(frameId, (documentNavigations.get(frameId) || 0) + 1));
      session.on("Network.loadingFailed", ({ requestId, canceled, timestamp }) => {
        const request = network.get(requestId);
        if (request) {
          request.failed = true;
          request.canceled = canceled === true;
          request.canceledAt = timestamp;
          // Arrival order: a same-document navigation observed before the cancel.
          request.sameDocument = (documentNavigations.get(request.frameId) || 0) > request.documentNavigations;
          request.navigationLoader = navigating.get(request.frameId);
        }
        network.delete(requestId);
      });
      session.on("Page.frameNavigated", ({ frame }) => {
        loaders.set(frame.id, frame.loaderId);
        navigating.delete(frame.id);
      });
      session.on("Page.frameDetached", ({ frameId }) => {
        for (const request of interceptions) if (request.frameId === frameId && !request.failed) request.detached = true;
        loaders.delete(frameId);
        navigating.delete(frameId);
      });
      page.on("close", () => {
        // Only interceptions still live at closure get closure evidence. A
        // request that already failed while live cannot be excused by teardown.
        for (const request of interceptions) if (!request.failed) request.closed = true;
        network.clear();
      });
      const generations = new WeakMap(), requests = new WeakMap();
      page.on("framenavigated", (frame) => generations.set(frame, (generations.get(frame) || 0) + 1));
      page.on("request", (req) => requests.set(req, generations.get(req.frame()) || 0));
      page.on("requestfailed", (req) => {
        if (originOf(req.url()) !== bffOrigin) return;
        // Chromium cancels open SSE on navigation. Verify the frame changed or
        // the page/context closed; an arbitrary live transport failure must fail.
        track(new Promise((resolve) => setTimeout(resolve, 25)).then(() => {
          const failure = req.failure()?.errorText || "request failed";
          if (failure === "net::ERR_ABORTED" && (closed || page.isClosed() ||
              requests.get(req) !== (generations.get(req.frame()) || 0))) return;
          record(failure, page, `${req.method()} ${new URL(req.url()).pathname}`);
        }));
      });
      session.on("Fetch.requestPaused", (event) => {
        const request = network.get(event.networkId);
        if (request) interceptions.add(request);
        const { url, headers = {} } = event.request;
        const pinned = originOf(url) === bffOrigin;
        const clean = Object.entries(headers).filter(([name, value]) =>
          !(["authorization", "x-tenant-id"].includes(name.toLowerCase()) && (pinned || value === bearer || name.toLowerCase() === "x-tenant-id")));
        if (pinned) {
          clean.push(["authorization", bearer]);
          if (tenantId) clean.push(["x-tenant-id", tenantId]);
        }
        // Await the browser's sample before dispatching continueRequest. Its
        // Timestamp therefore predates the actual command rejection, regardless
        // of command scheduling or delayed delivery of the rejection to Node.
        const before = request ? session.send("Performance.getMetrics").then(
          ({ metrics }) => metrics.find((metric) => metric.name === "Timestamp")?.value, () => undefined) : undefined;
        const continueRequest = (rejectedAt) => session.send("Fetch.continueRequest", { requestId: event.requestId,
          headers: clean.map(([name, value]) => ({ name, value: String(value) }))
        }).catch(async (error) => {
          // The network id binds Chromium's cancellation to this interception,
          // and the cancellation must be caused by a navigation (document
          // replacement, same-document navigation or frame detach). Lifecycle
          // events can be queued behind the command rejection, so wait for them,
          // but only accept a cancellation Chromium timestamped no later than the
          // pre-command sample: an invalid id on a live request, followed by later
          // navigation or teardown, stays a protocol failure, whenever the error
          // is delivered. Closure alone never proves anything afterwards.
          const invalidId = /Protocol error \(Fetch\.continueRequest\): Invalid InterceptionId\./u.test(String(error));
          if (invalidId && request) {
            const proven = () => request.canceled && request.canceledAt <= rejectedAt && (request.detached || request.sameDocument ||
              (request.loaderId && request.navigationLoader && request.loaderId !== request.navigationLoader &&
                loaders.get(request.frameId) === request.navigationLoader));
            if (typeof rejectedAt === "number") {
              for (let waited = 0; waited < 1000 && !proven(); waited += 10) await new Promise((resolve) => setTimeout(resolve, 10));
              if (proven()) return;
            }
          }
          record(error, page, "CDP continueRequest");
          await session.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "Failed" }).catch(() => {});
        });
        track((before ? before.then(continueRequest) : continueRequest(undefined)).finally(() => interceptions.delete(request)));
      });
      await session.send("Network.enable");
      await session.send("Page.enable");
      await session.send("Performance.enable");
      await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    })();
    pages.set(page, ready);
    // EventEmitter does not consume async rejections. Explicit callers still
    // receive the original rejection; auto-attached pages retain it as a failure.
    track(ready.catch((error) => record(error, page, "CDP attach")));
    return ready;
  };
  context.on("page", (page) => { attachPage(page); });
  await Promise.all(context.pages().map(attachPage));
  return { errors, attachPage,
    async settle() { while (pending.size) await Promise.all([...pending]); },
    assertHealthy() { if (errors.length) throw new Error(`Pinned BFF transport failures: ${errors.slice(0, 5).join("; ")}`); },
  };
}
