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
  const errors = [], pages = new WeakMap(), holds = new WeakMap(), pending = new Set(), finalizers = new Set();
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
      const documentNavigations = new Map(), network = new Map(), loaders = new Map(), navigating = new Map(), interceptions = new Set(), parents = new Map(), detaching = new Set();
      // Arm before draining: renderer requests can arrive after an empty drain.
      // Keep new subrequests paused until the replacement document commits (or
      // browser closure completes). The top-level Document must still proceed.
      let held = null, mainFrameId;
      holds.set(page, () => {
        if (held) throw new Error("Pinned BFF page lifecycle already held");
        const queue = held = [];
        let released = false;
        return () => {
          if (released) return;
          released = true;
          held = null;
          for (const resume of queue) resume(true);
        };
      });
      // Per-URL tally of aborts judged natively (one per CDP request record) vs seen by Playwright.
      const nativeAborted = new Map(), pwAborted = new Map(), frameNavs = new Map();
      // One causal reading of a cancelled request, shared by the ERR_ABORTED and the
      // Invalid InterceptionId judgments. A navigation that was already replacing this
      // request's document at the failure instant is excused once the frame commits it.
      // That commit can trail the cancellation by an arbitrary time under load, so an
      // unresolved judgment waits for the commit event (no timer) and is settled by
      // asking the browser at settle(); it is never excused by anything else.
      const committed = (request) => Boolean(request.navigationLoader) && request.navigationLoader !== request.loaderId &&
        (frameNavs.get(request.frameId) || 0) > request.frameNavs;
      const excused = (request) => request.detached || request.sameDocument || committed(request);
      const awaiting = new Set();
      const flush = () => { for (const entry of awaiting) if (entry.ok()) awaiting.delete(entry); };
      finalizers.add(async () => {
        if (!awaiting.size) return;
        if (!page.isClosed()) {
          // The renderer's reply is ordered behind every event it emitted before it.
          await session.send("Performance.getMetrics").catch(() => undefined);
          const walk = (node) => {
            if (!node) return;
            const { id, loaderId } = node.frame;
            if (loaders.has(id) && loaders.get(id) !== loaderId) { loaders.set(id, loaderId); frameNavs.set(id, (frameNavs.get(id) || 0) + 1); }
            node.childFrames?.forEach(walk);
          };
          walk((await session.send("Page.getFrameTree").catch(() => undefined))?.frameTree);
          flush();
        }
        for (const entry of awaiting) { awaiting.delete(entry); entry.fail(); }
      });
      const underDetach = (frameId) => { for (let id = frameId, hops = 0; id && hops < 64; id = parents.get(id), hops++) if (detaching.has(id)) return true; return false; };
      session.on("Network.requestWillBeSent", (event) => {
        const bound = { frameId: event.frameId, url: event.request?.url, loaderId: event.loaderId, documentNavigations: documentNavigations.get(event.frameId) || 0, frameNavs: frameNavs.get(event.frameId) || 0, method: event.request?.method, type: event.type };
        const early = network.get(event.requestId);
        // Chromium may deliver Fetch.requestPaused before Network.requestWillBeSent
        // for the same network id. Bind the later event to the already-paused
        // interception (same object) instead of replacing it, so its lifecycle
        // proof is not lost. A redirect hop (already bound) still starts fresh.
        if (early?.unbound) { Object.assign(early, bound); delete early.unbound; } else network.set(event.requestId, bound);
        if (event.type === "Document") navigating.set(event.frameId, [...(navigating.get(event.frameId) || []), { loaderId: event.loaderId, at: event.timestamp }]);
      });
      session.on("Network.loadingFinished", ({ requestId }) => network.delete(requestId));
      session.on("Page.navigatedWithinDocument", ({ frameId }) => documentNavigations.set(frameId, (documentNavigations.get(frameId) || 0) + 1));
      session.on("Network.loadingFailed", ({ requestId, canceled, timestamp, errorText }) => {
        const request = network.get(requestId);
        // A Document navigation that failed (e.g. HTTP 204 / download) never replaces
        // its frame's document: it stops being "in flight" at its own failure time.
        if (request?.type === "Document") for (const nav of navigating.get(request.frameId) || []) if (nav.loaderId === request.loaderId) nav.failedAt = timestamp;
        if (request) {
          request.failed = true;
          request.canceled = canceled === true;
          request.canceledAt = timestamp;
          // Arrival order: a same-document navigation observed before the cancel.
          request.sameDocument = (documentNavigations.get(request.frameId) || 0) > request.documentNavigations;
          // Causal, not arrival-order: only a navigation Chromium had already started
          // by the cancellation's own timestamp was replacing this document.
          request.navigationLoader = (navigating.get(request.frameId) || []).filter((nav) => nav.at <= timestamp && !(nav.failedAt < timestamp)).pop()?.loaderId;
          // Causal, not arrival-order: Chromium announces the teardown
          // (frameSubtreeWillBeDetached) before it cancels the frame's requests.
          // A cancellation delivered before that announcement was live and stays one.
          request.detached = underDetach(request.frameId);
          // Judge a BFF abort here, on THIS request's own record: the detach fact was
          // captured at the failure instant for this exact network id, so another
          // frame's teardown can never excuse it (and it can't excuse another's).
          if (errorText === "net::ERR_ABORTED" && request.url && originOf(request.url) === bffOrigin) {
            const { url, detached, sameDocument } = request;
            // Closure counts only if already true at the failure instant; a later close cannot excuse a live abort.
            const gone = closed || page.isClosed();
            // A trailing frameNavigated excuses only a navigation already in flight at failure time.
            const replacing = request.navigationLoader && request.navigationLoader !== request.loaderId;
            const label = `${request.method || "GET"} ${new URL(url).pathname}`;
            nativeAborted.set(url, (nativeAborted.get(url) || 0) + 1);
            // The brief delay only lets same-document/detach facts land; the replacing commit is awaited causally.
            track(new Promise((resolve) => setTimeout(resolve, 25)).then(() => {
              if (gone || detached || sameDocument || committed(request)) return;
              const entry = { ok: () => committed(request), fail: () => record("net::ERR_ABORTED", page, label) };
              if (replacing) awaiting.add(entry); else entry.fail();
            }));
          }
        }
        network.delete(requestId);
        flush();
      });
      session.on("Page.frameNavigated", ({ frame }) => {
        if (!frame.parentId) mainFrameId = frame.id;
        frameNavs.set(frame.id, (frameNavs.get(frame.id) || 0) + 1);
        loaders.set(frame.id, frame.loaderId);
        // The committed navigation and any it superseded are over; a later one is still in flight.
        const started = navigating.get(frame.id) || [], done = started.findIndex((nav) => nav.loaderId === frame.loaderId);
        navigating.set(frame.id, started.slice(done + 1));
        flush();
      });
      session.on("Page.frameAttached", ({ frameId, parentFrameId }) => parents.set(frameId, parentFrameId));
      session.on("Page.frameSubtreeWillBeDetached", ({ frameId }) => detaching.add(frameId));
      session.on("Page.frameDetached", ({ frameId }) => {
        detaching.delete(frameId);
        parents.delete(frameId);
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
        // Chromium cancels open SSE on navigation. Verify the frame changed, the
        // frame teardown preceded the cancellation, or the page/context closed; an arbitrary live transport failure must fail.
        track(new Promise((resolve) => setTimeout(resolve, 25)).then(() => {
          const failure = req.failure()?.errorText || "request failed";
          if (failure === "net::ERR_ABORTED") {
            // Aborts with a CDP record were judged per-request in loadingFailed. Only an
            // abort Playwright saw beyond those has no native evidence: fall back to
            // closure or a frame generation change; never a detach credit. The helper's
            // own CDP session can deliver its record later than Playwright's event, so
            // an abort not yet matched waits for that record (or settle()) instead of a timer.
            const url = req.url(), seen = (pwAborted.get(url) || 0) + 1;
            pwAborted.set(url, seen);
            const matched = () => seen <= (nativeAborted.get(url) || 0);
            if (matched() || closed || page.isClosed() || requests.get(req) !== (generations.get(req.frame()) || 0)) return;
            awaiting.add({ ok: matched, fail: () => record(failure, page, `${req.method()} ${new URL(url).pathname}`) });
            return;
          }
          record(failure, page, `${req.method()} ${new URL(req.url()).pathname}`);
        }));
      });
      session.on("Fetch.requestPaused", (event) => {
        let request = network.get(event.networkId);
        if (!request && event.networkId) { request = { unbound: true }; network.set(event.networkId, request); }
        if (request) interceptions.add(request);
        const { url, headers = {} } = event.request;
        const pinned = originOf(url) === bffOrigin;
        const clean = Object.entries(headers).filter(([name, value]) =>
          !(["authorization", "x-tenant-id"].includes(name.toLowerCase()) && (pinned || value === bearer || name.toLowerCase() === "x-tenant-id")));
        if (pinned) {
          clean.push(["authorization", bearer]);
          if (tenantId) clean.push(["x-tenant-id", tenantId]);
        }
        const resume = (deferred = false) => {
          // A queued request on a closed target cannot be continued. No command
          // was issued for it; errors from commands already dispatched stay errors.
          if (deferred && (closed || page.isClosed())) { interceptions.delete(request); return; }
          // Await the browser's sample before dispatching continueRequest. Its
          // Timestamp therefore predates the actual command rejection, regardless
          // of command scheduling or delayed delivery of the rejection to Node.
          // Cancellation after this lower bound is ambiguous: CDP exposes no failure
          // timestamp. Fail closed even if it was legitimate; the maintained caller
          // drains/checks outstanding commands before navigating or closing.
          const before = request ? session.send("Performance.getMetrics").then(
            ({ metrics }) => metrics.find((metric) => metric.name === "Timestamp")?.value, () => undefined) : undefined;
          const continueRequest = (sampledBeforeCommand) => {
            // This queued interception was never dispatched. If its exact native
            // record already proves navigation cancellation, retire it without
            // issuing a command for an obsolete id. Live/unknown requests proceed
            // through the unchanged conservative error judgment below.
            if (deferred && request?.canceled && excused(request)) return;
            return session.send("Fetch.continueRequest", { requestId: event.requestId,
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
            if (invalidId && request && typeof sampledBeforeCommand === "number") {
              const cancelled = () => request.canceled && request.canceledAt <= sampledBeforeCommand;
              const proven = () => cancelled() && excused(request);
              // The cancellation fact may be queued behind this rejection: give it the
              // existing bounded wait. Once it has arrived, only the replacing commit can
              // still be outstanding, and that is awaited causally, never by timer.
              const pendingCommit = () => cancelled() && request.navigationLoader && request.navigationLoader !== request.loaderId;
              for (let waited = 0; waited < 1000 && !proven() && !pendingCommit(); waited += 10) await new Promise((resolve) => setTimeout(resolve, 10));
              if (proven()) return;
              if (pendingCommit()) { awaiting.add({ ok: proven, fail: () => record(error, page, "CDP continueRequest") }); return; }
            }
            record(error, page, "CDP continueRequest");
            await session.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "Failed" }).catch(() => {});
          });
          };
          track((before ? before.then(continueRequest) : continueRequest(undefined)).finally(() => interceptions.delete(request)));
        };
        if (held && !(event.resourceType === "Document" && event.frameId === mainFrameId)) held.push(resume);
        else resume();
      });
      await session.send("Network.enable");
      await session.send("Page.enable");
      await session.send("Performance.enable");
      mainFrameId = (await session.send("Page.getFrameTree"))?.frameTree?.frame?.id;
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
    async navigate(page, targetUrl, { timeout }) {
      await attachPage(page);
      const release = holds.get(page)();
      try {
        await this.settle();
        this.assertHealthy();
        const started = Date.now();
        let error = null;
        try { await page.goto(targetUrl, { waitUntil: "commit", timeout }); }
        catch (err) { error = err; }
        finally { release(); }
        // Release new-document subrequests at commit, before waiting for DOM.
        // Both waits share the original navigation timeout budget.
        if (!error) try { await page.waitForLoadState("domcontentloaded", { timeout: Math.max(1, timeout - (Date.now() - started)) }); }
        catch (err) { error = err; }
        return error;
      } finally { release(); }
    },
    async closeBrowser(browser) {
      const releases = [];
      try {
        for (const page of context.pages()) { await attachPage(page); releases.push(holds.get(page)()); }
        await this.settle();
        this.assertHealthy();
      } finally {
        try { await browser.close(); }
        finally { for (const release of releases) release(); }
      }
    },
    async settle() {
      for (;;) {
        while (pending.size) await Promise.all([...pending]);
        await Promise.all([...finalizers].map((finalize) => finalize()));
        if (!pending.size) return;
      }
    },
    assertHealthy() { if (errors.length) throw new Error(`Pinned BFF transport failures: ${errors.slice(0, 5).join("; ")}`); },
  };
}
