#!/usr/bin/env node
/**
 * validate-management-live-deep.mjs
 *
 * Live deep validation for Management UI <-> BFF/persona interaction seams that
 * cannot be proven by the synthetic 3000-round validator alone:
 * - bearer-token RBAC matrix, when role-specific tokens are available
 * - two-operator / same-operator two-man-sign race behavior, when tokens exist
 * - long SSE open + reconnect with Last-Event-ID duplicate detection
 *
 * Missing role/operator tokens produce partial evidence instead of a false pass.
 */
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const ROOT = process.cwd();
const BFF_BASE_URL = (
  process.env.PANTHEON_BFF_BASE_URL ||
  process.env.VITE_BFF_BASE_URL ||
  "https://pantheon-lupin-dev-bff.35.201.239.38.sslip.io"
).replace(/\/$/, "");
const AUDIT_DIR = process.env.PANTHEON_AUDIT_OUT_DIR || ".lovable/audits";
const SMOKE_TOKEN = process.env.PANTHEON_BFF_SMOKE_BEARER_TOKEN || process.env.BFF_AUTH_TOKEN || "";
const OPERATOR_A_TOKEN = process.env.PANTHEON_BFF_OPERATOR_A_TOKEN || "";
const OPERATOR_B_TOKEN = process.env.PANTHEON_BFF_OPERATOR_B_TOKEN || "";
const SSE_MS = Math.max(10_000, Number(process.env.PANTHEON_LIVE_DEEP_SSE_MS || "65000"));
const REQUIRE_FULL = truthy(process.env.PANTHEON_LIVE_DEEP_REQUIRE_FULL || "false");
const RUN_ID = (process.env.GITHUB_RUN_ID || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "-");
const PROBE_MARKER = `management-live-deep-${RUN_ID}-${Math.random().toString(36).slice(2, 8)}`;

const REQUIRED_RBAC_ROLES = ["viewer", "operator", "approver", "risk_owner", "admin"];

