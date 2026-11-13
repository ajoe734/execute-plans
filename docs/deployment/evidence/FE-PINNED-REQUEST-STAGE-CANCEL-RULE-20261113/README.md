# FE-PINNED-REQUEST-STAGE-CANCEL-RULE-20261113

Owner: Codex. Independent reviewer: Codex2. Delivery target: execute-plans `dev`.

## Operator decision — 2026-11-13, approximately 07:40Z

Question recorded in the governed task packet:

> dev 部署已經 13 小時失敗、修了 8 輪，每次都卡在前端驗收的同一個瀏覽器錯誤（請求在送出前被瀏覽器取消）。部署負責人的規則是「來源不明就算失敗」，所以每次只能修一個特例。要不要由你決定改規則：這種「送出前就被取消」的錯誤一律記錄但不算失敗，成敗改由每頁的資料檢查判斷（權杖保護完全不變）？

Operator answer:

> 改規則（建議）

This supersedes the previous conservative InvalidID timing rule only for BFF
requests paused at Request stage. Fetch holds that request before sending it;
Invalid InterceptionId means that continuation command could not send it. The
helper adds its bearer only through that continuation. No navigation timestamp,
loader proof, retry, extra timeout or second transport is needed for this rule.
The historical four errors are not retroactively assigned request identities or
causes. Wrong-id test counterexamples are also covered by the new stage rule;
transport health alone cannot establish that required data arrived.

## Delivered behavior

- Exact BFF-origin Request-stage InvalidID produces `terminated_before_send`
  metadata: opaque interception/network ids, pathname, stage, helper phase and a
  fixed reason. It stores no bearer, cookie, headers, query or response body.
- Held requests retired before dispatch on navigation/close produce the same
  outcome. ERR_ABORTED is judged as a sent-request failure only after successful
  continuation, including when its native failure event arrives before the reply.
- Other continuation errors fail, including a Target closed error from an
  already-dispatched command. Origin/header/tenant/cookie/redirect protections
  and the exact-origin Fetch pattern from merged PR #998 remain.
- The original management crawler uses its existing settle budget to await the
  canonical route, resolved auth/loading, finite completed route JSON and API
  success. Session/readiness/shell responses and open streams cannot establish
  route data readiness. Declared entity details require their matching endpoint.
- Live-id list/API/shape errors fail the same data verdict instead of silently
  skipping details. Honest empty lists remain explicit; historical fixture-id
  not-found rendering is allowed, while a live-id 404 fails. Existing detail
  honesty, console/CORS, RBAC, alias and release-load gates still apply.
- JSON reports include safe termination records and per-route data results;
  Markdown identifies data failures. A healthy transport does not override a
  failed route/detail/discovery data check or its nonzero process exit.
- Closure/transport health failures also retain the completed route results in
  that same JSON/Markdown report with sanitized transport errors, `pass=false`
  and exit code 1. Ops' actual 6a51 hosted diagnostic exposed this lost-output
  path; its genuine continued `trade-journeys` abort is still a failure.

## Verification boundary

`evidence.json` records exact bounded commands, terminal exits, log hashes and
source blobs. Chromium uses real local HTTP/HTTPS servers and native CDP; only
command/event delivery is controlled. The preserved old crawler demonstrates
false acceptance of auth/loading/session-only/error states. New positive cases
wait for real fixture data and a delayed redirect. Local full-caller cases run
all 95 baseline routes and 15 discovered details, plus deliberate route, detail
and discovery negatives through the original main/report/exit-code path. A
native continued `trade-journeys` abort now verifies both failing report formats,
all 110 route records, retained failed-page evidence and nonzero exit status.

All generated HTML/API/load-gate inputs are explicitly local test fixtures.
They establish harness behavior, not hosted product, provider, load, financial,
role or deployment readiness. Generated reports and logs stay outside git.
This source task does not deploy or merge its independently reviewed PR; the
assigned reviewer and supervisor integrator govern that delivery. The sole
hosted owner retains actual deployment and hosted acceptance authority.
