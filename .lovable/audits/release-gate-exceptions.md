# Release Gate Exceptions

Generated: 2026-06-08

| Flow | Status | Owner | Expires | Reason |
|---|---|---|---|---|
| F10 | BACKEND-NOT-READY | Codex | 2026-06-30 | Rollback saga dry-run/execute is explicitly annotated in `e2e/10-rollback-saga.spec.ts` until the BFF returns RollbackDryRunDTO/RollbackSagaDTO and emits rollback saga SSE events. |