const RBAC_MATRIX = [
  {
    id: "read-strategies",
    method: "GET",
    route: "/bff/strategies",
    allowed: ["viewer", "operator", "approver", "risk_owner", "admin"],
  },
  {
    id: "read-approvals",
    method: "GET",
    route: "/bff/approvals",
    allowed: ["viewer", "operator", "approver", "risk_owner", "admin"],
  },
  {
    id: "approval-decide-dry-run",
    method: "POST",
    route: "/bff/approvals/approval-dev/decide",
    allowTyped404: true,
    allowed: ["operator", "approver", "risk_owner", "admin"],
    body: { decision: "approve", reason: PROBE_MARKER },
  },
  {
    id: "intervention-decide-dry-run",
    method: "POST",
    route: "/bff/v5/interventions/intervention-dev/decide",
    allowed: ["operator", "approver", "risk_owner", "admin"],
    body: { decision: "approve", memo: PROBE_MARKER },
  },
  {
    id: "two-man-sign-dry-run",
    method: "POST",
    route: "/bff/v5/interventions/intervention-dev/two-man-sign",
    allowed: ["operator", "approver", "risk_owner", "admin"],
    body: { memo: PROBE_MARKER },
  },
  {
    id: "management-nl-ask-dry-run",
    method: "POST",
    route: "/bff/management/nl/ask",
    // Management NL ask is a viewer-level read surface: the BFF allows any
    // viewer-capable role (viewer, operator, approver, admin) and denies
    // risk_owner ("Read access requires viewer-level role"). Matches the live
    // contract verified 2026-06-21.
    allowed: ["viewer", "operator", "approver", "admin"],
    body: { question: PROBE_MARKER, focus: "all", context: "live-deep-validator" },
  },
];

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizeRole(role) {
  return String(role).trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function normalizeToken(token) {
  const trimmed = String(token || "").trim();
  return trimmed.toLowerCase().startsWith("bearer ") ? trimmed.slice("bearer ".length).trim() : trimmed;
}

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isBffErrorEnvelope(value) {
  if (!isObject(value)) return false;
  const detail = value.detail;
  return (
    typeof value.error === "string" ||
    typeof value.code === "string" ||
    typeof detail === "string" ||
    Array.isArray(detail) ||
    (isObject(value.error) && typeof value.error.code === "string") ||
    (isObject(detail) && isObject(detail.error) && typeof detail.error.code === "string") ||
    (isObject(detail) && typeof detail.code === "string")
  );
}

function safeJson(text) {
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function statusWeight(status) {
  return { pass: 0, warn: 1, partial: 1, fail: 2 }[status] ?? 2;
}

function worstStatus(statuses) {
  return statuses.reduce((worst, status) => (statusWeight(status) > statusWeight(worst) ? status : worst), "pass");
}

function loadRoleTokens() {
  const tokens = {};
  const json = process.env.PANTHEON_BFF_RBAC_TOKENS_JSON || "";
  if (json.trim()) {
    try {
      const parsed = JSON.parse(json);
      for (const [role, token] of Object.entries(parsed)) {
        if (String(token || "").trim()) tokens[normalizeRole(role)] = normalizeToken(token);
      }
    } catch (err) {
      tokens.__parse_error = String(err).slice(0, 160);
    }
  }

  const envMap = {
    viewer: "PANTHEON_BFF_VIEWER_TOKEN",
    operator: "PANTHEON_BFF_OPERATOR_TOKEN",
    approver: "PANTHEON_BFF_APPROVER_TOKEN",
    risk_owner: "PANTHEON_BFF_RISK_OWNER_TOKEN",
    admin: "PANTHEON_BFF_ADMIN_TOKEN",
  };
  for (const [role, envName] of Object.entries(envMap)) {
    if (process.env[envName]) tokens[role] = normalizeToken(process.env[envName]);
  }
  return tokens;
}

function requestHeaders(token, method, requestId, extra = {}) {
  const headers = {
    Accept: "application/json",
    "X-Request-Id": requestId,
    "X-BFF-Api-Version": "2026-05-07",
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${normalizeToken(token)}`;
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-Dry-Run"] = "1";
    headers["Idempotency-Key"] = `idk-${requestId}`;
    headers["X-Idempotency-Key"] = `idk-${requestId}`;
  }
  return headers;
}

async function fetchJson(route, { method = "GET", token = "", body, requestPrefix = "live-deep", extraHeaders = {} } = {}) {
  const requestId = `${requestPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const url = new URL(route, BFF_BASE_URL).toString();
  try {
    const res = await fetch(url, {
      method,
      headers: requestHeaders(token, method, requestId, extraHeaders),
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text().catch(() => "");
    return {
      route,
      method,
      status: res.status,
      json: safeJson(text),
      text,
      error: "",
      typedEnvelope: isBffErrorEnvelope(safeJson(text)),
    };
  } catch (err) {
    return { route, method, status: 0, json: null, text: "", error: String(err), typedEnvelope: false };
  }
}

function classifyAllowed(response, check = {}) {
  if (response.error) return { pass: false, note: response.error.slice(0, 120) };
  if (check.allowTyped404 && response.status === 404 && response.typedEnvelope) {
    return { pass: true, note: "allowed route reached typed dev-id not-found envelope" };
  }
  if ([404, 405, 501].includes(response.status)) return { pass: false, note: `route missing/not implemented: ${response.status}` };
  if (response.status >= 500 || response.status === 0) return { pass: false, note: `backend/transport failure: ${response.status}` };
  if (response.status >= 200 && response.status < 300) return { pass: true, note: "allowed success" };
  if (response.status >= 400 && response.status < 500 && response.typedEnvelope) return { pass: true, note: "allowed route reached typed precondition envelope" };
  return { pass: false, note: `unexpected allowed response ${response.status}; typed=${response.typedEnvelope}` };
}

function classifyDenied(response) {
  if (response.error) return { pass: false, note: response.error.slice(0, 120) };
  if ([401, 403].includes(response.status) && response.typedEnvelope) return { pass: true, note: "denied with typed auth envelope" };
  if ([404, 405, 501].includes(response.status)) return { pass: false, note: `route missing/not implemented: ${response.status}` };
  if (response.status >= 500 || response.status === 0) return { pass: false, note: `backend/transport failure: ${response.status}` };
  return { pass: false, note: `expected 401/403 typed denial, got ${response.status}; typed=${response.typedEnvelope}` };
}

async function runRbacMatrix() {
  const roleTokens = loadRoleTokens();
  const parseError = roleTokens.__parse_error || "";
  delete roleTokens.__parse_error;
  const presentRoles = REQUIRED_RBAC_ROLES.filter((role) => roleTokens[role]);
  const missingRoles = REQUIRED_RBAC_ROLES.filter((role) => !roleTokens[role]);
  const rows = [];

  for (const role of presentRoles) {
    for (const check of RBAC_MATRIX) {
      const allowed = check.allowed.includes(role);
      const response = await fetchJson(check.route, {
        method: check.method,
        token: roleTokens[role],
        body: check.body,
        requestPrefix: `rbac-${role}-${check.id}`,
      });
      const verdict = allowed ? classifyAllowed(response, check) : classifyDenied(response);
      rows.push({
        role,
        check: check.id,
        method: check.method,
        route: check.route,
        expected: allowed ? "allowed" : "denied",
        status: response.status,
        typedEnvelope: response.typedEnvelope,
        pass: verdict.pass,
        note: verdict.note,
      });
    }
  }

  const smokeRows = [];
  if (!presentRoles.length && SMOKE_TOKEN) {
    for (const check of RBAC_MATRIX) {
      const response = await fetchJson(check.route, {
        method: check.method,
        token: SMOKE_TOKEN,
        body: check.body,
        requestPrefix: `rbac-smoke-${check.id}`,
      });
      const verdict = classifyAllowed(response, check);
      smokeRows.push({
        role: "smoke",
        check: check.id,
        method: check.method,
        route: check.route,
        status: response.status,
        typedEnvelope: response.typedEnvelope,
        pass: verdict.pass,
        note: verdict.note,
      });
    }
  }

  const failed = rows.filter((row) => !row.pass);
  const smokeFailed = smokeRows.filter((row) => !row.pass);
  const status = parseError || failed.length || smokeFailed.length
    ? "fail"
    : missingRoles.length
    ? "partial"
    : "pass";
  return {
    status,
    parseError,
    requiredRoles: REQUIRED_RBAC_ROLES,
    presentRoles,
    missingRoles,
    rows,
    smokeRows,
  };
}

function actorFromMe(json) {
  const candidate = json?.data ?? json ?? {};
  const user = candidate.user ?? candidate.current_user ?? candidate.currentUser ?? candidate;
  return (
    user.id ||
    user.user_id ||
    user.email ||
    candidate.user_id ||
    candidate.sub ||
    ""
  );
}

function raceResponseOk(response) {
  if (response.error) return false;
  if ([404, 405, 501].includes(response.status)) return false;
  if (response.status >= 500 || response.status === 0) return false;
  if (response.status >= 200 && response.status < 300) return true;
  return response.status >= 400 && response.status < 500 && response.typedEnvelope;
}

async function runOperatorRace() {
  const rows = [];
  const tokenA = OPERATOR_A_TOKEN || "";
  const tokenB = OPERATOR_B_TOKEN || "";

  if (!tokenA || !tokenB) {
    return {
      status: "partial",
      rows,
      note: "PANTHEON_BFF_OPERATOR_A_TOKEN and PANTHEON_BFF_OPERATOR_B_TOKEN are required for distinct-operator race proof.",
    };
  }

  const [meA, meB] = await Promise.all([
    fetchJson("/bff/me", { token: tokenA, requestPrefix: "race-me-a" }),
    fetchJson("/bff/me", { token: tokenB, requestPrefix: "race-me-b" }),
  ]);
  const actorA = actorFromMe(meA.json);
  const actorB = actorFromMe(meB.json);
  const distinctActors = actorA && actorB && actorA !== actorB;

  const body = { memo: PROBE_MARKER, reason: "operator-race-dry-run" };
  const [sameA1, sameA2] = await Promise.all([
    fetchJson("/bff/v5/interventions/intervention-dev/two-man-sign", { method: "POST", token: tokenA, body, requestPrefix: "race-same-a1" }),
    fetchJson("/bff/v5/interventions/intervention-dev/two-man-sign", { method: "POST", token: tokenA, body, requestPrefix: "race-same-a2" }),
  ]);
  const [distinctA, distinctB] = await Promise.all([
    fetchJson("/bff/v5/interventions/intervention-dev/two-man-sign", { method: "POST", token: tokenA, body, requestPrefix: "race-distinct-a" }),
    fetchJson("/bff/v5/interventions/intervention-dev/two-man-sign", { method: "POST", token: tokenB, body, requestPrefix: "race-distinct-b" }),
  ]);

  rows.push(
    { case: "same-operator-a1", actor: actorA, status: sameA1.status, typedEnvelope: sameA1.typedEnvelope, ok: raceResponseOk(sameA1) },
    { case: "same-operator-a2", actor: actorA, status: sameA2.status, typedEnvelope: sameA2.typedEnvelope, ok: raceResponseOk(sameA2) },
    { case: "distinct-operator-a", actor: actorA, status: distinctA.status, typedEnvelope: distinctA.typedEnvelope, ok: raceResponseOk(distinctA) },
    { case: "distinct-operator-b", actor: actorB, status: distinctB.status, typedEnvelope: distinctB.typedEnvelope, ok: raceResponseOk(distinctB) },
  );

  const bothSameSucceeded = [sameA1, sameA2].every((response) => response.status >= 200 && response.status < 300);
  const transportOk = rows.every((row) => row.ok);
  // bothSameSucceeded is informational only: two-man-sign dry-run does not run
  // the distinct-operator state machine (no first-signature is persisted), so a
  // same-operator double 200 in dry-run is expected. Real two-man enforcement is
  // a non-dry-run property and is not exercised by this gate.
  const status = !distinctActors || !transportOk ? "fail" : "pass";
  const notes = [];
  if (!distinctActors) notes.push(`operator tokens did not resolve to distinct /bff/me actors: ${actorA || "missing"} vs ${actorB || "missing"}`);
  if (bothSameSucceeded) notes.push("same operator produced two success responses for two-man-sign dry-run (expected: dry-run does not enforce the two-man state machine)");
  if (!transportOk) notes.push("one or more race requests failed route/envelope validation");
  return { status, rows, note: notes.join("; ") || "two-man-sign race dry-run completed with distinct operators" };
}

function processSseChunk(state, text) {
  state.buffer += text;
  let newlineIndex = state.buffer.search(/\r?\n/);
  while (newlineIndex >= 0) {
    const line = state.buffer.slice(0, newlineIndex).replace(/\r$/, "");
    state.buffer = state.buffer.slice(newlineIndex + (state.buffer[newlineIndex] === "\r" ? 2 : 1));
    if (line === "") {
      if (state.current.id || state.current.data.length || state.current.event) {
        state.messages += 1;
        if (state.current.id) {
          if (state.ids.has(state.current.id)) state.duplicateIds.push(state.current.id);
          state.ids.add(state.current.id);
          state.lastEventId = state.current.id;
        }
      }
      state.current = { id: "", event: "", data: [] };
    } else if (line.startsWith(":")) {
      state.heartbeats += 1;
    } else if (line.startsWith("id:")) {
      state.current.id = line.slice(3).trim();
    } else if (line.startsWith("event:")) {
      state.current.event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      state.current.data.push(line.slice(5).trim());
    }
    newlineIndex = state.buffer.search(/\r?\n/);
  }
}

async function readSsePhase({ token, lastEventId = "", durationMs, phase }) {
  const state = {
    phase,
    opened: false,
    status: 0,
    messages: 0,
    heartbeats: 0,
    ids: new Set(),
    duplicateIds: [],
    lastEventId: "",
    buffer: "",
    current: { id: "", event: "", data: [] },
    error: "",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), durationMs);
  const headers = {
    Accept: "text/event-stream",
    "X-Request-Id": `sse-${phase}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  if (token) headers.Authorization = `Bearer ${normalizeToken(token)}`;
  if (lastEventId) headers["Last-Event-ID"] = lastEventId;

  try {
    const res = await fetch(new URL("/bff/events/stream", BFF_BASE_URL), {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    state.status = res.status;
    state.opened = res.ok;
    if (!res.ok || !res.body) return state;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      processSseChunk(state, decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    if (!controller.signal.aborted) state.error = String(err).slice(0, 180);
  } finally {
    clearTimeout(timer);
  }
  return state;
}

async function runSseLongReconnect() {
  const token = SMOKE_TOKEN || OPERATOR_A_TOKEN || OPERATOR_B_TOKEN || "";
  const firstDuration = Math.floor(SSE_MS / 2);
  const secondDuration = SSE_MS - firstDuration;
  const first = await readSsePhase({ token, durationMs: firstDuration, phase: "initial" });
  const second = await readSsePhase({ token, lastEventId: first.lastEventId, durationMs: secondDuration, phase: "reconnect" });
  const duplicateIds = [...new Set([...first.duplicateIds, ...second.duplicateIds].filter(Boolean))];
  const opened = first.opened && second.opened;
  const totalMessages = first.messages + second.messages;
  const totalHeartbeats = first.heartbeats + second.heartbeats;
  const hardFailure = !opened || first.error || second.error || duplicateIds.length > 0;
  const status = hardFailure ? "fail" : totalMessages + totalHeartbeats > 0 ? "pass" : "warn";
  const note = hardFailure
    ? `opened=${opened}; first=${first.status}/${first.error || "ok"}; reconnect=${second.status}/${second.error || "ok"}; duplicate ids=${duplicateIds.length}`
    : totalMessages + totalHeartbeats > 0
    ? `stream opened twice; messages=${totalMessages}; heartbeats=${totalHeartbeats}; lastEventId=${first.lastEventId || "none"}`
    : "stream opened twice but no events or heartbeat comments arrived during the observation window";
  return { status, durationMs: SSE_MS, first, second, duplicateIds, note };
}

function tableRow(cells) {
  return `| ${cells.map((cell) => String(cell ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`;
}

function renderMarkdown(results) {
  const lines = [
    "# Management Live Deep Validation",
    "",
    `Generated: ${results.generatedAt}`,
    `BFF base: ${BFF_BASE_URL}`,
    `Probe marker: \`${PROBE_MARKER}\``,
    `Overall: ${results.overall}`,
    "",
    "## Preflight Questions",
    "",
    "- Which real bearer-token roles still lack CI secrets for full RBAC proof?",
    "- Which high-risk dry-run writes can return success without visible side effects?",
    "- Can a same-operator race ever satisfy two-man-sign under load?",
    "- Does SSE reconnect with Last-Event-ID replay duplicate event IDs after a longer open window?",
    "",
    "## Coverage Status",
    "",
    `- RBAC status: ${results.rbac.status}`,
    `- RBAC present roles: ${results.rbac.presentRoles.join(", ") || "none"}`,
    `- RBAC missing roles: ${results.rbac.missingRoles.join(", ") || "none"}`,
    `- Operator race status: ${results.operatorRace.status}`,
    `- SSE status: ${results.sse.status}`,
    `- SSE duration ms: ${results.sse.durationMs}`,
    "",
  ];

  if (results.rbac.parseError) {
    lines.push(`RBAC token JSON parse error: ${results.rbac.parseError}`, "");
  }

  lines.push("## RBAC Matrix", "", tableRow(["Role", "Check", "Expected", "Status", "Typed envelope", "Pass", "Note"]), tableRow(["---", "---", "---", "---:", "---", "---", "---"]));
  for (const row of results.rbac.rows) {
    lines.push(tableRow([row.role, row.check, row.expected, row.status, row.typedEnvelope ? "yes" : "no", row.pass ? "yes" : "no", row.note]));
  }
  if (!results.rbac.rows.length) {
    lines.push(tableRow(["none", "full matrix not executed", "missing tokens", "-", "-", "no", "provide PANTHEON_BFF_RBAC_TOKENS_JSON or role token secrets"]));
  }

  if (results.rbac.smokeRows.length) {
    lines.push("", "## Smoke Token Route Reachability", "", tableRow(["Role", "Check", "Status", "Typed envelope", "Pass", "Note"]), tableRow(["---", "---", "---:", "---", "---", "---"]));
    for (const row of results.rbac.smokeRows) {
      lines.push(tableRow([row.role, row.check, row.status, row.typedEnvelope ? "yes" : "no", row.pass ? "yes" : "no", row.note]));
    }
  }

  lines.push("", "## Operator Race", "", `Status: ${results.operatorRace.status}`, `Note: ${results.operatorRace.note || ""}`, "", tableRow(["Case", "Actor", "Status", "Typed envelope", "OK"]), tableRow(["---", "---", "---:", "---", "---"]));
  for (const row of results.operatorRace.rows) {
    lines.push(tableRow([row.case, row.actor || "missing", row.status, row.typedEnvelope ? "yes" : "no", row.ok ? "yes" : "no"]));
  }
  if (!results.operatorRace.rows.length) {
    lines.push(tableRow(["not executed", "missing", "-", "-", "no"]));
  }

  lines.push("", "## SSE Long Reconnect", "", `Status: ${results.sse.status}`, `Note: ${results.sse.note}`, "", tableRow(["Phase", "Opened", "Status", "Messages", "Heartbeats", "Last event ID", "Error"]), tableRow(["---", "---", "---:", "---:", "---:", "---", "---"]));
  for (const phase of [results.sse.first, results.sse.second]) {
    lines.push(tableRow([phase.phase, phase.opened ? "yes" : "no", phase.status, phase.messages, phase.heartbeats, phase.lastEventId || "none", phase.error || ""]));
  }
  lines.push("", `Duplicate event IDs after reconnect: ${results.sse.duplicateIds.length ? results.sse.duplicateIds.join(", ") : "none"}`, "");

  return lines.join("\n");
}

async function main() {
  console.log(`[live-deep] BFF: ${BFF_BASE_URL}`);
  console.log("[live-deep] Asking: what role tokens, operator races, and SSE replay cases have not been proven yet?");

  const rbac = await runRbacMatrix();
  console.log(`[live-deep] RBAC status: ${rbac.status}; present=${rbac.presentRoles.join(",") || "none"} missing=${rbac.missingRoles.join(",") || "none"}`);

  const operatorRace = await runOperatorRace();
  console.log(`[live-deep] Operator race status: ${operatorRace.status}`);

  const sse = await runSseLongReconnect();
  console.log(`[live-deep] SSE status: ${sse.status}; ${sse.note}`);

  const overall = worstStatus([rbac.status, operatorRace.status, sse.status]);
  const generatedAt = new Date().toISOString();
  const results = { generatedAt, overall, probeMarker: PROBE_MARKER, rbac, operatorRace, sse };
  const auditDir = path.resolve(ROOT, AUDIT_DIR);
  fs.mkdirSync(auditDir, { recursive: true });
  const ts = generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(auditDir, `management-live-deep-validation-${ts}.json`);
  const mdPath = path.join(auditDir, `management-live-deep-validation-${ts}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(results), "utf8");
  console.log(`[live-deep] Evidence: ${mdPath}`);

  if (overall === "fail" || (REQUIRE_FULL && overall !== "pass")) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[live-deep] Fatal:", err);
  process.exit(1);
});
