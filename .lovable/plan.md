# Batch V — v1 BFF Contract Frontend Wiring

Implement the typed client layer that conforms to the FROZEN v1 BFF contract (`.lovable/feedback/2026-05-07-final/` 4-file bundle). Adds a new `src/lib/bff-v1/` namespace alongside existing `src/lib/bff/` mocks; does NOT rip out current call sites.

## Scope

### 1. New `src/lib/bff-v1/` module
- **`dto.ts`** — TS interfaces mirroring DTO Catalog (9 core + 9 v5/Agora). Includes `CommandResponse<T>` (with required `data`), `ListEnvelope<T>`, `RedactedEvidenceRef`, `EvidenceKind`, action descriptors, status enums.
- **`errors.ts`** — `BffErrorEnvelope`, `ErrorCode` union (re-export from `src/lib/v4/errorCodes.ts` + add v1-only codes), `BffError` class for throwing typed errors. Maps 428 → `CONFIRM_TOKEN_REQUIRED` / `APPROVAL_REQUIRED`, 409 → `STATE_CONFLICT` / `IDEMPOTENCY_CONFLICT`.
- **`headers.ts`** — Helpers: `idempotencyKey()`, `acceptLanguage()` (reuse platform locale), `xRequestId()`, `ifMatch(version)`, plus stub `xBffApiVersion()` flagged H-backlog.
- **`paths.ts`** — Typed path builders for the 94 OpenAPI endpoints (grouped by resource: strategies, personas, capitalPools, rebalances, deployments, evolution, approvals, commands, sse, agora, v5).
- **`sse/channels.ts`** — Discriminated union for the 28 SSE channels per AsyncAPI doc; `SseEvent<K>` envelope with `id`, `channel`, `ts`, `payload`. Includes new `approval.*` and `ask.*` channels.
- **`sse/protocol.ts`** — `Last-Event-Id` resume contract, heartbeat interval, `resync_required` handling.

### 2. `src/lib/bff-v1/client.ts`
- `fetch` wrapper with mode switch via `import.meta.env.VITE_BFF_MODE` (`mock` default, `live`).
- Auto-injects required headers on mutations (Idempotency-Key, X-Request-Id, If-Match, Accept-Language).
- Parses `BffErrorEnvelope` and throws `BffError` (preserves `correlationId`, `retryable`, `userActionable`, `i18nKey`).
- In `mock` mode delegates to adapter layer (step 3); in `live` mode hits real BFF base URL.

### 3. Mock adapters `src/lib/bff-v1/mocks/`
- Thin shims that wrap existing `src/lib/bff/client.ts` outputs into v1 wire shapes:
  - lists → `ListEnvelope<T>` (cursor pagination)
  - mutations → `CommandResponse<T>` with `status: 'accepted' | 'queued' | 'completed'`
  - high-risk paths return 428 `BffErrorEnvelope` with `requires_confirm_token` / `requires_approval`
- Reuses `src/lib/bff/writeOverlay.ts` (30min TTL) — no seed writes.

### 4. SSE bridge `src/lib/bff-v1/sse/bridge.ts`
- Adapts existing `realtime` bus events → v1 `SseEvent` envelopes on the 28 channels.
- Exposes `subscribe(channel, handler)` API.

### 5. Tests `src/lib/bff-v1/__tests__/`
- `envelope.test.ts` — `CommandResponse.data` required; error envelope shape; 428/409 mapping.
- `headers.test.ts` — Idempotency-Key injection on mutations only; Accept-Language follows locale.
- `sse.test.ts` — Channel discriminated union; Last-Event-Id resume.
- `paths.test.ts` — Spot-check 10 representative path builders.

### 6. Memory
- Create `mem://features/bff-v1-client` — describes module layout, mode flag, mock-vs-live boundary.
- Update `mem://index.md` Core — add line: `v1 BFF client at src/lib/bff-v1/; VITE_BFF_MODE=mock|live; existing src/lib/bff/ remains until call sites migrate.`

## Out of scope (later batches)
- Migrating existing `bff.*` call sites to `bffV1.*` (Batch VI).
- Real backend wiring / network code beyond the fetch wrapper skeleton.
- H-version follow-ups (X-BFF-Api-Version enforcement, RESOURCE_NOT_FOUND, named `ActionCommandStatus`) — tracked in `H_VERSION_BACKLOG.md`.
- Pack D 7 canonical contract edits.

## Acceptance
- `src/lib/bff-v1/` compiles, exports typed `bffV1` client.
- New tests green; existing 268 tests stay green.
- `VITE_BFF_MODE=mock` (default) routes through adapters; `live` skeleton present but unused.
- Memory updated.
